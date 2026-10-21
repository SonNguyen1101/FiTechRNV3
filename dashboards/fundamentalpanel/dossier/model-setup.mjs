// Builds model setups from VALIDATED inputs only: segment group (same eligibility gate as the segment model), validated statements, a dated price and the ICB sector.
// Each setup says what is historical (with fact/period provenance) and what is a labelled default assumption. Availability is per model and per input.
import { isValidatedStatements } from './statements.mjs';
import { groupEligibility } from './model-inputs.mjs';
import { computeMetrics, sharesAt, trailingEarnings } from './valuation.mjs';
import { sectorModelFor } from './models.mjs';
import { ASSUMPTION_STATUS, OPERATING_MULTIPLES, FINANCIAL_DEFAULTS } from './model-defaults.mjs';
const toBn = { VND: 1e-9, million_VND: 1e-3, billion_VND: 1 };
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const latest = (st, pred) => [...st.periods].filter(pred).sort((a, b) => (a.end < b.end ? 1 : -1))[0];

export function buildValuationSetups({ ticker, loaded, statements, price, icb = {}, groupId }) {
  if (!isValidatedStatements(statements) || !statements.ok || statements.meta.ticker !== ticker) return { ok: false, code: 'STATEMENTS_NOT_VALIDATED' };
  const sector = sectorModelFor(icb.level1 || null, icb.level4 || null), metrics = computeMetrics({ statements, price });
  const sh = sharesAt({ shares: statements.shares, actions: statements.corporate_actions, date: price.date });
  const shares = { value: sh.value, as_of: price.date, base_as_of: sh.base_as_of, actions_applied: sh.actions_applied };
  const mult = OPERATING_MULTIPLES[icb.level1] || OPERATING_MULTIPLES.default;
  const out = { ok: true, ticker, sector, metrics, price, primary: null, alternative: null, flags: [] };
  const unavailable = (model, reason) => ({ model, available: false, reason, setup: null });
  const corporate = () => {
    const groups = (loaded && loaded.groups) || [];
    const g = groupId ? groups.find((x) => x.id === groupId) : [...groups].filter((x) => x.basis === 'ACTUAL' && x.scope === 'CONSOLIDATED').sort((a, b) => (b.period.fiscal_year || 0) - (a.period.fiscal_year || 0))[0];
    if (!g) return unavailable('corporate_sotp', 'GROUP_NOT_FOUND');
    const el = groupEligibility({ ticker, loaded, groupId: g.id, periodLabel: g.period.label });
    if (!el.ok) return unavailable('corporate_sotp', el.code);
    const fyP = latest(statements, (p) => p.kind === 'FY' && p.fiscal_year === el.Y && p.items.np_parent && p.items.np_total);
    if (!fyP || !(fyP.items.np_total.value > 0)) return unavailable('corporate_sotp', 'attribution: np_parent/np_total của năm cơ sở chưa có hoặc không dương');
    if (!fin(shares.value)) return unavailable('corporate_sotp', 'shares: NO_SHARE_RECORD');
    const f = toBn[g.unit];
    const setup = { model: 'corporate_sotp', variant: sector.variant, unit: 'billion_VND', price, shares, assumption_status: ASSUMPTION_STATUS, assumption_rationale: mult.rationale,
      base_period: { fiscal_year: el.Y, kind: g.period.kind, label: g.period.label }, attribution: { value: fyP.items.np_parent.value / fyP.items.np_total.value, basis: `np_parent/np_total (${fyP.id})`, period_id: fyP.id },
      components: el.ops.map((r) => ({ id: r.id, label: r.label, kind: 'PE_EARNINGS', base: { revenue: r.cells.revenue.value * f, pbt: r.cells.pbt.value * f }, multiple: { ...mult.pe }, provenance: { group: g.id, fact_ids: [r.cells.revenue.fact_id, r.cells.pbt.fact_id] } })),
      elimination: { pbt: el.elims.reduce((a, r) => a + r.cells.pbt.value, 0) * f, fact_ids: el.elims.map((r) => r.cells.pbt.fact_id) },
      holding_net_debt: 0, non_operating_assets: 0, defaults_note: 'Nợ ròng holding và tài sản phi hoạt động mặc định 0: định giá P/E đã phản ánh chi phí lãi vay; chỉ nhập khi có số liệu cấp công ty mẹ có nguồn.' };
    return { model: 'corporate_sotp', available: true, setup };
  };
  const ev = () => {
    const fyP = latest(statements, (p) => p.items.ebitda), bal = latest(statements, (p) => p.items.cash_and_investments && (p.items.debt_short || p.items.debt_long));
    if (!fyP) return unavailable('corporate_ev', 'ebitda: chưa có trong báo cáo đã duyệt');
    if (!bal) return unavailable('corporate_ev', 'net_debt: chưa có tiền/nợ vay');
    if (!fin(shares.value)) return unavailable('corporate_ev', 'shares: NO_SHARE_RECORD');
    const f = toBn[fyP.unit], fb = toBn[bal.unit];
    const setup = { model: 'corporate_ev', variant: sector.variant, unit: 'billion_VND', price, shares, assumption_status: ASSUMPTION_STATUS, assumption_rationale: mult.rationale,
      ebitda: fyP.items.ebitda.value * f, ebitda_period_id: fyP.id, net_debt: ((bal.items.debt_short?.value ?? 0) + (bal.items.debt_long?.value ?? 0) - bal.items.cash_and_investments.value) * fb, balance_period_id: bal.id,
      nci_equity: (bal.items.nci_equity?.value ?? 0) * fb, associates_book: (bal.items.associates_book?.value ?? 0) * fb, non_operating_assets: (bal.items.non_operating_assets?.value ?? 0) * fb, multiple: { ...mult.ev_ebitda },
      missing_optional: ['nci_equity', 'associates_book', 'non_operating_assets'].filter((k) => !bal.items[k]) };
    return { model: 'corporate_ev', available: true, setup };
  };
  const financial = () => {
    const D = FINANCIAL_DEFAULTS[sector.variant] || FINANCIAL_DEFAULTS.financial_services;
    const eq = latest(statements, (p) => p.items.equity_parent), te = trailingEarnings({ statements, key: 'np_parent' });
    const mk = (model) => ({ model, available: false, reason: null, setup: null });
    const pbR = !eq ? 'equity_parent: chưa có vốn chủ sở hữu công ty mẹ' : !fin(shares.value) ? 'shares: NO_SHARE_RECORD' : te.value === null ? `np_parent: ${te.reason}` : null;
    const peR = te.value === null ? `np_parent: ${te.reason}` : !fin(shares.value) ? 'shares: NO_SHARE_RECORD' : null;
    const roe0 = eq && te.value !== null ? (te.value * toBn[te.unit]) / (eq.items.equity_parent.value * toBn[eq.unit]) : null, roeBase = fin(roe0) && roe0 > 0 ? roe0 : null;
    const setup = { model: 'financial_pb', variant: sector.variant, unit: 'billion_VND', price, shares, assumption_status: ASSUMPTION_STATUS, assumption_rationale: D.rationale,
      equity_parent: eq ? eq.items.equity_parent.value * toBn[eq.unit] : null, equity_period_id: eq ? eq.id : null, np_parent_ttm: te.value === null ? null : te.value * toBn[te.unit], earnings_basis: te.basis, earnings_caveat: te.caveat || null,
      assumptions: { roe: roeBase === null ? null : { low: roeBase - D.roe_spread, base: roeBase, high: roeBase + D.roe_spread }, coe: D.coe, growth: D.growth, haircut: D.haircut, target_pe: D.target_pe, earnings_growth: D.earnings_growth },
      assumptions_note: roeBase === null ? 'ROE cuối kỳ không tính được (lợi nhuận hoặc vốn chủ thiếu/không dương): cần nhập ROE bền vững thủ công.' : 'ROE cơ sở = lợi nhuận cổ đông công ty mẹ (TTM/năm gần nhất) ÷ vốn chủ công ty mẹ cuối kỳ; low/high = ±' + D.roe_spread };
    const prim = pbR ? { ...mk('financial_pb'), reason: pbR } : { model: 'financial_pb', available: true, setup };
    const alt = peR ? { ...mk('financial_pe'), reason: peR } : { model: 'financial_pe', available: true, setup };
    return { prim, alt };
  };
  if (sector.primary === 'financial_pb') { const { prim, alt } = financial(); out.primary = prim; out.alternative = alt; }
  else { out.primary = corporate(); out.alternative = ev(); }
  return out;
}
