// Segment analysis built ONLY from explicit metadata (facts.mjs validateSegmentGroups) and the facts bound to it.
// Pure, DOM-free. Shares are of the declared total row; eliminations are real negative values; a mismatching total is reported, never adjusted.
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const decimals = (v) => { const m = /\.(\d+)$/.exec(String(v)); return m ? m[1].length : 0; };

export function buildSegmentGroups(groups, facts) {
  return (groups || []).map((g) => {
    const cell = new Map();
    for (const f of facts || []) if (f.segment && f.segment.group === g.id) cell.set(`${f.segment.segment}|${f.segment.metric}`, f);
    const totalSeg = g.segments.find((s) => s.role === 'total') || null;
    const val = (seg, m) => { const f = cell.get(`${seg}|${m}`); return f ? f.value : null; };
    const rows = g.segments.map((s) => {
      const cells = {}, missing = {}, share = {};
      for (const m of g.metrics) {
        const f = cell.get(`${s.id}|${m.id}`);
        cells[m.id] = f ? { value: f.value, fact_id: f.id, source: f.source, restated: f.restated, statement: f.statement } : null;
        if (!f) missing[m.id] = 'MISSING_CELL';
        const tot = totalSeg ? val(totalSeg.id, m.id) : null;
        share[m.id] = f && s.role === 'operating' && fin(tot) && tot !== 0 ? f.value / tot : f && s.role === 'total' && fin(tot) && tot !== 0 ? 1 : null;
      }
      const r = cells.revenue, p = cells.pbt;
      return { id: s.id, label: s.label, role: s.role, cells, missing, share, margin: { pbt_over_revenue: r && p && r.value > 0 ? p.value / r.value : null } };
    });
    const reconciliation = {};
    for (const m of g.metrics) {
      if (!totalSeg) { reconciliation[m.id] = { status: 'NO_TOTAL' }; continue; }
      const parts = g.segments.filter((s) => s.role !== 'total').map((s) => val(s.id, m.id)), total = val(totalSeg.id, m.id);
      if (parts.some((v) => !fin(v)) || !fin(total)) { reconciliation[m.id] = { status: 'INCOMPLETE' }; continue; }
      const sum = Number(parts.reduce((a, b) => a + b, 0).toPrecision(12)), d = Math.max(...parts.concat([total]).map(decimals));
      const diff = Number((sum - total).toFixed(9)), tol = 0.5 * 10 ** -d * (parts.length + 1);
      reconciliation[m.id] = { status: Math.abs(diff) <= tol + 1e-12 ? 'RECONCILED' : 'MISMATCH', sum, total, diff };
    }
    return { id: g.id, title: g.title, taxonomy: g.taxonomy, period: g.period, basis: g.basis, unit: g.unit, scope: g.scope, note: g.note, metrics: g.metrics, rows, reconciliation };
  });
}

// Contribution bars for one metric: operating + elimination rows share one baseline at zero; negatives extend to the left of it.
export function barsFor(group, metric) {
  const items = group.rows.filter((r) => r.role !== 'total' && r.cells[metric] && fin(r.cells[metric].value));
  if (!items.length) return { domain: null, zeroAt: null, rows: [] };
  const vals = items.map((r) => r.cells[metric].value), min = Math.min(0, ...vals), max = Math.max(0, ...vals), span = max - min;
  if (span === 0) return { domain: { min, max }, zeroAt: null, rows: items.map((r) => ({ id: r.id, label: r.label, role: r.role, value: 0, left: 0, width: 0, neg: false })) };
  return { domain: { min, max }, zeroAt: min < 0 ? (0 - min) / span * 100 : null,
    rows: items.map((r) => { const v = r.cells[metric].value; return { id: r.id, label: r.label, role: r.role, value: v, left: (Math.min(v, 0) - min) / span * 100, width: Math.abs(v) / span * 100, neg: v < 0 }; }) };
}
