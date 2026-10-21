// Buy-zone / crash-zone levels for the price section (#gia), reproducing the original's zoneLevels()/renderZone():
//   peak = highest HIGH of the PREVIOUS calendar quarter (not the rolling 12-month high)
//   normal-buy upper = peak*(1-p50_normal), normal lower = peak*(1-p75_normal), crash upper = peak*(1-p50_crash), crash floor = peak*(1-p75_crash)
// The percentages are ticker-specific inputs with provenance (validateThresholds); nothing here calibrates them, and the percentages of the
// PHP snapshot are never applied to another ticker. "Đáy vùng sập" is a statistical drawdown level, NOT an exchange daily floor price.
// Pure, DOM-free.
import { fmtVnd, fmtDrop, fmtDate } from './format.mjs';

export const QRW_PRICE_BASIS = 'QRW_1D_SOURCE_DECLARED_ADJUSTED';   // QRW's loader declares adjusted prices (source declaration; not independently checked against corporate actions)
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const TOL_DAYS = 10, LOW_SAMPLE_QUARTERS = 20;

export function quarterKey(iso) { return isIso(iso) ? `${iso.slice(0, 4)}Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}` : null; }
export function prevQuarterKey(k) { let y = Number(k.slice(0, 4)), q = Number(k.slice(5)); q--; if (q === 0) { q = 4; y--; } return `${y}Q${q}`; }
export const quarterLabel = (k) => `Q${k.slice(5)}/${k.slice(2, 4)}`;
export function quarterHighs(bars) {
  const out = {};
  for (const b of bars || []) {
    const k = quarterKey(b.date); if (!k || !isNum(b.high)) continue;
    const q = out[k] || (out[k] = { high: -Infinity, bars: 0, first: b.date, last: b.date });
    if (b.high > q.high) q.high = b.high;
    q.bars++; if (b.date < q.first) q.first = b.date; if (b.date > q.last) q.last = b.date;
  }
  return out;
}
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
function quarterBounds(k) { const y = Number(k.slice(0, 4)), m0 = (Number(k.slice(5)) - 1) * 3; return { start: new Date(Date.UTC(y, m0, 1)).toISOString().slice(0, 10), end: new Date(Date.UTC(y, m0 + 3, 0)).toISOString().slice(0, 10) }; }

// ---- thresholds with provenance ---------------------------------------------------------------------------------
export function validateThresholds(doc, { ticker }) {
  const bad = (code) => ({ ok: false, thresholds: null, issues: [{ code }] });
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return bad('BAD_DOCUMENT');
  if (doc.schema !== 'panel-zone-thresholds/1') return bad('BAD_SCHEMA');
  if (doc.ticker !== ticker) return bad('TICKER_MISMATCH');
  if (!['SOURCED_ACTUALS', 'SYNTHETIC_FIXTURE', 'ESTIMATED_METHOD'].includes(doc.data_kind)) return bad('BAD_DATA_KIND');
  if (doc.data_kind === 'ESTIMATED_METHOD' && !(doc.estimated === true && doc.estimation && typeof doc.estimation === 'object' && typeof doc.estimation.formula === 'string' && doc.estimation.params && doc.estimation.counts && typeof doc.estimation.disclaimer === 'string')) return bad('ESTIMATION_METADATA_MISSING');
  if (typeof doc.price_basis !== 'string' || !doc.price_basis.trim()) return bad('PRICE_BASIS_MISSING');
  if (typeof doc.method !== 'string' || !doc.method.trim() || typeof doc.method_version !== 'string' || !doc.method_version.trim()) return bad('METHOD_MISSING');
  const w = doc.calibration_window;
  if (!w || !isIso(w.from) || !isIso(w.to) || w.from > w.to || !Number.isInteger(w.quarters) || w.quarters < 1) return bad('CALIBRATION_WINDOW_INVALID');
  if (!doc.source || typeof doc.source !== 'object' || typeof doc.source.title !== 'string' || !doc.source.title.trim() || !isIso(doc.source.retrieved)) return bad('SOURCE_MISSING');
  for (const fam of ['normal', 'crash']) {
    const f = doc[fam];
    if (!f || ![f.p50, f.p75].every((v) => isNum(v) && v > 0 && v < 1)) return bad('PERCENTILE_OUT_OF_RANGE');
    if (f.p50 > f.p75) return bad('PERCENTILES_NOT_ORDERED');
  }
  // The PHP snapshot percentages belong to PHP; presenting them as another real ticker's calibration is refused (synthetic fixtures may reuse them for parity tests).
  const php = doc.normal.p50 === 0.22 && doc.normal.p75 === 0.2675 && doc.crash.p50 === 0.2505 && doc.crash.p75 === 0.324;
  if (php && ticker !== 'PHP' && doc.data_kind !== 'SYNTHETIC_FIXTURE') return bad('PHP_PARAMETERS_COPIED');
  return { ok: true, issues: [], thresholds: { ticker, data_kind: doc.data_kind, estimated: doc.data_kind === 'ESTIMATED_METHOD', estimation: doc.estimation ? { formula: doc.estimation.formula, counts: doc.estimation.counts, flags: doc.estimation.flags || [], disclaimer: doc.estimation.disclaimer, params: doc.estimation.params, benchmark: doc.estimation.benchmark || null } : null, price_basis: doc.price_basis, method: doc.method, method_version: doc.method_version, calibration_window: { ...w }, normal: { p50: doc.normal.p50, p75: doc.normal.p75 }, crash: { p50: doc.crash.p50, p75: doc.crash.p75 }, source: { ...doc.source }, low_sample: w.quarters < LOW_SAMPLE_QUARTERS } };
}

// ---- levels ---------------------------------------------------------------------------------------------------------
export function zoneLevels({ bars, subject, thresholds = null, asOf = null, expectedBasis = QRW_PRICE_BASIS }) {
  const base = { status: 'OK', subject, as_of: null, as_of_source: null, cur: null, prev: null, peak: null, cur_peak: null, coverage: null, levels: null, overlap: null, inverted: null, thresholds_ref: null, missing_inputs: [], y_bounds: null, verdict: null, price: null, price_basis_expected: expectedBasis };
  if (asOf !== null && !isIso(asOf)) return { ...base, status: 'AS_OF_INVALID', verdict: { code: 'NO_BARS' } };
  const all = (bars || []).filter((b) => isIso(b.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const used = asOf ? all.filter((b) => b.date <= asOf) : all;
  if (!used.length) return { ...base, status: 'NO_BARS', verdict: { code: 'NO_BARS' }, missing_inputs: ['bars'] };
  const last = used[used.length - 1], as_of = asOf || last.date, closes = used.slice(-252).map((b) => b.close).filter(isNum);
  const cur = quarterKey(as_of), prev = prevQuarterKey(cur), q = quarterHighs(used);
  const out = { ...base, as_of, as_of_source: asOf ? 'EXPLICIT' : 'LAST_BAR', cur, prev, cur_peak: q[cur] ? q[cur].high : null, price: isNum(last.close) ? last.close : null };
  const bounds = (levelVals) => { const v = closes.concat(levelVals); const lo0 = Math.min(...v), hi0 = Math.max(...v), pad = (hi0 - lo0) * 0.06; return { lo: lo0 - pad, hi: hi0 + pad }; };
  const pq = q[prev];
  if (pq) {
    out.peak = pq.high;
    const b = quarterBounds(prev), partial = dayDiff(b.start, pq.first) > TOL_DAYS || dayDiff(pq.last, b.end) > TOL_DAYS;
    out.coverage = { quarter: prev, status: partial ? 'PARTIAL' : 'COMPLETE', bars: pq.bars, first: pq.first, last: pq.last, quarter_start: b.start, quarter_end: b.end };
  } else out.missing_inputs.push('previous_quarter_bars');
  if (!thresholds) out.missing_inputs.push('thresholds');
  if (!pq) { out.status = 'PREV_QUARTER_MISSING'; out.verdict = { code: 'NO_PREV_QUARTER' }; out.y_bounds = bounds([]); return out; }
  if (!thresholds) { out.status = 'THRESHOLDS_MISSING'; out.verdict = { code: 'NO_THRESHOLDS' }; out.y_bounds = bounds([]); return out; }
  if (thresholds.ticker !== subject) { out.status = 'THRESHOLDS_TICKER_MISMATCH'; out.verdict = { code: 'NO_THRESHOLDS' }; out.y_bounds = bounds([]); return out; }
  if (thresholds.price_basis !== expectedBasis) { out.status = 'PRICE_BASIS_MISMATCH'; out.verdict = { code: 'NO_THRESHOLDS' }; out.y_bounds = bounds([]); return out; }
  const peak = pq.high, t = thresholds;
  const L = { peak, n50: peak * (1 - t.normal.p50), n75: peak * (1 - t.normal.p75), c50: peak * (1 - t.crash.p50), c75: peak * (1 - t.crash.p75) };
  out.levels = L; out.thresholds_ref = t;
  out.overlap = Math.max(L.n75, L.c75) < Math.min(L.n50, L.c50);
  out.inverted = L.c75 >= L.n50;   // the crash floor is not below the normal-buy upper level: no band between them can be drawn
  out.y_bounds = bounds([L.peak, L.n50, L.c75]);
  out.verdict = verdict(out.price, L);
  return out;
}
function verdict(p, L) {
  if (!isNum(p)) return { code: 'NO_PRICE' };
  if (p <= L.c75) return { code: 'BELOW_CRASH_FLOOR' };
  if (p <= L.c50) return { code: 'IN_CRASH_ZONE', to_floor: 1 - L.c75 / p };
  if (p <= L.n50) return { code: 'IN_NORMAL_BUY', past_lower_normal: p <= L.n75, to_lower_normal: p <= L.n75 ? null : 1 - L.n75 / p };
  return { code: 'NOT_IN_ZONE', need_drop: 1 - L.n50 / p };
}
// One source of text for the chart labels and the sidebar rows.
export function zoneLabels(z) {
  const peak = isNum(z.peak) ? `Đỉnh ${quarterLabel(z.prev)} ${fmtVnd(z.peak)}` : null;
  if (!z.levels || !z.thresholds_ref) return { peak, n50: null, c75: null, n75_title: null, c50_title: null };
  const t = z.thresholds_ref;
  return { peak, n50: `Vùng mua thường (rơi ${fmtDrop(t.normal.p50)}%): ${fmtVnd(z.levels.n50)}`, c75: `Đáy vùng sập (rơi ${fmtDrop(t.crash.p75)}%): ${fmtVnd(z.levels.c75)}`,
    n75_title: `Rơi ${fmtDrop(t.normal.p75)}%`, c50_title: `Rơi ${fmtDrop(t.crash.p50)}%` };
}

// ---- weak thresholds: ONE definition for the screener, the market page and the dossier ---------------------------------------------------------------------------
export const WEAK_VI = { CRASH_NOT_DEEPER_THAN_NORMAL: 'ngưỡng sập không sâu hơn ngưỡng thường (p50 quý sập ≤ p50 quý thường)', LOW_SAMPLE: 'mẫu ít (dưới 20 quý)',
  DEGENERATE: 'các phân vị trùng nhau nên ít nhất một vùng chỉ còn một đường', INVERTED_LEVELS: 'đáy vùng sập nằm trên cận trên vùng mua thường, hai vùng không tách được' };
// reasons in a fixed order, each at most once; a calibration flag and the rule derived from the numbers count as the same reason. DEGENERATE: no spread (p50 = p75) in at least one of the two families (rule B, chosen by the user).
export function weakReasons(t, levels = null) {
  if (!t) return [];
  const flags = t.estimation && Array.isArray(t.estimation.flags) ? t.estimation.flags : [], out = [];
  if (flags.includes('CRASH_NOT_DEEPER_THAN_NORMAL') || t.crash.p50 <= t.normal.p50) out.push('CRASH_NOT_DEEPER_THAN_NORMAL');
  if (flags.includes('LOW_SAMPLE') || t.low_sample) out.push('LOW_SAMPLE');
  if (flags.includes('DEGENERATE') || t.normal.p50 === t.normal.p75 || t.crash.p50 === t.crash.p75) out.push('DEGENERATE');
  if (levels && levels.c75 >= levels.n50) out.push('INVERTED_LEVELS');
  return out;
}
export const weakText = (reasons) => (reasons && reasons.length ? `Ngưỡng yếu: ${reasons.map((x) => WEAK_VI[x] || x).join('; ')}.` : null);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
// one sentence when the ticker's last price is older than the market date (stopped or lagging); null when it is current
export function priceStaleNote({ date, daysBehind, status }) {
  if (!isIso(date) || !(daysBehind > 0)) return null;
  const asOf = fmtDate(addDays(date, daysBehind));
  return status === 'STOPPED' ? `Giá dừng ngày ${fmtDate(date)}, chậm ${daysBehind} ngày so với ngày thị trường ${asOf}; mã đã dừng giao dịch. Vùng giá chỉ tính tới ngày này, không phải giá hiện tại.`
    : `Giá chậm ${daysBehind} ngày: phiên cuối là ${fmtDate(date)}, ngày thị trường là ${asOf}; mã vẫn niêm yết. Vùng giá chỉ tính tới ngày này, không phải giá hiện tại.`;
}

// One Vietnamese sentence for levels where the crash floor is not below the normal-buy upper level (p75 of the crash quarters smaller than p50 of the normal ones); null otherwise.
export function zoneInversionNote(z) {
  if (!z || !z.inverted || !z.thresholds_ref) return null;
  const t = z.thresholds_ref;
  return `Ngưỡng sập không sâu hơn ngưỡng thường (mức rơi p75 của quý sập ${fmtDrop(t.crash.p75)}% nhỏ hơn p50 của quý thường ${fmtDrop(t.normal.p50)}%): hai vùng không tách được; coi vùng giá này là yếu.`;
}

// ---- loading (index first, so an export without thresholds causes no failed request) ------------------------------------
export async function loadZoneThresholds(ticker, { fetch: f = globalThis.fetch, base = 'data' } = {}) {
  if (typeof ticker !== 'string' || !/^[A-Z0-9]{2,10}$/.test(ticker)) throw new Error(`invalid ticker: ${JSON.stringify(ticker)}`);
  if (!/^(\.\.\/qrw\/)?data$/.test(base)) throw new Error(`unsupported data base: ${base}`);
  const get = async (rel) => { try { const r = await f(`${base}/${rel}`); return r.ok ? await r.json() : null; } catch { return null; } };
  const idx = await get('zones/index.json');
  if (!idx || !Array.isArray(idx.tickers)) return { state: 'NO_INDEX', thresholds: null, issues: [] };
  if (!idx.tickers.includes(ticker)) return { state: 'NOT_PROVIDED', thresholds: null, issues: [] };
  const doc = await get(`zones/${ticker}.json`);
  const v = validateThresholds(doc, { ticker });
  return v.ok ? { state: 'LOADED', thresholds: v.thresholds, issues: [] } : { state: 'INVALID', thresholds: null, issues: v.issues };
}
