// Peer comparison: explicit grouping level (ICB level 2 by default, matching FiTechTrade's comparison convention; level 4 and GICS selectable), an explicit column
// specification (never a silent slice), per-ticker price date and performance aligned to the benchmark window. A ratio without a compatible denominator is a dash
// with a reason; it never removes the peer. Pure, DOM-free.
export const GROUPING_LEVELS = [
  { id: 'icb_level2', label: 'ICB cấp 2 (mặc định)', short: 'ICB cấp 2', get: (r) => (r.sector && r.sector.icb && r.sector.icb.level2) || null },
  { id: 'icb_level4', label: 'ICB cấp 4', short: 'ICB cấp 4', get: (r) => (r.sector && r.sector.icb && r.sector.icb.level4) || null },
  { id: 'gics_sector_l2', label: 'GICS ngành cấp 2', short: 'GICS ngành cấp 2', get: (r) => (r.sector && r.sector.gics && r.sector.gics.sector_l2) || null },
];
// unit/source are stated per column; market-based columns depend on a price at an unspecified source date (★).
export const PEER_COLUMNS = [
  { id: 'price', label: 'Giá', unit: 'VND', source: 'market', marketBased: false, fmt: 'vnd' },
  { id: 'mcap', label: 'Vốn hoá', unit: 'tỷ đồng', source: 'ssi', marketBased: true, fmt: 'billion' },
  { id: 'pe', label: 'P/E', unit: '×', source: 'ssi', marketBased: true, fmt: 'multiple' },
  { id: 'pb', label: 'P/B', unit: '×', source: 'ssi', marketBased: true, fmt: 'multiple' },
  { id: 'roe', label: 'ROE', unit: 'thang SSI chưa xác minh', source: 'ssi', marketBased: false, fmt: 'ratio' },
  { id: 'perf1m', label: '1 tháng so VN-Index', unit: 'điểm %', source: 'market', marketBased: false, fmt: 'pctpoint', window: '1M' },
  { id: 'perf3m', label: '3 tháng so VN-Index', unit: 'điểm %', source: 'market', marketBased: false, fmt: 'pctpoint', window: '3M' },
  { id: 'perf6m', label: '6 tháng so VN-Index', unit: 'điểm %', source: 'market', marketBased: false, fmt: 'pctpoint', window: '6M' },
  { id: 'perf12m', label: '12 tháng so VN-Index', unit: 'điểm %', source: 'market', marketBased: false, fmt: 'pctpoint', window: '12M' },
];
export function peerCell(m, id) {
  const col = PEER_COLUMNS.find((c) => c.id === id), w = col && col.window;
  const v = w ? (m.perf && m.perf[w] ? m.perf[w].relative : null) : { price: m.price && m.price.value, mcap: m.ssi && m.ssi.marketCap, pe: m.ssi && m.ssi.pe, pb: m.ssi && m.ssi.pb, roe: m.ssi && m.ssi.roe }[id];
  return typeof v === 'number' && Number.isFinite(v) ? { value: v } : { value: null, reason: 'NO_VALUE' };
}
// Column sort for the rows already selected (the cap and the default order are applied by selectPeers). Pure; never mutates its input. Missing values stay last in both directions;
// ties and an unknown or empty key keep the original order. Text (ticker) compares as plain strings, the price date as ISO text.
export const PEER_SORT_KEYS = ['ticker', 'date', ...PEER_COLUMNS.map((c) => c.id)];
export function sortPeers(members, key, dir = 'desc') {
  if (!PEER_SORT_KEYS.includes(key)) return members.slice();
  const val = (m) => (key === 'ticker' ? m.ticker : key === 'date' ? (m.price && m.price.date) || null : peerCell(m, key).value), sign = dir === 'asc' ? 1 : -1;
  return members.map((m, i) => ({ m, i, v: val(m) })).sort((a, b) => (a.v === null) - (b.v === null) || (a.v === null ? 0 : (a.v < b.v ? -1 : a.v > b.v ? 1 : 0) * sign) || a.i - b.i).map((x) => x.m);
}
export function selectPeers({ subject, records, market, ssi = {}, level = 'icb_level2', cap = 25 }) {
  const lv = GROUPING_LEVELS.find((g) => g.id === level);
  if (!lv) return { status: 'LEVEL_INVALID', members: [], excluded: [] };
  const sub = records.find((r) => r.ticker === subject);
  if (!sub) return { status: 'SUBJECT_NOT_FOUND', members: [], excluded: [] };
  const label = lv.get(sub);
  if (!label) return { status: 'NO_GROUP_LABEL', level, members: [], excluded: [], note: `Mã này không có nhãn ${lv.short}; chọn cấp nhóm khác.`, counts: { in_group: 0, shown: 0 } };
  const group = records.filter((r) => lv.get(r) === label), withMarket = [], excluded = [];
  for (const r of group) {
    const mk = market && market.tickers && market.tickers[r.ticker];
    if (!mk || !mk.last) { excluded.push({ ticker: r.ticker, reason: 'NO_MARKET_DATA' }); continue; }
    withMarket.push({ ticker: r.ticker, isSubject: r.ticker === subject, name: r.company && r.company.status === 'SOURCE_BACKED' ? r.company.name : null, price: { value: mk.last.close, date: mk.last.date }, perf: mk.perf || {}, ssi: ssi[r.ticker] || {} });
  }
  withMarket.sort((a, b) => (a.isSubject ? -1 : b.isSubject ? 1 : (b.ssi.marketCap ?? -1) - (a.ssi.marketCap ?? -1) || (a.ticker < b.ticker ? -1 : 1)));
  const members = withMarket.slice(0, cap);
  return { status: 'OK', level, group_label: label, level_label: lv.short, members, excluded,
    counts: { in_group: group.length, shown: members.length, omitted_by_cap: withMarket.length - members.length, no_market: excluded.length },
    criteria: [`Cùng ${lv.short} với mã đang xem ("${label}")`, 'Có giá đóng cửa trong dữ liệu QRW (ngày giá ghi ở từng dòng)', `Sắp theo vốn hoá giảm dần khi có, mã đang xem luôn ở đầu; tối đa ${cap} dòng`],
    benchmark: market && market.benchmark ? market.benchmark : null,
    note: members.length <= 1 ? 'Nhóm này chỉ có một mã có dữ liệu thị trường nên chưa có gì để so sánh; chọn cấp nhóm khác để xem thêm.' : null };
}
