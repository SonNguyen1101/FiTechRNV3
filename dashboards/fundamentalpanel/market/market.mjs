// Pure logic of the market page: URL-hash state, filters, sorting, pagination and cell text for the screener rows (screener.json). DOM-free and dependency-free apart from the
// shared number formats, so the same functions are tested in Node and used by the page. Nothing here computes market data: every number comes from a screener row.
import { fmtVnd, fmtPct, fmtPctU, fmtPctPoint, fmtMultiple, fmtRatio, fmtBillion, fmtDate, MISSING } from '../dossier/format.mjs';
import { WEAK_VI, weakText } from '../dossier/zones.mjs';

export const VERDICT_VI = { IN_NORMAL_BUY: 'Đã vào vùng mua thường', IN_CRASH_ZONE: 'Vào vùng sập', BELOW_CRASH_FLOOR: 'Dưới đáy vùng sập', NOT_IN_ZONE: 'Chưa vào vùng mua',
  NO_THRESHOLDS: 'Chưa có ngưỡng', NO_PREV_QUARTER: 'Thiếu quý trước', NO_BARS: 'Chưa có giá', NO_PRICE: 'Chưa có giá' };
export const WEAK_SHORT = { CRASH_NOT_DEEPER_THAN_NORMAL: 'vùng sập không sâu hơn vùng thường', LOW_SAMPLE: 'mẫu ít', DEGENERATE: 'phân vị trùng nhau', INVERTED_LEVELS: 'hai vùng đảo ngược' };
// the three verdicts that mean "the price has entered a buy or crash zone"; the grouped filter value ENTERED stands for all of them
export const ENTERED_VERDICTS = ['IN_NORMAL_BUY', 'IN_CRASH_ZONE', 'BELOW_CRASH_FLOOR'];

export const COLUMNS = [
  { id: 'ticker', label: 'Mã', title: 'Mã cổ phiếu; bấm để mở hồ sơ doanh nghiệp', sortable: true, num: false },
  { id: 'name', label: 'Tên công ty', title: 'Tên công ty theo nguồn (trống nếu nguồn không có)', sortable: true, num: false },
  { id: 'sector', label: 'Ngành (ICB cấp 2)', title: 'Ngành ICB cấp 2 theo nguồn FiTechTrade/SSI', sortable: true, num: false },
  { id: 'price', label: 'Giá (đ) · ngày', title: 'Giá đóng cửa của phiên cuối của chính mã, kèm ngày. Mã dừng hoặc chậm giữ giá và ngày cũ.', sortable: true, num: true },
  { id: 'perf3m', label: '3T so VN-Index (điểm %)', title: 'Lợi suất 3 tháng của mã trừ lợi suất VN-Index, cùng ngày kết thúc chung của hai chuỗi', sortable: true, num: true },
  { id: 'perf12m', label: '12T so VN-Index (điểm %)', title: 'Lợi suất 12 tháng của mã trừ lợi suất VN-Index, cùng ngày kết thúc chung của hai chuỗi', sortable: true, num: true },
  { id: 'range', label: 'Vị trí biên 12T', title: 'Vị trí giá cuối trong biên đóng cửa thấp nhất–cao nhất của 252 phiên gần nhất (0% = đáy, 100% = đỉnh)', sortable: true, num: true },
  { id: 'zone', label: 'Vùng giá', title: 'Vùng mua theo ngưỡng ước lượng của hệ thống (không phải thuật toán gốc), tính tới ngày giá cuối của chính mã', sortable: true, num: false },
  { id: 'pe', label: 'P/E ★', title: 'P/E theo SSI; ★ = chưa xác minh đơn vị và kỳ', sortable: true, num: true },
  { id: 'pb', label: 'P/B ★', title: 'P/B theo SSI; ★ = chưa xác minh đơn vị và kỳ', sortable: true, num: true },
  { id: 'roe', label: 'ROE ★', title: 'ROE theo SSI (thang chưa xác minh); ★ = chưa xác minh đơn vị và kỳ', sortable: true, num: true },
  { id: 'mcap', label: 'Vốn hoá ★ (tỷ đ)', title: 'Giá cuối của QRW × số cổ phiếu của SSI; ★ = số cổ phiếu chưa xác minh', sortable: true, num: true },
];

export const PAGE_SIZES = [25, 50, 100, 250];
const ALLOWED_N = [5, 10, ...PAGE_SIZES], LEVELS = ['icb2', 'icb4', 'gics'];
export const DEFAULT_STATE = Object.freeze({ q: '', ex: '', ls: '', lv: 'icb2', sec: '', stale: 30, vd: '', wk: '', stm: '', sort: 'ticker', dir: 'asc', p: 1, n: 50 });
const KEYS = Object.keys(DEFAULT_STATE);

const intIn = (s, lo, hi) => (/^\d{1,6}$/.test(s) && +s >= lo && +s <= hi ? +s : undefined);
const VALIDATE = {
  q: (s) => (s.length <= 120 ? s.toUpperCase() : undefined), ex: (s) => (['HOSE', 'HNX'].includes(s) ? s : undefined), ls: (s) => (['ACTIVE', 'STOPPED'].includes(s) ? s : undefined),
  lv: (s) => (LEVELS.includes(s) ? s : undefined), sec: (s) => (s.length <= 80 ? s : undefined), stale: (s) => intIn(s, 0, 3650), vd: (s) => (Object.hasOwn(VERDICT_VI, s) || s === 'ENTERED' ? s : undefined), wk: (s) => (s === 'in' ? s : undefined),
  stm: (s) => (['yes', 'no'].includes(s) ? s : undefined), sort: (s) => (COLUMNS.some((c) => c.id === s && c.sortable) ? s : undefined), dir: (s) => (['asc', 'desc'].includes(s) ? s : undefined),
  p: (s) => intIn(s, 1, 100000), n: (s) => { const v = intIn(s, 1, 1000); return ALLOWED_N.includes(v) ? v : undefined; },
};
export function parseHash(hash) {
  const st = { ...DEFAULT_STATE }, sp = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  for (const k of KEYS) { if (!sp.has(k)) continue; const v = VALIDATE[k](sp.get(k)); if (v !== undefined) st[k] = v; }
  return st;
}
export function serializeHash(state) {
  const sp = new URLSearchParams();
  for (const k of KEYS) if (state[k] !== DEFAULT_STATE[k]) sp.set(k, String(state[k]));
  const s = sp.toString(); return s ? `#${s}` : '';
}

const LEVEL_GET = { icb2: (r) => r.sector && r.sector.icb_level2, icb4: (r) => r.sector && r.sector.icb_level4, gics: (r) => r.sector && r.sector.gics_l2 };
const label = (r, lv) => LEVEL_GET[lv](r) || null;
const collator = new Intl.Collator('vi');

export function applyFilters(rows, st) {
  const tokens = st.q.split(/[\s,;]+/).filter(Boolean).map((t) => t.toUpperCase());
  const pass = (r) => (!tokens.length || tokens.some((t) => r.ticker.startsWith(t))) && (!st.ex || r.exchange === st.ex) && (!st.ls || r.listing_status === st.ls)
    && (!st.sec || (st.sec === '__none' ? label(r, st.lv) === null : label(r, st.lv) === st.sec)) && (!st.vd || (r.zone && (st.vd === 'ENTERED' ? ENTERED_VERDICTS.includes(r.zone.verdict) : r.zone.verdict === st.vd)))
    && (!st.stm || ((r.coverage && r.coverage.statements === 'APPROVED') === (st.stm === 'yes')));
  const isOld = (r) => st.stale > 0 && r.price && typeof r.price.days_behind_market === 'number' && r.price.days_behind_market > st.stale;
  // weak thresholds are left out of the buy-zone filters unless the user asks for them (wk=in); they stay visible when no verdict filter is set
  const buyFilter = st.vd === 'ENTERED' || ENTERED_VERDICTS.includes(st.vd), isWeak = (r) => !!(r.zone && r.zone.quality && r.zone.quality.weak);
  const others = rows.filter(pass), strong = buyFilter && st.wk !== 'in' ? others.filter((r) => !isWeak(r)) : others, kept = strong.filter((r) => !isOld(r));
  return { rows: kept, total: rows.length, shown: kept.length, hidden_by_stale: strong.length - kept.length, hidden_weak: others.length - strong.length };
}

export function sectorOptions(rows, lv) {
  const m = new Map(); let none = 0;
  for (const r of rows) { const l = label(r, lv); if (l === null) none++; else m.set(l, (m.get(l) || 0) + 1); }
  const out = [...m].sort((a, b) => collator.compare(a[0], b[0])).map(([value, count]) => ({ value, count }));
  if (none) out.push({ value: '__none', count: none }); return out;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const KEY = {
  ticker: (r) => r.ticker, name: (r) => r.name || null, sector: (r) => (r.sector && r.sector.icb_level2) || null, price: (r) => num(r.price && r.price.close),
  perf3m: (r) => num(r.perf && r.perf['3M'] && r.perf['3M'].relative), perf12m: (r) => num(r.perf && r.perf['12M'] && r.perf['12M'].relative), range: (r) => num(r.range_12m && r.range_12m.pos),
  verdict: (r) => num(r.zone && r.zone.vs_normal_upper), zone: (r) => num(r.zone && r.zone.vs_normal_upper), pe: (r) => num(r.ssi && r.ssi.pe), pb: (r) => num(r.ssi && r.ssi.pb), roe: (r) => num(r.ssi && r.ssi.roe), mcap: (r) => num(r.ssi && r.ssi.market_cap_bn),
};
// Missing values are last in BOTH directions; ties are broken by ticker (ascending) so the order is total and stable.
export function sortRows(rows, key, dir) {
  const get = KEY[key]; if (!get) throw new Error(`unknown sort key ${key}`);
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = get(a), y = get(b);
    if (x === null && y === null) return collator.compare(a.ticker, b.ticker);
    if (x === null) return 1; if (y === null) return -1;
    const c = typeof x === 'string' ? collator.compare(x, y) : x - y;
    return c !== 0 ? sign * c : collator.compare(a.ticker, b.ticker);
  });
}

export function paginate(rows, page, size) {
  const pages = Math.max(1, Math.ceil(rows.length / size)), p = Math.min(Math.max(1, Math.trunc(page) || 1), pages), start = (p - 1) * size, slice = rows.slice(start, start + size);
  return { rows: slice, pages, page: p, from: slice.length ? start + 1 : 0, to: start + slice.length, total: rows.length };
}

const COV_KEYS = ['count', 'with_prices', 'with_thresholds', 'weak', 'with_ssi', 'with_statements', 'with_facts', 'stale'];
const zeroCov = () => Object.fromEntries(COV_KEYS.map((k) => [k, 0]));
// counts per sector label (and a total) over ALL rows, never the filtered ones: how much of each sector has prices, valid thresholds, weak thresholds, SSI, approved statements, sourced facts, a stale price
export function sectorCoverage(rows, lv) {
  const m = new Map(), total = zeroCov();
  for (const r of rows) {
    const k = label(r, lv) ?? '__none', g = m.get(k) || { value: k, ...zeroCov() }; m.set(k, g);
    const c = r.coverage || {}, add = (key, on) => { if (on) { g[key]++; total[key]++; } };
    g.count++; total.count++; add('with_prices', c.prices === true); add('with_thresholds', c.thresholds === 'VALID'); add('weak', !!(r.zone && r.zone.quality && r.zone.quality.weak));
    add('with_ssi', c.ssi === true); add('with_statements', c.statements === 'APPROVED'); add('with_facts', c.facts === 'SOURCED'); add('stale', !!(r.price && r.price.stale));
  }
  const groups = [...m.values()].sort((a, b) => (a.value === '__none') - (b.value === '__none') || b.count - a.count || collator.compare(a.value, b.value));
  return { groups, total };
}

export function modalPeriod(rows) {
  const m = new Map(); for (const r of rows) { const k = r.ssi && r.ssi.period_key; if (k) m.set(k, (m.get(k) || 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
}

const OUT = (main, sub = '', extra = {}) => ({ main, sub, title: '', ...extra });
export function cellText(r, col, { modal = null, asOf = null } = {}) {
  switch (col) {
    case 'ticker': return OUT(r.ticker);
    case 'name': return OUT(r.name || MISSING);
    case 'sector': return OUT((r.sector && r.sector.icb_level2) || MISSING);
    case 'price': {
      const p = r.price || {};
      if (!Number.isFinite(p.close)) return OUT(MISSING, '');
      const badge = p.stale ? (r.listing_status === 'STOPPED' ? { kind: 'stopped', text: 'đã dừng' } : { kind: 'lag', text: `chậm ${p.days_behind_market} ngày` }) : null;
      return p.stale ? OUT(fmtVnd(p.close), `giá dừng ngày ${fmtDate(p.date)}`, { flag: 'stale', badge, title: `Phiên giá cuối của mã: ${fmtDate(p.date)}, chậm ${p.days_behind_market} ngày so với ngày thị trường` }) : OUT(fmtVnd(p.close), fmtDate(p.date), { badge: null });
    }
    case 'perf3m': case 'perf12m': {
      const w = col === 'perf3m' ? '3M' : '12M', p = r.perf && r.perf[w];
      if (!p || !Number.isFinite(p.relative)) return OUT(MISSING);
      const sub = asOf && p.end_date && p.end_date !== asOf ? `đến ${fmtDate(p.end_date)}` : '';
      return OUT(fmtPctPoint(p.relative), sub, { title: `Mã ${fmtPct(p.own)}${Number.isFinite(p.index) ? `, VN-Index ${fmtPct(p.index)}` : ''}${p.start_date ? `, từ ${fmtDate(p.start_date)} đến ${fmtDate(p.end_date)}` : ''}` });
    }
    case 'range': {
      const g = r.range_12m;
      if (!g || !Number.isFinite(g.pos)) return OUT(MISSING, '', { title: g ? 'Biên giá phẳng, vị trí không xác định' : '' });
      return OUT(fmtPctU(g.pos), '', { title: `Đỉnh ${fmtVnd(g.high.close)} (${fmtDate(g.high.date)}), đáy ${fmtVnd(g.low.close)} (${fmtDate(g.low.date)}), ${g.bars_used} phiên` });
    }
    case 'zone': {
      const z = r.zone || {}, verdict = VERDICT_VI[z.verdict] || MISSING, parts = [];
      if (z.verdict && !['NO_THRESHOLDS', 'NO_PREV_QUARTER', 'NO_BARS', 'NO_PRICE'].includes(z.verdict) && Number.isFinite(z.vs_normal_upper)) parts.push(`so cận trên ${fmtPct(z.vs_normal_upper)} · so đáy sập ${fmtPct(z.vs_crash_floor)}`);
      if (z.stale_as_of && z.as_of) parts.push(`tính đến ${fmtDate(z.as_of)}`);
      const q = z.quality, weak = !!(q && q.weak), wt = weak ? weakText(q.weak_reasons) : '';
      return OUT(verdict, parts.join(' · '), { weak, weakBadge: weak ? 'ngưỡng yếu' : null, weakShort: weak ? q.weak_reasons.map((x) => WEAK_SHORT[x] || x).join('; ') : '', weakText: wt, title: wt });
    }
    case 'pe': case 'pb': case 'roe': case 'mcap': {
      const s = r.ssi, v = s && { pe: s.pe, pb: s.pb, roe: s.roe, mcap: s.market_cap_bn }[col], f = { pe: fmtMultiple, pb: fmtMultiple, roe: fmtRatio, mcap: fmtBillion }[col];
      if (!s || !Number.isFinite(v)) return OUT(MISSING);
      let sub = modal && s.period_key && s.period_key !== modal ? s.period_key : '';
      if (col === 'mcap' && asOf && s.market_cap_price_date && s.market_cap_price_date !== asOf) sub = `giá ${fmtDate(s.market_cap_price_date)}`;
      return OUT(f(v), sub, { title: `SSI, chưa xác minh đơn vị; kỳ ${s.period_key ?? 'không rõ'}${col === 'mcap' && s.market_cap_price_date ? `; giá ngày ${fmtDate(s.market_cap_price_date)}` : ''}` });
    }
    default: throw new Error(`unknown column ${col}`);
  }
}
