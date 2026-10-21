// Per-ticker zone calibration PIPELINE (proposal for controller evaluation). This is NOT the original "Chặt" algorithm, which is unknown; it is an explicitly named
// ESTIMATED_METHOD with a complete formula, quantile convention, sample selection, price basis and benchmark coverage, plus a sensitivity table. Pure, DOM-free.
//
// Formula (quarterly running-peak drawdown):  for calendar quarter q with previous-quarter peak P(q-1) = max high of q-1 and trough T(q) = min low (or min close) of q,
//   dd(q) = 1 − T(q) / P(q-1).  Crash quarters = quarters whose BENCHMARK (VNINDEX) dd(q), computed the same way on the same quarter, is >= crash_threshold; normal = the rest.
//   normal.p50/p75 and crash.p50/p75 = quantiles of the stock's dd(q) over the normal / crash quarters (default type-7 linear interpolation).
// Selection: only quarters COMPLETE in both stock and benchmark (first/last bar within 10 days of the quarter bounds), inside the window (last N years before as_of, or all).
export const METHOD_ID = 'ESTIMATED_QUARTERLY_RUNNING_PEAK_DRAWDOWN';
export const METHOD_VERSION = 'est-1';
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const TOL_DAYS = 10;
const qKey = (d) => `${d.slice(0, 4)}Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`;
const prevKey = (k) => { let y = Number(k.slice(0, 4)), q = Number(k.slice(5)); q--; if (q === 0) { q = 4; y--; } return `${y}Q${q}`; };
const bounds = (k) => { const y = Number(k.slice(0, 4)), m0 = (Number(k.slice(5)) - 1) * 3; return { start: new Date(Date.UTC(y, m0, 1)).toISOString().slice(0, 10), end: new Date(Date.UTC(y, m0 + 3, 0)).toISOString().slice(0, 10) }; };
const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

export function quantile(sortedAsc, p, convention = 'linear') {
  if (!(p >= 0 && p <= 1)) throw new Error('quantile: p must be in [0,1]');
  const a = sortedAsc, n = a.length; if (!n) return null;
  if (convention === 'nearest_rank') return a[Math.max(0, Math.ceil(p * n) - 1)];
  const h = (n - 1) * p, lo = Math.floor(h), hi = Math.ceil(h); return a[lo] + (a[hi] - a[lo]) * (h - lo);
}
export function quarterStats(bars, { trough = 'low' } = {}) {
  const m = new Map();
  for (const b of bars || []) {
    if (!isIso(b.date) || !fin(b.high) || !fin(b[trough])) continue;
    const k = qKey(b.date), s = m.get(k) || { key: k, high: -Infinity, trough: Infinity, bars: 0, first: b.date, last: b.date };
    s.high = Math.max(s.high, b.high); s.trough = Math.min(s.trough, b[trough]); s.bars++; if (b.date < s.first) s.first = b.date; if (b.date > s.last) s.last = b.date; m.set(k, s);
  }
  for (const s of m.values()) { const bd = bounds(s.key); s.complete = days(bd.start, s.first) <= TOL_DAYS && days(s.last, bd.end) <= TOL_DAYS; s.bounds = bd; }
  return m;
}
export function quarterDrawdowns(bars, { trough = 'low' } = {}) {
  const qs = quarterStats(bars, { trough }), keys = [...qs.keys()].sort(), rows = [], excluded = { incomplete: 0, no_previous: 0 };
  for (const k of keys) {
    const q = qs.get(k), p = qs.get(prevKey(k));
    if (!p) { excluded.no_previous++; continue; }
    if (!q.complete || !p.complete) { excluded.incomplete++; continue; }
    rows.push({ quarter: k, dd: 1 - q.trough / p.high, trough: q.trough, prev_peak: p.high, start: q.bounds.start, end: q.bounds.end });
  }
  return { rows, excluded };
}
export function calibrateZones({ stock, index, params }) {
  const P = { crash_threshold: 0.12, trough: 'low', quantile: 'linear', window_years: null, min_crash_quarters: 6, min_normal_quarters: 12, as_of: null, ...params };
  const out = { method: METHOD_ID, method_version: METHOD_VERSION, estimated: true, params: P, status: 'OK', thresholds: null, counts: { crash: 0, normal: 0, stock_quarters: 0 }, excluded: { stock_incomplete: 0, stock_no_previous: 0, benchmark_incomplete: 0, benchmark_missing: 0, outside_window: 0 }, flags: [], window: null, benchmark: { last_date: null, bars: 0 } };
  if (!index || !index.length) return { ...out, status: 'NO_BENCHMARK' };
  out.benchmark = { last_date: index.map((b) => b.date).sort().at(-1), bars: index.length };
  const sd = quarterDrawdowns(stock, { trough: P.trough }), id = quarterDrawdowns(index, { trough: P.trough });
  out.excluded.stock_incomplete = sd.excluded.incomplete; out.excluded.stock_no_previous = sd.excluded.no_previous; out.counts.stock_quarters = sd.rows.length;
  const idxBy = new Map(id.rows.map((r) => [r.quarter, r])), asOf = P.as_of || stock.map((b) => b.date).sort().at(-1);
  const from = P.window_years ? new Date(Date.parse(`${asOf}T00:00:00Z`) - P.window_years * 365.25 * 864e5).toISOString().slice(0, 10) : null;
  const crash = [], normal = [], used = [];
  for (const r of sd.rows) {
    if (r.end > asOf || (from && r.start < from)) { out.excluded.outside_window++; continue; }
    const ix = idxBy.get(r.quarter); if (!ix) { out.excluded.benchmark_incomplete++; continue; }
    (ix.dd >= P.crash_threshold ? crash : normal).push(r.dd); used.push(r);
  }
  out.counts.crash = crash.length; out.counts.normal = normal.length;
  out.window = used.length ? { from: used[0].start, to: used.at(-1).end, quarters: used.length } : null;
  if (crash.length < P.min_crash_quarters) return { ...out, status: 'INSUFFICIENT_CRASH_QUARTERS' };
  if (normal.length < P.min_normal_quarters) return { ...out, status: 'INSUFFICIENT_NORMAL_QUARTERS' };
  const q = (a, p) => quantile([...a].sort((x, y) => x - y), p, P.quantile);
  out.thresholds = { normal: { p50: q(normal, 0.5), p75: q(normal, 0.75) }, crash: { p50: q(crash, 0.5), p75: q(crash, 0.75) } };
  if (out.thresholds.crash.p50 <= out.thresholds.normal.p50) out.flags.push('CRASH_NOT_DEEPER_THAN_NORMAL');
  if (used.length < 20) out.flags.push('LOW_SAMPLE');
  if (!(out.thresholds.normal.p50 > 0 && out.thresholds.crash.p75 < 1)) out.status = 'DEGENERATE_THRESHOLDS';
  return out;
}
export function sensitivityTable({ stock, index, windows, thresholds, troughs, base }) {
  const cells = [];
  for (const w of windows) for (const th of thresholds) for (const tr of troughs) {
    const r = calibrateZones({ stock, index, params: { ...base, window_years: w, crash_threshold: th, trough: tr } });
    cells.push({ window_years: w, crash_threshold: th, trough: tr, status: r.status, counts: r.counts, crash_p50: r.thresholds ? r.thresholds.crash.p50 : null, crash_p75: r.thresholds ? r.thresholds.crash.p75 : null, normal_p50: r.thresholds ? r.thresholds.normal.p50 : null, normal_p75: r.thresholds ? r.thresholds.normal.p75 : null });
  }
  const ok = cells.filter((c) => c.status === 'OK'), spread = (k) => (ok.length ? Math.max(...ok.map((c) => c[k])) - Math.min(...ok.map((c) => c[k])) : null);
  return { cells, spread: { crash_p50: spread('crash_p50'), crash_p75: spread('crash_p75'), normal_p50: spread('normal_p50'), normal_p75: spread('normal_p75') } };
}
export function buildThresholdsDoc({ ticker, result, price_basis, generated_at, source }) {
  if (result.status !== 'OK') throw new Error(`cannot build thresholds from status ${result.status}`);
  return {
    schema: 'panel-zone-thresholds/1', data_kind: 'ESTIMATED_METHOD', estimated: true, ticker, price_basis, method: METHOD_ID, method_version: METHOD_VERSION,
    calibration_window: { from: result.window.from, to: result.window.to, quarters: result.window.quarters }, normal: result.thresholds.normal, crash: result.thresholds.crash, source,
    estimation: { formula: 'dd(q) = 1 − đáy(q) ÷ đỉnh(q−1); đỉnh(q−1) = high cao nhất quý trước; đáy(q) = ' + (result.params.trough === 'close' ? 'close' : 'low') + ' thấp nhất quý q. Quý sập = quý mà dd của VN-Index cùng quý ≥ ' + result.params.crash_threshold + '; quý thường = các quý còn lại. p50/p75 = phân vị của dd cổ phiếu (' + (result.params.quantile === 'linear' ? 'nội suy tuyến tính loại 7' : 'nearest-rank') + ').',
      params: result.params, counts: result.counts, excluded: result.excluded, benchmark: result.benchmark, flags: result.flags, generated_at,
      disclaimer: 'Ước lượng do hệ thống đề xuất để controller đánh giá; không phải thuật toán "Chặt" gốc và không được hiển thị như hiệu chuẩn gốc.' },
  };
}
export function checkBars(bars) {
  const q = { count: bars.length, duplicates: 0, non_positive: 0, non_finite: 0, high_below_low: 0, unsorted: false, max_gap_days: 0, first: null, last: null };
  const seen = new Set(); let prev = null;
  for (const b of bars) {
    if (seen.has(b.date)) q.duplicates++; seen.add(b.date);
    const vals = [b.open, b.high, b.low, b.close];
    if (!vals.every(fin)) q.non_finite++; else if (vals.some((v) => v <= 0)) q.non_positive++;
    if (fin(b.high) && fin(b.low) && b.high < b.low) q.high_below_low++;
    if (prev !== null) { if (b.date < prev) q.unsorted = true; else q.max_gap_days = Math.max(q.max_gap_days, days(prev, b.date)); }
    prev = b.date;
  }
  const ds = [...seen].sort(); q.first = ds[0] || null; q.last = ds.at(-1) || null; return q;
}
// QRW index CSV: `time` = Unix seconds (Asia/Saigon). The prices are used only through ratios, so their scale does not matter.
export function parseIndexCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== ''), head = lines[0].split(',').map((s) => s.trim());
  const ix = Object.fromEntries(['time', 'open', 'high', 'low', 'close'].map((k) => [k, head.indexOf(k)]));
  if (Object.values(ix).some((v) => v < 0)) throw new Error(`index CSV header must contain time,open,high,low,close; got ${JSON.stringify(head)}`);
  const bars = [], seen = new Set(); let invalid = 0;
  for (const l of lines.slice(1)) {
    const c = l.split(','), t = Number(c[ix.time]), o = Number(c[ix.open]), h = Number(c[ix.high]), lo = Number(c[ix.low]), cl = Number(c[ix.close]);
    if (!/^\d+$/.test(c[ix.time] || '') || ![t, o, h, lo, cl].every(fin) || [o, h, lo, cl].some((v) => v <= 0) || h < lo) { invalid++; continue; }
    const date = new Date(t * 1000 + 7 * 3600 * 1000).toISOString().slice(0, 10);
    if (seen.has(date)) { invalid++; continue; } seen.add(date); bars.push({ date, open: o, high: h, low: lo, close: cl });
  }
  bars.sort((a, b) => (a.date < b.date ? -1 : 1)); return { bars, invalid };
}
