// DOM for the peer table (#nganh), the operating-assets blocks (#nhamay) and the structured AGM blocks (#dhcd). Plain text only; the only links are validated source URLs
// and same-origin ticker links. Numbers come from peers.mjs / analysis.mjs / the validated facts; nothing is computed here beyond layout.
import { selectPeers, GROUPING_LEVELS, PEER_COLUMNS, peerCell, sortPeers } from './peers.mjs';
import { peerInputs, agmBlocks, AGM_STATUS_VI } from './analysis.mjs';
import { fmtBillion, fmtMultiple, fmtRatio, fmtVndUnit, fmtPctPoint, fmtDate, fmtNum, MISSING } from './format.mjs';

const FMT = { vnd: fmtVndUnit, billion: fmtBillion, multiple: fmtMultiple, ratio: fmtRatio, pctpoint: fmtPctPoint };
const REASON_VI = { NO_VALUE: 'nguồn không có giá trị tương thích', INSUFFICIENT_HISTORY: 'chuỗi giá chưa đủ dài cho cửa sổ này', NO_BENCHMARK: 'chưa có chuỗi VN-Index' };
const UNIT_VI = { VND: 'đồng', million_VND: 'triệu đồng', billion_VND: 'tỷ đồng', percent: '%', ratio: 'lần', count: '' };
const BASIS_VI = { ACTUAL: 'Thực tế đã công bố', PLAN: 'Kế hoạch', ESTIMATE: 'Ước tính', NARRATIVE: 'Mô tả' };

export function renderPeers({ h, put, data, rec }) {
  const records = data.universeRecords || [rec], host = h('div', { class: 'stack', 'data-role': 'peers' });
  const ssi = peerInputs({ peers: data.peers, market: data.market, records });
  let level = 'icb_level2', sort = { key: null, dir: 'desc' };   // sort: click once = largest first (A to Z for the ticker, oldest first for the date), again = reverse, a third time = back to the default order
  const picker = h('div', { class: 'seg', role: 'group', 'aria-label': 'Cấp nhóm so sánh', id: 'peerLevel' });
  const body = h('div', { class: 'stack' });
  const draw = () => {
    for (const b of picker.children) b.setAttribute('aria-pressed', String(b.dataset.level === level));
    const sel = selectPeers({ subject: data.ticker, records, market: data.market, ssi, level });
    if (sel.status !== 'OK') { put(body, h('div', { class: 'todo', 'data-role': 'peer-status' }, h('b', { text: 'Chưa dựng được nhóm so sánh. ' }), document.createTextNode(sel.note || ({ NO_GROUP_LABEL: 'Mã không có nhãn ở cấp này.', SUBJECT_NOT_FOUND: 'Mã không có trong universe.', LEVEL_INVALID: 'Cấp nhóm không hợp lệ.' }[sel.status] || sel.status)))); return; }
    const mk = data.market, bm = sel.benchmark;
    const first = (key) => (key === 'ticker' || key === 'date' ? 'asc' : 'desc');
    const sortTh = (key, title, ...kids) => { const on = sort.key === key, b = h('button', { type: 'button', class: 'sortbtn', 'data-sort': key, title: `${title} · bấm để sắp xếp` }, ...kids, h('span', { class: 'arrow', 'aria-hidden': 'true', text: on ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '' }));
      b.addEventListener('click', () => { sort = sort.key !== key ? { key, dir: first(key) } : sort.dir === first(key) ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: null, dir: 'desc' }; draw(); });
      return h('th', { scope: 'col', 'data-col': key, 'aria-sort': on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none', title }, b); };
    const small = (t) => h('small', { style: 'display:block;font-weight:400;text-transform:none;letter-spacing:0', text: t });
    const th = h('tr', {}, sortTh('ticker', 'Mã', document.createTextNode('Mã')), sortTh('date', 'Ngày của giá đóng cửa', document.createTextNode('Ngày giá')), ...PEER_COLUMNS.map((c) => sortTh(c.id, `${c.unit} · nguồn ${c.source === 'ssi' ? 'SSI (đơn vị và ngày chưa xác minh)' : 'QRW'}`, document.createTextNode(`${c.label}${c.marketBased ? ' ★' : ''}`), small(c.unit))));
    const tb = h('tbody');
    for (const m of sortPeers(sel.members, sort.key, sort.dir)) {
      const tr = h('tr', { class: m.isSubject ? 'me' : '', 'data-ticker': m.ticker }, h('td', {}, m.isSubject ? h('b', { text: m.ticker }) : h('a', { href: `./?ticker=${m.ticker}`, text: m.ticker }), m.name ? h('small', { style: 'display:block;color:var(--mute);font-size:11px;font-weight:400', text: m.name }) : null), h('td', { text: fmtDate(m.price.date) }));
      for (const c of PEER_COLUMNS) {
        const cell = peerCell(m, c.id), p = c.window ? m.perf[c.window] : null;
        const why = cell.value !== null ? (p ? `Mã ${fmtPctPoint(p.stock)}% · VN-Index ${fmtPctPoint(p.index)}% · đến ${fmtDate(p.end_date)}` : '') : (c.window ? (bm ? REASON_VI[(mk.tickers[m.ticker].perf_unavailable || {})[c.window]] || REASON_VI.NO_VALUE : REASON_VI.NO_BENCHMARK) : REASON_VI[cell.reason] || cell.reason);
        tr.append(h('td', { 'data-col': c.id, title: why, class: cell.value !== null && cell.value < 0 && c.window ? 'neg' : '', text: cell.value === null ? MISSING : FMT[c.fmt](cell.value) }));
      }
      tb.append(tr);
    }
    const lag = bm && !bm.covers_latest_price ? ` VN-Index kết thúc sớm hơn giá ${bm.lag_days} ngày nên cửa sổ hiệu suất kết thúc ở ngày chung ${fmtDate(bm.last_date)} cho cả mã và chỉ số.` : '';
    put(body, h('div', { class: 'panel scroll' }, h('table', { class: 'tmin', id: 'peerTbl' }, h('thead', {}, th), tb)),
      h('p', { class: 'hint', 'data-role': 'peer-rule', text: `Nhóm: ${sel.level_label} = "${sel.group_label}". ${sel.criteria.join('. ')}. ${sel.counts.in_group} mã trong nhóm, hiển thị ${sel.counts.shown}${sel.counts.omitted_by_cap ? `, ${sel.counts.omitted_by_cap} mã bị cắt do giới hạn ${25} dòng` : ''}${sel.counts.no_market ? `, ${sel.counts.no_market} mã bị loại vì không có giá QRW` : ''}.` }),
      h('p', { class: 'hint', 'data-role': 'peer-columns', text: `Cột nguồn SSI (P/E, P/B, ROE, số cổ phiếu) lấy hàng mới nhất của từng mã; đơn vị và ngày của giá dùng trong P/E, P/B chưa xác minh (★ = phụ thuộc giá tại thời điểm chưa xác định), không đặt cạnh giá QRW cùng hàng. Vốn hoá = giá QRW × số cổ phiếu SSI (ngày số cổ phiếu chưa xác minh). Hiệu suất = lợi suất mã − lợi suất ${bm ? bm.code : 'VN-Index'} cùng cửa sổ (1, 3, 6 và 12 tháng).${lag} Bấm tên cột để sắp xếp (bấm lần nữa để đảo chiều, lần thứ ba để về thứ tự mặc định); ô không có số luôn xếp cuối, mã đang xem vẫn được tô nền.` }),
      sel.note ? h('p', { class: 'note', 'data-role': 'peer-note', text: sel.note }) : null,
      sel.excluded.length ? h('details', { class: 'tech', 'data-role': 'peer-excluded' }, h('summary', { text: `Mã bị loại (${sel.excluded.length})` }), h('p', { class: 'hint', text: sel.excluded.map((x) => `${x.ticker}: ${x.reason === 'NO_MARKET_DATA' ? 'không có giá QRW' : x.reason}`).join('; ') })) : null);
  };
  for (const g of GROUPING_LEVELS) { const b = h('button', { type: 'button', 'data-level': g.id, 'aria-pressed': String(g.id === level), text: g.label }); b.addEventListener('click', () => { level = g.id; draw(); }); picker.append(b); }
  put(host, picker, body); draw();
  return host;
}

// Operating assets / business units (#nhamay): numeric facts as tiles (count/amount, dated), narrative facts (subsidiaries, ownership, associates) as a list. Sector-neutral:
// only what the validated facts of THIS ticker state is shown.
export function renderOps({ h, put, facts, factItem, empty }) {
  const items = facts.filter((f) => f.section === 'nhamay');
  if (!items.length) return empty();
  const nums = items.filter((f) => f.kind === 'number'), rest = items.filter((f) => f.kind !== 'number');
  const host = h('div', { class: 'stack', 'data-role': 'ops-body' });
  if (nums.length) host.append(h('div', { class: 'tiles', id: 'opsTiles' }, ...nums.map((f) => h('div', { class: 'tile', 'data-fact': f.id }, h('div', { class: 'l', text: f.statement }), h('div', { class: 'v', text: `${fmtNum(f.value, { max: 2 })}${UNIT_VI[f.unit] ? ` ${UNIT_VI[f.unit]}` : ''}` }), h('div', { class: 's', text: `${f.period.label} · ${BASIS_VI[f.basis]} · ${f.source.title || f.source.url}` })))));
  if (rest.length) host.append(h('div', { class: 'panel', 'data-role': 'ops-units' }, h('h3', { text: 'Đơn vị, công ty con và liên kết' }), ...rest.map((f) => factItem(f))));
  return host;
}

// Structured AGM blocks (#dhcd): grouped by category; each block states the document (title/date/number), the status (approved plan vs execution confirmed), the target date and
// the metric/segment. A target date that has passed is flagged "no confirmation of execution", never rendered as executed.
export function renderAgm({ h, put, facts, asOf, factItem, empty }) {
  const items = facts.filter((f) => f.section === 'dhcd');
  if (!items.length) return empty();
  const B = agmBlocks(facts, asOf), host = h('div', { class: 'stack', 'data-role': 'agm-body' });
  const docs = new Map(); for (const g of B.groups) for (const it of g.items) docs.set(`${it.agm.document.title}|${it.agm.document.date}`, it.agm);
  if (docs.size) host.append(h('div', { class: 'agm-k', id: 'agmKpis' }, ...[...docs.values()].map((a) => h('div', {}, h('span', { class: 'l', text: `ĐHĐCĐ ${a.meeting.year}${a.meeting.date ? ` · ${fmtDate(a.meeting.date)}` : ''}` }), h('span', { class: 'v', text: a.document.number || 'Nghị quyết' }), h('span', { class: 's', text: `${a.document.title} · ngày ${fmtDate(a.document.date)}` })))));
  for (const g of B.groups) {
    const box = h('div', { class: 'panel', 'data-agm-category': g.category }, h('h3', { text: g.label }));
    for (const it of g.items) {
      const f = it.fact, a = it.agm, chipCls = a.status === 'EXECUTED_CONFIRMED' ? 'ok' : it.target_passed_unconfirmed ? 'low' : 'mid';
      const val = f.kind === 'number' ? `${fmtNum(f.value, { max: 2 })}${UNIT_VI[f.unit] ? ` ${UNIT_VI[f.unit]}` : ''}` : null;
      box.append(h('div', { class: 'ritem', 'data-fact': f.id, 'data-agm-status': a.status, style: 'grid-template-columns:1fr' },
        h('span', { class: 'rt' }, document.createTextNode(f.statement), h('span', { class: `agm-pct ${chipCls}`, 'data-role': 'agm-status', text: AGM_STATUS_VI[a.status] })),
        val ? h('span', { class: 'rd', 'data-role': 'fact-value', style: 'grid-column:1', text: `${val} · ${f.period.label} · ${BASIS_VI[f.basis]}${a.metric ? ` · chỉ tiêu ${a.metric}` : ''}${a.segment ? ` · mảng ${a.segment}` : ''}` }) : null,
        h('span', { class: 'rw', style: 'grid-column:1', text: [a.target_date ? `Mốc dự kiến: ${fmtDate(a.target_date)}` : null, a.executed_date ? `Đã thực hiện: ${fmtDate(a.executed_date)}` : null, it.target_passed_unconfirmed ? `Mốc dự kiến đã qua nhưng nguồn chưa xác nhận việc thực hiện: không coi là đã thực hiện` : null].filter(Boolean).join(' · ') }),
        h('span', { class: 'rs', style: 'grid-column:1' }, document.createTextNode(`${a.document.title} (${a.document.number || 'không số'}, ${fmtDate(a.document.date)}) · Nguồn: `), h('a', { href: f.source.url, rel: 'noopener noreferrer', target: '_blank', text: f.source.title || f.source.url }), document.createTextNode(` · truy cập ${fmtDate(f.source.retrieved)} · (${f.source.locator.type}) ${f.source.locator.value}`))));
    }
    host.append(box);
  }
  if (B.loose.length) host.append(h('div', { class: 'panel', 'data-role': 'agm-other' }, h('h3', { text: 'Tài liệu và nội dung khác' }), ...B.loose.map((f) => factItem(f))));
  return host;
}

// Peer table availability for the content-coverage line: needs market data and at least two members at the default level.
export function peersAvailable(data, rec) {
  if (!data.market) return false;
  const records = data.universeRecords || [rec];
  const sel = selectPeers({ subject: data.ticker, records, market: data.market, ssi: peerInputs({ peers: data.peers, market: data.market, records }) });
  return sel.status === 'OK' && sel.members.length > 1;
}
