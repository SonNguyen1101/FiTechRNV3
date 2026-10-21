// Profit-driver analysis (#bien): exact decompositions of the change in pre-tax profit between two comparable periods (same scope regime), plus segment deltas
// between two reconciled segment groups. Pure, DOM-free. Rows always sum to the change; nothing is estimated or smoothed.
import { periodValue } from './valuation.mjs';
import { buildSegmentGroups } from './segments.mjs';
import { isValidatedResult } from './facts.mjs';
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

export function statementBridge({ statements, current, prior, variant = 'corporate' }) {
  const cur = statements.periods.find((p) => p.id === current), pri = statements.periods.find((p) => p.id === prior);
  if (!cur || !pri) return { status: 'MISSING_PERIOD', rows: [] };
  const regime = cur.scope_regime;
  const get = (id, key) => periodValue(statements, id, key, regime);
  const need = variant === 'financial' ? ['nii', 'noii', 'provisions', 'pbt'] : ['revenue', 'pbt'];
  const c = {}, p = {};
  for (const k of [...need, 'gross_profit', 'np_parent']) { c[k] = get(current, k)?.value ?? null; p[k] = get(prior, k)?.value ?? null; }
  for (const k of need) {
    if (c[k] === null || p[k] === null) {
      const exists = pri.items[k] || statements.periods.some((q) => q.restated_comparatives && q.restated_comparatives[prior] && q.restated_comparatives[prior].items[k]);
      return { status: exists && cur.items[k] ? 'INCOMPARABLE_SCOPE_REGIME' : 'MISSING_ITEM', rows: [], regime, missing: k };
    }
  }
  const out = { status: 'COMPUTED', regime, variant, current, prior, unit: cur.unit, rows: [], total_delta: c.pbt - p.pbt, attribution: null };
  if (variant === 'financial') {
    const parts = [{ id: 'nii', label: 'Thu nhập lãi thuần', value: c.nii - p.nii }, { id: 'noii', label: 'Thu nhập ngoài lãi', value: c.noii - p.noii }, { id: 'provisions', label: 'Chi phí dự phòng (giảm = tăng lợi nhuận)', value: -(c.provisions - p.provisions) }];
    const rest = out.total_delta - parts.reduce((a, x) => a + x.value, 0);
    out.rows = [...parts, { id: 'cost_other_effect', label: 'Chi phí hoạt động và khác (phần còn lại)', value: rest }];
  } else if (c.gross_profit !== null && p.gross_profit !== null && c.revenue > 0 && p.revenue > 0) {
    const gm0 = p.gross_profit / p.revenue, gm1 = c.gross_profit / c.revenue;
    out.rows = [{ id: 'revenue_effect', label: 'Doanh thu (ở biên gộp kỳ trước)', value: (c.revenue - p.revenue) * gm0 }, { id: 'gross_margin_effect', label: 'Biên lợi nhuận gộp (trên doanh thu kỳ này)', value: (gm1 - gm0) * c.revenue },
      { id: 'cost_other_effect', label: 'Chi phí bán hàng, quản lý, tài chính và khác', value: (c.pbt - c.gross_profit) - (p.pbt - p.gross_profit) }];
  } else if (c.revenue > 0 && p.revenue > 0) {
    const m0 = p.pbt / p.revenue, m1 = c.pbt / c.revenue;
    out.rows = [{ id: 'revenue_effect', label: 'Doanh thu (ở biên LNTT kỳ trước)', value: (c.revenue - p.revenue) * m0 }, { id: 'margin_effect', label: 'Biên LNTT (trên doanh thu kỳ này)', value: (m1 - m0) * c.revenue }];
  } else return { ...out, status: 'NON_POSITIVE_REVENUE', rows: [] };
  out.check = Math.abs(out.rows.reduce((a, r) => a + r.value, 0) - out.total_delta) < 1e-9 * Math.max(1, Math.abs(out.total_delta));
  if (fin(c.np_parent) && fin(p.np_parent) && c.pbt > 0 && p.pbt > 0) out.attribution = { current: c.np_parent / c.pbt, prior: p.np_parent / p.pbt, label: 'LNST công ty mẹ ÷ LNTT (thuế, lợi ích cổ đông không kiểm soát)' };
  return out;
}

export function segmentDelta({ loaded, current, prior, metric }) {
  if (!isValidatedResult(loaded)) return { status: 'FACTS_NOT_VALIDATED', rows: [] };
  const gc = loaded.groups.find((g) => g.id === current), gp = loaded.groups.find((g) => g.id === prior);
  if (!gc || !gp) return { status: 'GROUP_NOT_FOUND', rows: [] };
  if (gc.taxonomy !== gp.taxonomy) return { status: 'TAXONOMY_MISMATCH', rows: [] };
  const [bc] = buildSegmentGroups([gc], loaded.facts), [bp] = buildSegmentGroups([gp], loaded.facts);
  const rows = []; let incomplete = false;
  for (const r of bc.rows.filter((x) => x.role !== 'total')) {
    const pr = bp.rows.find((x) => x.id === r.id), a = r.cells[metric], b = pr && pr.cells[metric];
    if (!a || !b) { incomplete = true; rows.push({ id: r.id, label: r.label, role: r.role, delta: null }); continue; }
    rows.push({ id: r.id, label: r.label, role: r.role, delta: a.value - b.value, current: a.value, prior: b.value });
  }
  const tc = bc.rows.find((x) => x.role === 'total')?.cells[metric], tp = bp.rows.find((x) => x.role === 'total')?.cells[metric];
  const total = tc && tp ? tc.value - tp.value : null;
  const sum = rows.every((x) => x.delta !== null) ? rows.reduce((a, x) => a + x.delta, 0) : null;
  return { status: incomplete ? 'INCOMPLETE' : 'COMPUTED', metric, unit: gc.unit, current, prior, rows, total_delta: total, reconciled: total !== null && sum !== null && Math.abs(sum - total) < 1e-9 * Math.max(1, Math.abs(total)) + 1e-9 };
}
