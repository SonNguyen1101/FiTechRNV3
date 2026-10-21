// DOM for the analytical sections that are driven by reviewed statements and the valuation engines: #h1 (latest reported period), the statements part of #kqkd,
// #bien (profit drivers), #q3 (projection), #sotp / #sotpB (valuation), #kichban (scenario controls) and #doinhay (sensitivity). All numbers come from analysis.mjs,
// models.mjs and projection.mjs; this file only lays them out. One shared scenario state connects the controls, the projection, both valuations and the matrix, so
// moving a slider changes forecast, fair value, upside and the sensitivity grid together. Plain text only (textContent), no HTML from data.
import { fmtNum, fmtBillion, fmtMultiple, fmtVndUnit, fmtPct, fmtPctU, fmtPctPoint, fmtFixed1, fmtDate, MISSING } from './format.mjs';
import { periodName, STATUS_VI, summarizePeriod, modelEntry, runEntry, projectionFromDrivers } from './analysis.mjs';
import { MODELS, presetDrivers, sensitivityGrid } from './models.mjs';
import { projectPeriod } from './projection.mjs';
import { ttm } from './valuation.mjs';
import { barChart, lineChart } from './charts.mjs';
import { ASSUMPTION_STATUS } from './model-defaults.mjs';
import { SECTIONS, STATUS_LABEL } from './sections.mjs';

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const SCN_VI = { low: 'Thận trọng', base: 'Cơ sở', high: 'Lạc quan' };
const SCOPE_VI = { CONSOLIDATED: 'hợp nhất', SEPARATE: 'riêng lẻ' };
const CHANGE_VI = { NO_PRIOR: 'không có kỳ cùng loại năm trước', INCOMPARABLE_SCOPE_REGIME: 'kỳ trước thuộc phạm vi hợp nhất khác và không có số trình bày lại: không so sánh', NON_POSITIVE_BASE: 'kỳ trước không dương: % không có nghĩa' };
const MISSING_VI = { NO_STATEMENTS_INDEX: 'Chưa có chỉ mục báo cáo tài chính đã duyệt (statements/index.json).', NOT_ACQUIRED: 'Mã này chưa có báo cáo tài chính đã duyệt.', INVALID: 'File báo cáo tài chính của mã này không hợp lệ nên không dùng.', NO_PRICE: 'Chưa có giá để tính.', STATEMENTS_NOT_VALIDATED: 'Báo cáo tài chính chưa qua kiểm tra.' };
const MODEL_REASON_VI = { GROUP_NOT_FOUND: 'chưa có nhóm số liệu theo mảng của năm gần nhất (thuyết minh bộ phận)', FACTS_NOT_VALIDATED: 'facts của mã chưa qua kiểm tra', GROUP_NOT_RECONCILED: 'số liệu theo mảng chưa khớp tổng công bố', MISSING_CELL: 'thiếu ô doanh thu/LNTT của một mảng', RESTATEMENT_UNVERIFIED: 'chưa có bằng chứng số liệu mảng so sánh được giữa các năm', SCOPE_CHANGE_UNRESOLVED: 'có thay đổi phạm vi hợp nhất chưa có số cơ sở so sánh', PERIOD_YEAR_UNBOUND: 'nhóm mảng chưa khai báo năm tài chính' };
const ONE_DAY = 864e5;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / ONE_DAY);
const reasonText = (r) => { if (!r) return ''; const k = String(r).split(':')[0].trim(); return MODEL_REASON_VI[k] ? `${MODEL_REASON_VI[k]} (${r})` : String(r); };

export function createAnalysisView({ h, put, A, facts, data, label }) {
  const price = A.price, redraws = [];
  const scn = { name: 'base', drv: {} };
  const prim = A.ok ? modelEntry(A, 'primary') : null, alt = A.ok ? modelEntry(A, 'alternative') : null;
  const defsAvailable = [prim, alt].filter((e) => e && e.available);
  const idOf = (e) => e.def.id;
  const preset = (name) => { const o = {}; for (const e of [alt, prim]) if (e && e.available) Object.assign(o, presetDrivers(e.def, name, e.setup)); return o; };
  if (A.ok) scn.drv = preset('base');
  const live = (e) => (e && e.available ? runEntry(e, scn.name === 'custom' ? 'base' : scn.name, scn.drv) : null);
  const runAt = (e, name) => (e && e.available ? runEntry(e, name, preset(name)) : null);
  const emit = () => redraws.forEach((f) => f());
  const subscribe = (f) => { redraws.push(f); f(); };
  const note = (t, cls = 'note') => h('p', { class: cls, text: t });
  const noInput = (id, title, lines) => h('div', { class: 'todo', 'data-section': id, 'data-role': 'no-input' }, h('b', { text: title }), ...lines.map((l) => h('p', { text: l })));
  const why = () => MISSING_VI[A.code] || `Không tựa được vào báo cáo tài chính đã duyệt: ${A.code || 'thiếu dữ liệu'}.`;
  const NEED_STATEMENTS = 'Cách nạp: node scripts/import-statements.mjs --file <tệp báo cáo đã duyệt của mã> --install-into app/qrw/data (xem docs/STATEMENTS-IMPORT.md). Giả lập trong cloud: node scripts/build-fullpanel-fixture.mjs.';
  const needBlock = (id, title) => { const sec = SECTIONS.find((x) => x.id === id);
    return h('div', { class: 'todo', 'data-section': id, 'data-role': 'no-input' }, h('p', {}, h('b', { text: 'Trạng thái: ' }), document.createTextNode(STATUS_LABEL[sec.status])), h('p', { text: sec.blocker }), h('p', {}, h('b', { text: `${title} ` }), document.createTextNode(why())),
      h('b', { text: 'Cần để dựng mục này:' }), h('ul', {}, ...sec.needs.map((x) => h('li', { text: x }))),
      h('p', { class: 'hint', text: 'Đã dựng đủ thành phần; mục sẽ hiển thị khi có báo cáo tài chính đã duyệt của mã (kỳ, đơn vị, phạm vi hợp nhất và nguồn từng chỉ tiêu).' }),
      h('details', { class: 'tech', 'data-role': 'howto' }, h('summary', { text: 'Cách bổ sung (kỹ thuật)' }), h('p', { class: 'hint', text: NEED_STATEMENTS }))); };
  const tile = (l, v, s, attrs = {}) => h('div', { class: 'tile', ...attrs }, h('div', { class: 'l', text: l }), h('div', { class: 'v', text: v }), h('div', { class: 's', text: s }));
  const chgText = (ch, kind = 'money') => (!ch ? '' : ch.status === 'OK' ? (kind === 'ratio' ? `${fmtPctPoint(ch.abs)} điểm %` : fmtPct(ch.pct)) : CHANGE_VI[ch.status] || ch.status);
  const sign = (v) => (fin(v) && v > 0 ? '+' : '');
  const sourceLine = (p) => `Nguồn số liệu: báo cáo ${SCOPE_VI[p.scope]} ${STATUS_VI[p.review] || p.review}, ${fmtDate(p.start)}–${fmtDate(p.end)}, đơn vị gốc ${p.source_unit === 'billion_VND' ? 'tỷ đồng' : p.source_unit === 'million_VND' ? 'triệu đồng' : 'đồng'}, phạm vi hợp nhất "${p.regime}".`;
  const valueFmt = (r) => (r.kind === 'ratio' ? fmtPctU(r.value) : r.kind === 'pct_number' ? `${fmtFixed1(r.value)}%` : fmtBillion(r.value));

  // ------------------------------------------------------------------------------------------------------------------ #gia valuation block
  function valuation() {
    if (!A.ok) return h('div', { class: 'note', 'data-role': 'valuation' }, h('b', { text: 'Định giá chưa tính được. ' }), document.createTextNode(`${why()} Mục đã dựng: khi có báo cáo tài chính đã duyệt, vốn hoá, EPS, P/E, BVPS, P/B và giá hợp lý theo mô hình ngành sẽ hiện kèm ngày giá, kỳ lợi nhuận và ngày số cổ phiếu.`));
    const M = A.metrics, ds = (d) => fmtDate(d);
    const eps = M.eps, pe = M.pe, pbv = M.pb, mc = M.market_cap, nd = M.net_debt;
    const tiles = h('div', { class: 'tiles', id: 'valTiles', 'data-role': 'valuation' },
      tile('Giá đóng cửa', `${fmtVndUnit(M.price.value)} đ`, `ngày giá ${ds(M.price.date)} (QRW)`),
      tile('Vốn hoá', mc.value_billion_vnd === null ? MISSING : `${fmtBillion(mc.value_billion_vnd)} tỷ`, mc.value_billion_vnd === null ? mc.reason : `giá × ${fmtNum(M.shares.value, { max: 0 })} cổ phiếu hiện hành; bản ghi ngày ${ds(M.shares.base_as_of)}${M.shares.actions_applied.length ? `, đã áp dụng ${M.shares.actions_applied.length} hành động doanh nghiệp đến ${ds(M.price.date)}` : ''}`),
      tile(eps.basis === 'TTM' ? 'EPS 12 tháng (TTM)' : eps.basis === 'FY' ? 'EPS năm gần nhất' : 'EPS', eps.value === null ? MISSING : `${fmtVndUnit(eps.value)} đ`, eps.value === null ? String(eps.reason) : `LNST công ty mẹ ${eps.earnings_period_ids.join(' + ')}${eps.basis === 'TTM' ? ' (năm trước + kỳ này − cùng kỳ năm trước)' : ''}, chia số cổ phiếu tại ngày giá${eps.caveat ? `. ${eps.caveat}` : ''}`),
      tile('P/E', pe.value === null ? MISSING : fmtMultiple(pe.value), pe.value === null ? String(pe.reason) : `giá ${ds(pe.as_of_price)} ÷ EPS ${pe.basis}`),
      tile('BVPS', M.bvps.value === null ? MISSING : `${fmtVndUnit(M.bvps.value)} đ`, M.bvps.value === null ? String(M.bvps.reason) : `vốn chủ công ty mẹ ${M.bvps.period_id} ÷ số cổ phiếu tại ngày giá`),
      tile('P/B', pbv.value === null ? MISSING : fmtMultiple(pbv.value), pbv.value === null ? String(pbv.reason) : `giá ${ds(pbv.as_of_price)} ÷ BVPS ${pbv.period_id}`));
    if (A.variant === 'corporate') tiles.append(tile('Nợ ròng', nd.value_billion_vnd === null ? MISSING : `${fmtBillion(nd.value_billion_vnd)} tỷ`, nd.value_billion_vnd === null ? String(nd.reason) : `kỳ ${nd.period_id}${nd.partial ? ' (thiếu một loại nợ vay)' : ''}`));
    const fair = h('div', { class: 'out', id: 'giaFair', 'data-role': 'fair-summary' });
    const wrap = h('div', { class: 'stack' }, tiles, note(`Mỗi chỉ tiêu nêu riêng ngày giá, kỳ báo cáo và ngày số cổ phiếu; EPS ở kỳ trước được trình bày lại theo cổ phiếu hiện hành khi có chia cổ phiếu/thưởng sau kỳ. ${M.flags.includes('STALE_SHARE_BASIS_FORCED') ? 'CẢNH BÁO: số cổ phiếu chưa cập nhật theo hành động doanh nghiệp. ' : ''}`, 'hint'), fair);
    subscribe(() => {
      const r = prim && prim.available ? live(prim) : null;
      put(fair, ...(r && r.status === 'COMPUTED' ? [h('div', { class: 'big' }, h('span', { class: 'l', text: `Giá hợp lý · ${prim.def.label} · kịch bản ${scn.name === 'custom' ? 'tuỳ chỉnh' : SCN_VI[scn.name]}` }), h('span', { class: 'v', text: `${fmtVndUnit(r.per_share.value)} đ` }), h('span', { class: 's', text: `so với giá ${fmtVndUnit(price.value)} đ ngày ${ds(price.date)}: ${fmtPct(r.upside.value)} · giả định mặc định chưa duyệt, xem mục Định giá tổng hợp` }))] : [h('div', { class: 'big' }, h('span', { class: 'l', text: 'Giá hợp lý theo mô hình ngành' }), h('span', { class: 'v', text: MISSING }), h('span', { class: 's', text: prim && !prim.available ? reasonText(prim.reason) : (r ? `${r.status}: ${(r.missing || []).join(', ')}` : '') }))]));
    });
    return wrap;
  }

  // ------------------------------------------------------------------------------------------------------------------ #h1
  function h1() {
    if (!A.ok) return needBlock('h1', 'Chưa có báo cáo tài chính đã duyệt cho kỳ gần nhất.');
    const S = A.summary, host = h('div', { class: 'stack', 'data-role': 'h1-statements' });
    const kp = (r, lead = false) => h('div', { class: `kpi${lead ? ' lead' : ''}`, 'data-metric': r.key }, h('span', { class: 'l', text: r.label }), h('span', { class: 'v', title: valueFmt(r), text: `${valueFmt(r)}${r.kind === 'money' || !r.kind ? ' tỷ' : ''}` }),
      h('span', { class: 's', text: r.change ? (r.change.status === 'OK' ? `${chgText(r.change, r.kind)} so với ${S.kind === 'FY' ? 'năm' : 'cùng kỳ'} ${S.fiscal_year - 1}${r.via === 'RESTATED_COMPARATIVE' ? ' (số trình bày lại cùng phạm vi)' : ''}` : chgText(r.change, r.kind)) : '' }));
    put(host,
      h('p', { class: 'hint', 'data-role': 'h1-source', text: `${S.name} (${fmtDate(S.start)}–${fmtDate(S.end)}). ${sourceLine(S)} Số tính toán từ các số này nêu rõ là tính lại.` }),
      h('div', { class: 'kpis', id: 'h1Kpis' }, ...S.income.map((r, i) => kp(r, i === 0)), ...S.margins.map((r) => kp(r))),
      S.detail.length ? h('div', { class: 'panel scroll', 'data-role': 'income-detail' }, h('h3', { text: 'Chi tiết kết quả kinh doanh, tỷ đồng (dấu đúng như báo cáo)' }), h('table', { class: 'tmin', id: 'h1Detail' }, h('thead', {}, h('tr', {}, h('th', { text: 'Khoản mục' }), h('th', { text: S.name }), h('th', { text: `so với cùng kỳ ${S.fiscal_year - 1}` }))), h('tbody', {}, ...S.detail.map((r) => h('tr', { 'data-metric': r.key }, h('td', { text: r.label }), h('td', { text: fmtBillion(r.value) }), h('td', { text: r.prior !== null && r.prior !== undefined ? fmtBillion(r.prior) : chgText(r.change) })))))) : null,
      S.attribution ? note(`${S.attribution.label}: ${fmtPctU(S.attribution.parent_share)}${fin(S.attribution.nci) ? `; lợi ích cổ đông không kiểm soát ${fmtBillion(S.attribution.nci)} tỷ` : ''}.`, 'hint') : null,
      S.balance.length || S.cash.length || S.ratios.length ? h('div', { class: 'tiles', id: 'h1Tiles', 'data-role': 'h1-balance' }, ...[...S.balance, ...S.cash, ...S.ratios].map((r) => tile(r.label, valueFmt({ ...r, kind: r.kind || 'money' }) + (r.kind === 'ratio' || r.kind === 'pct_number' ? '' : ' tỷ'), r.derived ? 'tính từ hai số công bố cùng kỳ' : r.partial ? 'thiếu một loại nợ vay trong báo cáo' : `kỳ ${S.id}`, { 'data-metric': r.key }))) : note('Báo cáo của kỳ này chưa có bảng cân đối/dòng tiền được duyệt.', 'hint'),
      S.eps ? epsBlock(S) : null);
    return host;
  }
  function epsBlock(S) {
    const e = S.eps;
    return h('div', { class: 'panel', 'data-role': 'eps-basis' }, h('h3', { text: 'EPS: số công bố và số tính lại' }),
      h('div', { class: 'out' },
        h('div', {}, h('span', { class: 'l', text: `EPS công bố (${S.name})` }), h('span', { class: 'v', text: e.published === null ? MISSING : `${fmtVndUnit(e.published)} đ` }), h('span', { class: 's', text: `theo số cổ phiếu của chính kỳ đó, như doanh nghiệp công bố${e.published_diluted !== null && e.published_diluted !== undefined ? `; EPS pha loãng công bố ${fmtVndUnit(e.published_diluted)} đ` : ''}` })),
        h('div', {}, h('span', { class: 'l', text: `EPS tính lại về ${fmtDate(e.restated_to)}` }), h('span', { class: 'v', text: e.restated === null ? MISSING : `${fmtVndUnit(e.restated)} đ` }), h('span', { class: 's', text: e.restated === null ? String(e.reason) : `LNST công ty mẹ ÷ ${fmtNum(e.shares_at_period_end, { max: 0 })} cổ phiếu cuối kỳ${e.cumulative_ratio && e.cumulative_ratio !== 1 ? ` ÷ hệ số hành động doanh nghiệp ${fmtNum(e.cumulative_ratio, { max: 4 })}` : ''}` }))),
      note(`Hai số dùng cơ sở cổ phiếu khác nhau nên không so trực tiếp. ${e.period_kind === 'H1' ? 'Đây là EPS của nửa năm, chưa quy năm hoá.' : ''}`, 'hint'));
  }

  // ------------------------------------------------------------------------------------------------------------------ #kqkd (statements part)
  function kqkdStatements() {
    if (!A.ok) return needBlock('kqkd', 'Chưa có báo cáo tài chính đã duyệt nhiều kỳ.');
    const st = A.st, periods = [...st.periods].sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : a.kind === 'FY' ? 1 : -1)), v = A.variant;
    const keys = (v === 'bank' ? ['nii', 'noii', 'provisions', 'pbt', 'np_total', 'np_parent'] : v === 'financial' ? ['revenue', 'pbt', 'np_total', 'np_parent'] : ['revenue', 'gross_profit', 'ebitda', 'pbt', 'tax', 'np_total', 'np_parent']).filter((k) => periods.some((p) => p.items[k]));
    const NAME = { revenue: 'Doanh thu', gross_profit: 'Lợi nhuận gộp', ebitda: 'EBITDA', pbt: 'Lợi nhuận trước thuế', tax: 'Chi phí thuế', np_total: 'LNST', np_parent: 'LNST thuộc công ty mẹ', nii: 'Thu nhập lãi thuần', noii: 'Thu nhập ngoài lãi', provisions: 'Chi phí dự phòng' };
    const f = { VND: 1e-9, million_VND: 1e-3, billion_VND: 1 };
    const latest = A.latest, tt = latest && latest.kind === 'H1' ? Object.fromEntries(keys.map((k) => [k, ttm({ statements: st, target: latest.id, key: k })])) : null;
    const th = h('tr', {}, h('th', { text: 'Tỷ đồng' }), ...periods.map((p) => h('th', { 'data-period': p.id, text: periodName(p) })), tt ? h('th', { 'data-period': 'TTM', text: `12 tháng đến ${fmtDate(latest.end)}` }) : null);
    const tb = h('tbody');
    for (const k of keys) tb.append(h('tr', { 'data-metric': k }, h('td', { text: NAME[k] }), ...periods.map((p) => h('td', { text: p.items[k] ? fmtBillion(p.items[k].value * f[p.unit]) : MISSING })), tt ? h('td', { title: tt[k].value === null ? tt[k].reason : 'TTM = năm trước + kỳ này − cùng kỳ năm trước, trong cùng phạm vi hợp nhất', text: tt[k].value === null ? MISSING : fmtBillion(tt[k].value * f[tt[k].unit]) }) : null));
    const fy = periods.filter((p) => p.kind === 'FY'), chart = (title, k, kind = 'bar') => {
      if (fy.filter((p) => p.items[k]).length < 1) return null;
      const svg = kind === 'bar' ? barChart({ cats: fy.map((p) => ({ label: String(p.fiscal_year), value: p.items[k] ? p.items[k].value * f[p.unit] : null })), title, yFormat: fmtBillion }) : '';
      return h('div', { class: 'panel' }, h('h3', { text: title }), h('div', { class: 'chart', 'data-metric': k, html: svg }));
    };
    const mg = [['gross_profit', 'revenue', 'Biên lợi nhuận gộp'], ['pbt', 'revenue', 'Biên LNTT'], ['np_parent', 'revenue', 'Biên LNST công ty mẹ']].filter(([a, b]) => v === 'corporate' ? fy.filter((p) => p.items[a] && p.items[b]).length >= 1 : false);
    const lineOf = (num, den, title) => { const pts = fy.filter((p) => p.items[num] && p.items[den]).map((p, i) => ({ x: i, y: p.items[num].value / p.items[den].value, label: String(p.fiscal_year) })); return pts.length ? h('div', { class: 'panel' }, h('h3', { text: title }), h('div', { class: 'chart', 'data-metric': `${num}/${den}`, html: lineChart({ points: pts, title, yFormat: fmtPctU }) })) : null; };
    const charts = h('div', { class: 'charts2', 'data-role': 'kqkd-statement-charts' }, ...(v === 'bank' ? [chart('Thu nhập lãi thuần theo năm, tỷ đồng', 'nii'), chart('LNST công ty mẹ theo năm, tỷ đồng', 'np_parent')] : [chart(`${NAME[v === 'corporate' ? 'revenue' : 'revenue']} theo năm, tỷ đồng`, 'revenue'), chart('LNST công ty mẹ theo năm, tỷ đồng', 'np_parent'), ...mg.slice(0, 2).map(([a, b, t]) => lineOf(a, b, `${t} theo năm`))]).filter(Boolean));
    return h('div', { class: 'stack', 'data-role': 'kqkd-statements' },
      h('p', { class: 'hint', text: `Báo cáo đã duyệt: kỳ nào ra kỳ đó (năm, nửa năm), không đặt tên lại. Phạm vi hợp nhất từng kỳ: ${[...new Set(periods.map((p) => p.scope_regime))].join(' · ')}. Cột 12 tháng chỉ tính khi cả ba kỳ cùng phạm vi (hoặc có số trình bày lại).` }),
      h('div', { class: 'wrap-table' }, h('table', { class: 'tmin', id: 'stmtTbl' }, h('thead', {}, th), tb)),
      charts.children.length ? charts : null);
  }

  // ------------------------------------------------------------------------------------------------------------------ #bien
  function bars(rows, { unit = 'tỷ' } = {}) {
    const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.value))), neg = rows.some((r) => r.value < 0), zero = neg ? 50 : 0, scale = neg ? 50 : 100;
    return h('div', { class: 'bridge', 'data-role': 'bars' }, ...rows.map((r) => {
      const w = (Math.abs(r.value) / max) * scale, left = r.value < 0 ? zero - w : zero;
      return h('div', { class: 'brow', 'data-bar-row': r.id }, h('span', { class: 'lb', title: r.label, text: r.label }), h('span', { class: 'tr' }, h('span', { class: 'fl', style: `left:${left}%;width:${w}%;background:${r.value < 0 ? 'var(--bad)' : r.total ? 'var(--ink)' : 'var(--urea)'}` })), h('span', { class: 'vl', text: `${sign(r.value)}${fmtBillion(r.value)}` }));
    }));
  }
  const pname = (id) => { const p = A.st.periods.find((q) => q.id === id); return p ? periodName(p) : id; };
  const gname = (id) => { const g = A.loaded && A.loaded.groups.find((x) => x.id === id); return g ? g.period.label : id; };
  function bien() {
    if (!A.ok) return needBlock('bien', 'Chưa có báo cáo tài chính đã duyệt để phân tích động lực lợi nhuận.');
    const out = h('div', { class: 'stack', 'data-role': 'bien-body' }), B = A.bridge;
    if (B && B.status === 'COMPUTED') {
      const rows = [...B.rows.map((r) => ({ id: r.id, label: r.label, value: r.value })), { id: 'total', label: `Tổng thay đổi LNTT (${pname(B.prior)} → ${pname(B.current)})`, value: B.total_delta, total: true }];
      out.append(h('div', { class: 'panel', 'data-role': 'bridge' }, h('h3', { text: `Cầu nối LNTT ${pname(B.prior)} → ${pname(B.current)}, tỷ đồng` }), bars(rows),
        note(`${B.rows.length} cấu phần cộng đúng bằng thay đổi LNTT (kiểm tra ${B.check ? 'khớp' : 'LỆCH'}). Cùng phạm vi hợp nhất "${B.regime}". Đây là phép phân rã số đã công bố, không phải ước tính.${B.attribution ? ` LNST công ty mẹ ÷ LNTT: ${fmtPctU(B.attribution.prior)} → ${fmtPctU(B.attribution.current)}.` : ''}`, 'hint')));
    } else out.append(note(`Chưa dựng được cầu nối LNTT: ${B ? B.status : 'thiếu hai kỳ báo cáo'}${B && B.missing ? ` (${B.missing})` : ''}. Cần hai kỳ cùng loại, cùng phạm vi hợp nhất, có doanh thu${A.variant === 'bank' ? '/thu nhập lãi' : ''} và LNTT.`));
    for (const d of A.segDeltas) {
      if (d.status !== 'COMPUTED' && d.status !== 'INCOMPLETE') continue;
      const rows = d.rows.filter((r) => r.delta !== null).map((r) => ({ id: r.id, label: r.label, value: r.delta })), M = d.metric === 'pbt' ? 'LNTT' : 'Doanh thu';
      out.append(h('div', { class: 'panel', 'data-role': 'segment-delta', 'data-metric': d.metric }, h('h3', { text: `${M} theo mảng: ${gname(d.prior)} → ${gname(d.current)}, thay đổi tỷ đồng` }), bars(rows),
        note(d.reconciled ? 'Tổng thay đổi các mảng (gồm loại trừ) bằng thay đổi của dòng tổng công bố.' : `Chưa đối chiếu được tổng (${d.status}).`, 'hint')));
    }
    const run = prim && prim.available && prim.def.id === 'corporate_sotp' ? live(prim) : null;
    if (run && run.status === 'COMPUTED') {
      const fc = h('div', { class: 'panel scroll', id: 'bienFwd', 'data-role': 'forward-components' });
      subscribe(() => {
        const r = live(prim), comps = prim.setup.components;
        const tb = h('tbody', {}, ...r.components.map((c, i) => h('tr', {}, h('td', { text: c.label }), h('td', { text: fmtBillion(comps[i].base.pbt) }), h('td', { text: fmtBillion(c.pbt_forecast) }), h('td', { class: c.pbt_forecast - comps[i].base.pbt < 0 ? 'neg' : '', text: `${sign(c.pbt_forecast - comps[i].base.pbt)}${fmtBillion(c.pbt_forecast - comps[i].base.pbt)}` }))));
        put(fc, h('h3', { text: `Cấu phần LNTT: ${prim.setup.base_period.label} thực tế và năm kế tiếp theo kịch bản đang chọn, tỷ đồng` }), h('table', { class: 'tmin', style: 'min-width:470px' }, h('thead', {}, h('tr', {}, ...['Mảng', 'Thực tế (cơ sở)', 'Dự phóng theo giả định', '±'].map((x) => h('th', { text: x })))), tb),
          note(`Dự phóng = doanh thu × (1 + tăng trưởng) × (biên LNTT + thay đổi biên), tăng trưởng ${fmtPctU(scn.drv.growth)} và thay đổi biên ${fmtPctU(scn.drv.margin_delta)}: giả định ${scn.name === 'custom' ? 'tuỳ chỉnh' : SCN_VI[scn.name]}, thay đổi ở mục Kịch bản.`, 'hint'));
      });
      out.append(fc);
    }
    const guide = { bank: 'Ngân hàng: động lực lợi nhuận là thu nhập lãi thuần (tăng trưởng tín dụng × NIM), thu nhập ngoài lãi, chi phí dự phòng và chi phí hoạt động. Cầu nối ở trên tách đúng các dòng này.', financial: 'Công ty chứng khoán/tài chính: doanh thu theo hoạt động (môi giới, tự doanh, cho vay ký quỹ) phụ thuộc thanh khoản thị trường; báo cáo hiện có chỉ cung cấp doanh thu và LNTT tổng.', corporate: 'Doanh nghiệp hoạt động: động lực là doanh thu và biên của từng mảng (thuyết minh bộ phận), biên gộp và chi phí chung. Các biến vận hành riêng của ngành khác (sản lượng, đơn giá, công suất của một loại tài sản cụ thể) không áp dụng cho mã này.' }[A.variant];
    out.append(note(guide, 'hint'));
    return out;
  }

  // ------------------------------------------------------------------------------------------------------------------ #q3
  const growthOf = () => (A.variant === 'corporate' ? scn.drv.growth : scn.drv.earnings_growth);
  const projection = () => {
    const P = A.projection; if (!P || !P.ok) return { ok: false, code: P ? P.code : 'NO_PROJECTION_BASE' };
    const a = projectionFromDrivers({ growth: growthOf(), margin_delta: scn.drv.margin_delta }, { growth: 0.08, margin_delta: 0 });
    return { ok: true, res: projectPeriod(P.ctx, a), ctx: P.ctx, assumptions: a };
  };
  function q3() {
    if (!A.ok) return needBlock('q3', 'Chưa có báo cáo tài chính đã duyệt để dự phóng.');
    const P = projection(); if (!P.ok) return noInput('q3', 'Chưa dựng được dự phóng.', [`Thiếu cơ sở dự phóng (${P.code}): cần một kỳ năm hoặc nửa năm có doanh thu (hoặc thu nhập lãi + ngoài lãi) và LNST công ty mẹ.`]);
    const host = h('div', { class: 'stack', 'data-role': 'projection' }), out = h('div', { class: 'out', id: 'q3Out' }), tblBox = h('div', { class: 'panel scroll', id: 'q3Box' }), chartBox = h('div', { class: 'panel' });
    const baseP = A.projection.base_period;
    subscribe(() => {
      const Q = projection(), r = Q.res;
      if (r.status !== 'COMPUTED') { put(out, h('div', { class: 'big' }, h('span', { class: 'l', text: 'Dự phóng' }), h('span', { class: 'v', text: MISSING }), h('span', { class: 's', text: `${r.status} ${(r.missing || []).join(', ')}` }))); put(tblBox); put(chartBox); return; }
      const T = r.target, fyLabel = `${T.kind === 'FY' ? 'Năm' : T.kind} ${T.fiscal_year}`;
      put(out, h('div', { class: 'big' }, h('span', { class: 'l', text: `LNST công ty mẹ ${fyLabel} ước (ước tính, không phải số công bố)` }), h('span', { class: 'v', 'data-role': 'q3-np', text: `${fmtBillion(r.fy.np_parent)} tỷ` }), h('span', { class: 's', text: `giả định ${scn.name === 'custom' ? 'tuỳ chỉnh' : SCN_VI[scn.name]}: tăng trưởng doanh thu ${fmtPctU(Q.assumptions.growth)}, thay đổi biên ${fmtPctU(Q.assumptions.margin_delta)}` })),
        h('div', {}, h('span', { class: 'l', text: `${A.projection.ctx.base.revenue_basis} cả kỳ ước` }), h('span', { class: 'v', text: `${fmtBillion(r.fy.revenue)} tỷ` }), h('span', { class: 's', text: 'ước tính theo giả định' })),
        h('div', {}, h('span', { class: 'l', text: 'EPS ước' }), h('span', { class: 'v', text: r.eps ? `${fmtVndUnit(r.eps.value)} đ` : MISSING }), h('span', { class: 's', text: `trên ${fmtNum(A.projection.ctx.shares, { max: 0 })} cổ phiếu hiện hành (${fmtDate(price.date)})` })),
        h('div', {}, h('span', { class: 'l', text: 'P/E dự phóng' }), h('span', { class: 'v', text: r.forward_pe && r.forward_pe.value !== null ? fmtMultiple(r.forward_pe.value) : MISSING }), h('span', { class: 's', text: `giá ${fmtVndUnit(price.value)} đ ngày ${fmtDate(price.date)}` })),
        r.plan ? h('div', {}, h('span', { class: 'l', text: 'So với kế hoạch ĐHĐCĐ' }), h('span', { class: 'v', text: fmtPctU(r.plan.fraction_of_plan) }), h('span', { class: 's', text: `kế hoạch ${fmtBillion(r.plan.np_parent)} tỷ (kế hoạch của doanh nghiệp, không phải dự phóng của hệ thống)` })) : null);
      const tb = h('tbody', {}, ...r.rows.map((x) => h('tr', { class: x.kind === 'ESTIMATE' ? 'me' : '', 'data-kind': x.kind }, h('td', {}, document.createTextNode(x.label), h('small', { text: { ACTUAL: 'số thực tế đã công bố', FORECAST: 'dự phóng theo giả định', ESTIMATE: 'ước tính = thực tế + dự phóng' }[x.kind] })), h('td', { text: fmtBillion(x.revenue) }), h('td', { text: fmtBillion(x.np_parent) }))));
      put(tblBox, h('table', { class: 'tmin', id: 'q3Tbl', style: 'min-width:420px' }, h('thead', {}, h('tr', {}, h('th', { text: 'Tỷ đồng' }), h('th', { text: 'Doanh thu' }), h('th', { text: 'LNST công ty mẹ' }))), tb),
        note(`${r.flags.includes('H2_BASE_FROM_H1_NO_SEASONALITY') ? 'Không có nửa năm cuối của năm trước cùng phạm vi, nên nửa năm cuối lấy nền từ nửa năm đầu (không có mùa vụ). ' : ''}Phần dự phóng = doanh thu nền × (1 + tăng trưởng) × (LNST ÷ doanh thu của kỳ thực tế + thay đổi biên). Nền: ${baseP.id}, phạm vi hợp nhất "${baseP.scope_regime}".${A.variant === 'corporate' ? '' : ' Với ngành tài chính, giả định tăng trưởng lợi nhuận của mô hình P/E được dùng làm tăng trưởng thu nhập hoạt động.'}`, 'hint'));
      const cats = r.rows.map((x) => ({ label: x.kind === 'ACTUAL' ? 'Thực tế' : x.kind === 'FORECAST' ? 'Dự phóng' : 'Ước tính', value: x.np_parent }));
      put(chartBox, h('h3', { text: 'LNST công ty mẹ: thực tế → dự phóng → ước tính, tỷ đồng' }), h('div', { class: 'chart', id: 'q3Chart', html: barChart({ cats, title: 'LNST công ty mẹ: thực tế, dự phóng, ước tính', yFormat: fmtBillion }) }),
        h('div', { class: 'legend' }, h('span', {}, document.createTextNode('Cột thực tế là số đã công bố; dự phóng và ước tính tính theo giả định ở mục Kịch bản.'))));
    });
    put(host, h('div', { class: 'verdict warn', 'data-role': 'q3-label' }, h('b', { text: 'Dự phóng theo giả định' }), h('span', { text: `Số dưới đây là ước tính từ ${baseP.id} đã công bố, không phải kết quả đã công bố và không phải dự báo của doanh nghiệp. Bộ giả định mặc định chưa được duyệt (${ASSUMPTION_STATUS}); chỉnh ở mục Kịch bản.` })), out, tblBox, chartBox);
    return host;
  }

  // ------------------------------------------------------------------------------------------------------------------ #sotp / #sotpB
  const unitNote = (u) => (u === 'billion_VND' ? 'tỷ đồng' : u);
  const runCols = () => [['low', SCN_VI.low], ['base', SCN_VI.base], ['high', SCN_VI.high]];
  function modelTable(entry, id) {
    const def = entry.def, S = entry.setup, host = h('div', { class: 'stack', 'data-model': def.id });
    const body = h('div', { class: 'panel', style: 'overflow-x:auto' }), info = h('div', { class: 'note', 'data-role': 'model-note' });
    subscribe(() => {
      const runs = { low: runAt(entry, 'low'), base: runAt(entry, 'base'), high: runAt(entry, 'high'), live: live(entry) };
      const cols = [...runCols(), ['live', scn.name === 'custom' ? 'Theo thanh trượt (tuỳ chỉnh)' : `Đang chọn: ${SCN_VI[scn.name]}`]];
      const th = h('tr', {}, h('th', { text: 'Thành phần' }), ...cols.map(([k, t]) => h('th', { class: k === 'live' ? 'on' : '', 'data-col': k, text: t })));
      const R = [], row = (labelNode, fn, o = {}) => R.push(h('tr', { class: o.cls || '', ...(o.attrs || {}) }, h('td', { style: 'white-space:normal' }, ...labelNode), ...cols.map(([k]) => { const r = runs[k]; const v = r ? fn(r) : MISSING; return h('td', { class: k === 'live' ? 'on' : '', text: v ?? MISSING }); })));
      const lab = (t, sub) => [document.createTextNode(t), sub ? h('small', { style: 'display:block;color:var(--mute);font-size:11px', text: sub }) : null].filter(Boolean);
      const okv = (r, f) => (r.status === 'COMPUTED' ? f(r) : r.status === 'NULL_INPUT' ? `thiếu: ${(r.missing || []).join(', ')}` : r.status);
      if (def.id === 'corporate_sotp') {
        S.components.forEach((c, i) => row(lab(c.label, `${c.kind === 'PE_EARNINGS' ? `LNTT dự phóng × (1−thuế) × tỷ lệ thuộc công ty mẹ × P/E (tham chiếu ${fmtNum(c.multiple.low, { max: 1 })}/${fmtNum(c.multiple.base, { max: 1 })}/${fmtNum(c.multiple.high, { max: 1 })}×)` : c.kind}; ô nguồn: ${(c.provenance.fact_ids || []).join(', ')}`), (r) => okv(r, (x) => fmtBillion(x.components[i].value)), { attrs: { 'data-component': c.id } }));
        row(lab('Loại trừ hợp nhất', 'lợi nhuận nội bộ co giãn theo tăng trưởng, bội số bình quân'), (r) => okv(r, (x) => fmtBillion(x.elimination.value)));
        row(lab('Tổng các phần'), (r) => okv(r, (x) => fmtBillion(x.sum_components)), { cls: 'tot' });
        row(lab('Chiết khấu holding', `${fmtPctU(scn.drv.holding_discount)} ở cột đang chọn`), (r) => okv(r, (x) => fmtBillion(x.holding_discount_amount)));
        row(lab('Tài sản phi hoạt động − nợ ròng holding', S.defaults_note), () => fmtBillion((S.non_operating_assets || 0) - (S.holding_net_debt || 0)));
        row(lab('Giá trị vốn chủ sở hữu (tỷ đồng)'), (r) => okv(r, (x) => fmtBillion(x.equity_value)), { cls: 'tot' });
      } else if (def.id === 'corporate_ev') {
        row(lab('EBITDA cơ sở', S.ebitda_period_id), () => fmtBillion(S.ebitda));
        row(lab('Bội số EV/EBITDA áp dụng'), (r) => okv(r, () => fmtMultiple(S.multiple[runKey(r, runs)] * scn.drvFor(r, runs).multiple_scale)));
        row(lab('Giá trị doanh nghiệp (EV)'), (r) => okv(r, (x) => fmtBillion(x.enterprise_value)));
        row(lab('Nợ ròng', S.balance_period_id), () => fmtBillion(-S.net_debt));
        row(lab('Lợi ích cổ đông không kiểm soát (sổ sách)'), () => fmtBillion(-(S.nci_equity || 0)));
        row(lab('Công ty liên kết (sổ sách)'), () => fmtBillion(S.associates_book || 0));
        row(lab('Giá trị vốn chủ sở hữu (tỷ đồng)'), (r) => okv(r, (x) => fmtBillion(x.equity_value)), { cls: 'tot' });
      } else if (def.id === 'financial_pb') {
        row(lab('ROE bền vững'), (r) => okv(r, () => fmtPctU(driversOf(r, runs).roe)));
        row(lab('Tăng trưởng dài hạn g'), (r) => okv(r, () => fmtPctU(driversOf(r, runs).growth)));
        row(lab('Chi phí vốn chủ CoE'), (r) => okv(r, () => fmtPctU(driversOf(r, runs).coe)));
        row(lab('P/B hợp lý = (ROE − g) ÷ (CoE − g)'), (r) => okv(r, (x) => fmtMultiple(x.justified_pb)), { cls: 'tot' });
        row(lab('BVPS điều chỉnh', `vốn chủ công ty mẹ ${S.equity_period_id} sau điều chỉnh`), (r) => okv(r, (x) => `${fmtVndUnit(x.bvps)} đ`));
      } else {
        row(lab('EPS dự phóng', `lợi nhuận ${S.earnings_basis} ÷ cổ phiếu hiện hành × (1 + tăng trưởng)`), (r) => okv(r, (x) => `${fmtVndUnit(x.eps_forward)} đ`));
        row(lab('P/E mục tiêu'), (r) => okv(r, () => fmtMultiple(driversOf(r, runs).target_pe)));
      }
      row(lab('Số cổ phiếu', `bản ghi ngày ${fmtDate(S.shares.base_as_of)}, quy về ${fmtDate(S.shares.as_of)}`), () => fmtNum(S.shares.value, { max: 0 }));
      row(lab('Giá hợp lý mỗi cổ phiếu (đ)'), (r) => okv(r, (x) => fmtVndUnit(x.per_share.value)), { cls: 'tot', attrs: { 'data-role': 'fair' } });
      row(lab('Giá hiện tại (đ)', `ngày giá ${fmtDate(price.date)}`), () => fmtVndUnit(price.value));
      row(lab('Chênh lệch so với giá hiện tại'), (r) => okv(r, (x) => fmtPct(x.upside.value)), { cls: 'tot', attrs: { 'data-role': 'upside' } });
      put(body, h('table', { class: 'sotpt tmin', id: id === 'sotp' ? 'sotpTbl' : 'sotpBTbl', style: 'min-width:640px' }, h('thead', {}, th), h('tbody', {}, ...R)));
      const lr = runs.live;
      put(info, h('b', { text: 'Chú thích. ' }), document.createTextNode(`${S.assumption_status === ASSUMPTION_STATUS ? 'GIẢ ĐỊNH MẶC ĐỊNH CHƯA DUYỆT (bội số, chiết khấu, thuế, chi phí vốn): ' : ''}${S.assumption_rationale} Lịch sử lấy từ báo cáo đã duyệt${S.base_period ? ` (${S.base_period.label})` : ''}; đây là công cụ mô hình hoá theo giả định, không phải khuyến nghị đầu tư.${lr && lr.differences ? '' : ''}`));
    });
    put(host, h('div', { class: 'note', 'data-role': 'model-head' }, h('b', { text: `${def.label} · ` }), document.createTextNode(`${A.sector.note}${S.assumption_status ? ` Trạng thái giả định: ${S.assumption_status}.` : ''}`)), body, info,
      h('details', { class: 'tech', 'data-role': 'equations' }, h('summary', { text: 'Công thức' }), h('ul', { class: 'src-list' }, ...def.equations.map((e) => h('li', { text: e })))));
    return host;
  }
  const driversOf = (r, runs) => (r === runs.live ? scn.drv : preset(Object.keys(runs).find((k) => runs[k] === r)));
  const runKey = (r, runs) => (r === runs.live ? (scn.name === 'custom' ? 'base' : scn.name) : Object.keys(runs).find((k) => runs[k] === r));
  scn.drvFor = (r, runs) => driversOf(r, runs);

  function unavailable(e, which) {
    return h('div', { class: 'todo', 'data-section': which, 'data-role': 'model-unavailable', 'data-model': e ? e.model : null }, h('b', { text: `${e ? e.def.label : 'Mô hình'} chưa chạy được. ` }), document.createTextNode(`Thiếu đầu vào: ${reasonText(e && e.reason)}.`),
      h('p', { class: 'hint', text: 'Chỉ hiển thị khi đủ đầu vào có nguồn; hệ thống không điền số thay thế. Bổ sung báo cáo tài chính đã duyệt và số liệu theo mảng của mã.' }));
  }
  function sotp() {
    if (!A.ok) return needBlock('sotp', 'Chưa có đầu vào cho định giá.');
    return prim.available ? modelTable(prim, 'sotp') : unavailable(prim, 'sotp');
  }
  function sotpB() {
    if (!A.ok) return needBlock('sotpB', 'Chưa có đầu vào cho mô hình thay thế.');
    if (!alt.available) return unavailable(alt, 'sotpB');
    const box = h('div', { class: 'stack' }), cmp = h('div', { class: 'panel', 'data-role': 'method-diff' });
    subscribe(() => {
      const a = live(prim), b = live(alt), diff = a && b && a.status === 'COMPUTED' && b.status === 'COMPUTED' ? b.per_share.value - a.per_share.value : null;
      put(cmp, h('h3', { text: 'So với phương pháp chính' }), h('div', { class: 'out' }, h('div', {}, h('span', { class: 'l', text: prim.def.label }), h('span', { class: 'v', text: a && a.status === 'COMPUTED' ? `${fmtVndUnit(a.per_share.value)} đ` : MISSING }), h('span', { class: 's', text: a && a.status === 'COMPUTED' ? `${fmtPct(a.upside.value)} so với giá` : '' })),
        h('div', {}, h('span', { class: 'l', text: alt.def.label }), h('span', { class: 'v', text: b && b.status === 'COMPUTED' ? `${fmtVndUnit(b.per_share.value)} đ` : MISSING }), h('span', { class: 's', text: b && b.status === 'COMPUTED' ? `${fmtPct(b.upside.value)} so với giá` : '' })),
        h('div', { class: 'big' }, h('span', { class: 'l', text: 'Chênh lệch giữa hai phương pháp' }), h('span', { class: 'v', text: diff === null ? MISSING : `${sign(diff)}${fmtVndUnit(diff)} đ` }), h('span', { class: 's', text: 'phản ánh khác biệt phương pháp và giả định, không phải tăng trưởng thêm' }))),
        b && b.differences ? h('ul', { class: 'notes', 'data-role': 'differences' }, ...b.differences.map((d) => h('li', { text: d }))) : null);
    });
    put(box, modelTable(alt, 'sotpB'), cmp);
    return box;
  }

  // ------------------------------------------------------------------------------------------------------------------ #kichban
  function kichban() {
    if (!A.ok) return needBlock('kichban', 'Chưa có mô hình để gắn kịch bản.');
    if (!defsAvailable.length) return unavailable(prim, 'kichban');
    const host = h('div', { class: 'stack' });
    const segBar = h('div', { class: 'seg', role: 'group', 'aria-label': 'Kịch bản', id: 'presetSeg' });
    for (const k of ['low', 'base', 'high']) { const b = h('button', { type: 'button', 'data-p': k, 'aria-pressed': String(k === scn.name), text: SCN_VI[k] }); b.addEventListener('click', () => { scn.name = k; scn.drv = preset(k); sync(); emit(); }); segBar.append(b); }
    const ids = new Map(); for (const e of [prim, alt]) if (e && e.available) for (const d of e.def.drivers) if (!ids.has(d.id)) ids.set(d.id, { d, models: [] }); for (const e of defsAvailable) for (const d of e.def.drivers) ids.get(d.id).models.push(e.def.label);
    const sliders = h('div', { class: 'panel sliders', id: 'sliders' }), outs = new Map();
    const fmtDrv = (d, v) => (d.fmt === 'num' ? fmtNum(v, { max: 2 }) + (d.unit === '×' ? '×' : '') : `${fmtNum(v * 100, { max: 2 })}${d.unit === 'điểm %' ? ' điểm %' : '%'}`);
    for (const [id, { d, models }] of ids) {
      const inp = h('input', { type: 'range', id: `s_${id}`, min: String(d.min), max: String(d.max), step: String(d.step), value: String(scn.drv[id]), 'aria-label': d.label, 'data-driver': id }), val = h('b', { id: `v_${id}`, text: fmtDrv(d, scn.drv[id]) });
      inp.addEventListener('input', () => { scn.drv = { ...scn.drv, [id]: Number(inp.value) }; scn.name = 'custom'; val.textContent = fmtDrv(d, scn.drv[id]); for (const b of segBar.children) b.setAttribute('aria-pressed', 'false'); emit(); });
      outs.set(id, { inp, val, d });
      sliders.append(h('div', { class: 'sl' }, h('label', { for: `s_${id}` }, h('span', { text: d.label }), val), inp, h('small', { text: `Thận trọng ${fmtDrv(d, d.presets.low)} · cơ sở ${fmtDrv(d, d.presets.base)} · lạc quan ${fmtDrv(d, d.presets.high)} · dùng trong: ${models.join('; ')}` })));
    }
    const sync = () => { for (const [id, o] of outs) { o.inp.value = String(scn.drv[id]); o.val.textContent = fmtDrv(o.d, scn.drv[id]); } for (const b of segBar.children) b.setAttribute('aria-pressed', String(b.dataset.p === scn.name)); };
    const outBox = h('div', { class: 'out', id: 'outBox', 'data-role': 'scenario-out' });
    subscribe(() => {
      const a = live(prim), b = live(alt), q = projection(), items = [];
      const nm = scn.name === 'custom' ? 'Tuỳ chỉnh' : SCN_VI[scn.name];
      if (q.ok && q.res.status === 'COMPUTED') items.push(h('div', { class: 'big' }, h('span', { class: 'l', text: `LNST công ty mẹ ${q.res.target.kind === 'FY' ? 'cả năm' : q.res.target.kind} ${q.res.target.fiscal_year} ước · ${nm}` }), h('span', { class: 'v', 'data-role': 'scn-np', text: `${fmtBillion(q.res.fy.np_parent)} tỷ` }), h('span', { class: 's', text: `EPS ước ${q.res.eps ? fmtVndUnit(q.res.eps.value) : MISSING} đ · P/E dự phóng ${q.res.forward_pe && q.res.forward_pe.value !== null ? fmtMultiple(q.res.forward_pe.value) : MISSING}` })));
      for (const [e, r, role] of [[prim, a, 'scn-fair'], [alt, b, 'scn-fair-alt']]) if (e && e.available) items.push(h('div', {}, h('span', { class: 'l', text: e.def.label }), h('span', { class: 'v', 'data-role': role, text: r && r.status === 'COMPUTED' ? `${fmtVndUnit(r.per_share.value)} đ` : MISSING }), h('span', { class: 's', text: r && r.status === 'COMPUTED' ? `${fmtPct(r.upside.value)} so với giá ${fmtVndUnit(price.value)} đ (${fmtDate(price.date)})` : r ? r.status : '' })));
      put(outBox, ...items);
    });
    put(host, h('div', { class: 'sechead', style: 'margin:0' }, h('div', {}, h('p', { id: 'scenSub', text: `Chọn một kịch bản rồi kéo thanh trượt. Thanh trượt đổi đồng thời dự phóng, hai mô hình định giá, chênh lệch so với giá và ma trận độ nhạy. Điều khiển ứng với mô hình của ngành (${prim.def.label}), không áp 9 biến của bản PHP cho mã khác. Giá trị mặc định là giả định chưa duyệt.` })), segBar),
      h('div', { class: 'scen' }, sliders, h('div', { class: 'stack' }, outBox)));
    return host;
  }

  // ------------------------------------------------------------------------------------------------------------------ #doinhay
  const AXIS_STEP = { multiple_scale: 0.1, growth: 0.04, margin_delta: 0.01, roe: 0.02, coe: 0.01, target_pe: 1, earnings_growth: 0.04, holding_discount: 0.05, tax: 0.02, haircut: 0.02 };
  const axisVals = (id, centre, n = 5) => Array.from({ length: n }, (_, i) => Number((centre + (i - (n - 1) / 2) * AXIS_STEP[id]).toFixed(6)));
  function doinhay() {
    if (!A.ok) return needBlock('doinhay', 'Chưa có mô hình để dựng ma trận độ nhạy.');
    const entries = [prim, alt].filter((e) => e && e.available);
    if (!entries.length) return unavailable(prim, 'doinhay');
    const host = h('div', { class: 'stack' });
    for (const e of entries) {
      const box = h('div', { class: 'panel scroll', 'data-role': 'sensitivity', 'data-model': e.def.id });
      subscribe(() => {
        const ax = e.def.axes, dx = e.def.drivers.find((d) => d.id === ax.x), dy = e.def.drivers.find((d) => d.id === ax.y);
        const xs = axisVals(ax.x, scn.drv[ax.x]), ys = axisVals(ax.y, scn.drv[ax.y]), scnName = scn.name === 'custom' ? 'base' : scn.name;
        const g = sensitivityGrid({ model: e.def, setup: e.setup, scenario: scnName, base: scn.drv, x: { driver: ax.x, values: xs }, y: { driver: ax.y, values: ys } });
        const fx = (v) => (dx.fmt === 'num' ? `${fmtNum(v, { max: 2 })}${dx.unit === '×' ? '×' : ''}` : fmtPctU(v)), fy = (v) => (dy.fmt === 'num' ? `${fmtNum(v, { max: 2 })}${dy.unit === '×' ? '×' : ''}` : fmtPctU(v));
        const tb = h('tbody', {}, ...g.rows.map((row) => h('tr', {}, h('td', {}, h('b', { text: fy(row.y) })), ...row.cells.map((c) => {
          const u = c.upside, pct = fin(u) ? Math.min(35, Math.round(Math.min(Math.abs(u), 0.5) / 0.5 * 35)) : 0;
          return h('td', { class: c.is_base ? 'cur' : '', 'data-cell': 'x', 'data-upside': fin(u) ? String(u) : '', style: fin(u) ? `background:color-mix(in srgb, var(${u >= 0 ? '--good' : '--bad'}) ${pct}%, var(--surface))` : '', title: c.status !== 'COMPUTED' ? c.status : `Chênh lệch ${fmtPct(u)}`, text: c.per_share === null ? MISSING : fmtVndUnit(c.per_share) }, fin(u) ? h('small', { style: 'display:block;color:var(--mute);font-size:10.5px', text: fmtPct(u) }) : null);
        }))));
        put(box, h('h3', { text: `${e.def.label}: giá hợp lý mỗi cổ phiếu (đ)` }), h('table', { class: 'sens', id: e.def.id === prim.def.id ? 'sensTbl' : 'sensTblB' }, h('thead', {}, h('tr', {}, h('th', { text: `${dy.label} \\ ${dx.label}` }), ...xs.map((x) => h('th', { text: fx(x) })))), tb),
          h('div', { class: 'legend' }, h('span', {}, h('i', { class: 'box', style: 'background:color-mix(in srgb, var(--good) 30%, var(--surface))' }), document.createTextNode('cao hơn giá hiện tại')), h('span', {}, h('i', { class: 'box', style: 'background:color-mix(in srgb, var(--bad) 30%, var(--surface))' }), document.createTextNode('thấp hơn giá hiện tại')), h('span', {}, document.createTextNode(`Ô viền đậm = lựa chọn hiện tại · giá hiện tại ${fmtVndUnit(price.value)} đ (${fmtDate(price.date)}) · số nhỏ = chênh lệch so với giá`))),
          note(`Mọi ô chạy cùng engine với mục Định giá, đơn vị và giả định như thanh trượt (kịch bản ${scn.name === 'custom' ? 'tuỳ chỉnh' : SCN_VI[scn.name]}); các biến khác giữ nguyên.`, 'hint'));
      });
      host.append(box);
    }
    return host;
  }

  return { valuation, h1, kqkdStatements, bien, q3, sotp, sotpB, kichban, doinhay, state: scn, emit, preset, live };
}
