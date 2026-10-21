// DOM rendering for the reader dossier. All numbers come from model.mjs / the exported files; this file only lays them out.
// No value is invented, carried across periods, or described with period words the source has not verified.
import { priceStats, groupRows, priorSameLabel, comparableChange, seriesFor, peerSelection, sectorProfile } from './model.mjs';
import { contentAvailability } from './facts.mjs';
import { zoneLevels, zoneLabels, zoneInversionNote, weakReasons, weakText, priceStaleNote, quarterLabel } from './zones.mjs';
import { buildSegmentGroups } from './segments.mjs';
import { renderSegmentsView } from './segments-view.mjs';
import { fmtNum, fmtMetric, fmtVnd, fmtPct, fmtPctU, fmtDrop, fmtDate, periodTitle, ttmText, MISSING } from './format.mjs';
import { SECTIONS, STATUS, STATUS_LABEL, coverageSummary } from './sections.mjs';
import { lineChart, barChart, zoneChart } from './charts.mjs';
import { renderTopbar, dataKindBanner } from '../shared/topbar.mjs';
import { buildAnalysis, modelEntry } from './analysis.mjs';
import { createAnalysisView } from './render-analysis.mjs';
import { renderPeers, renderOps, renderAgm, peersAvailable } from './render-blocks.mjs';

const h = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else if (k === 'html') n.innerHTML = v; else n.setAttribute(k, v); }
  for (const k of kids) if (k !== null && k !== undefined) n.append(k);
  return n;
};
const REASON_VI = {
  NO_FITECHTRADE_FINANCE_FILE_FOR_TICKER: 'Không có file finance-indicator của mã này trong snapshot FiTechTrade',
  NO_FITECHTRADE_PROFILE_FILE_FOR_TICKER: 'Không có file company-profile của mã này trong snapshot FiTechTrade',
  FINANCE_FILE_HAS_NO_ROWS: 'File finance-indicator không có dòng nào', SYMBOL_MISMATCH: 'company-profile không khớp mã nên không dùng',
};
const FLAG_VI = { INVALID_JSON: 'File không phải JSON hợp lệ', ENVELOPE_NOT_OBJECT: 'Phong bì nguồn không phải đối tượng', ENVELOPE_STATUS_NOT_OK: 'Phong bì nguồn có status khác "ok" nên không dùng', DATA_NOT_ARRAY: 'Trường data không phải mảng', PATH_ESCAPE: 'Đường dẫn file thoát khỏi thư mục nguồn nên không đọc', READ_ERROR: 'Lỗi đọc file', CHANGED_DURING_READ: 'File đổi trong lúc đọc' };
const reason = (c) => (c ? (REASON_VI[c] ? `${REASON_VI[c]} (${c})` : FLAG_VI[c] ? `${FLAG_VI[c]} (${c})` : c) : null);
// Why a ticker has no usable finance rows: an explicit missing_reason, else the flags of an unusable file, else the load problems.
const whyNoRows = (rec, problems) => { const f = rec.financials || {}; return reason(f.missing_reason) || (f.flags && f.flags.length ? f.flags.map(reason).join('; ') : null) || (problems.map((p) => p.message).join(' ') || 'Không có dòng nào.'); };
const CHANGE_NOTE = { NO_PRIOR: 'Không có hàng cùng nhãn kỳ một yearReport trước', AMBIGUOUS_PRIOR: 'Không đối chiếu: nhiều hàng cùng nhãn kỳ ở yearReport trước', NULL_INPUT: 'Thiếu giá trị ở một trong hai kỳ', ZERO_BASE: 'Kỳ trước bằng 0, tăng trưởng không xác định', NON_POSITIVE_BASE: 'Kỳ trước không dương, % không có nghĩa', NOT_FINITE: 'Giá trị không hợp lệ' };
const SCOPE_NOTE = {
  SCOPE_UNVERIFIED: 'Chưa hiển thị thay đổi: chưa có bằng chứng về phạm vi kế toán giống nhau giữa hai kỳ (cùng nhãn kỳ chưa đủ)',
  SCOPE_CHANGED: 'Không hiển thị thay đổi: doanh nghiệp công bố thay đổi phạm vi hợp nhất trong khoảng này',
  SCOPE_NOT_COMPARABLE: 'Không hiển thị thay đổi: có bằng chứng hai kỳ không so sánh được',
};
const BASIS_VI = { ACTUAL: 'Thực tế đã công bố', PLAN: 'Kế hoạch của doanh nghiệp', ESTIMATE: 'Ước tính (nêu tác giả)', NARRATIVE: 'Mô tả' };
const UNIT_VI = { VND: 'đồng', million_VND: 'triệu đồng', billion_VND: 'tỷ đồng', USD: 'USD', billion_USD: 'tỷ USD', percent: '%', ratio: 'lần', count: '' };
const SCOPE_VI = { CONSOLIDATED: 'hợp nhất', SEPARATE: 'riêng lẻ', SEGMENT: 'theo mảng', UNSPECIFIED: 'phạm vi chưa nêu trong trích dẫn' };
const ACQUIRE_CMD = 'node scripts/acquire-public-facts.mjs --sources docs/sources/<MÃ>.sources.json --install-into app/qrw/data (xem docs/CC-03E-WINDOWS-RECHECK.md)';
const FACTS_STATE_VI = { NO_FACTS_INDEX: 'Chưa có chỉ mục facts (export chưa chạy kèm bước cài facts)', NOT_ACQUIRED: 'Mã này chưa được thu thập facts có nguồn', INVALID: 'File facts của mã này không hợp lệ nên không dùng' };
const MAX_PEER_COLS = 8;
// DOM append/replaceChildren coerce null to the text "null"; every multi-child replace goes through this filter.
const put = (host, ...kids) => host.replaceChildren(...kids.filter((k) => k !== null && k !== undefined && k !== false));

function todo(sec) {
  return h('div', { class: 'todo', 'data-section': sec.id },
    h('p', {}, h('b', { text: 'Trạng thái: ' }), document.createTextNode(STATUS_LABEL[sec.status])),
    h('p', { text: sec.blocker }),
    h('b', { text: 'Cần để dựng mục này:' }), h('ul', {}, ...sec.needs.map((x) => h('li', { text: x }))),
    sec.status === STATUS.SOURCE_DRIVEN ? h('details', { class: 'tech', 'data-role': 'howto' }, h('summary', { text: 'Cách bổ sung (kỹ thuật)' }), h('p', { class: 'hint', text: ACQUIRE_CMD })) : null);
}
const seg = (groups, cur, onPick, label) => {
  const bar = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  for (const g of groups) { const b = h('button', { type: 'button', 'data-key': g.key, 'aria-pressed': String(g.key === cur), text: `${g.label} (${g.rows.length} dòng)` }); b.addEventListener('click', () => onPick(g.key)); bar.append(b); }
  return bar;
};
// One sourced fact. Everything is plain text (textContent); the only link is the fact's own validated https source URL.
function factItem(f, { lede = false } = {}) {
  const meta = [BASIS_VI[f.basis]];
  if (f.kind === 'number') meta.push(`${f.period.label}`, SCOPE_VI[f.scope], f.restated === true ? 'số đã điều chỉnh' : f.restated === false ? 'không điều chỉnh' : 'chưa rõ điều chỉnh');
  if (f.basis === 'ESTIMATE') meta.push(`ước tính bởi ${f.estimated_by}`);
  const s = f.source, link = f.kind === 'document' ? f.document_url : s.url;
  const val = f.kind === 'number' ? h('div', { class: 'fv', 'data-role': 'fact-value' }, h('b', { text: fmtNum(f.value, { max: 6 }) }), document.createTextNode(UNIT_VI[f.unit] ? ` ${UNIT_VI[f.unit]}` : '')) : null;
  return h('article', { class: 'fact', 'data-fact': f.id, 'data-basis': f.basis, 'data-kind': f.kind },
    h('p', { class: lede ? 'lede' : 'fs', text: f.statement }), val,
    lede ? null : h('p', { class: 'fm', text: meta.join(' · ') }),
    h('p', { class: 'src' }, document.createTextNode('Nguồn: '), h('a', { href: link, rel: 'noopener noreferrer', target: '_blank', text: s.title || s.url }), document.createTextNode(` · truy cập ${fmtDate(s.retrieved)}`)),
    h('details', { class: 'tech', 'data-role': 'locator' }, h('summary', { text: 'Vị trí trích dẫn' }), h('p', { class: 'hint', text: `${s.publisher ? `${s.publisher} · ` : ''}${s.published ? `đăng ${fmtDate(s.published)} · ` : ''}(${s.locator.type}) ${s.locator.value}` })));
}
function wireHover(host) {
  const svg = host.querySelector('svg[data-hover]'); const hit = host.querySelector('.hit');
  if (!svg || !hit) return;
  const tipEl = () => document.getElementById('tip'); // created after the sections are built, so resolve it when the pointer moves
  const pts = svg.dataset.hover.split('\n').map((l) => l.split('|')); const vb = svg.viewBox.baseVal;
  const show = (ev) => {
    const r = svg.getBoundingClientRect(), x = ((ev.clientX - r.left) / r.width) * vb.width;
    let best = pts[0]; for (const p of pts) if (Math.abs(+p[0] - x) < Math.abs(+best[0] - x)) best = p;
    const tip = tipEl(); if (!tip) return;
    put(tip, h('b', { text: best[1] }), document.createTextNode(` ${best[2] || 'không có giá trị'}`)); tip.classList.add('on');
    tip.style.left = `${ev.pageX + 12}px`; tip.style.top = `${ev.pageY + 12}px`;
  };
  hit.addEventListener('pointermove', show); hit.addEventListener('pointerleave', () => tipEl()?.classList.remove('on'));
}

export function renderDossier(root, data) {
  root.replaceChildren();
  root.append(renderTopbar('dossier', { ticker: data.ticker }));
  const wrap = h('div', { class: 'wrap' }); root.append(wrap);
  const banner = dataKindBanner(data.manifest); if (banner) wrap.append(banner);
  if (!data.record) {
    wrap.append(h('div', { class: 'note', role: 'alert' }, h('b', { text: 'Không dựng được hồ sơ. ' }), document.createTextNode(data.problems.map((p) => p.message).join(' '))),
      h('p', {}, h('a', { href: '../panel/', text: '← Về cửa vào để chọn mã' })));
    return;
  }
  const rec = data.record, icb = (rec.sector && rec.sector.icb) || {}, gics = (rec.sector && rec.sector.gics) || {};
  if (data.snapshotRow) {
    const s=data.snapshotRow, box=h('section',{class:'panel public-summary'});
    box.append(h('h2',{text:'Chỉ số tổng hợp đã chụp · '+data.ticker}));
    const val=(v)=>typeof v==='number'?v.toLocaleString('vi-VN',{maximumFractionDigits:2}):'—';
    for(const [label,value] of [['Giá đóng cửa (VND)',s.price?.close],['Ngày giá',s.price?.date],['Trạng thái giá',s.price?.bar_status],['Ngưỡng mua thường (VND)',s.zone?.levels?.n50],['Đáy vùng sập (VND)',s.zone?.levels?.c75],['Kết luận vùng giá',s.zone?.verdict],['Phương pháp ngưỡng',s.zone?.quality?.data_kind],['P/E SSI · chưa xác minh',s.ssi?.pe],['P/B SSI · chưa xác minh',s.ssi?.pb],['ROE SSI · đơn vị chưa xác minh',s.ssi?.roe]]) box.append(h('p',{},h('b',{text:label+': '}),document.createTextNode(typeof value==='string'?value:val(value))));
    box.append(h('p',{class:'hint',text:'Chỉ số lấy nguyên từ screener đã có, không tính lại hoặc xác nhận phương pháp. Chuỗi giá đầy đủ, biểu đồ giá động và lịch sử finance thô không xuất công khai; phần dưới ghi rõ dữ liệu không khả dụng trong bản chụp.'}));
    wrap.append(box);
  }
  const catalog = (data.manifest && data.manifest.financial_coverage && data.manifest.financial_coverage.metric_catalog) || {};
  const label = (m) => (catalog[m] ? catalog[m].label : m), marketBased = (m) => !!(catalog[m] && catalog[m].market_based);
  const profile = sectorProfile(icb.level1 || null);
  const rows = (data.history && data.history.rows) || [];
  const groups = groupRows(rows), firstValid = rows.find((r) => r.period_valid);
  const defaultKey = firstValid ? `${firstValid.lengthReport}|${JSON.stringify(firstValid.ttmType)}` : null;
  const stats = data.prices ? priceStats(data.prices.bars) : null;
  const Z = data.zones || { state: 'NO_INDEX', thresholds: null, issues: [] };
  const zones = stats ? zoneLevels({ bars: data.prices.bars, subject: data.ticker, thresholds: Z.thresholds }) : null;
  const redraws = [];
  document.title = `${data.manifest && data.manifest.data_kind === 'SYNTHETIC_FIXTURE' ? '[GIẢ LẬP] ' : ''}${data.ticker} — Hồ sơ doanh nghiệp`;

  // ---- header + coverage + KPIs
  const cs = coverageSummary();
  const F = data.facts || { state: 'NO_FACTS_INDEX', facts: [], rejected: [], issues: [] }, facts = F.facts;
  const introFacts = facts.filter((f) => f.section === 'gioithieu');
  const companyName = rec.company && rec.company.status === 'SOURCE_BACKED' ? rec.company.name : null;
  const factsStateNote = () => (F.state === 'LOADED' ? 'File facts đã nạp nhưng không có facts cho phần này.' : `${FACTS_STATE_VI[F.state] || F.state}.`);
  const A = buildAnalysis({ ticker: data.ticker, record: rec, prices: data.prices, facts: F, statements: data.statements });
  const prim = A.ok ? modelEntry(A, 'primary') : null, alt = A.ok ? modelEntry(A, 'alternative') : null;
  const modelsOn = A.ok ? { bien: !!(A.bridge && A.bridge.status === 'COMPUTED') || A.segDeltas.length > 0, q3: !!(A.projection && A.projection.ok), sotp: !!(prim && prim.available), sotpB: !!(alt && alt.available), kichban: !!((prim && prim.available) || (alt && alt.available)), doinhay: !!((prim && prim.available) || (alt && alt.available)) } : null;
  const avail = contentAvailability({ facts, hasPrices: !!stats, peersOk: peersAvailable(data, rec), groups: groups.length, statements: A.ok, models: modelsOn });
  const view = createAnalysisView({ h, put, A, facts, data, label });
  wrap.append(h('header', { class: 'head' },
    h('div', {}, h('div', { class: 'eyebrow', text: `${rec.exchange} · ${data.ticker} · ${icb.level1 || 'Chưa có ICB'}${icb.level2 ? ` · ${icb.level2}` : ''}` }), companyName ? h('h1', { 'data-role': 'company-name', text: companyName }) : h('h1', { text: data.ticker }),
      companyName ? null : h('p', { class: 'coname missing', 'data-role': 'company-name', text: rec.company && rec.company.status === 'INVALID' ? 'Tên công ty trong nguồn không hợp lệ nên không hiển thị.' : 'Nguồn không có tên công ty cho mã này.' }),
      introFacts.length ? h('div', { class: 'intro', 'data-role': 'intro' }, ...introFacts.map((f) => factItem(f, { lede: true }))) : h('p', { class: 'lede', 'data-role': 'intro-missing', text: `Chưa có mô tả hoạt động có nguồn cho mã này. ${factsStateNote()}` })),
    h('div', { class: 'status' }, h('span', { class: 'chip snap', text: stats ? `Giá QRW đến ${fmtDate(stats.last.date)}` : 'Chuỗi giá không xuất công khai' }), h('span', { class: 'chip snap', text: 'Số SSI: đơn vị và kỳ chưa xác minh' }), h('span', { class: 'chip live', 'data-role': 'content-chip', text: `Có nguồn doanh nghiệp: ${avail.counts.SOURCED}/14 khu vực${avail.counts.MODELED ? ` · tính từ nguồn + giả định: ${avail.counts.MODELED}` : ''}` }))));
  const scopeWarn = facts.filter((f) => f.kind === 'scope_change').map((f) => `từ ${f.effective_year} doanh nghiệp công bố thay đổi phạm vi hợp nhất; số trước và sau mốc này không so sánh trực tiếp`);
  wrap.append(h('div', { class: 'banner-info', 'data-role': 'quality' }, h('b', { text: 'Lưu ý dữ liệu: ' }), document.createTextNode(`${stats ? `giá QRW đến ${fmtDate(stats.last.date)} (QRW khai báo giá đã điều chỉnh; khai báo của nguồn, chưa đối chiếu độc lập với hành động doanh nghiệp)` : 'chưa có chuỗi giá'}; số SSI là số nguồn thô, chưa xác minh đơn vị và ý nghĩa kỳ${scopeWarn.length ? `; ${scopeWarn.join('; ')}` : ''}.`)));
  const covBox = h('details', { class: 'tech', 'data-role': 'coverage' }, h('summary', { text: 'Mức dựng của hệ thống và độ phủ nội dung của mã này' }));
  wrap.append(covBox);
  covBox.append(h('div', { class: 'banner-info', 'data-role': 'implementation' }, h('b', { text: 'Khung dựng của hệ thống (giống nhau cho mọi mã): ' }),
    document.createTextNode(`${cs.delivered_complete}/${cs.total} mục hoàn chỉnh, ${cs.source_driven} mục đã dựng và chờ facts có nguồn của từng mã, ${cs.partial} mục có một phần, ${cs.by_status[STATUS.NOT_ACTIVATED] || 0} mục chưa bật (chờ xác minh và công thức), ${cs.by_status[STATUS.NOT_IMPLEMENTED] || 0} mục chưa có nguồn. Đây là mức dựng, không phải mức đầy đủ nội dung của mã này.`)));
  covBox.append(h('div', { class: 'banner-info', 'data-role': 'content-coverage' }, h('b', { text: `Nội dung của ${data.ticker}: ` }),
    document.createTextNode(`${avail.counts.SOURCED}/14 khu vực của bản gốc có facts có nguồn doanh nghiệp, ${avail.counts.MODELED ? `${avail.counts.MODELED} khu vực tính từ báo cáo đã duyệt cộng giả định có nhãn, ` : ''}${avail.counts.DATA_ONLY} khu vực chỉ có số liệu giá/SSI (ngữ nghĩa chưa xác minh), ${avail.counts.NONE} khu vực chưa có nội dung cho mã này. Mô tả đầu trang: ${avail.intro === 'SOURCED' ? 'có nguồn' : 'chưa có nguồn'}; tên công ty: ${companyName ? 'có (company-profile)' : 'chưa có'}. Facts: ${FACTS_STATE_VI[F.state] || (F.state === 'LOADED' ? 'đã nạp' : F.state)}${F.rejected && F.rejected.length ? `, ${F.rejected.length} bị từ chối` : ''}. `), h('a', { href: '../panel/#matrix', text: 'Xem ma trận' })));
  const sl = rec.financials && rec.financials.structural_latest;
  const rowOf = (key) => { const g = groups.find((x) => x.key === key); return g ? g.rows[0] : null; };
  const baseRow = rowOf(defaultKey);
  const kpi = (l, v, s, lead = false) => h('div', { class: `kpi${lead ? ' lead' : ''}` }, h('span', { class: 'l', text: l }), h('span', { class: 'v', title: v, text: v }), h('span', { class: 's', text: s }));
  wrap.append(h('div', { class: 'kpis', id: 'kpis' },
    kpi('Giá đóng cửa (QRW)', stats ? fmtVnd(stats.last.close) : MISSING, stats ? `${fmtPct(stats.fromHighPct)} so với đỉnh 12T · ${fmtDate(stats.last.date)}` : 'Chuỗi giá không xuất công khai', true),
    kpi('Vị trí trong vùng giá 12T', stats && stats.rangePos !== null ? `${fmtNum(stats.rangePos * 100, { max: 0 })}%` : MISSING, stats ? `${fmtVnd(stats.low.close)} – ${fmtVnd(stats.high.close)} · ${stats.bars_used} phiên` : 'Chuỗi giá không xuất công khai'),
    kpi('ICB cấp 4', icb.level4 || MISSING, icb.level1 ? `Cấp 1: ${icb.level1}` : 'Chưa có ICB'),
    kpi('Hàng mới nhất theo thứ tự nguồn', sl ? sl.period_key : MISSING, 'chỉ để sắp xếp; ý nghĩa kỳ chưa xác minh'),
    kpi(label('revenue'), baseRow ? fmtMetric(baseRow.values.revenue) : MISSING, 'số nguồn, đơn vị chưa xác minh'),
    kpi(label('roe'), baseRow ? fmtMetric(baseRow.values.roe) : MISSING, 'số nguồn, đơn vị chưa xác minh')));

  // ---- nav
  const nav = h('nav', { class: 'nav', 'aria-label': 'Mục lục' }, ...[h('div', { class: 'nav-in' }, ...SECTIONS.map((s) => h('a', { href: `#${s.id}`, 'data-status': s.status, text: s.nav })))]);
  wrap.append(nav);

  // ---- sections
  const body = {};
  // Sidebar of the original (renderZone): verdict + the four levels + previous/current quarter peaks. Levels exist only with ticker-bound thresholds.
  const MISSING_VI = { thresholds: 'ngưỡng rơi giá riêng của mã này (p50/p75 của quý thường và quý sập, cửa sổ hiệu chuẩn, cơ sở giá, phương pháp)', previous_quarter_bars: 'các phiên của quý dương lịch trước' };
  const STATUS_VI = { THRESHOLDS_MISSING: 'Chưa có ngưỡng rơi giá của mã này', THRESHOLDS_TICKER_MISMATCH: 'Ngưỡng được cung cấp thuộc mã khác nên không dùng', PRICE_BASIS_MISMATCH: 'Cơ sở giá của ngưỡng khác cơ sở giá QRW nên không tính vùng', PREV_QUARTER_MISSING: 'Chưa đủ dữ liệu quý trước', AS_OF_INVALID: 'Ngày mốc không hợp lệ', NO_BARS: 'Chuỗi giá không xuất công khai' };
  const zoneSidebar = () => {
    const z = zones, box = h('div', { class: 'panel zone', id: 'zonePanel', 'data-zone-status': z.status });
    const row = (k, sub, val, s2) => h('div', { class: 'zrow' }, h('div', { class: 'k' }, document.createTextNode(k), sub ? h('small', { text: sub }) : null), h('div', { class: 'v' }, document.createTextNode(val), s2 ? h('small', { text: s2 }) : null));
    box.append(h('h3', { text: `Vị trí giá ${z.cur ? quarterLabel(z.cur) : ''}`.trim() }));
    const p = z.price, L = z.levels, t = z.thresholds_ref, v = z.verdict;
    if (!L) {
      box.append(h('div', { class: 'verdict warn', 'data-role': 'zone-missing' }, h('b', { text: STATUS_VI[z.status] || z.status }),
        h('span', { text: `Thiếu đầu vào: ${z.missing_inputs.map((m) => MISSING_VI[m] || m).join('; ') || '—'}. Không dùng ngưỡng của bản PHP cho mã khác và không thay bằng đỉnh/đáy 12 tháng.` }),
        h('details', { class: 'tech', 'data-role': 'howto' }, h('summary', { text: 'Cách bổ sung (kỹ thuật)' }), h('p', { class: 'hint', text: 'node scripts/install-zone-thresholds.mjs --file <tệp ngưỡng của mã> (docs/CC-03E-WINDOWS-RECHECK.md)' }))));
      if (z.peak !== null) box.append(row(`Đỉnh ${quarterLabel(z.prev)}`, 'giá cao nhất phiên trong quý', fmtVnd(z.peak), `${fmtPct(p / z.peak - 1)} tới nay`));
    } else {
      const d = (k) => fmtDrop(t[k.f][k.p]);
      const tx = { BELOW_CRASH_FLOOR: ['good', 'Dưới đáy vùng sập', `Giá dưới ${fmtVnd(L.c75)} (rơi ${d({ f: 'crash', p: 'p75' })}% từ đỉnh ${quarterLabel(z.prev)}), sâu hơn 3/4 số quý thị trường sập của ${data.ticker}.`],
        IN_CRASH_ZONE: ['good', 'Vào vùng sập', `Giá trong vùng ${fmtVnd(L.c50)}–${fmtVnd(L.c75)} (rơi ${d({ f: 'crash', p: 'p50' })}–${d({ f: 'crash', p: 'p75' })}%), mức rơi thường gặp khi cả thị trường sập; còn cách đáy vùng sập ${fmtPctU(v.to_floor)}.`],
        IN_NORMAL_BUY: ['warn', 'Đã vào vùng mua thường', `Giá dưới ${fmtVnd(L.n50)} (rơi ${d({ f: 'normal', p: 'p50' })}%)${v.past_lower_normal ? `, đã qua cận dưới vùng thường ${fmtVnd(L.n75)}` : `; cận dưới vùng thường ${fmtVnd(L.n75)} còn cách ${fmtPctU(v.to_lower_normal)}`}.`],
        NOT_IN_ZONE: ['bad', 'Chưa vào vùng mua', `Cần giảm thêm ${fmtPctU(v.need_drop)} để chạm cận trên vùng mua thường (rơi ${d({ f: 'normal', p: 'p50' })}%).`] }[v.code] || ['warn', 'Chưa xác định', ''];
      box.append(h('div', { class: `verdict ${tx[0]}`, 'data-role': 'zone-verdict', 'data-code': v.code }, h('b', { text: tx[1] }), h('span', { text: tx[2] })));
      const lab = zoneLabels(z), lv = (k, sub, x) => row(k, sub, fmtVnd(x), `giá hiện ${fmtPct(p / x - 1)}`);
      box.append(row(`Đỉnh ${quarterLabel(z.prev)}`, 'giá cao nhất phiên trong quý', fmtVnd(L.peak), `${fmtPct(p / L.peak - 1)} tới nay`),
        lv(`Vùng mua thường (rơi ${d({ f: 'normal', p: 'p50' })}%)`, 'cận trên vùng thường · p50 quý thường', L.n50), lv(lab.n75_title, 'cận dưới vùng thường · p75 quý thường', L.n75),
        lv(lab.c50_title, 'cận trên vùng sập · p50 quý sập', L.c50), lv(`Đáy vùng sập (rơi ${d({ f: 'crash', p: 'p75' })}%)`, 'cận dưới vùng sập · p75 quý sập', L.c75));
    }
    if (z.cur_peak !== null) box.append(row(`Đỉnh ${quarterLabel(z.cur)} tới nay`, 'mốc bán tham khảo quý sau', fmtVnd(z.cur_peak), ''));
    // one line each, same wording as the market page: weak thresholds (with the reason) and a price older than the market date (stopped or lagging)
    const wLine = weakText(weakReasons(t, L)), sLine = rec.bar ? priceStaleNote({ date: rec.bar.actual_last_date, daysBehind: rec.bar.days_behind_as_of, status: rec.universe_status }) : null;
    if (wLine) box.append(h('p', { class: 'note zone-flag', 'data-role': 'zone-weak', text: wLine }));
    if (sLine) box.append(h('p', { class: 'note zone-flag', 'data-role': 'zone-stale', text: sLine }));
    const bits = [`Mốc tính: ${fmtDate(z.as_of)} (${z.as_of_source === 'LAST_BAR' ? 'ngày của phiên giá cuối trong dữ liệu' : 'ngày chỉ định'}).`];
    if (z.coverage) bits.push(`Quý đỉnh ${quarterLabel(z.prev)}: ${z.coverage.bars} phiên, ${fmtDate(z.coverage.first)}–${fmtDate(z.coverage.last)}${z.coverage.status === 'PARTIAL' ? ' — CHƯA phủ trọn quý, đỉnh có thể thấp hơn thực tế' : ''}.`);
    const METHOD_VI = { ESTIMATED_QUARTERLY_RUNNING_PEAK_DRAWDOWN: 'ước lượng mức rơi theo quý từ đỉnh quý trước, phân tách quý thường/quý sập theo VN-Index' }, BASIS_PX_VI = { QRW_1D_SOURCE_DECLARED_ADJUSTED: 'giá QRW khai báo đã điều chỉnh', QRW_1D_HIGH_ADJUSTMENT_UNVERIFIED: 'giá QRW chưa xác minh điều chỉnh' };
    if (t) bits.push(`Ngưỡng: ${METHOD_VI[t.method] || t.method} (${t.method}, ${t.method_version}), cửa sổ ${fmtDate(t.calibration_window.from)}–${fmtDate(t.calibration_window.to)} (${t.calibration_window.quarters} quý${t.low_sample ? ', mẫu ít' : ''}), cơ sở giá: ${BASIS_PX_VI[t.price_basis] || 'chưa rõ'} (${t.price_basis}); nguồn: ${t.source.title}.`);
    if (z.overlap) bits.push('Với các ngưỡng này vùng thường và vùng sập chồng lấn, nên vùng "sập" ít khác vùng thường.');
    const inv = zoneInversionNote(z); if (inv) bits.push(inv);
    bits.push('Đáy vùng sập là mức rơi thống kê từ đỉnh quý trước, không phải giá sàn trong phiên của sở giao dịch. QRW khai báo giá đã điều chỉnh (khai báo của nguồn, chưa đối chiếu độc lập).');
    if (t && t.data_kind === 'SYNTHETIC_FIXTURE') bits.push('NGƯỠNG GIẢ LẬP (dữ liệu thử nghiệm).');
    if (t && t.data_kind === 'ESTIMATED_METHOD') bits.push('NGƯỠNG ƯỚC LƯỢNG: do phương pháp hệ thống đề xuất (tách riêng, không phải thuật toán "Chặt" gốc và không dùng phần trăm của bản PHP); cần controller đánh giá trước khi coi là hiệu chuẩn.');
    box.append(h('p', { class: 'note', 'data-role': 'zone-note', style: 'margin:0', text: bits.join(' ') }));
    return box;
  };
  body.gia = () => {
    const out = h('div', { class: 'stack' });
    if (!stats) { out.append(h('div', { class: 'todo' }, h('b', { text: 'Chuỗi giá không xuất công khai. ' }), document.createTextNode(data.problems.filter((p) => p.code.startsWith('PRICES')).map((p) => p.message).join(' ') || 'Bản công khai giữ chỉ số tổng hợp; không cung cấp chuỗi giá gốc.'))); }
    else {
      const bars = data.prices.bars.slice(-252);
      const chart = h('div', { class: 'chart', id: 'pxChart' });
      const drawPx = () => { chart.innerHTML = zoneChart({ bars, zones, width: chart.clientWidth || 700, title: `Giá đóng cửa ${data.ticker}` }); wireHover(chart); };
      redraws.push(drawPx); chart.innerHTML = zoneChart({ bars, zones, width: 700, title: `Giá đóng cửa ${data.ticker}` });
      const zonePanel = zoneSidebar();
      const statsPanel = h('div', { class: 'panel zone', id: 'statsPanel' });
      for (const [k, v] of [['Giá hiện tại', `${fmtVnd(stats.last.close)} (${fmtDate(stats.last.date)})`], ['Đỉnh 12T', `${fmtVnd(stats.high.close)} (${fmtDate(stats.high.date)})`], ['Đáy 12T', `${fmtVnd(stats.low.close)} (${fmtDate(stats.low.date)})`],
        ['Vị trí trong vùng', stats.rangePos === null ? 'Không xác định (vùng giá phẳng)' : `${fmtNum(stats.rangePos * 100, { max: 1 })}%`], ['So với đỉnh', fmtPct(stats.fromHighPct)], ['So với đáy', fmtPct(stats.fromLowPct)]])
        statsPanel.append(h('div', { class: 'zrow' }, h('div', { class: 'k', text: k }), h('div', { class: 'v', text: v })));
      out.append(h('div', { class: 'grid2', style: 'align-items:start' }, h('div', { class: 'panel' }, chart, h('p', { class: 'hint', text: `${stats.bars_used} phiên đóng cửa của QRW, VND. Vùng mua = đỉnh (giá cao nhất) của quý dương lịch TRƯỚC × (1 − mức rơi); đường chấm: đỉnh quý trước, cận trên vùng mua thường, đáy vùng sập. QRW khai báo giá đã điều chỉnh (khai báo của nguồn, chưa đối chiếu độc lập với hành động doanh nghiệp); số cổ phiếu dùng cho vốn hoá và EPS được quy về ngày giá.` })), h('div', { class: 'stack' }, zonePanel, statsPanel)));
    }
    const mk = baseRow ? ['pe', 'pb', 'dilutedPe', 'dividendYield', 'marketCap', 'eps', 'bv', 'sharesOutstanding'].filter((m) => catalog[m]) : [];
    out.append(view.valuation());
    if (baseRow) {
      const sec = h('details', { class: 'tech', 'data-role': 'ssi-published' }, h('summary', { text: 'Chỉ tiêu SSI đã công bố (nguồn thô, đơn vị và ngày giá chưa xác minh)' }));
      const t = h('table', { class: 'tmin' }, h('thead', {}, h('tr', {}, h('th', { text: 'Chỉ tiêu nguồn' }), h('th', { text: `Giá trị tại ${periodTitle(baseRow)}` }), h('th', { text: 'Ghi chú' }))));
      const tb = h('tbody'); for (const m of mk) tb.append(h('tr', {}, h('td', { text: label(m) + (marketBased(m) ? ' ★' : '') }), h('td', { text: fmtMetric(baseRow.values[m]) }), h('td', { text: marketBased(m) ? 'Phụ thuộc giá tại thời điểm chưa xác định; không phải hiện tại, không đặt cạnh giá QRW' : 'Đơn vị chưa xác minh' })));
      t.append(tb); sec.append(h('div', { class: 'panel scroll' }, t));
      out.append(sec);
    }
    return out;
  };
  body.nganh = () => renderPeers({ h, put, data, rec });
  const needHistory = () => (!groups.length ? h('div', { class: 'todo' }, h('b', { text: 'Không có dữ liệu finance-indicator cho mã này. ' }), document.createTextNode(rows.length ? 'Mọi dòng đều thuộc khóa kỳ không hợp lệ (UNASSIGNED_PERIOD_KEY_SHARED), nên không dựng nhóm kỳ nào; không ghép kỳ để lấp chỗ.' : whyNoRows(rec, data.problems))) : null);
  const h1Ssi = () => {
    const miss = needHistory(); if (miss) return miss;
    const host = h('div', { class: 'stack' }); let cur = defaultKey;
    const draw = () => {
      const g = groups.find((x) => x.key === cur), r = g.rows[0], prior = priorSameLabel(g, r);
      const tiles = h('div', { class: 'tiles', id: 'h1Tiles' }), empty = [];
      for (const m of profile.metrics) {
        const v = r.values[m]; if (v === null || v === undefined) { empty.push(label(m)); continue; }
        const ch = prior.status === 'OK' ? comparableChange(m, r, prior.row, facts) : { status: prior.status };
        const sub = ch.status === 'OK' ? `${fmtPct(ch.pct)} (Δ ${fmtMetric(ch.abs)}) so với yearReport ${r.yearReport - 1}, cùng nhãn kỳ; phạm vi so sánh có bằng chứng` : (SCOPE_NOTE[ch.status] || CHANGE_NOTE[ch.status] || ch.status);
        tiles.append(h('div', { class: 'tile', 'data-metric': m }, h('div', { class: 'l', text: label(m) + (marketBased(m) ? ' ★' : '') }), h('div', { class: 'v', text: fmtMetric(v) }), h('div', { class: 's', text: sub })));
      }
      put(host, groups.length > 1 ? seg(groups, cur, (k) => { cur = k; draw(); }, 'Nhóm kỳ') : null,
        h('p', { class: 'hint', text: `Hàng mới nhất của nhóm theo thứ tự yearReport: ${periodTitle(r)}. "So với" chỉ dùng đúng một hàng cùng nhãn kỳ ở yearReport trước; không điền khuyết, không ghép kỳ.` }),
        r.flags.includes('DUPLICATE_PERIOD') ? h('div', { class: 'note', text: 'Kỳ này có nhiều hàng cùng khóa trong nguồn; mọi hàng được giữ trong bảng ở mục KQKD, ở đây chỉ hiển thị hàng đầu theo thứ tự xuất.' }) : null,
        tiles, empty.length ? h('p', { class: 'hint', text: `Nguồn để trống ở hàng này: ${empty.join(', ')}.` }) : null,
        h('div', { class: 'note', text: 'Chưa có bảng cân đối, nợ vay, tiền và giải thích tăng trưởng: nguồn finance-indicator không chứa các phần đó.' }));
    };
    draw(); return host;
  };
  const kqkdSsi = () => {
    const miss = needHistory(); if (miss) return miss;
    const host = h('div', { class: 'stack' }); let cur = defaultKey;
    const draw = () => {
      const g = groups.find((x) => x.key === cur);
      const chartsSpec = profile.key === 'bank' ? [['roe', 'line'], ['roa', 'line'], ['npl', 'line'], ['debtEquity', 'line']] : [['revenue', 'bar'], ['profit', 'bar'], ['grossProfitMargin', 'line'], ['netProfitMargin', 'line']];
      const grid = h('div', { class: 'charts2' });
      for (const [m, kind] of chartsSpec) {
        const pts = seriesFor(g, m); const yf = (v) => fmtMetric(v);
        const svg = kind === 'bar' ? barChart({ cats: pts.map((p) => ({ label: `${p.year}${p.duplicate ? ' ⚠' : ''}`, value: p.value, dup: p.duplicate })), title: label(m), yFormat: yf })
          : lineChart({ points: pts.map((p, i) => ({ x: i, y: p.value, label: `${p.year}${p.duplicate ? ' ⚠' : ''}` })), title: label(m), yFormat: yf });
        grid.append(h('div', { class: 'panel' }, h('h3', { text: label(m) + (marketBased(m) ? ' ★' : '') }), h('div', { class: 'chart', 'data-metric': m, html: svg })));
      }
      const shown = profile.metrics.filter((m) => g.rows.some((r) => r.values[m] !== null && r.values[m] !== undefined)), hidden = profile.metrics.filter((m) => !shown.includes(m));
      const t = h('table', { class: 'tmin', id: 'kqkdTbl' }, h('thead', {}, h('tr', {}, h('th', { text: 'Chỉ tiêu (tên trường nguồn)' }), ...g.rows.map((r) => h('th', { 'data-source-index': String(r.source_index), text: `${r.yearReport}${r.flags.includes('DUPLICATE_PERIOD') ? ' ⚠ trùng kỳ' : ''}` })))));
      const tb = h('tbody'); for (const m of shown) tb.append(h('tr', {}, h('td', { text: label(m) + (marketBased(m) ? ' ★' : '') }), ...g.rows.map((r) => h('td', { text: fmtMetric(r.values[m]) }))));
      t.append(tb);
      put(host, groups.length > 1 ? seg(groups, cur, (k) => { cur = k; draw(); }, 'Nhóm kỳ') : null,
        h('p', { class: 'hint', text: `Nhóm ${g.label}: ${g.rows.length} dòng, từ yearReport ${g.rows[g.rows.length - 1].yearReport} đến ${g.rows[0].yearReport}. Chỗ trống = nguồn để trống (không phải 0). Mỗi dòng trùng khóa có cột riêng và dấu ⚠. Không gọi nhãn kỳ là quý hay năm.` }),
        h('div', { class: 'note', 'data-role': 'scope-note' }, h('b', { text: 'Phạm vi kế toán giữa các cột: ' }), document.createTextNode(scopeFacts.length ? `doanh nghiệp công bố thay đổi phạm vi hợp nhất: ${scopeFacts.map((f) => `từ ${f.effective_year}, ${f.statement}`).join('; ')} — các cột trước và sau mốc này không so sánh trực tiếp được.` : 'chưa có bằng chứng các cột cùng phạm vi hợp nhất; đây là số nguồn thô theo từng yearReport, không phải chuỗi so sánh được.')),
        grid, h('div', { class: 'wrap-table' }, t), hidden.length ? h('p', { class: 'hint', text: `Đã ẩn vì trống ở mọi dòng của nhóm: ${hidden.map(label).join(', ')}.` }) : null,
        h('p', { class: 'hint' }, document.createTextNode('Toàn bộ dòng, kể cả dòng có kỳ không hợp lệ, xem ở '), h('a', { href: `../qrw/?ticker=${data.ticker}`, text: 'bộ kiểm tra dữ liệu' }), document.createTextNode('.')));
    };
    draw(); return host;
  };
  // Statements-driven areas come first; the SSI source-reported history stays available underneath (raw labels, units unverified).
  const underSsi = (node, build, title) => { if (!A.ok) return h('div', { class: 'stack' }, node, build()); const d = h('details', { class: 'tech', 'data-role': 'ssi-raw' }, h('summary', { text: title })); d.append(build()); return h('div', { class: 'stack' }, node, d); };
  body.h1 = () => underSsi(view.h1(), h1Ssi, 'Chỉ tiêu SSI theo nhãn nguồn (thô: đơn vị và ý nghĩa kỳ chưa xác minh)');
  body.kqkd = () => underSsi(view.kqkdStatements(), kqkdSsi, 'Lịch sử SSI theo nhãn nguồn (thô: lengthReport/ttmType, đơn vị chưa xác minh)');
  for (const id of ['bien', 'q3', 'sotp', 'sotpB', 'kichban', 'doinhay']) body[id] = () => view[id]();
  // Sourced sections (CC-03E): shown only from validated facts of THIS ticker; otherwise the specific blocker and the acquisition state.
  const factsBody = (secId, keep = () => true) => () => {
    const items = facts.filter((f) => f.section === secId && keep(f)), sec = SECTIONS.find((x) => x.id === secId);
    if (!items.length) { const t = todo(sec); t.append(h('p', { class: 'hint', 'data-role': 'facts-state', text: factsStateNote() })); return t; }
    if (secId === 'ruiro') {   // the original's risk list (#ruiro .ritem): no severity chips, because the source gives no severity rating
      const list = h('div', { class: 'panel', id: 'riskList', 'data-role': 'facts-list' }, h('div', { class: 'rgrp', text: 'Rủi ro nêu trong tài liệu công bố' }));
      for (const f of items) {
        const s = f.source;
        list.append(h('div', { class: 'ritem', 'data-fact': f.id, 'data-basis': f.basis }, h('span', { class: 'hint', text: BASIS_VI[f.basis] }), h('span', { class: 'rd', style: 'grid-column:2', text: f.statement }),
          h('span', { class: 'rs' }, document.createTextNode('Nguồn: '), h('a', { href: s.url, rel: 'noopener noreferrer', target: '_blank', text: s.title || s.url }), document.createTextNode(` · truy cập ${fmtDate(s.retrieved)}`)),
          h('details', { class: 'tech', style: 'grid-column:2' }, h('summary', { text: 'Vị trí trích dẫn' }), h('p', { class: 'hint', text: `(${s.locator.type}) ${s.locator.value}` }))));
      }
      return list;
    }
    const out = h('div', { class: 'stack', 'data-role': 'facts-list' });
    for (const basis of ['ACTUAL', 'PLAN', 'ESTIMATE', 'NARRATIVE']) {
      const g = items.filter((f) => f.basis === basis); if (!g.length) continue;
      const nums = g.filter((f) => f.kind === 'number'), rest = g.filter((f) => f.kind !== 'number');
      const box = h('div', { class: 'panel', 'data-basis-group': basis }, h('h3', { text: BASIS_VI[basis] }));
      if (nums.length) {
        const t = h('table', { class: 'tmin factnum' }, h('thead', {}, h('tr', {}, ...['Chỉ tiêu', 'Giá trị', 'Kỳ', 'Phạm vi', 'Nguồn'].map((x) => h('th', { text: x })))));
        const tb = h('tbody');
        for (const f of nums) tb.append(h('tr', { 'data-fact': f.id }, h('td', { text: f.statement }), h('td', { 'data-role': 'fact-value', text: `${fmtNum(f.value, { max: 6 })}${UNIT_VI[f.unit] ? ` ${UNIT_VI[f.unit]}` : ''}` }), h('td', { text: f.period.label }),
          h('td', { text: `${SCOPE_VI[f.scope]}${f.restated === true ? ' · đã điều chỉnh' : f.restated === null ? ' · chưa rõ điều chỉnh' : ''}${f.basis === 'ESTIMATE' ? ` · ước tính bởi ${f.estimated_by}` : ''}` }),
          h('td', {}, h('a', { href: f.source.url, rel: 'noopener noreferrer', target: '_blank', text: f.source.title || f.source.url }), document.createTextNode(` · truy cập ${fmtDate(f.source.retrieved)} · (${f.source.locator.type}) ${f.source.locator.value}`))));
        t.append(tb); box.append(h('div', { class: 'wrap-table' }, t));
      }
      for (const f of rest) box.append(factItem(f));
      out.append(box);
    }
    return out;
  };
  const SG = buildSegmentGroups(F.groups || [], facts), boundIds = new Set(facts.filter((f) => f.segment).map((f) => f.id));
  const baseMang = factsBody('mang');
  body.mang = () => {
    if (!SG.length) return baseMang();
    const out = h('div', { class: 'stack', 'data-role': 'mang-body' }, renderSegmentsView(h, put, SG));
    const rest = facts.filter((f) => f.section === 'mang' && !boundIds.has(f.id));
    if (rest.length) { const saved = facts; const box = h('div', { class: 'stack', 'data-role': 'mang-other' }); out.append(box); const tmp = factsBody('mang', (f) => !boundIds.has(f.id)); box.append(tmp()); }
    return out;
  };
  const empty = (id) => () => factsBody(id)();
  const factItemLede = (f) => factItem(f);
  body.nhamay = () => renderOps({ h, put, facts, factItem: factItemLede, empty: empty('nhamay') });
  body.dhcd = () => renderAgm({ h, put, facts, asOf: stats ? stats.last.date : null, factItem: factItemLede, empty: empty('dhcd') });
  body.ruiro = factsBody('ruiro');
  const scopeFacts = facts.filter((f) => f.kind === 'scope_change');
  body.phuongphap = () => {
    const src = (name, s) => (s ? h('li', {}, document.createTextNode(`${name}: `), h('code', { text: s.path || '' }), document.createTextNode(s.snapshot_date ? ` · snapshot ${s.snapshot_date}` : '')) : h('li', { text: `${name}: không có nguồn cho mã này` }));
    return h('div', { class: 'stack' },
      h('div', { class: 'panel' }, h('h3', { text: 'Nguồn và ngày dữ liệu' }), h('ul', { class: 'src-list' },
        src('Giá', data.prices && data.prices.source), src('Ngành ICB', icb.source), src('Ngành GICS', gics.source), src('finance-indicator', rec.financials && rec.financials.source),
        h('li', { text: `Ngày giá cuối trong universe: ${fmtDate(data.manifest && data.manifest.as_of_actual)}; xuất lúc ${data.manifest ? data.manifest.generated_at : MISSING}.` }))),
      h('div', { class: 'panel', 'data-role': 'facts-method' }, h('h3', { text: 'Facts có nguồn của doanh nghiệp' }),
        h('p', { text: F.state === 'LOADED' ? `${facts.length} facts hợp lệ${F.meta ? ` (${F.meta.data_kind === 'SYNTHETIC_FIXTURE' ? 'DỮ LIỆU GIẢ LẬP' : 'số thực tế đã công bố'}, đơn vị phát hành: ${F.meta.issuer})` : ''}, ${F.rejected.length} bị từ chối do không đạt kiểm tra (mã lý do ở file kiểm tra, không hiển thị nội dung bị từ chối).` : factsStateNote() }),
        h('p', { class: 'hint', text: 'Mỗi fact nêu đơn vị phát hành, kỳ, đơn vị tính, phạm vi (hợp nhất/riêng lẻ/theo mảng), thực tế/kế hoạch/ước tính, URL nguồn https, ngày truy cập và vị trí trích dẫn. Kế hoạch và ước tính không bao giờ được gắn nhãn là thực tế. Công ty con và công ty liên kết là đơn vị phát hành khác: không gộp.' })),
      h('div', { class: 'panel' }, h('h3', { text: 'Thực tế hay ước tính' }), h('p', { text: 'Số QRW/SSI là số nguồn đã báo cáo hoặc phép tính trực tiếp từ chúng. Số trong các mục có nguồn doanh nghiệp được gắn thực tế/kế hoạch/ước tính theo từng fact. Không có dự phóng hay số do mô hình của hệ thống tạo ra. Số liệu giả lập luôn có banner đỏ.' })),
      h('div', { class: 'panel' }, h('h3', { text: 'Cách tính các phép tính hiển thị' }), h('ul', { class: 'src-list' },
        h('li', { text: 'Vị trí trong vùng = (giá cuối − đáy 12T) / (đỉnh 12T − đáy 12T), trên giá đóng cửa của tối đa 252 phiên gần nhất; không xác định khi vùng phẳng.' }),
        h('li', { text: 'So với đỉnh/đáy = (giá cuối − mốc) / mốc.' }),
        h('li', { text: 'So với kỳ trước = (giá trị − giá trị kỳ trước) / giá trị kỳ trước, chỉ khi (a) có đúng một hàng cùng nhãn kỳ ở yearReport trước, (b) kỳ trước dương và (c) có bằng chứng công bố rằng hai kỳ cùng phạm vi kế toán; thiếu bằng chứng hoặc có thay đổi phạm vi thì không hiển thị và nêu lý do. Không điền khuyết, không sửa số nguồn.' }),
        h('li', { text: 'So với ngành: cùng ICB cấp 4 (hoặc cấp 2 khi thiếu) và đúng cùng period_key, lengthReport, ttmType; xếp theo mã, không xếp theo quy mô.' }))),
      h('details', { class: 'tech' }, h('summary', { text: 'Băm tệp và chi tiết kỹ thuật (thứ yếu)' }), h('p', { text: `Giá: ${(data.prices && data.prices.source && data.prices.source.sha256) || MISSING}` }), h('p', { text: `finance-indicator: ${(rec.financials && rec.financials.source && rec.financials.source.sha256) || MISSING}` })),
      h('p', { class: 'hint' }, document.createTextNode('Công cụ tra cứu cá nhân, không phải tư vấn đầu tư. Chi tiết nguồn và cờ dữ liệu: '), h('a', { href: `../qrw/?ticker=${data.ticker}`, text: 'bộ kiểm tra dữ liệu' }), document.createTextNode('.')));
  };

  for (const s of SECTIONS) {
    const av = avail.areas.find((a) => a.id === s.id);
    const sec = h('section', { id: s.id, 'data-status': s.status, ...(av ? { 'data-content': av.state } : {}) });
    const CHIP = { SOURCED: 'Có nguồn của mã', MODELED: 'Tính từ báo cáo đã duyệt + giả định có nhãn', DATA_ONLY: 'Có số liệu giá/SSI của mã' };
    sec.append(h('div', { class: 'sechead' }, h('div', {}, h('h2', { text: s.title }), h('p', { text: s.summary })), h('span', { class: `st ${s.status}`, 'data-role': 'section-chip', text: (av && CHIP[av.state]) || STATUS_LABEL[s.status] })));
    sec.append(body[s.id] ? body[s.id]() : todo(s));
    if (body[s.id] && s.status === STATUS.PARTIAL) sec.append(h('div', { class: 'note', 'data-role': 'partial-blocker' }, h('b', { text: 'Còn thiếu: ' }), document.createTextNode(`${s.blocker}`)));
    wrap.append(sec);
  }
  wrap.append(h('div', { class: 'tip', id: 'tip', role: 'tooltip' }));
  // The reference sizes the price chart to its container and redraws on resize; so do we (labels must stay readable on narrow screens).
  const redraw = () => redraws.forEach((f) => f());
  redraw();
  if (globalThis.__dossierResize) removeEventListener('resize', globalThis.__dossierResize);
  let rt = null; globalThis.__dossierResize = () => { clearTimeout(rt); rt = setTimeout(redraw, 150); };
  addEventListener('resize', globalThis.__dossierResize);
}
