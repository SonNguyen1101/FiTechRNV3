// DOM-free analysis layer for the reader: everything the analytical sections display is computed here from VALIDATED inputs (statements, facts, dated price, market summary,
// peers file) through the pure modules, so the renderer only lays results out and the numbers can be checked in tests. No value is invented: a missing input yields an
// explicit reason, never a default taken from another ticker. Units: billion VND for money, VND for per-share values, number of shares.
import { isValidatedStatements } from './statements.mjs';
import { periodValue, epsRestated, sharesAt, trailingEarnings } from './valuation.mjs';
import { statementBridge, segmentDelta } from './profit-bridge.mjs';
import { projectPeriod } from './projection.mjs';
import { buildValuationSetups } from './model-setup.mjs';
import { MODELS, presetDrivers, sectorModelFor } from './models.mjs';

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const TO_BN = { VND: 1e-9, million_VND: 1e-3, billion_VND: 1 };
const bn = (item, unit) => (item && fin(item.value) ? item.value * TO_BN[unit] : null);

export const KIND_VI = { FY: 'Năm', H1: '6 tháng đầu năm', H2: '6 tháng cuối năm', Q1: 'Quý 1', Q2: 'Quý 2', Q3: 'Quý 3', Q4: 'Quý 4' };
export const STATUS_VI = { AUDITED: 'đã kiểm toán', LIMITED_REVIEW: 'soát xét', MANAGEMENT_RELEASE: 'công bố của ban lãnh đạo', UNAUDITED: 'chưa kiểm toán' };
export const DETAIL_ROWS = [['cost_of_sales', 'Giá vốn hàng bán'], ['finance_income', 'Doanh thu hoạt động tài chính'], ['finance_cost', 'Chi phí tài chính'], ['interest_expense', 'trong đó: chi phí lãi vay'], ['selling_expenses', 'Chi phí bán hàng'], ['general_admin_expenses', 'Chi phí quản lý doanh nghiệp'], ['associate_jv_profit', 'Lãi/lỗ từ công ty liên doanh, liên kết'], ['operating_profit', 'Lợi nhuận thuần từ hoạt động kinh doanh'], ['tax_current', 'Thuế TNDN hiện hành'], ['tax_deferred', 'Thuế TNDN hoãn lại']];
export const periodName = (p) => `${KIND_VI[p.kind]} ${p.fiscal_year}`;
export const latestPeriod = (st) => [...st.periods].sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : a.kind === 'FY' ? -1 : 1))[0] || null;
export const variantOf = (sectorModel) => (sectorModel.primary === 'financial_pb' ? (sectorModel.variant === 'bank' ? 'bank' : 'financial') : 'corporate');

const ROWS = {
  corporate: [['revenue', 'Doanh thu'], ['gross_profit', 'Lợi nhuận gộp'], ['ebitda', 'EBITDA'], ['pbt', 'Lợi nhuận trước thuế'], ['np_total', 'LNST (gồm lợi ích cổ đông không kiểm soát)'], ['np_parent', 'LNST thuộc công ty mẹ']],
  bank: [['nii', 'Thu nhập lãi thuần'], ['noii', 'Thu nhập ngoài lãi'], ['provisions', 'Chi phí dự phòng'], ['pbt', 'Lợi nhuận trước thuế'], ['np_parent', 'LNST thuộc công ty mẹ']],
  financial: [['revenue', 'Doanh thu'], ['pbt', 'Lợi nhuận trước thuế'], ['np_total', 'LNST'], ['np_parent', 'LNST thuộc công ty mẹ']],
};
const MARGINS = { corporate: [['gross_profit', 'revenue', 'Biên lợi nhuận gộp'], ['ebitda', 'revenue', 'Biên EBITDA'], ['pbt', 'revenue', 'Biên LNTT'], ['np_parent', 'revenue', 'Biên LNST công ty mẹ']], bank: [], financial: [['pbt', 'revenue', 'Biên LNTT'], ['np_parent', 'revenue', 'Biên LNST công ty mẹ']] };
const cmp = (cur, pri) => (cur === null || pri === null ? { status: 'NO_PRIOR' } : pri > 0 ? { status: 'OK', pct: cur / pri - 1, abs: cur - pri } : { status: 'NON_POSITIVE_BASE', abs: cur - pri });

// Same-kind, previous-fiscal-year value inside the SAME accounting scope regime (or a restated comparative supplied in that regime).
function priorOf(st, p, key) {
  const pid = `${p.fiscal_year - 1}${p.kind}`, has = st.periods.some((q) => q.id === pid);
  const v = periodValue(st, pid, key, p.scope_regime);
  if (v) return { value: v.value * TO_BN[v.unit], via: v.via, id: pid };
  const exists = has && st.periods.find((q) => q.id === pid).items[key];
  return { value: null, id: pid, status: exists ? 'INCOMPARABLE_SCOPE_REGIME' : 'NO_PRIOR' };
}
export function summarizePeriod({ st, id, variant, price = null }) {
  const p = st.periods.find((q) => q.id === id); if (!p) return { status: 'MISSING_PERIOD' };
  const unit = p.unit, row = (key, label, kind = 'money') => {
    const cur = bn(p.items[key], unit); if (cur === null) return { key, label, kind, value: null };
    const pr = priorOf(st, p, key), ch = pr.value === null ? { status: pr.status } : cmp(cur, pr.value);
    return { key, label, kind, value: cur, prior: pr.value, prior_id: pr.id, via: pr.via || null, change: ch };
  };
  const out = { status: 'COMPUTED', id, name: periodName(p), kind: p.kind, fiscal_year: p.fiscal_year, start: p.start, end: p.end, regime: p.scope_regime, scope: p.scope, review: p.status, unit: 'billion_VND', source_unit: unit, flags: [],
    income: ROWS[variant].map(([k, l]) => row(k, l)).filter((r) => r.value !== null), detail: DETAIL_ROWS.map(([k, l]) => row(k, l)).filter((r) => r.value !== null), margins: [], balance: [], cash: [], ratios: [], eps: null };
  for (const [num, den, label] of MARGINS[variant]) {
    const n = bn(p.items[num], unit), d = bn(p.items[den], unit); if (n === null || d === null || !(d > 0)) continue;
    const pn = priorOf(st, p, num), pd = priorOf(st, p, den), prior = pn.value !== null && pd.value !== null && pd.value > 0 ? pn.value / pd.value : null;
    out.margins.push({ key: `${num}/${den}`, label, kind: 'ratio', value: n / d, prior, change: prior === null ? { status: 'NO_PRIOR' } : { status: 'OK', abs: n / d - prior } });
  }
  const cash = bn(p.items.cash_and_investments, unit), ds = bn(p.items.debt_short, unit), dl = bn(p.items.debt_long, unit);
  if (variant === 'corporate') {
    if (cash !== null) out.balance.push({ key: 'cash_and_investments', label: 'Tiền và đầu tư tài chính ngắn hạn', value: cash });
    if (ds !== null || dl !== null) out.balance.push({ key: 'debt', label: 'Nợ vay (ngắn + dài hạn)', value: (ds ?? 0) + (dl ?? 0), partial: ds === null || dl === null });
    if (cash !== null && (ds !== null || dl !== null)) out.balance.push({ key: 'net_debt', label: 'Nợ ròng (nợ vay − tiền và đầu tư)', value: (ds ?? 0) + (dl ?? 0) - cash, partial: ds === null || dl === null });
    const cfo = bn(p.items.cfo, unit), capex = bn(p.items.capex, unit);
    if (cfo !== null) out.cash.push({ key: 'cfo', label: 'Dòng tiền kinh doanh', value: cfo });
    if (capex !== null) out.cash.push({ key: 'capex', label: 'Chi đầu tư tài sản cố định', value: capex });
    if (cfo !== null && capex !== null) out.cash.push({ key: 'fcf', label: 'Dòng tiền tự do (kinh doanh − chi đầu tư)', value: cfo - capex, derived: true });
  }
  for (const [k, l] of [['equity_parent', 'Vốn chủ sở hữu thuộc công ty mẹ'], ['nci_equity', 'Lợi ích cổ đông không kiểm soát'], ['total_assets', 'Tổng tài sản'], ['loans', 'Dư nợ cho vay'], ['deposits', 'Tiền gửi khách hàng']]) { const v = bn(p.items[k], unit); if (v !== null) out.balance.push({ key: k, label: l, value: v }); }
  if (variant === 'bank') {
    const L = bn(p.items.loans, unit), D = bn(p.items.deposits, unit);
    if (L !== null && D !== null && D > 0) out.ratios.push({ key: 'ldr', label: 'Cho vay ÷ tiền gửi', value: L / D, kind: 'ratio' });
    for (const [k, l] of [['npl_ratio', 'Nợ xấu (%)'], ['car', 'Hệ số an toàn vốn CAR (%)']]) if (p.items[k]) out.ratios.push({ key: k, label: l, value: p.items[k].value, kind: 'pct_number' });
  }
  const parent = bn(p.items.np_parent, unit), nci = bn(p.items.nci_profit, unit), tot = bn(p.items.np_total, unit);
  if (parent !== null && tot !== null && tot > 0) out.attribution = { parent_share: parent / tot, nci, label: 'Phần LNST thuộc công ty mẹ ÷ LNST' };
  // EPS: the published figure (on the share basis of its own period) next to a recomputed one restated to the share basis at the price date.
  if (p.items.np_parent && price) {
    const sh = sharesAt({ shares: st.shares, actions: st.corporate_actions, date: p.end });
    const earnVnd = p.items.np_parent.value * ({ VND: 1, million_VND: 1e6, billion_VND: 1e9 }[unit]);
    const r = sh.value ? epsRestated({ earnings: earnVnd, sharesAtPeriodEnd: sh.value, periodEnd: p.end, actions: st.corporate_actions, toDate: price.date }) : { value: null, reason: 'NO_SHARE_RECORD_AT_PERIOD_END' };
    out.eps = { published: p.items.eps_published ? p.items.eps_published.value : null, published_diluted: p.items.eps_diluted_published ? p.items.eps_diluted_published.value : null, shares_at_period_end: sh.value, basis_date: p.end, restated_to: price.date, restated: r.value, cumulative_ratio: r.cumulative_ratio ?? null, reason: r.reason || null, period_kind: p.kind };
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------ projection context
export function projectionContext({ st, price, shares, facts = [] }) {
  const cands = [...st.periods].filter((p) => (p.kind === 'H1' || p.kind === 'FY') && ((p.items.revenue) || (p.items.nii && p.items.noii)) && p.items.np_parent).sort((a, b) => (a.end < b.end ? 1 : -1)), p = cands[0];
  if (!p) return { ok: false, code: 'NO_PROJECTION_BASE' };
  const unit = p.unit, rev = p.items.revenue ? bn(p.items.revenue, unit) : bn(p.items.nii, unit) + bn(p.items.noii, unit);
  const base = { kind: p.kind, fiscal_year: p.fiscal_year, revenue: rev, np_parent: bn(p.items.np_parent, unit), regime: p.scope_regime, id: p.id, revenue_basis: p.items.revenue ? 'Doanh thu' : 'Thu nhập hoạt động (lãi thuần + ngoài lãi)' };
  if (p.kind === 'H1') {
    const k = p.items.revenue ? 'revenue' : null, fy = k && periodValue(st, `${p.fiscal_year - 1}FY`, k, p.scope_regime), h1 = k && periodValue(st, `${p.fiscal_year - 1}H1`, k, p.scope_regime);
    if (fy && h1) base.h2_prev = { revenue: (fy.value - h1.value) * TO_BN[fy.unit], regime: p.scope_regime };
  }
  const plan = facts.find((f) => f.section === 'dhcd' && f.agm && f.agm.metric === 'np_parent' && f.basis === 'PLAN' && f.unit === 'billion_VND' && f.agm.target_date && Number(f.agm.target_date.slice(0, 4)) === p.fiscal_year);
  return { ok: true, ctx: { base, shares, price, plan: plan ? { np_parent: plan.value, fact_id: plan.id } : null }, base_period: p };
}
export const projectionFromDrivers = (drv, fallback) => ({ growth: fin(drv.growth) ? drv.growth : fin(drv.earnings_growth) ? drv.earnings_growth : fallback.growth, margin_delta: fin(drv.margin_delta) ? drv.margin_delta : fallback.margin_delta });

// ------------------------------------------------------------------------------------------------------------------ orchestration
export function buildAnalysis({ ticker, record, prices, facts, statements }) {
  const bars = prices && prices.bars || [], last = bars.length ? bars[bars.length - 1] : null;
  const price = last ? { value: last.close, date: last.date } : null, icb = (record && record.sector && record.sector.icb) || {};
  const sector = sectorModelFor(icb.level1 || null, icb.level4 || null), variant = variantOf(sector);
  const out = { ticker, price, icb, sector, variant, ok: false, code: null, st: null };
  if (!price) return { ...out, code: 'NO_PRICE' };
  if (!statements || statements.state !== 'LOADED' || !isValidatedStatements(statements.statements)) return { ...out, code: statements ? statements.state || 'NO_STATEMENTS' : 'NO_STATEMENTS_INDEX' };
  const st = statements.statements, loaded = facts && facts.loaded ? facts.loaded : null;
  const setups = buildValuationSetups({ ticker, loaded, statements: st, price, icb });
  if (!setups.ok) return { ...out, st, code: setups.code };
  const latest = latestPeriod(st), summary = latest ? summarizePeriod({ st, id: latest.id, variant, price }) : null;
  const annual = [...st.periods].filter((p) => p.kind === 'FY').sort((a, b) => (a.end < b.end ? 1 : -1));
  let bridge = null;
  if (annual.length >= 2) { bridge = statementBridge({ statements: st, current: annual[0].id, prior: `${annual[0].fiscal_year - 1}FY`, variant: variant === 'bank' ? 'financial' : 'corporate' }); }
  if (!bridge || bridge.status !== 'COMPUTED') { // fall back to the latest half-year against the same half a year earlier
    const h = [...st.periods].filter((p) => p.kind === 'H1').sort((a, b) => (a.end < b.end ? 1 : -1))[0];
    if (h) { const alt = statementBridge({ statements: st, current: h.id, prior: `${h.fiscal_year - 1}H1`, variant: variant === 'bank' ? 'financial' : 'corporate' }); if (alt.status === 'COMPUTED' || !bridge) bridge = alt; }
  }
  const segDeltas = [];
  if (loaded) { const gs = loaded.groups.filter((g) => g.basis === 'ACTUAL' && g.scope === 'CONSOLIDATED' && g.period.fiscal_year != null).sort((a, b) => b.period.fiscal_year - a.period.fiscal_year); for (let i = 0; i + 1 < gs.length; i++) if (gs[i].taxonomy === gs[i + 1].taxonomy) for (const metric of ['revenue', 'pbt']) segDeltas.push(segmentDelta({ loaded, current: gs[i].id, prior: gs[i + 1].id, metric })); }
  const proj = projectionContext({ st, price, shares: setups.metrics.shares.value, facts: facts ? facts.facts : [] });
  return { ...out, ok: true, st, loaded, setups, metrics: setups.metrics, latest, summary, bridge, segDeltas, projection: proj };
}
export function modelEntry(analysis, which) { const e = analysis.setups && analysis.setups[which]; return e ? { ...e, def: MODELS[e.model] || null } : null; }
export function runEntry(entry, scn, drivers) { return entry && entry.available ? entry.def.run(entry.setup, drivers, scn) : null; }
export const defaultDrivers = (entry, scn) => (entry && entry.available ? presetDrivers(entry.def, scn, entry.setup) : null);
export { trailingEarnings };

// ------------------------------------------------------------------------------------------------------------------ peers
export function peerInputs({ peers, market, records }) {
  const ssi = {};
  for (const r of records) {
    const row = peers && peers.rows && peers.rows[r.ticker], e = row && row.entries && row.entries[0], v = e && e.values, mk = market && market.tickers && market.tickers[r.ticker];
    if (!v) continue;
    const num = (x) => (fin(x) ? x : null), price = mk && mk.last ? mk.last.close : null;
    ssi[r.ticker] = { pe: num(v.pe), pb: num(v.pb), roe: num(v.roe), marketCap: price !== null && fin(v.sharesOutstanding) && v.sharesOutstanding > 0 ? (price * v.sharesOutstanding) / 1e9 : null, period_key: e.period_key, shares: num(v.sharesOutstanding) };
  }
  return ssi;
}

// ------------------------------------------------------------------------------------------------------------------ AGM blocks
export const AGM_CATEGORY_VI = { DIVIDEND: 'Cổ tức', EARNINGS_PLAN: 'Kế hoạch kinh doanh', CAPITAL: 'Vốn và cổ phiếu', INVESTMENT: 'Đầu tư', ESOP: 'Cổ phiếu ưu đãi nhân viên', GOVERNANCE: 'Quản trị', OTHER: 'Khác' };
export const AGM_STATUS_VI = { APPROVED_PLAN: 'Kế hoạch đã thông qua', EXECUTED_CONFIRMED: 'Đã thực hiện (có xác nhận)', EXECUTION_NOT_CONFIRMED: 'Chưa có xác nhận thực hiện', SUPERSEDED: 'Đã được thay thế' };
export function agmBlocks(facts, asOf) {
  const items = facts.filter((f) => f.section === 'dhcd'), withAgm = items.filter((f) => f.agm), loose = items.filter((f) => !f.agm);
  const groups = new Map();
  for (const f of withAgm) {
    const a = f.agm, passed = !!a.target_date && !!asOf && a.target_date < asOf && a.status !== 'EXECUTED_CONFIRMED' && a.status !== 'SUPERSEDED';
    if (!groups.has(a.category)) groups.set(a.category, []);
    groups.get(a.category).push({ fact: f, agm: a, target_passed_unconfirmed: passed });
  }
  const order = Object.keys(AGM_CATEGORY_VI);
  return { groups: [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([category, list]) => ({ category, label: AGM_CATEGORY_VI[category], items: list })), loose };
}
