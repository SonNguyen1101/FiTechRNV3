// Formatting only (no data logic). Vietnamese separators; null/absent is a dash, never zero.
export const MISSING = '—';
const nf = (max) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: max });
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
export const fmtNum = (v, { max = 2 } = {}) => (finite(v) ? nf(max).format(v) : MISSING);
// Source metrics keep up to 6 decimals; their units are UNVERIFIED so no unit suffix is ever added here.
export const fmtMetric = (v) => fmtNum(v, { max: 6 });
export const fmtVnd = (v) => fmtNum(v, { max: 0 });
export function fmtPct(frac) {
  if (!finite(frac)) return MISSING;
  const s = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(frac * 100);
  return `${frac > 0 ? '+' : ''}${s}%`;
}
export function fmtDate(iso) {
  const m = typeof iso === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : MISSING;
}
// Raw source labels only: the meaning of lengthReport/ttmType (quarter, year, TTM) is not verified, so none is implied.
export const ttmText = (v) => (v === null || v === undefined ? 'null' : String(v));
export const periodTitle = (r) => `yearReport ${r.yearReport} · lengthReport ${r.lengthReport} · ttmType ${ttmText(r.ttmType)}`;
// Percent-point text exactly as the reference's pp(): value is a fraction, three decimals at most, vi-VN separators ("26,75").
export const fmtDrop = (v) => (typeof v === 'number' && Number.isFinite(v) ? (Math.round(v * 100000) / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 3 }) : MISSING);
export const fmtPctU = (frac) => (typeof frac === 'number' && Number.isFinite(frac) ? `${new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(frac * 100)}%` : MISSING);
// Exactly one decimal, as the reference prints money columns ("1.458,7").
export const fmtFixed1 = (v) => (typeof v === 'number' && Number.isFinite(v) ? new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) : MISSING);
// ---- table number formats (CC-03G): one convention per quantity, no float tails, dash for invalid ----
export const fmtBillion = (v) => fmtFixed1(v);                                  // tỷ đồng, one decimal
export const fmtMultiple = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}x` : MISSING);
export const fmtRatio = (v) => (typeof v === 'number' && Number.isFinite(v) ? new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) : MISSING);
export const fmtVndUnit = (v) => fmtNum(v, { max: 0 });                         // VND per share; the unit lives in the column header
export const fmtPctPoint = (frac) => (typeof frac === 'number' && Number.isFinite(frac) ? `${frac > 0 ? '+' : ''}${new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(frac * 100)}` : MISSING);
