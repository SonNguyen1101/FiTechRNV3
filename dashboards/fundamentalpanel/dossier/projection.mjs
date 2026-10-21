// Next-period / full-year projection bridge adapted to the actual as-of period. Actual periods are never relabelled; forecast and estimate rows are marked as such.
// Inputs are ASSUMPTIONS (growth, margin delta) applied to reported figures of one scope regime. Pure, DOM-free.
import { pe } from './valuation.mjs';
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

export function projectPeriod(ctx, { growth, margin_delta }) {
  const b = ctx.base, out = { status: 'COMPUTED', flags: [], rows: [], target: null, h2: null, fy: null, eps: null, forward_pe: null, plan: null };
  const nul = (path) => ({ ...out, status: 'NULL_INPUT', missing: [path] });
  if (!b || !fin(b.revenue) || b.revenue <= 0 || !fin(b.np_parent)) return nul('base.revenue/np_parent');
  if (!fin(growth) || !fin(margin_delta)) return nul('assumptions');
  const margin = b.np_parent / b.revenue + margin_delta;
  if (b.kind === 'H1') {
    let h2rev;
    if (b.h2_prev && b.h2_prev.regime === b.regime && fin(b.h2_prev.revenue) && b.h2_prev.revenue > 0) h2rev = b.h2_prev.revenue * (1 + growth);
    else { out.flags.push(b.h2_prev ? 'H2_PREV_DIFFERENT_REGIME_IGNORED' : 'H2_BASE_FROM_H1_NO_SEASONALITY'); h2rev = b.revenue * (1 + growth); }
    const h2np = h2rev * margin;
    out.h2 = { revenue: h2rev, margin_used: margin, np_parent: h2np };
    out.fy = { revenue: b.revenue + h2rev, np_parent: b.np_parent + h2np, basis: 'ESTIMATE_ACTUAL_PLUS_FORECAST' };
    out.target = { fiscal_year: b.fiscal_year, kind: 'FY' };
    out.rows = [{ kind: 'ACTUAL', label: `H1 ${b.fiscal_year} (thực tế)`, revenue: b.revenue, np_parent: b.np_parent }, { kind: 'FORECAST', label: `H2 ${b.fiscal_year} (dự phóng theo giả định)`, revenue: h2rev, np_parent: h2np }, { kind: 'ESTIMATE', label: `Cả năm ${b.fiscal_year} (ước tính = thực tế + dự phóng)`, revenue: out.fy.revenue, np_parent: out.fy.np_parent }];
  } else if (b.kind === 'FY') {
    const rev = b.revenue * (1 + growth), np = rev * margin;
    out.fy = { revenue: rev, np_parent: np, basis: 'ESTIMATE_FORECAST' }; out.target = { fiscal_year: b.fiscal_year + 1, kind: 'FY' };
    out.rows = [{ kind: 'ACTUAL', label: `Năm ${b.fiscal_year} (thực tế)`, revenue: b.revenue, np_parent: b.np_parent }, { kind: 'ESTIMATE', label: `Năm ${b.fiscal_year + 1} (ước tính theo giả định)`, revenue: rev, np_parent: np }];
  } else return { ...out, status: 'UNSUPPORTED_BASE_KIND' };
  if (fin(ctx.shares) && ctx.shares > 0) {
    out.eps = { value: (out.fy.np_parent * 1e9) / ctx.shares, basis: out.fy.basis };
    out.forward_pe = { ...pe({ price: ctx.price.value, eps: out.eps.value }), as_of_price: ctx.price.date, basis: out.fy.basis };
  }
  if (ctx.plan && fin(ctx.plan.np_parent) && ctx.plan.np_parent > 0) out.plan = { np_parent: ctx.plan.np_parent, fraction_of_plan: out.fy.np_parent / ctx.plan.np_parent, label: 'Kế hoạch của doanh nghiệp (không phải dự phóng của hệ thống)' };
  return out;
}
