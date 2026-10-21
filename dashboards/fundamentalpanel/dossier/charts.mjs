// Dependency-free SVG chart builders returning markup strings. Styling comes from the reference stylesheet tokens (var(--...)).
// Rules: null is a gap, never 0; zero is a visible value; non-finite input throws; no NaN/undefined ever reaches the markup.
import { fmtNum, fmtVnd, fmtDate, fmtPct } from './format.mjs';
import { zoneLabels } from './zones.mjs';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (v) => Number(v.toFixed(1));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const EMPTY = (t) => `<div class="chart-empty note">${esc(t)}</div>`;
function check(v, where) { if (v !== null && v !== undefined && !isNum(v)) throw new Error(`${where}: value must be finite or null`); }

export function niceTicks(min, max, count = 4) {
  if (!isNum(min) || !isNum(max)) throw new Error('niceTicks: bounds must be finite');
  if (min > max) [min, max] = [max, min];
  if (min === max) { const d = min === 0 ? 0.5 : Math.abs(min) * 0.1; min -= d; max += d; }
  const raw = (max - min) / count, mag = 10 ** Math.floor(Math.log10(raw)), n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  const start = Math.floor(min / step) * step, end = Math.ceil(max / step) * step, out = [];
  for (let v = start, i = 0; v <= end + step / 1e6 && i < 50; i++, v = start + (i) * step) out.push(Number(v.toPrecision(12)));
  return out;
}

const W = 650, H = 300, PAD = { l: 64, r: 12, t: 12, b: 34 };
function frame(ticks, y, yFormat) {
  return ticks.map((t) => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${r1(y(t))}" y2="${r1(y(t))}" stroke="var(--line2)"></line><text x="${PAD.l - 6}" y="${r1(y(t)) + 4}" text-anchor="end" font-size="11" fill="var(--mute)">${esc(yFormat(t))}</text>`).join('');
}

// points: [{x, y|null, label}]; x ascending. One <path class="series"> may hold several subpaths (a null splits the line); isolated points get a marker.
export function lineChart({ points, title, yFormat }) {
  if (!Array.isArray(points) || points.length === 0) return EMPTY('Không có dữ liệu');
  for (const p of points) { if (!isNum(p.x)) throw new Error('lineChart: x must be finite'); check(p.y, 'lineChart'); }
  if (points.every((p) => p.y === null || p.y === undefined)) return EMPTY('Không có giá trị nào để vẽ');
  const vals = points.filter((p) => isNum(p.y)).map((p) => p.y);
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals), 4), lo = ticks[0], hi = ticks[ticks.length - 1];
  const xs = points.map((p) => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = (x) => (x1 === x0 ? (PAD.l + W - PAD.r) / 2 : PAD.l + ((x - x0) / (x1 - x0)) * (W - PAD.l - PAD.r));
  const Y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  let d = '', open = false; const singles = [];
  points.forEach((p, i) => {
    if (!isNum(p.y)) { open = false; return; }
    const prevOk = i > 0 && isNum(points[i - 1].y), nextOk = i < points.length - 1 && isNum(points[i + 1].y);
    if (!prevOk && !nextOk) singles.push(p);
    d += `${open ? ' L' : (d ? ' M' : 'M')}${r1(X(p.x))} ${r1(Y(p.y))}`; open = true;
  });
  const pick = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  const xl = pick.map((i, k) => `<text x="${r1(X(points[i].x))}" y="${H - 10}" text-anchor="${k === 0 ? 'start' : k === pick.length - 1 ? 'end' : 'middle'}" font-size="11" fill="var(--mute)">${esc(points[i].label)}</text>`).join('');
  const hover = points.map((p) => `${r1(X(p.x))}|${p.label}|${isNum(p.y) ? yFormat(p.y) : ''}`).join('\n');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" data-hover="${esc(hover)}"><title>${esc(title)}</title>${frame(ticks, Y, yFormat)}`
    + `<path class="series" d="${d}" fill="none" stroke="var(--urea)" stroke-width="2"></path>${singles.map((p) => `<circle class="pt" cx="${r1(X(p.x))}" cy="${r1(Y(p.y))}" r="3" fill="var(--urea)"></circle>`).join('')}${xl}`
    + `<rect class="hit" x="${PAD.l}" y="${PAD.t}" width="${W - PAD.l - PAD.r}" height="${H - PAD.t - PAD.b}" fill="transparent"></rect></svg>`;
}

// cats: [{label, value|null, dup?}] in display order. Bars share one baseline at 0; null is a marked gap; every datum has its own slot.
export function barChart({ cats, title, yFormat }) {
  if (!Array.isArray(cats) || cats.length === 0) return EMPTY('Không có dữ liệu');
  for (const c of cats) check(c.value, 'barChart');
  const vals = cats.filter((c) => isNum(c.value)).map((c) => c.value);
  if (!vals.length) return EMPTY('Không có giá trị nào để vẽ');
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 4), lo = ticks[0], hi = ticks[ticks.length - 1];
  const Y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b), y0 = Y(0);
  const slot = (W - PAD.l - PAD.r) / cats.length, bw = Math.max(2, slot * 0.62);
  const every = Math.ceil(cats.length / 12);
  const items = cats.map((c, i) => {
    const cx = PAD.l + slot * (i + 0.5), lab = i % every === 0 ? `<text x="${r1(cx)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="var(--mute)">${esc(c.label)}</text>` : '';
    if (!isNum(c.value)) return `<g class="gap"><line x1="${r1(cx - 4)}" x2="${r1(cx + 4)}" y1="${r1(y0)}" y2="${r1(y0)}" stroke="var(--mute)" stroke-dasharray="2 2"></line><title>${esc(c.label)}: không có giá trị</title></g>${lab}`;
    const top = Math.min(Y(c.value), y0), h = Math.abs(Y(c.value) - y0);
    return `<rect class="bar${c.dup ? ' dup' : ''}" data-value="${c.value}" x="${r1(cx - bw / 2)}" y="${r1(top)}" width="${r1(bw)}" height="${r1(h)}" fill="${c.dup ? 'var(--gold)' : 'var(--urea)'}"><title>${esc(c.label)}: ${esc(yFormat(c.value))}</title></rect>${lab}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${frame(ticks, Y, yFormat)}<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${r1(y0)}" y2="${r1(y0)}" stroke="var(--ink2)"></line>${items}</svg>`;
}

// Height of one 11px label box as the browser reports it (ascent 12 + descent 3); labels closer than this overlap.
export const ZONE_LABEL_H = 15;
// Moves ONLY labels: takes the wanted vertical positions (any order) and returns positions, in the same order as the input, that are at least minGap apart,
// keep the order of the wanted positions and stay inside [top, bottom]. Labels that collide form a cluster that is laid out at minGap steps around the mean of
// its members' wanted positions (so it grows symmetrically); a cluster that would leave the range is shifted back inside, and clusters that then touch merge.
// If the range cannot hold n labels at minGap the gap shrinks evenly (the bounds win over the gap).
export function spreadLabels(ys, { minGap, top, bottom }) {
  if (!Array.isArray(ys) || ys.some((v) => !isNum(v))) throw new Error('spreadLabels: positions must be finite');
  if (![minGap, top, bottom].every(isNum) || minGap < 0 || top > bottom) throw new Error('spreadLabels: bad bounds or gap');
  const n = ys.length; if (n === 0) return [];
  const gap = n > 1 ? Math.min(minGap, (bottom - top) / (n - 1)) : 0;
  const order = ys.map((v, i) => i).sort((a, b) => ys[a] - ys[b] || a - b);
  const cl = order.map((i) => ({ items: [i], start: ys[i] }));
  const place = (c) => {
    c.start = c.items.reduce((sum, i, k) => sum + ys[i] - k * gap, 0) / c.items.length;
    const span = (c.items.length - 1) * gap; c.start = Math.min(Math.max(c.start, top), bottom - span);
  };
  cl.forEach(place);
  for (let again = true; again;) {
    again = false;
    for (let k = 0; k + 1 < cl.length; k++) {
      const a = cl[k], b = cl[k + 1];
      if (a.start + (a.items.length - 1) * gap + gap > b.start + 1e-9) { a.items = a.items.concat(b.items); place(a); cl.splice(k + 1, 1); again = true; break; }
    }
  }
  const out = new Array(n);
  for (const c of cl) c.items.forEach((i, k) => { out[i] = c.start + k * gap; });
  return out;
}

// Price chart with the original's buy-zone overlay (renderPrice): shaded band between the normal-buy upper level and the crash floor, dashed lines for
// the previous-quarter peak, the normal-buy upper level and the crash floor, each with its text. `zones` comes from zoneLevels(); without levels only the
// price line is drawn (no invented lines). Width is supplied by the caller (the reference sizes to its container) so labels stay readable on narrow screens.
export function zoneChart({ bars, zones, width, title }) {
  const pts = (bars || []).slice(-252);
  if (!pts.length) return EMPTY('Không có dữ liệu');
  for (const b of pts) { if (!isNum(b.close)) throw new Error('zoneChart: close must be finite'); }
  const Wd = Math.max(320, Math.round(width || 700)), Hd = Wd < 520 ? 260 : 300, m = { l: 48, r: 12, t: 12, b: 26 }, iw = Wd - m.l - m.r, ih = Hd - m.t - m.b;
  const lv = zones && zones.levels ? zones.levels : null;
  let lo, hi;
  if (zones && zones.y_bounds) ({ lo, hi } = zones.y_bounds);
  else { const v = pts.map((b) => b.close); lo = Math.min(...v); hi = Math.max(...v); const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad; }
  const n = pts.length, x = (i) => (n === 1 ? m.l + iw / 2 : m.l + i * (iw / (n - 1))), y = (v) => m.t + ((hi - v) / (hi - lo)) * ih, f = (v) => Number(v.toFixed(1));
  const ticks = niceTicks(lo, hi, 5).filter((t) => t >= lo && t <= hi);
  let s = `<svg viewBox="0 0 ${Wd} ${Hd}" role="img" aria-label="${esc(title)}" data-hover="${esc(pts.map((b, i) => `${f(x(i))}|${fmtDate(b.date)}|${fmtVnd(b.close)} đ · ${fmtPct(b.close / Math.max(...pts.map((p) => p.close)) - 1)} so với đỉnh 12T`).join('\n'))}"><title>${esc(title)}</title>`;
  for (const t of ticks) s += `<line x1="${m.l}" x2="${Wd - m.r}" y1="${f(y(t))}" y2="${f(y(t))}" stroke="var(--line2)"></line><text x="${m.l - 6}" y="${f(y(t)) + 4}" text-anchor="end" font-size="11" fill="var(--mute)">${esc(fmtNum(t / 1000, { max: 0 }))}k</text>`;
  let lastM = -1;
  pts.forEach((b, i) => { const mo = Number(b.date.slice(5, 7)) - 1, d = Number(b.date.slice(8, 10)); if (mo !== lastM && d <= 7 && mo % 2 === 0) s += `<text x="${f(x(i))}" y="${Hd - 6}" font-size="11" fill="var(--mute)" text-anchor="middle">T${mo + 1}/${b.date.slice(2, 4)}</text>`; lastM = mo; });
  if (lv) {
    const lab = zoneLabels(zones), defs = [['peak', lv.peak, 'var(--mute)'], ['n50', lv.n50, 'var(--gold)'], ['c75', lv.c75, 'var(--gold)']];
    // No band when the crash floor is not below the normal-buy upper level (the two zones cannot be told apart); the lines are still drawn at their own prices.
    if (lv.c75 < lv.n50) s += `<rect data-zone="band" x="${m.l}" width="${iw}" y="${f(y(lv.n50))}" height="${f(Math.max(0, y(lv.c75) - y(lv.n50)))}" fill="var(--gold-soft)" opacity=".75"></rect>`;
    // Only the TEXT is moved when levels sit closer than a line of text; a thin leader joins a label that ended up more than one line from its level.
    const want = defs.map(([, v]) => f(y(v)) - 5), put = spreadLabels(want, { minGap: ZONE_LABEL_H + 1, top: 13, bottom: Hd - m.b - 4 });
    defs.forEach(([k, v, c], j) => {
      s += `<line data-zone="${k}" x1="${m.l}" x2="${Wd - m.r}" y1="${f(y(v))}" y2="${f(y(v))}" stroke="${c}" stroke-width="1.5" stroke-dasharray="5 4"></line>`;
      if (Math.abs(put[j] - want[j]) > ZONE_LABEL_H) s += `<line data-zone-leader="${k}" x1="${m.l + 3}" x2="${m.l + 3}" y1="${f(y(v))}" y2="${f(put[j] - 4)}" stroke="var(--line)" stroke-width="1"></line>`;
      s += `<text data-zone-label="${k}" x="${m.l + 6}" y="${f(put[j])}" font-size="11" font-weight="600" fill="var(--ink2)" stroke="var(--surface)" stroke-width="3" paint-order="stroke">${esc(lab[k])}</text>`;
    });
  }
  const d = pts.map((b, i) => `${i ? 'L' : 'M'}${f(x(i))} ${f(y(b.close))}`).join(' ');
  s += `<path d="M${m.l} ${m.t + ih} ${d.replace(/^M/, 'L')} L${f(x(n - 1))} ${m.t + ih}" fill="var(--urea)" opacity=".08"></path>`;
  s += `<path class="series" d="${d}" fill="none" stroke="var(--urea)" stroke-width="2" stroke-linejoin="round"></path>`;
  const last = pts[n - 1];
  s += `<circle cx="${f(x(n - 1))}" cy="${f(y(last.close))}" r="4.5" fill="var(--urea)" stroke="var(--surface)" stroke-width="2"></circle>`;
  s += `<text x="${f(x(n - 1)) - 8}" y="${f(y(last.close)) + 18}" text-anchor="end" font-size="12" font-weight="700" fill="var(--ink)" stroke="var(--surface)" stroke-width="3" paint-order="stroke">${esc(fmtVnd(last.close))}</text>`;
  return `${s}<rect class="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"></rect></svg>`;
}
