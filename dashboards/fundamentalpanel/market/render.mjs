// DOM for the market page: filter bar, sortable table (sticky ticker column), pagination, caption with counts. All text goes through textContent; filter state lives in the URL hash.
import { COLUMNS, PAGE_SIZES, VERDICT_VI, DEFAULT_STATE, parseHash, serializeHash, applyFilters, sortRows, paginate, sectorOptions, sectorCoverage, cellText, modalPeriod } from './market.mjs';
import { fmtDate, fmtPctU } from '../dossier/format.mjs';

const h = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v === null || v === undefined || v === false) continue; if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : v); } for (const k of kids) if (k !== null && k !== undefined) n.append(k); return n; };
const LV_LABEL = { icb2: 'ICB cấp 2', icb4: 'ICB cấp 4', gics: 'GICS cấp 2' };

export function renderMarket(host, screener, { manifest = null } = {}) {
  const rows = screener.rows, asOf = screener.as_of_market, modal = modalPeriod(rows);
  let st = parseHash(location.hash), table = null; const perf = { render_ms: null };
  const caption = h('p', { class: 'mk-caption', id: 'mkCaption', role: 'status', 'aria-live': 'polite' });
  const wrap = h('div', { class: 'wrap-table mk-scroll', id: 'mkScroll', tabindex: '0', role: 'region', 'aria-label': 'Bảng thị trường, cuộn ngang để xem thêm cột' });
  const pager = h('nav', { class: 'mk-pager', id: 'mkPager', 'aria-label': 'Phân trang' });
  const field = (label, control) => h('label', { class: 'mk-f' }, h('span', { text: label }), control);
  const sel = (id, opts, value) => { const s = h('select', { id }); for (const [v, t] of opts) s.append(h('option', { value: v, text: t })); s.value = value; return s; };

  const q = h('input', { id: 'mkQ', type: 'search', placeholder: 'VD: FPT, VN', maxlength: '120', autocomplete: 'off', 'aria-label': 'Tìm theo mã' }); q.value = st.q;
  const ex = sel('mkEx', [['', 'Tất cả sàn'], ['HOSE', 'HOSE'], ['HNX', 'HNX']], st.ex);
  const ls = sel('mkLs', [['', 'Tất cả'], ['ACTIVE', 'Đang niêm yết'], ['STOPPED', 'Đã dừng']], st.ls);
  const lv = sel('mkLv', Object.entries(LV_LABEL), st.lv), sec = h('select', { id: 'mkSec' });
  const stale = h('input', { id: 'mkStale', type: 'number', min: '0', max: '3650', step: '1', inputmode: 'numeric', 'aria-label': 'Ẩn mã có giá cũ hơn số ngày này' }); stale.value = String(st.stale);
  const vd = sel('mkVd', [['', 'Tất cả vùng giá'], ['ENTERED', 'Đã vào vùng mua (thường hoặc sập)'], ...Object.entries(VERDICT_VI).filter(([k]) => k !== 'NO_PRICE')], st.vd);
  const wk = sel('mkWk', [['', 'Loại khỏi bộ lọc vùng mua (mặc định)'], ['in', 'Gồm cả mã ngưỡng yếu']], st.wk);
  const stm = sel('mkStm', [['', 'Tất cả'], ['yes', 'Có BCTC đã duyệt'], ['no', 'Chưa có BCTC đã duyệt']], st.stm);
  const size = h('select', { id: 'mkN' }); for (const n of [...new Set([...PAGE_SIZES, st.n])].sort((a, b) => a - b)) size.append(h('option', { value: String(n), text: `${n} dòng/trang` })); size.value = String(st.n);
  const reset = h('button', { type: 'button', id: 'mkReset', text: 'Xoá bộ lọc' });
  const fillSectors = () => {
    sec.replaceChildren(h('option', { value: '', text: `Tất cả nhóm (${LV_LABEL[st.lv]})` }));
    for (const o of sectorOptions(rows, st.lv)) sec.append(h('option', { value: o.value, text: `${o.value === '__none' ? 'Không có nhãn' : o.value} (${o.count})` }));
    sec.value = st.sec; if (sec.value !== st.sec) { st = { ...st, sec: '' }; sec.value = ''; }
  };

  const filters = h('div', { class: 'mk-filters panel', id: 'mkFilters' },
    field('Tìm mã', q), field('Sàn', ex), field('Niêm yết', ls), field('Nhóm ngành', lv), field('Ngành', sec), field('Ẩn mã có giá cũ hơn (ngày)', stale), field('Vùng giá', vd), field('Mã ngưỡng yếu', wk), field('Báo cáo tài chính', stm), field('Số dòng', size), h('div', { class: 'mk-f mk-actions' }, reset));

  function readControls() {
    const prev = st, levelChanged = lv.value !== prev.lv;
    st = { ...st, q: q.value.slice(0, 120).toUpperCase(), ex: ex.value, ls: ls.value, lv: lv.value, sec: levelChanged ? '' : sec.value, stale: /^\d{1,4}$/.test(stale.value) ? +stale.value : prev.stale, vd: vd.value, wk: wk.value, stm: stm.value, n: +size.value };
    const sig = (s) => JSON.stringify([s.q, s.ex, s.ls, s.lv, s.sec, s.stale, s.vd, s.wk, s.stm, s.n]);
    if (sig(st) !== sig(prev)) st.p = 1;
  }
  const push = () => { const hash = serializeHash(st); history.replaceState(null, '', hash || `${location.pathname}${location.search}`); };
  const th = (c) => {
    const active = st.sort === c.id, el = h('th', { scope: 'col', class: `${c.num ? 'num ' : ''}${c.id === 'ticker' ? 'sticky ' : ''}c-${c.id}`, title: c.title, 'data-col': c.id, 'aria-sort': active ? (st.dir === 'asc' ? 'ascending' : 'descending') : 'none' });
    const b = h('button', { type: 'button', class: 'sortbtn', 'data-sort': c.id, text: c.label }); b.append(h('span', { class: 'arrow', 'aria-hidden': 'true', text: active ? (st.dir === 'asc' ? ' ▲' : ' ▼') : '' })); el.append(b); return el;
  };
  const cell = (r, c) => {
    const t = cellText(r, c.id, { modal, asOf });
    const td = h('td', { class: `${c.num ? 'num ' : ''}${c.id === 'ticker' ? 'sticky ' : ''}c-${c.id}`, 'data-col': c.id, title: t.title || null });
    if (c.id === 'ticker') td.append(h('a', { href: `../dossier/?ticker=${r.ticker}`, text: r.ticker }));
    else td.append(h('span', { class: `n${t.flag ? ` ${t.flag}` : ''}`, text: t.main }));
    if (c.id === 'price' && t.badge) td.append(h('span', { class: `badge ${t.badge.kind}`, text: t.badge.text }));
    if (c.id === 'zone' && t.weak) td.append(h('span', { class: 'badge weak', title: t.weakText, 'aria-label': t.weakText, text: t.weakBadge }));
    if (t.sub) td.append(h('small', { class: `sub${t.flag ? ` ${t.flag}` : ''}`, text: t.sub }));
    if (c.id === 'zone' && t.weak) td.append(h('span', { class: 'weak-reason', text: t.weakShort }));
    return td;
  };

  function render() {
    const t0 = performance.now();
    const f = applyFilters(rows, st), sorted = sortRows(f.rows, st.sort, st.dir), pg = paginate(sorted, st.p, st.n); st.p = pg.page;
    const tb = h('tbody'); for (const r of pg.rows) tb.append(h('tr', { 'data-ticker': r.ticker, 'data-stale': r.price && r.price.stale ? '1' : null }, ...COLUMNS.map((c) => cell(r, c))));
    table = h('table', { class: 'mk-table', id: 'mkTable' }, h('thead', {}, h('tr', {}, ...COLUMNS.map(th))), tb);
    wrap.replaceChildren(table);
    if (!pg.rows.length) wrap.append(h('div', { class: 'todo', 'data-role': 'empty' }, h('b', { text: 'Không có mã nào khớp bộ lọc. ' }), document.createTextNode('Nới bộ lọc hoặc bấm "Xoá bộ lọc".')));
    caption.textContent = `Hiển thị ${pg.from}–${pg.to} trong ${pg.total} mã khớp (tổng ${f.total} mã trong danh sách, ngày thị trường ${fmtDate(asOf)}).${f.hidden_by_stale ? ` Đang ẩn ${f.hidden_by_stale} mã có giá cũ hơn ${st.stale} ngày so với ngày thị trường (phần lớn là mã đã dừng giao dịch); đặt 0 để hiện tất cả.` : ''}${f.hidden_weak ? ` Đang loại ${f.hidden_weak} mã ngưỡng yếu khỏi bộ lọc vùng mua; chọn "Gồm cả mã ngưỡng yếu" để hiện.` : ''}`;
    const go = (p) => { st.p = p; push(); render(); };
    pager.replaceChildren(h('button', { type: 'button', 'data-page': 'prev', disabled: pg.page <= 1, text: '‹ Trước' }), h('span', { class: 'mk-pageinfo', text: `Trang ${pg.page}/${pg.pages}` }), h('button', { type: 'button', 'data-page': 'next', disabled: pg.page >= pg.pages, text: 'Sau ›' }));
    pager.querySelector('[data-page="prev"]').onclick = () => go(pg.page - 1); pager.querySelector('[data-page="next"]').onclick = () => go(pg.page + 1);
    wrap.querySelectorAll('.sortbtn').forEach((b) => { b.onclick = () => { const id = b.dataset.sort; st = { ...st, sort: id, dir: st.sort === id && st.dir === 'asc' ? 'desc' : 'asc', p: 1 }; push(); render(); }; });
    perf.render_ms = Math.round((performance.now() - t0) * 10) / 10; document.body.dataset.renderMs = String(perf.render_ms); document.body.dataset.rows = String(pg.rows.length);
  }
  const refresh = () => { readControls(); push(); render(); };

  for (const el of [ex, ls, sec, vd, wk, stm, size]) el.addEventListener('change', refresh);
  lv.addEventListener('change', () => { readControls(); fillSectors(); push(); render(); });
  q.addEventListener('input', refresh); stale.addEventListener('input', refresh);
  const syncControls = () => { q.value = st.q; ex.value = st.ex; ls.value = st.ls; lv.value = st.lv; vd.value = st.vd; wk.value = st.wk; stm.value = st.stm; stale.value = String(st.stale); size.value = String(st.n); fillSectors(); };
  reset.addEventListener('click', () => { st = { ...DEFAULT_STATE }; syncControls(); push(); render(); });
  window.addEventListener('hashchange', () => { st = parseHash(location.hash); syncControls(); render(); });

  fillSectors();
  const notes = h('div', { class: 'mk-notes' },
    h('p', { class: 'hint', text: `★ = số liệu SSI chưa xác minh đơn vị và kỳ (kỳ phổ biến nhất: ${modal ?? 'không rõ'}; mã nào khác kỳ này ghi kỳ riêng dưới số). Vốn hoá = giá cuối của QRW × số cổ phiếu của SSI. Hiệu suất so VN-Index lấy ngày kết thúc chung của mã và chỉ số.` }),
    h('p', { class: 'hint', text: 'Vùng giá dùng ngưỡng ƯỚC LƯỢNG của hệ thống (không phải thuật toán "Chặt" gốc), tính tới ngày giá cuối của chính mã. Mã dừng giao dịch hoặc chậm giữ giá và ngày cũ, không được coi là giá hiện tại.' }));
  // ---- coverage by ICB level 2: always over ALL rows, not the filtered ones
  const cov = sectorCoverage(rows, 'icb2'), covCols = [['with_prices', 'Có giá'], ['with_thresholds', 'Có ngưỡng'], ['weak', 'Ngưỡng yếu'], ['with_ssi', 'Có SSI ★'], ['with_statements', 'BCTC đã duyệt'], ['with_facts', 'Facts có nguồn'], ['stale', 'Giá dừng/chậm']];
  const covCell = (g, k) => h('td', { class: 'num', 'data-k': k }, h('span', { class: 'n', text: String(g[k]) }), h('small', { class: 'sub', text: g.count ? fmtPctU(g[k] / g.count) : '—' }));
  const covRow = (g, total = false) => h('tr', { 'data-sector': total ? '__total' : g.value, class: total ? 'total' : null },
    h('th', { scope: 'row', class: 'cov-name' }, total ? document.createTextNode('Tất cả các nhóm') : h('a', { href: `#lv=icb2&sec=${encodeURIComponent(g.value)}&stale=0`, text: g.value === '__none' ? 'Không có nhãn ngành' : g.value })),
    h('td', { class: 'num', 'data-k': 'count' }, h('span', { class: 'n', text: String(g.count) })), ...covCols.map(([k]) => covCell(g, k)));
  const covTable = h('table', { class: 'mk-table mk-cov-table', id: 'covTbl' }, h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Ngành (ICB cấp 2)' }), h('th', { scope: 'col', class: 'num', text: 'Số mã' }), ...covCols.map(([, t]) => h('th', { scope: 'col', class: 'num', text: t })))),
    h('tbody', {}, ...cov.groups.map((g) => covRow(g))), h('tfoot', {}, covRow(cov.total, true)));
  const covSection = h('section', { id: 'mkCoverage', class: 'mk-cov' }, h('div', { class: 'sechead' }, h('div', {}, h('h2', { text: 'Độ phủ dữ liệu theo ngành (ICB cấp 2)' }),
    h('p', { text: 'Tính trên toàn bộ danh sách, không theo bộ lọc. Mỗi ô là số mã có dữ liệu đó và tỷ lệ trên số mã của ngành. Bấm tên ngành để lọc bảng theo ngành (hiện cả mã giá cũ).' }))),
    h('div', { class: 'wrap-table', role: 'region', tabindex: '0', 'aria-label': 'Bảng độ phủ theo ngành, cuộn ngang để xem thêm cột' }, covTable),
    h('p', { class: 'hint', text: 'BCTC đã duyệt và facts có nguồn là dữ liệu do người duyệt nhập, nên có thể là 0 ở nhiều ngành. Ngưỡng yếu: ngưỡng ước lượng không đủ tin cậy (xem lý do ở từng mã). Giá dừng/chậm: giá cuối cũ hơn ngày thị trường.' }));
  host.append(filters, caption, wrap, pager, notes, covSection);
  render();
  return { getState: () => ({ ...st }), perf };
}
