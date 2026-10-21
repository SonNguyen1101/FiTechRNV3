// Runnable sector valuation engines. Every engine is a pure function of (setup, drivers, scenario): the SETUP holds immutable historical inputs plus labelled
// assumptions, DRIVERS are the editable controls, outputs are calculated. Results are modelling aids on explicit assumptions, not published forecasts or advice.
// Units: billion VND for earnings/values, VND for prices, number of shares for share counts. No engine fabricates an input: missing inputs make the affected
// result null with the exact path (NULL_INPUT); nothing is silently defaulted to zero.
import { upside } from './valuation.mjs';
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
export const perShare = (billion, shares) => (fin(billion) && fin(shares) && shares > 0 ? Number(((billion * 1e9) / shares).toFixed(6)) : null);
const pick = (t, scn) => (t && fin(t[scn]) ? t[scn] : null);

const ps = (setup, equity) => { const v = perShare(equity, setup.shares && setup.shares.value); return { value: v, shares: setup.shares && setup.shares.value, shares_as_of: setup.shares && setup.shares.as_of }; };
const base = (setup, extra) => ({ status: 'COMPUTED', unit: setup.unit, missing: [], flags: [], per_share: { value: null }, upside: { value: null }, ...extra });
const finish = (setup, r, equity) => { r.equity_value = equity; r.per_share = ps(setup, equity); r.upside = upside({ fair: r.per_share.value, price: setup.price && setup.price.value }); r.price = setup.price; return r; };

// ---- corporate SOTP (primary) ---------------------------------------------------------------------------------------------------
export function runCorporateSotp(setup, d, scn) {
  const r = base(setup, { model: 'corporate_sotp', components: [], elimination: null, sum_components: null, holding_discount_amount: null, equity_value: null });
  if (!Array.isArray(setup.components) || !setup.components.length) return { ...r, status: 'NO_COMPONENTS', missing: ['components'] };
  const attr = setup.attribution ? setup.attribution.value : null;
  let weightedMult = 0, weight = 0;
  for (const c of setup.components) {
    const o = { id: c.id, label: c.label, kind: c.kind, flags: [], value: null, multiple_used: null, pbt_forecast: null, attributable_earnings: null, formula: '' };
    const mult = c.multiple ? pick(c.multiple, scn) : null, needsMult = c.kind !== 'NAV';
    if (needsMult && mult === null) { r.missing.push(`components.${c.id}.multiple`); r.components.push(o); continue; }
    o.multiple_used = needsMult ? mult * d.multiple_scale : null;
    const b = c.base || {}, own = fin(c.ownership) ? c.ownership : null;
    if (c.kind === 'PE_EARNINGS') {
      const pbt = fin(b.revenue) && b.revenue > 0 && fin(b.pbt) ? b.revenue * (1 + d.growth) * (b.pbt / b.revenue + d.margin_delta) : fin(b.pbt) ? b.pbt * (1 + d.growth) : null;
      if (pbt === null) { r.missing.push(`components.${c.id}.base.pbt`); r.components.push(o); continue; }
      const a = own ?? attr; if (!fin(a)) { r.missing.push('attribution'); r.components.push(o); continue; }
      o.pbt_forecast = pbt; o.attributable_earnings = pbt * (1 - d.tax) * a; o.formula = 'PBT_f × (1 − thuế) × tỷ lệ thuộc về công ty mẹ × P/E';
      if (o.attributable_earnings <= 0) { o.value = 0; o.flags.push('NEGATIVE_EARNINGS_NOT_CAPITALISED'); } else { o.value = o.attributable_earnings * o.multiple_used; weightedMult += o.multiple_used * pbt; weight += pbt; }
    } else if (c.kind === 'EV_MULTIPLE') {
      if (!fin(b.ebitda) || !fin(c.net_debt)) { r.missing.push(`components.${c.id}.base.ebitda/net_debt`); r.components.push(o); continue; }
      const ev = b.ebitda * (1 + d.growth) * o.multiple_used; o.ev = ev; o.value = (ev - c.net_debt) * (own ?? 1); o.formula = '(EBITDA_f × bội số EV/EBITDA − nợ ròng của thành phần) × sở hữu';
    } else if (c.kind === 'ASSOCIATE_PE') {
      if (!fin(b.np_share)) { r.missing.push(`components.${c.id}.base.np_share`); r.components.push(o); continue; }
      o.attributable_earnings = b.np_share * (1 + d.growth); o.value = o.attributable_earnings * o.multiple_used; o.formula = 'phần lợi nhuận sau thuế được chia × P/E (không trừ thuế/sở hữu lần nữa)';
    } else if (c.kind === 'NAV') {
      if (!fin(b.nav)) { r.missing.push(`components.${c.id}.base.nav`); r.components.push(o); continue; }
      o.value = b.nav * (own ?? 1); o.formula = 'NAV × sở hữu';
    } else { r.missing.push(`components.${c.id}.kind`); }
    r.components.push(o);
  }
  if (setup.elimination && fin(setup.elimination.pbt)) {
    const pbt = setup.elimination.pbt * (1 + d.growth), a = attr, m = weight > 0 ? weightedMult / weight : null;
    r.elimination = { pbt_forecast: pbt, multiple_used: m, value: pbt === 0 ? 0 : (m !== null && fin(a) ? pbt * (1 - d.tax) * a * m : null), formula: 'loại trừ lợi nhuận nội bộ co giãn theo tăng trưởng, định giá theo bội số bình quân gia quyền của các thành phần P/E' };
    if (r.elimination.value === null) r.missing.push('elimination.multiple');
  } else r.elimination = { pbt_forecast: 0, value: 0, multiple_used: null };
  if (r.missing.length) return { ...r, status: 'NULL_INPUT', sum_components: null, per_share: { value: null }, upside: { value: null } };
  r.sum_components = r.components.reduce((a, c) => a + c.value, 0) + r.elimination.value;
  r.holding_discount_amount = -r.sum_components * d.holding_discount;
  const equity = r.sum_components + r.holding_discount_amount + (setup.non_operating_assets || 0) - (setup.holding_net_debt || 0);
  return finish(setup, r, equity);
}
// ---- corporate EV/EBITDA (method B) ----------------------------------------------------------------------------------------------
export function runCorporateEv(setup, d, scn) {
  const r = base(setup, { model: 'corporate_ev', enterprise_value: null, equity_value: null, differences: [
    'Phương pháp B định giá cả tập đoàn một lần bằng EV/EBITDA hợp nhất, không cộng từng thành phần.',
    'Nợ ròng, lợi ích cổ đông không kiểm soát (theo sổ sách) trừ MỘT lần ở cấp hợp nhất; phương pháp A không trừ lại nợ của thành phần P/E để tránh trừ hai lần.',
    'Công ty liên kết cộng theo giá trị sổ sách và chỉ một lần (EBITDA hợp nhất không gồm phần lãi liên kết), tránh cộng hai lần với P/E liên kết ở phương pháp A.',
    'Không có chiết khấu holding; chênh lệch với A phản ánh khác biệt phương pháp, không phải tăng trưởng thêm.'] });
  const need = { ebitda: setup.ebitda, net_debt: setup.net_debt, multiple: setup.multiple && pick(setup.multiple, scn) };
  for (const [k, v] of Object.entries(need)) if (!fin(v)) r.missing.push(k);
  if (r.missing.length) return { ...r, status: 'NULL_INPUT' };
  r.enterprise_value = setup.ebitda * (1 + d.growth) * need.multiple * d.multiple_scale;
  const equity = r.enterprise_value - setup.net_debt - (setup.nci_equity || 0) + (setup.associates_book || 0) + (setup.non_operating_assets || 0);
  return finish(setup, r, equity);
}
// ---- financial (bank / securities / insurance): justified P/B and P/E alternative --------------------------------------------------
export function runFinancialPb(setup, d, scn) {
  const r = base(setup, { model: 'financial_pb', variant: setup.variant, justified_pb: null, bvps: null });
  if (!fin(setup.equity_parent)) return { ...r, status: 'NULL_INPUT', missing: ['equity_parent'] };
  if (!fin(setup.shares && setup.shares.value) || setup.shares.value <= 0) return { ...r, status: 'NULL_INPUT', missing: ['shares'] };
  if (![d.roe, d.coe, d.growth, d.haircut].every(fin) || d.roe <= 0 || d.coe <= d.growth || d.growth >= d.roe) return { ...r, status: 'INVALID_ASSUMPTIONS' };
  r.justified_pb = (d.roe - d.growth) / (d.coe - d.growth);
  r.bvps = (setup.equity_parent * (1 - d.haircut) * 1e9) / setup.shares.value;
  r.equity_value = r.justified_pb * setup.equity_parent * (1 - d.haircut);
  r.per_share = { value: r.justified_pb * r.bvps, shares: setup.shares.value, shares_as_of: setup.shares.as_of }; r.upside = upside({ fair: r.per_share.value, price: setup.price.value }); r.price = setup.price;
  return r;
}
export function runFinancialPe(setup, d, scn) {
  const r = base(setup, { model: 'financial_pe', variant: setup.variant, eps_forward: null });
  if (!fin(setup.np_parent_ttm)) return { ...r, status: 'NULL_INPUT', missing: ['np_parent_ttm'] };
  if (!fin(setup.shares && setup.shares.value) || setup.shares.value <= 0) return { ...r, status: 'NULL_INPUT', missing: ['shares'] };
  if (![d.target_pe, d.earnings_growth].every(fin) || d.target_pe <= 0) return { ...r, status: 'INVALID_ASSUMPTIONS' };
  r.eps_forward = ((setup.np_parent_ttm * 1e9) / setup.shares.value) * (1 + d.earnings_growth);
  r.per_share = { value: d.target_pe * r.eps_forward, shares: setup.shares.value, shares_as_of: setup.shares.as_of }; r.equity_value = (r.per_share.value * setup.shares.value) / 1e9;
  r.upside = upside({ fair: r.per_share.value, price: setup.price.value }); r.price = setup.price;
  return r;
}

// ---- registry: spec (drivers/equations) + runner ------------------------------------------------------------------------------------
const drv = (id, label, unit, min, max, step, presets, fmt = 'pct') => ({ id, label, unit, min, max, step, presets, fmt });
export const MODELS = {
  corporate_sotp: { id: 'corporate_sotp', label: 'Cộng từng phần (SOTP)', run: runCorporateSotp, headline: true,
    equations: ['PBT_f(c) = doanh thu × (1+g) × (biên + Δbiên)', 'Giá trị thành phần P/E = PBT_f × (1−thuế) × tỷ lệ thuộc công ty mẹ × P/E', 'Giá trị EV = (EBITDA_f × bội số − nợ ròng thành phần) × sở hữu', 'Liên kết = lợi nhuận được chia × P/E; NAV = giá trị × sở hữu',
      'Tổng = Σ thành phần + loại trừ; trừ chiết khấu holding; + tài sản phi hoạt động − nợ ròng holding; ÷ cổ phiếu hiện hành tại ngày giá'],
    drivers: [drv('growth', 'Tăng trưởng LNTT hợp nhất', '%', -0.2, 0.4, 0.005, { low: 0.0, base: 0.08, high: 0.15 }), drv('margin_delta', 'Thay đổi biên LNTT', 'điểm %', -0.05, 0.05, 0.0025, { low: -0.01, base: 0, high: 0.01 }),
      drv('multiple_scale', 'Hệ số bội số so với mặc định ngành', '×', 0.6, 1.4, 0.05, { low: 0.85, base: 1, high: 1.15 }, 'num'), drv('holding_discount', 'Chiết khấu holding', '%', 0, 0.3, 0.01, { low: 0.15, base: 0.10, high: 0.05 }), drv('tax', 'Thuế suất hiệu dụng', '%', 0.1, 0.3, 0.005, { low: 0.2, base: 0.2, high: 0.2 })],
    axes: { x: 'multiple_scale', y: 'growth' } },
  corporate_ev: { id: 'corporate_ev', label: 'EV/EBITDA hợp nhất (phương pháp B)', run: runCorporateEv,
    equations: ['EV = EBITDA × (1+g) × bội số', 'Vốn chủ = EV − nợ ròng − NCI (sổ sách) + liên kết (sổ sách) + tài sản phi hoạt động', 'Mỗi cổ phiếu = Vốn chủ ÷ cổ phiếu hiện hành'],
    drivers: [drv('growth', 'Tăng trưởng EBITDA', '%', -0.2, 0.4, 0.005, { low: 0.0, base: 0.08, high: 0.15 }), drv('margin_delta', 'Thay đổi biên (không dùng ở B)', 'điểm %', -0.05, 0.05, 0.0025, { low: 0, base: 0, high: 0 }), drv('multiple_scale', 'Hệ số bội số EV/EBITDA', '×', 0.6, 1.4, 0.05, { low: 0.85, base: 1, high: 1.15 }, 'num')], axes: { x: 'multiple_scale', y: 'growth' } },
  financial_pb: { id: 'financial_pb', label: 'P/B hợp lý theo ROE (tài chính)', run: runFinancialPb, headline: true,
    equations: ['P/B hợp lý = (ROE − g) ÷ (CoE − g), yêu cầu CoE > g và ROE > g', 'Vốn chủ điều chỉnh = vốn chủ công ty mẹ × (1 − trích lập thêm)', 'Giá hợp lý = P/B hợp lý × BVPS điều chỉnh'],
    drivers: [drv('roe', 'ROE bền vững', '%', 0.05, 0.3, 0.005, { low: 0.16, base: 0.18, high: 0.2 }), drv('coe', 'Chi phí vốn chủ', '%', 0.08, 0.2, 0.005, { low: 0.15, base: 0.14, high: 0.13 }), drv('growth', 'Tăng trưởng dài hạn g', '%', 0, 0.1, 0.0025, { low: 0.04, base: 0.05, high: 0.06 }), drv('haircut', 'Trích lập/điều chỉnh vốn chủ', '%', 0, 0.15, 0.005, { low: 0.03, base: 0, high: 0 })], axes: { x: 'roe', y: 'coe' } },
  financial_pe: { id: 'financial_pe', label: 'P/E mục tiêu × EPS dự phóng (phương pháp B)', run: runFinancialPe,
    equations: ['EPS dự phóng = EPS (lợi nhuận TTM ÷ cổ phiếu hiện hành) × (1 + g lợi nhuận)', 'Giá = P/E mục tiêu × EPS dự phóng (P/E mục tiêu là giả định tham chiếu ngành, không suy từ ROE)'],
    drivers: [drv('target_pe', 'P/E mục tiêu', '×', 4, 20, 0.5, { low: 7, base: 8, high: 9 }, 'num'), drv('earnings_growth', 'Tăng trưởng lợi nhuận', '%', -0.1, 0.4, 0.005, { low: 0.08, base: 0.12, high: 0.15 })], axes: { x: 'target_pe', y: 'earnings_growth' } },
};
export function presetDrivers(model, scn, setup = null) {
  const out = {};
  for (const x of model.drivers) {
    const t = setup && setup.assumptions && setup.assumptions[x.id];
    out[x.id] = t && fin(t[scn]) ? t[scn] : x.presets[scn];
  }
  return out;
}
export function sectorModelFor(level1, level4 = null) {
  const L = level1 || '';
  if (L === 'Ngân hàng') return { primary: 'financial_pb', alternative: 'financial_pe', variant: 'bank', note: 'Ngân hàng: P/B hợp lý theo ROE và P/E mục tiêu; không áp EBITDA/nợ ròng.' };
  if (L === 'Dịch vụ tài chính' || L === 'Chứng khoán') return { primary: 'financial_pb', alternative: 'financial_pe', variant: L === 'Chứng khoán' || /Môi giới|Chứng khoán/i.test(level4 || '') ? 'securities' : 'financial_services', note: 'Chứng khoán/dịch vụ tài chính: P/B theo ROE (ROE biến động theo chu kỳ), P/E làm đối chiếu.' };
  if (L === 'Bảo hiểm') return { primary: 'financial_pb', alternative: 'financial_pe', variant: 'insurance', note: 'Bảo hiểm: P/B theo ROE; EV nội tại (embedded value) cần dữ liệu tính toán bảo hiểm chưa có trong nguồn.' };
  if (L === 'Bất động sản') return { primary: 'corporate_sotp', alternative: 'corporate_ev', variant: 'real_estate', note: 'Bất động sản: thành phần NAV theo dự án (giá trị × sở hữu) cộng P/E cho phần cho thuê/dịch vụ; cần danh mục dự án có nguồn.' };
  if (!L) return { primary: 'corporate_sotp', alternative: 'corporate_ev', variant: 'generic', fallback: true, note: 'Chưa có ngành ICB: dùng mô hình doanh nghiệp tổng quát, ghi rõ là mặc định.' };
  return { primary: 'corporate_sotp', alternative: 'corporate_ev', variant: 'operating', note: 'Doanh nghiệp hoạt động: SOTP theo mảng, EV/EBITDA hợp nhất làm phương pháp đối chiếu.' };
}
export function sensitivityGrid({ model, setup, scenario, base: b, x, y }) {
  const ids = new Set(model.drivers.map((d) => d.id));
  for (const a of [x, y]) if (!ids.has(a.driver)) throw new Error(`unknown driver: ${a.driver}`);
  const rows = y.values.map((yv) => ({ y: yv, cells: x.values.map((xv) => {
    const res = model.run(setup, { ...b, [x.driver]: xv, [y.driver]: yv }, scenario);
    return { x: xv, per_share: res.per_share.value, upside: res.upside.value, status: res.status, is_base: xv === b[x.driver] && yv === b[y.driver] };
  }) }));
  return { axes: { x: { driver: x.driver, values: x.values }, y: { driver: y.driver, values: y.values } }, rows };
}
