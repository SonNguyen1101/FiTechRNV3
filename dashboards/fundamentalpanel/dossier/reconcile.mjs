// Reconciliation of ONE official figure (a validated number fact) against the SSI history rows of the same ticker.
// A numeric match LOCATES candidate rows (and the decimal scale at which they agree). It does not establish what the SSI period label
// means, whether the accounting scope is the same, or what the SSI field is: that needs the evidence in docs/FINANCIAL-SEMANTICS.md.
const UNIT_BASE = { VND: 1, million_VND: 1e6, billion_VND: 1e9, USD: 1, billion_USD: 1e9, percent: 1, ratio: 1, count: 1 };
const SCALES = { VND: [1, 1e3, 1e6, 1e9], million_VND: [1, 1e3, 1e6, 1e9], billion_VND: [1, 1e3, 1e6, 1e9], USD: [1, 1e3, 1e6, 1e9], billion_USD: [1, 1e3, 1e6, 1e9], percent: [1, 100], ratio: [1], count: [1, 1e3, 1e6] };
const NOTE = 'A numeric match locates a candidate row only; it does not establish period meaning, accounting scope or the label of the SSI field.';
const decimals = (v) => { const m = /\.(\d+)$/.exec(String(v)); return m ? m[1].length : 0; };

export function reconcileFact({ fact, rows, tolerance = null }) {
  const base = { fact_id: fact.id, ssi_field: fact.ssi_field ?? null, accounting_comparability: 'NOT_ESTABLISHED', note: NOTE };
  if (fact.kind !== 'number' || typeof fact.value !== 'number' || !Number.isFinite(fact.value) || fact.value === 0) return { ...base, verdict: 'NOT_APPLICABLE', matches: [] };
  if (typeof fact.ssi_field !== 'string' || !fact.ssi_field) return { ...base, verdict: 'NO_FIELD_MAPPING', matches: [] };
  const target = fact.value * UNIT_BASE[fact.unit], scales = SCALES[fact.unit] || [1];
  const tol = tolerance ?? Math.max(1e-5, (0.5 * 10 ** -decimals(fact.value)) / Math.abs(fact.value));
  let considered = 0, nulls = 0, invalidPeriod = 0, invalidValue = 0, nearest = null;
  const matches = [];
  for (const r of rows || []) {
    if (!r.period_valid) { invalidPeriod++; continue; }
    const v = r.values ? r.values[fact.ssi_field] : undefined;
    if (v === null || v === undefined) { nulls++; continue; }
    if (typeof v !== 'number' || !Number.isFinite(v)) { invalidValue++; continue; }
    considered++;
    let best = null;
    for (const scale of scales) { const err = Math.abs(v * scale - target) / Math.abs(target); if (best === null || err < best.rel_err) best = { scale, rel_err: err }; }
    const where = { period_key: r.period_key, yearReport: r.yearReport, lengthReport: r.lengthReport, ttmType: r.ttmType, source_index: r.source_index, ...best };
    if (nearest === null || best.rel_err < nearest.rel_err) nearest = where;
    if (best.rel_err <= tol) matches.push(where);
  }
  const counts = { rows_considered: considered, rows_null: nulls, rows_excluded_invalid_period: invalidPeriod, rows_invalid_value: invalidValue, tolerance: tol };
  if (!considered) return { ...base, ...counts, verdict: 'NO_SSI_VALUE', matches: [], nearest: null };
  if (matches.length) return { ...base, ...counts, verdict: 'MATCH', unique: matches.length === 1, matches, nearest };
  return { ...base, ...counts, verdict: 'NO_MATCH', matches: [], nearest };
}
export function reconcileAll({ facts, rows, tolerance = null }) {
  const results = facts.map((fact) => reconcileFact({ fact, rows, tolerance }));
  const summary = {}; for (const r of results) summary[r.verdict] = (summary[r.verdict] || 0) + 1;
  return { results, summary };
}
