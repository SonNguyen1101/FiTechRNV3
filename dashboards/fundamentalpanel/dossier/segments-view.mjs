// DOM for the segment analysis (#mang), built from the reference's own markup/classes: period toggle (.segper), compact matrix (.segt) and
// contribution bars (.segbars/.sbrow). The group data comes from segments.mjs (explicit metadata only). Plain text only; links are validated source URLs.
import { barsFor } from './segments.mjs';
import { fmtFixed1, fmtPctU, fmtDate, MISSING } from './format.mjs';

const UNIT_VI = { VND: 'đồng', million_VND: 'triệu đồng', billion_VND: 'tỷ đồng', USD: 'USD', billion_USD: 'tỷ USD', percent: '%', ratio: 'lần', count: '' };
export const TAXONOMY_VI = { NOTE_34A: 'Thuyết minh bộ phận (BCTC)', MANAGEMENT_PRESENTATION: 'Trình bày quản trị (báo cáo thường niên)', OTHER_DECLARED: 'Phân loại khác' };
const SCOPE_VI = { CONSOLIDATED: 'hợp nhất', SEPARATE: 'riêng lẻ', SEGMENT: 'theo mảng', UNSPECIFIED: 'phạm vi chưa nêu' };
const RECON_VI = { MISMATCH: 'Tổng công bố lệch tổng các cột', INCOMPLETE: 'Thiếu ô nên chưa đối chiếu được tổng', NO_TOTAL: 'Nhóm không có dòng tổng nên không tính tỷ trọng' };

export function renderSegmentsView(h, put, groups) {
  const host = h('div', { class: 'stack', 'data-role': 'segments' });
  let cur = 0;
  const per = h('div', { class: 'segper', id: 'segPer', role: 'group', 'aria-label': 'Nhóm số liệu theo mảng' });
  const body = h('div', { class: 'stack' });
  const draw = () => {
    for (const b of per.children) b.setAttribute('aria-pressed', String(Number(b.dataset.i) === cur));
    const g = groups[cur], u = UNIT_VI[g.unit] || '';
    const mets = g.metrics, hasMargin = mets.some((m) => m.id === 'revenue') && mets.some((m) => m.id === 'pbt');
    const th = [h('th', { text: 'Mảng' })];
    for (const m of mets) { th.push(h('th', {}, document.createTextNode(m.label), h('small', { text: u }))); th.push(h('th', { text: `% ${m.label}` })); }
    if (hasMargin) th.push(h('th', {}, document.createTextNode('Biên LNTT'), h('small', { text: 'tính từ hai số công bố' })));
    const tb = h('tbody');
    for (const r of g.rows) {
      const tr = h('tr', { 'data-segment': r.id, 'data-role-row': r.role, class: r.role === 'total' ? 'tot' : r.role === 'elimination' ? 'sub' : '' });
      tr.append(h('td', {}, document.createTextNode(r.label), r.role === 'elimination' ? h('small', { text: 'giá trị âm thật trong nguồn, không phải mảng hoạt động' }) : null));
      for (const m of mets) {
        const c = r.cells[m.id], v = c ? c.value : null;
        tr.append(h('td', { class: v !== null && v < 0 ? 'neg' : '', 'data-metric': m.id, title: c ? '' : 'Nguồn đã duyệt không có ô này', text: c ? fmtFixed1(v) : MISSING }));
        const sh = r.share[m.id];
        tr.append(h('td', { class: sh !== null && sh < 0 ? 'neg' : '', text: sh === null ? '' : fmtPctU(sh) }));
      }
      if (hasMargin) { const mg = r.margin.pbt_over_revenue; tr.append(h('td', { text: mg === null ? '' : fmtPctU(mg) })); }
      tb.append(tr);
    }
    const table = h('table', { class: 'segt', id: 'segTbl' }, h('thead', {}, h('tr', {}, ...th)), tb);
    const bm = g.metrics.find((m) => m.id === 'pbt') || g.metrics[0], bars = barsFor(g, bm.id), bx = h('div', { class: 'segbars', id: 'segBars' });
    if (bars.rows.length) {
      bx.append(h('div', { class: 'capgrp', style: 'font-size:12px;color:var(--mute);margin-bottom:4px', text: `Đóng góp vào ${bm.label} · ${g.period.label} (${u})` }));
      for (const r of bars.rows) {
        const tr = h('span', { class: 'tr' }, h('span', { class: 'fl', style: `left:${r.left}%;width:${r.width}%;background:${r.neg ? 'var(--bad)' : 'var(--urea)'}`, 'data-bar': r.id }), bars.zeroAt !== null ? h('span', { class: 'zero', style: `left:${bars.zeroAt}%` }) : null);
        bx.append(h('div', { class: 'sbrow', 'data-bar-row': r.id }, h('span', { class: 'lb', title: r.label, text: r.label }), tr, h('span', { class: 'vl', text: fmtFixed1(r.value) })));
      }
    }
    const warns = [];
    for (const m of g.metrics) { const rc = g.reconciliation[m.id]; if (rc.status === 'MISMATCH') warns.push(`${m.label}: ${RECON_VI.MISMATCH} (chênh ${fmtFixed1(rc.diff)} ${u}); giữ nguyên số công bố, không điều chỉnh.`); else if (rc.status === 'INCOMPLETE') warns.push(`${m.label}: ${RECON_VI.INCOMPLETE}.`); else if (rc.status === 'NO_TOTAL') { warns.push(`${m.label}: ${RECON_VI.NO_TOTAL}.`); break; } }
    const allOk = g.metrics.every((m) => g.reconciliation[m.id].status === 'RECONCILED');
    const first = g.rows.flatMap((r) => Object.values(r.cells)).find(Boolean);
    const cites = g.rows.flatMap((r) => g.metrics.map((m) => (r.cells[m.id] ? { r, m, c: r.cells[m.id] } : null)).filter(Boolean));
    const det = h('details', { class: 'tech', 'data-role': 'segment-sources' }, h('summary', { text: `Nguồn từng ô số liệu (${cites.length} ô)` }),
      h('ul', { class: 'src-list' }, ...cites.map(({ r, m, c }) => h('li', { 'data-cell': `${r.id}|${m.id}` }, document.createTextNode(`${r.label} · ${m.label} ${fmtFixed1(c.value)} ${u}${c.restated === true ? ' (đã điều chỉnh)' : ''} — `), h('a', { href: c.source.url, rel: 'noopener noreferrer', target: '_blank', text: c.source.title || c.source.url }), document.createTextNode(` · truy cập ${fmtDate(c.source.retrieved)} · (${c.source.locator.type}) ${c.source.locator.value}`)))));
    put(body,
      h('p', { class: 'hint', 'data-role': 'segment-caption', text: `${TAXONOMY_VI[g.taxonomy]} · ${g.period.label} · ${SCOPE_VI[g.scope]} · ${u}${g.basis === 'ACTUAL' ? ' · số thực tế đã công bố' : ''}` }),
      h('div', { class: 'panel scroll' }, table),
      bx.children.length ? bx : null,
      ...warns.map((w) => h('div', { class: 'segwarn', 'data-role': 'segment-warning', text: w })),
      h('p', { class: 'note', id: 'segNote', 'data-role': 'segment-note', style: 'margin-bottom:0' }, document.createTextNode(`${g.title}.${allOk ? ' Σ các mảng + loại trừ = tổng, cho mọi chỉ tiêu.' : ''} Tỷ trọng là phần của dòng tổng công bố; biên LNTT = LNTT / doanh thu của cùng dòng. Chưa có trong nguồn đã duyệt (để trống, không ước tính): lợi nhuận sau thuế theo mảng, biên gộp, so cùng kỳ năm trước, dự phóng.${g.note ? ` ${g.note}` : ''}${groups.length > 1 ? ' Các nhóm là hai cách phân loại khác nhau và không được cộng chéo.' : ''}`)),
      det);
  };
  groups.forEach((g, i) => per.append(Object.assign(h('button', { type: 'button', 'aria-pressed': String(i === 0), 'data-i': String(i), text: `${TAXONOMY_VI[g.taxonomy]} · ${g.period.label}` }), {})));
  per.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) { cur = Number(b.dataset.i); draw(); } });
  host.append(groups.length > 1 ? per : h('div', { class: 'segper' }, per.children[0]), body);
  draw();
  return host;
}
