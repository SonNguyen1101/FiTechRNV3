// Valuation identities with explicit provenance and period/share-basis handling. Pure, DOM-free. Every function returns {value, reason?, ...} and never throws on bad
// numbers: negative/zero denominators and missing inputs are explicit reasons, never silent zeros. Prices are VND per share; share counts are numbers of shares.
import { isValidatedStatements, periodId } from './statements.mjs';
export { periodId };
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const toVnd = { VND: 1, million_VND: 1e6, billion_VND: 1e9 };

// Latest share record at or before `date`, rolled forward by every corporate action AFTER that record's date and not after `date`.
export function sharesAt({ shares, actions = [], date }) {
  const base = [...(shares || [])].filter((s) => s.as_of <= date).sort((a, b) => (a.as_of < b.as_of ? 1 : -1))[0];
  if (!base) return { value: null, status: 'NO_SHARE_RECORD', base_as_of: null, actions_applied: [] };
  const applied = actions.filter((a) => a.date > base.as_of && a.date <= date);
  return { value: applied.reduce((v, a) => v * a.ratio, base.value), status: 'OK', base_as_of: base.as_of, actions_applied: applied };
}
// Per-share earnings of a past period, restated for actions between the period end and `toDate` (otherwise a later stock dividend overstates EPS).
export function epsRestated({ earnings, sharesAtPeriodEnd, periodEnd, actions = [], toDate }) {
  if (!fin(earnings) || !fin(sharesAtPeriodEnd) || sharesAtPeriodEnd <= 0) return { value: null, reason: 'MISSING_INPUT' };
  const f = actions.filter((a) => a.date > periodEnd && a.date <= toDate).reduce((v, a) => v * a.ratio, 1);
  return { value: earnings / (sharesAtPeriodEnd * f), cumulative_ratio: f };
}
export function marketCap({ price, shares }) { return fin(price) && price > 0 && fin(shares) && shares > 0 ? { value: price * shares, value_billion_vnd: (price * shares) / 1e9 } : { value: null, value_billion_vnd: null, reason: 'MISSING_INPUT' }; }
export function pe({ price, eps }) {
  if (!fin(price) || price <= 0) return { value: null, reason: 'MISSING_PRICE' };
  if (!fin(eps)) return { value: null, reason: 'MISSING_EARNINGS' };
  if (eps <= 0) return { value: null, reason: 'NON_POSITIVE_EARNINGS' };
  return { value: price / eps };
}
export function pb({ price, bvps }) {
  if (!fin(price) || price <= 0) return { value: null, reason: 'MISSING_PRICE' };
  if (!fin(bvps)) return { value: null, reason: 'MISSING_EQUITY' };
  if (bvps <= 0) return { value: null, reason: 'NON_POSITIVE_BOOK' };
  return { value: price / bvps };
}
export function upside({ fair, price }) { return fin(fair) && fin(price) && price > 0 ? { value: fair / price - 1 } : { value: null, reason: 'MISSING_INPUT' }; }
// Half-year x2 is an ASSUMPTION about the second half; it is not TTM and is always labelled.
export function annualize({ value, kind }) { return kind === 'H1' && fin(value) ? { value: value * 2, basis: 'ANNUALIZED_ASSUMPTION' } : { value: null, reason: 'NOT_A_HALF_YEAR' }; }

const byId = (st) => new Map(st.periods.map((p) => [p.id, p]));
// Value of an item for a period inside a given scope regime: the period itself when it is in that regime, else a restated comparative supplied by a later period.
export function periodValue(st, pid, key, regime) { return valueIn(st, pid, key, regime); }
function valueIn(st, pid, key, regime) {
  const m = byId(st), p = m.get(pid);
  if (p && p.scope_regime === regime && p.items[key]) return { value: p.items[key].value, unit: p.unit, via: 'PERIOD' };
  for (const q of st.periods) { const rc = q.restated_comparatives && q.restated_comparatives[pid]; if (rc && rc.scope_regime === regime && rc.items[key]) return { value: rc.items[key].value, unit: q.unit, via: 'RESTATED_COMPARATIVE' }; }
  return null;
}
export function ttm({ statements, target, key }) {
  const m = byId(statements), t = m.get(target);
  if (!t) return { value: null, reason: 'MISSING_PERIOD' };
  const y = t.fiscal_year, regime = t.scope_regime;
  if (t.kind === 'FY') return t.items[key] ? { value: t.items[key].value, basis: 'FY', period_ids: [target], regime, unit: t.unit } : { value: null, reason: 'MISSING_ITEM' };
  if (t.kind !== 'H1') return { value: null, reason: 'UNSUPPORTED_TARGET_KIND' };
  const ids = [periodId(y - 1, 'FY'), target, periodId(y - 1, 'H1')];
  if (!ids.every((i) => m.has(i))) return { value: null, reason: 'MISSING_PERIOD', period_ids: ids };
  const v = ids.map((i) => valueIn(statements, i, key, regime));
  if (v.some((x) => x === null)) {
    const anyItem = ids.every((i) => m.get(i).items[key] || (statements.periods.some((q) => q.restated_comparatives && q.restated_comparatives[i] && q.restated_comparatives[i].items[key])));
    return { value: null, reason: anyItem ? 'INCOMPARABLE_SCOPE_REGIME' : 'MISSING_ITEM', period_ids: ids };
  }
  if (new Set(v.map((x) => x.unit)).size !== 1) return { value: null, reason: 'MIXED_UNITS', period_ids: ids };
  return { value: v[0].value + v[1].value - v[2].value, basis: 'TTM', period_ids: ids, regime, unit: v[0].unit, comparatives_restated: v.some((x) => x.via === 'RESTATED_COMPARATIVE') };
}
// TTM when comparable; else annualized H1 if the newest period is a half-year (labelled, never TTM); else the latest full year.
export function trailingEarnings({ statements, key }) {
  const ps = [...statements.periods].filter((p) => p.items[key]).sort((a, b) => (a.end < b.end ? 1 : -1)), latest = ps[0];
  if (!latest) return { value: null, reason: 'MISSING_ITEM' };
  if (latest.kind === 'H1') {
    const t = ttm({ statements, target: latest.id, key });
    if (t.value !== null) return t;
    const a = annualize({ value: latest.items[key].value, kind: 'H1' });
    return { value: a.value, basis: a.basis, period_ids: [latest.id], regime: latest.scope_regime, unit: latest.unit, caveat: `Nhân đôi nửa năm ${latest.fiscal_year} là giả định về nửa năm sau, không phải TTM (${t.reason}).` };
  }
  const fy = ps.find((p) => p.kind === 'FY'); return fy ? { value: fy.items[key].value, basis: 'FY', period_ids: [fy.id], regime: fy.scope_regime, unit: fy.unit } : { value: null, reason: 'NO_COMPARABLE_PERIOD' };
}

// Metrics table: dated price, share basis (with corporate actions) and the financial period stay separate; each metric is available or unavailable on its own.
export function computeMetrics({ statements, price, staleShareBasis = false }) {
  const out = { price: { value: price.value, date: price.date, unit: 'VND/cp' }, flags: [] };
  const sh = sharesAt({ shares: statements.shares, actions: staleShareBasis ? [] : statements.corporate_actions, date: price.date });
  if (staleShareBasis) out.flags.push('STALE_SHARE_BASIS_FORCED');
  out.shares = { value: sh.value, base_as_of: sh.base_as_of, actions_applied: sh.actions_applied, status: sh.status };
  out.market_cap = sh.value === null ? { value: null, value_billion_vnd: null, reason: 'NO_SHARE_RECORD' } : marketCap({ price: price.value, shares: sh.value });
  const te = trailingEarnings({ statements, key: 'np_parent' });
  if (te.value === null) { out.eps = { value: null, reason: te.reason }; out.pe = { value: null, reason: te.reason }; }
  else {
    const earnVnd = te.value * toVnd[te.unit];
    out.eps = { value: sh.value ? earnVnd / sh.value : null, basis: te.basis, earnings_period_ids: te.period_ids, regime: te.regime, caveat: te.caveat || null };
    out.pe = { ...pe({ price: price.value, eps: out.eps.value }), basis: te.basis, earnings_period_ids: te.period_ids, as_of_price: price.date, caveat: te.caveat || null };
  }
  const eq = [...statements.periods].filter((p) => p.items.equity_parent).sort((a, b) => (a.end < b.end ? 1 : -1))[0];
  if (!eq || !sh.value) { out.bvps = { value: null, reason: 'MISSING_EQUITY' }; out.pb = { value: null, reason: 'MISSING_EQUITY' }; }
  else { out.bvps = { value: (eq.items.equity_parent.value * toVnd[eq.unit]) / sh.value, period_id: eq.id }; out.pb = { ...pb({ price: price.value, bvps: out.bvps.value }), period_id: eq.id, as_of_price: price.date }; }
  const nd = [...statements.periods].filter((p) => p.items.cash_and_investments && (p.items.debt_short || p.items.debt_long)).sort((a, b) => (a.end < b.end ? 1 : -1))[0];
  out.net_debt = nd ? { value_billion_vnd: ((nd.items.debt_short?.value ?? 0) + (nd.items.debt_long?.value ?? 0) - nd.items.cash_and_investments.value) * toVnd[nd.unit] / 1e9, period_id: nd.id } : { value_billion_vnd: null, reason: 'MISSING_BALANCE' };
  if (nd && !(nd.items.debt_short && nd.items.debt_long)) out.net_debt.partial = true;
  return out;
}
