// Pure analytical transformations for the reader dossier. No DOM, no formatting, no network.
// Nothing here carries a value across periods, fills a null, or asserts what a source period label means.
export { MISSING } from './format.mjs';
import { ttmText } from './format.mjs';
import { comparability } from './facts.mjs';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ---- price ---------------------------------------------------------------------------------------------------------
export function priceStats(bars, { window = 252 } = {}) {
  if (!Array.isArray(bars) || bars.length === 0) return null;
  const used = [...bars].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(-window);
  for (const b of used) {
    if (!isNum(b.close)) throw new Error(`price bar ${b.date}: close must be finite`);
    if (b.close <= 0) throw new Error(`price bar ${b.date}: close must be positive`);
  }
  let high = used[0], low = used[0];
  for (const b of used) { if (b.close >= high.close) high = b; if (b.close <= low.close) low = b; }   // ties: latest date wins
  const last = used[used.length - 1];
  return {
    bars_used: used.length, last: { date: last.date, close: last.close }, high: { date: high.date, close: high.close }, low: { date: low.date, close: low.close },
    rangePos: high.close > low.close ? (last.close - low.close) / (high.close - low.close) : null,    // flat range: undefined, not 0
    fromHighPct: (last.close - high.close) / high.close, fromLowPct: (last.close - low.close) / low.close,
  };
}

// ---- finance-indicator groups ----------------------------------------------------------------------------------------
// A group is the exact (lengthReport, ttmType) pair. Labels stay raw; rows keep the export's newest-first order.
export function groupRows(rows) {
  const map = new Map();
  for (const r of rows || []) {
    if (!r.period_valid) continue;
    const key = `${r.lengthReport}|${JSON.stringify(r.ttmType)}`;
    if (!map.has(key)) map.set(key, { key, lengthReport: r.lengthReport, ttmType: r.ttmType, label: `lengthReport ${r.lengthReport} · ttmType ${ttmText(r.ttmType)}`, rows: [] });
    map.get(key).rows.push(r);
  }
  const rank = (g) => (g.ttmType === null ? '' : JSON.stringify(g.ttmType));
  return [...map.values()].sort((a, b) => a.lengthReport - b.lengthReport || (rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0));
}
// Same raw label exactly one yearReport earlier. More than one candidate is ambiguous: never picked arbitrarily.
export function priorSameLabel(group, row) {
  const c = group.rows.filter((r) => r.yearReport === row.yearReport - 1);
  if (c.length === 0) return { status: 'NO_PRIOR', row: null };
  if (c.length > 1) return { status: 'AMBIGUOUS_PRIOR', row: null, count: c.length };
  return { status: 'OK', row: c[0] };
}
export function changeBetween(cur, prior) {
  if (cur === null || cur === undefined || prior === null || prior === undefined) return { status: 'NULL_INPUT', abs: null, pct: null };
  if (!isNum(cur) || !isNum(prior)) return { status: 'NOT_FINITE', abs: null, pct: null };
  const abs = cur - prior;
  if (prior === 0) return { status: 'ZERO_BASE', abs, pct: null };            // growth from zero is undefined; zero itself is a real value
  if (prior < 0) return { status: 'NON_POSITIVE_BASE', abs, pct: null };      // a percentage on a negative base is not meaningful
  return { status: 'OK', abs, pct: abs / prior };
}
// Growth is produced only when comparability of accounting scope is evidenced (facts.mjs). Raw values are never rewritten.
export function comparableChange(metric, curRow, priorRow, facts) {
  const c = comparability(facts, curRow, priorRow);
  const MAP = { UNVERIFIED: 'SCOPE_UNVERIFIED', CHANGED_SCOPE: 'SCOPE_CHANGED', NOT_COMPARABLE: 'SCOPE_NOT_COMPARABLE' };
  if (c.status !== 'COMPARABLE_VERIFIED') return { status: MAP[c.status], abs: null, pct: null, comparability: c };
  return { ...changeBetween(curRow.values[metric], priorRow.values[metric]), comparability: c };
}
export function seriesFor(group, metric) {
  return [...group.rows].sort((a, b) => a.yearReport - b.yearReport || a.source_index - b.source_index)
    .map((r) => ({ year: r.yearReport, value: isNum(r.values && r.values[metric]) ? r.values[metric] : null, source_index: r.source_index, flags: r.flags || [], duplicate: (r.flags || []).includes('DUPLICATE_PERIOD') }));
}

// ---- peers ----------------------------------------------------------------------------------------------------------
const sameKey = (a, b) => a.period_key === b.period_key && a.lengthReport === b.lengthReport && JSON.stringify(a.ttmType) === JSON.stringify(b.ttmType);
export function peerSelection({ subject, records, peers, minPeers = 2, cap = 12 }) {
  const srow = peers && peers.rows && peers.rows[subject];
  const entry = srow && srow.entries.find((e) => !e.ambiguous);
  if (!entry) return { status: 'SUBJECT_NO_COMPARABLE_ENTRY', rule: 'The subject has no unambiguous structural-latest entry in the peer index.', rule_vi: 'Mã đang xem không có hàng mới nhất rõ ràng (hoặc nhiều hàng cùng khóa) trong chỉ mục so sánh.' };
  const LEVELS = [['level4', 'level 4 (subSector)'], ['level2', 'level 2 (sector)']];
  let last = null;
  for (const [i, [level, name]] of LEVELS.entries()) {
    const code = srow.icb[level];
    if (!code) continue;
    const same = records.filter((r) => r.sector && r.sector.icb && r.sector.icb[level] === code);
    const excluded = { same_icb_total: same.length, other_period: 0, ambiguous: 0, no_history: 0 };
    const members = [];
    for (const r of same) {
      if (r.ticker === subject) continue;
      const p = peers.rows[r.ticker];
      if (!p) { excluded.no_history++; continue; }
      const matches = p.entries.filter((e) => sameKey(e, entry));
      if (matches.length === 0) excluded.other_period++;
      else if (matches.some((e) => e.ambiguous)) excluded.ambiguous++;
      else members.push({ ticker: r.ticker, isSubject: false, values: matches[0].values });
    }
    last = { level, excluded };
    if (members.length >= minPeers) {
      members.sort((a, b) => (a.ticker < b.ticker ? -1 : 1));
      const shown = members.slice(0, Math.max(0, cap - 1));
      return {
        status: 'OK', level, group: { period_key: entry.period_key, lengthReport: entry.lengthReport, ttmType: entry.ttmType }, metrics: peers.metrics, excluded, omitted_by_cap: members.length - shown.length,
        rule: `Same ICB ${name} as the subject AND identical period_key, lengthReport and ttmType; ordered alphabetically by ticker (no size ranking) and capped at ${cap} rows including the subject.${i > 0 ? ' Fell back from level 4 because it had fewer than ' + minPeers + ' comparable peers.' : ''}`,
        rule_vi: `Cùng ICB ${level === 'level4' ? 'cấp 4 (subSector)' : 'cấp 2 (sector)'} với mã đang xem VÀ đúng cùng period_key, lengthReport, ttmType; xếp theo mã (không xếp theo quy mô), tối đa ${cap} dòng kể cả mã đang xem.${i > 0 ? ` Phải lùi từ ICB cấp 4 xuống cấp 2 vì cấp 4 có ít hơn ${minPeers} mã so sánh được.` : ''}`,
        members: [{ ticker: subject, isSubject: true, values: entry.values }, ...shown],
      };
    }
  }
  return { status: 'INSUFFICIENT_PEERS', rule: `Fewer than ${minPeers} comparable peers at ICB level 4 and level 2 for the same period_key/lengthReport/ttmType.`, rule_vi: `Có ít hơn ${minPeers} mã cùng ngành (ICB cấp 4 rồi cấp 2) có đúng cùng period_key, lengthReport, ttmType.`, excluded: last ? last.excluded : null };
}

// ---- sector profile: DISPLAY grouping only, never a formula ---------------------------------------------------------------
const PROFILES = {
  bank: { key: 'bank', label: 'Ngân hàng', metrics: ['roe', 'roa', 'npl', 'debtEquity', 'financialLeverage', 'eps', 'bv', 'sharesOutstanding', 'pe', 'pb', 'dividendYield', 'marketCap'] },
  default: { key: 'default', label: 'Doanh nghiệp (mặc định)', metrics: ['revenue', 'profit', 'grossProfitMargin', 'netProfitMargin', 'roe', 'roa', 'debtEquity', 'currentRatio', 'quickRatio', 'eps', 'bv', 'sharesOutstanding', 'asset', 'pe', 'pb', 'marketCap', 'dividendYield'] },
};
export function sectorProfile(level1) {
  const p = level1 === 'Ngân hàng' ? PROFILES.bank : PROFILES.default;
  return { ...p, formula: null, note: 'Nhóm hiển thị chỉ tiêu theo ngành để đọc cho dễ; không phải mô hình định giá và không có công thức nào được bật.' };
}
