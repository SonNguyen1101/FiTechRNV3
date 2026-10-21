// The ONLY way to build an input for the segment-bridge model. It binds every historical number to a fact that passed validateFactsDoc for this
// ticker, in a segment group of the requested period, with consolidated scope, ACTUAL basis, money unit, reconciled totals and restatement /
// comparability evidence. The returned object is frozen and registered; the model refuses anything else (no caller-supplied "validated" flag).
// Scenario assumptions are separate, unsourced inputs and stay labelled as assumptions.
import { isValidatedFact, isValidatedResult } from './facts.mjs';
import { buildSegmentGroups } from './segments.mjs';

const BOUND = new WeakSet();
export const isBoundInput = (x) => !!x && typeof x === 'object' && BOUND.has(x);
const MONEY = ['VND', 'million_VND', 'billion_VND'];
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const deepFreeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v); return Object.freeze(o); };

// Shared eligibility gate (also used by the valuation setup builder): the group must be ACTUAL, consolidated, money-denominated, reconciled, period-bound,
// restatement/scope-change-resolved and made of validated snapshots of THIS ticker. Returns {ok, g, bg, ops, elims, Y, T, tgt} or {ok:false, code}.
export function groupEligibility({ ticker, loaded, groupId, periodLabel, year, target }) {
  const no = (code, detail = null) => ({ ok: false, code, detail });
  if (!isValidatedResult(loaded) || !loaded.ok || !(loaded.facts || []).every(isValidatedFact)) return no('FACTS_NOT_VALIDATED');
  if (!loaded.meta || loaded.meta.ticker !== ticker) return no('WRONG_TICKER', loaded.meta && loaded.meta.ticker);
  const g = loaded.groups.find((x) => x.id === groupId); if (!g) return no('GROUP_NOT_FOUND');
  if (g.basis !== 'ACTUAL') return no('GROUP_NOT_ACTUAL');
  if (g.scope !== 'CONSOLIDATED') return no('SCOPE_NOT_CONSOLIDATED');
  if (!MONEY.includes(g.unit)) return no('UNIT_NOT_MONEY', g.unit);
  if (g.period.label !== periodLabel) return no('PERIOD_MISMATCH', g.period.label);
  if (!['revenue', 'pbt'].every((m) => g.metrics.some((x) => x.id === m))) return no('METRICS_MISSING');
  // The reporting year comes from the group's explicit period metadata; a caller-supplied year is only a cross-check, never the source of truth.
  const Y = g.period.fiscal_year; if (!Number.isInteger(Y)) return no('PERIOD_YEAR_UNBOUND');
  if (year !== undefined && year !== Y) return no('YEAR_MISMATCH', { given: year, bound: Y });
  const KINDS_T = ['FY', 'H1', 'H2', 'Q1', 'Q2', 'Q3', 'Q4'];
  const tgt = target === undefined ? { fiscal_year: Y, kind: g.period.kind || 'FY' } : target;
  if (!tgt || !Number.isInteger(tgt.fiscal_year) || tgt.fiscal_year < Y || tgt.fiscal_year > Y + 5 || !KINDS_T.includes(tgt.kind)) return no('TARGET_PERIOD_INVALID');
  const T = tgt.fiscal_year; year = Y;
  const [bg] = buildSegmentGroups([g], loaded.facts);
  if (!['revenue', 'pbt'].every((m) => bg.reconciliation[m].status === 'RECONCILED')) return no('GROUP_NOT_RECONCILED', { revenue: bg.reconciliation.revenue.status, pbt: bg.reconciliation.pbt.status });
  const ops = bg.rows.filter((r) => r.role === 'operating'), elims = bg.rows.filter((r) => r.role === 'elimination');
  for (const r of ops) for (const m of ['revenue', 'pbt']) if (!r.cells[m]) return no('MISSING_CELL', `${r.id}.${m}`);
  for (const r of elims) if (!r.cells.pbt) return no('MISSING_CELL', `${r.id}.pbt`);
  if (ops.some((r) => !(r.cells.revenue.value > 0))) return no('NON_POSITIVE_REVENUE');
  // restatement: every used cell must be an as-originally-reported number, or comparability evidence must cover [year-1, year]
  const used = [...ops.flatMap((r) => [r.cells.revenue, r.cells.pbt]), ...elims.map((r) => r.cells.pbt)];
  const cmp = loaded.facts.filter((f) => f.kind === 'comparability' && f.from_year <= year - 1 && f.to_year >= year);
  if (cmp.some((f) => f.verdict === 'NOT_COMPARABLE')) return no('RESTATEMENT_UNVERIFIED', 'NOT_COMPARABLE');
  if (used.some((c) => c.restated !== false) && !cmp.some((f) => f.verdict === 'COMPARABLE')) return no('RESTATEMENT_UNVERIFIED', 'NO_EVIDENCE');
  // A published scope change inside [base year, target year] needs a source-bound adjusted/compatible baseline covering [Y-1, max(T, E)]; restated:false alone proves nothing.
  for (const sc of loaded.facts.filter((f) => f.kind === 'scope_change' && f.effective_year >= Y && f.effective_year <= T)) {
    const hi = Math.max(T, sc.effective_year);
    if (!loaded.facts.some((f) => f.kind === 'comparability' && f.verdict === 'COMPARABLE' && f.from_year <= Y - 1 && f.to_year >= hi)) return no('SCOPE_CHANGE_UNRESOLVED', { effective_year: sc.effective_year, needs: [Y - 1, hi] });
  }
  return { ok: true, g, bg, ops, elims, Y, T, tgt, used };
}

export function bindSegmentBridgeInputs({ ticker, loaded, groupId, periodLabel, year, target, assumptions, sensitivity }) {
  const no = (code, detail = null) => ({ ok: false, code, detail });
  const el = groupEligibility({ ticker, loaded, groupId, periodLabel, year, target });
  if (!el.ok) return el;
  const { g, ops, elims, Y, T, tgt } = el;
  // assumptions: exactly the operating segments, ordered trios, finite
  if (!assumptions || typeof assumptions !== 'object') return no('ASSUMPTIONS_SEGMENT_MISMATCH');
  const ids = ops.map((r) => r.id).sort(), keys = Object.keys(assumptions).sort();
  if (JSON.stringify(ids) !== JSON.stringify(keys)) return no('ASSUMPTIONS_SEGMENT_MISMATCH', keys);
  const trio = (t) => t && ['low', 'base', 'high'].every((k) => fin(t[k])) && t.low <= t.base && t.base <= t.high;
  for (const id of ids) if (!trio(assumptions[id].growth) || !trio(assumptions[id].margin_delta)) return no('ASSUMPTIONS_INVALID', id);
  const axis = (a) => Array.isArray(a) && a.length >= 1 && a.length <= 11 && a.every(fin) && new Set(a).size === a.length;
  if (!sensitivity || !axis(sensitivity.growth_shift) || !axis(sensitivity.margin_shift)) return no('SENSITIVITY_INVALID');
  const input = {
    ticker, unit: g.unit, period: g.period.label, scope: g.scope, year: Y, group: g.id, base_period: { fiscal_year: Y, kind: g.period.kind }, target_period: { fiscal_year: T, kind: tgt.kind },
    segments: ops.map((r) => ({ id: r.id, revenue: { value: r.cells.revenue.value, fact_id: r.cells.revenue.fact_id, metric: 'revenue' }, pbt_margin: { value: r.cells.pbt.value / r.cells.revenue.value, fact_id: r.cells.pbt.fact_id, fact_ids: [r.cells.pbt.fact_id, r.cells.revenue.fact_id], metric: 'pbt/revenue' },
      growth: { ...assumptions[r.id].growth }, margin_delta: { ...assumptions[r.id].margin_delta } })),
    consolidation_adjustment: elims.length ? { value: elims.reduce((a, r) => a + r.cells.pbt.value, 0), fact_ids: elims.map((r) => r.cells.pbt.fact_id), fact_id: elims[0].cells.pbt.fact_id, metric: 'elimination_pbt' } : { not_applicable: true, reason: 'GROUP_DECLARES_NO_ELIMINATION_ROW' },
    sensitivity: { growth_shift: [...sensitivity.growth_shift], margin_shift: [...sensitivity.margin_shift] },
  };
  deepFreeze(input); BOUND.add(input);
  return { ok: true, input };
}
