// Proposed sector model: SEGMENT PROFIT BRIDGE (see docs/SECTOR-MODEL-SPEC.md). Pure calculation, no DOM, no I/O.
// DRAFT: SPEC.activated stays false until the controller approves the equations in writing (review status CHANGES_REQUIRED). Inputs are accepted only from
// model-inputs.mjs, which binds each historical number to a validated fact. Historical inputs and scenario assumptions are kept apart.
import { isBoundInput } from './model-inputs.mjs';

export const SEGMENT_BRIDGE_SPEC = {
  id: 'segment_bridge_pbt', activated: false, status: 'DRAFT_NOT_APPROVED (controller review: CHANGES_REQUIRED)', unit_required: ['VND', 'million_VND', 'billion_VND'],
  note: 'Segment profit-before-tax bridge only. It is not a valuation or share-price model and must not be run on unverified SSI fields.',
  equations: [
    'revenue_s(scn) = revenue_s * (1 + growth_s[scn])',
    'margin_s(scn)  = pbt_margin_s + margin_delta_s[scn]',
    'pbt_s(scn)     = revenue_s(scn) * margin_s(scn)',
    'total_pbt(scn) = sum_s pbt_s(scn) + consolidation_adjustment',
    'sensitivity(dg, dm) = total_pbt with growth_s = growth_s[base] + dg and margin_delta_s = margin_delta_s[base] + dm for every segment',
  ],
};
const SCN = ['low', 'base', 'high'];
const fin = (x) => typeof x === 'number' && Number.isFinite(x);

// Accepts ONLY an input created by bindSegmentBridgeInputs (model-inputs.mjs). Anything else is UNBOUND_INPUT: no numbers, no zero totals.
export function runSegmentBridge(input) {
  const out = { model: SEGMENT_BRIDGE_SPEC.id, draft: true, unit: null, scope: null, period: null, status: 'COMPUTED', missing: [], scenarios: null, sensitivity: null, inputs_provenance: { historical: [], assumptions: [] } };
  if (!isBoundInput(input)) return { ...out, status: 'UNBOUND_INPUT' };
  Object.assign(out, { unit: input.unit, scope: input.scope, period: input.period });
  if (!input.segments.length) return { ...out, status: 'NO_SEGMENTS', missing: ['segments'] };
  if (new Set(input.segments.map((s) => s.id)).size !== input.segments.length) return { ...out, status: 'DUPLICATE_SEGMENTS' };
  const adj = input.consolidation_adjustment;
  const adjV = adj.not_applicable === true ? 0 : adj.value;
  if (!fin(adjV)) return { ...out, status: 'NULL_INPUT', missing: ['consolidation_adjustment'] };
  for (const s of input.segments) {
    out.inputs_provenance.historical.push({ path: `segments.${s.id}.revenue`, segment: s.id, metric: 'revenue', fact_id: s.revenue.fact_id }, { path: `segments.${s.id}.pbt_margin`, segment: s.id, metric: 'pbt', fact_id: s.pbt_margin.fact_id }, { path: `segments.${s.id}.pbt_margin`, segment: s.id, metric: 'revenue', fact_id: s.pbt_margin.fact_ids[1] });
    for (const k of ['growth', 'margin_delta']) for (const c of SCN) out.inputs_provenance.assumptions.push({ path: `segments.${s.id}.${k}.${c}`, kind: 'ASSUMPTION', value: s[k][c] });
  }
  if (adj.not_applicable !== true) for (const id of adj.fact_ids) out.inputs_provenance.historical.push({ path: 'consolidation_adjustment', segment: null, metric: 'elimination_pbt', fact_id: id });
  let nonFinite = false;
  const pbt = (s, g, dm) => { const v = s.revenue.value * (1 + g) * (s.pbt_margin.value + dm); if (!fin(v)) { nonFinite = true; return null; } return v; };
  const total = (pick) => { let sum = 0; for (const s of input.segments) { const p = pbt(s, pick(s).g, pick(s).dm); if (p === null) return null; sum += p; } const t = sum + adjV; if (!fin(t)) { nonFinite = true; return null; } return t; };
  out.scenarios = {};
  for (const scn of SCN) {
    const segOut = {};
    for (const s of input.segments) { const rev = s.revenue.value * (1 + s.growth[scn]), mar = s.pbt_margin.value + s.margin_delta[scn]; segOut[s.id] = { revenue: fin(rev) ? rev : null, margin: fin(mar) ? mar : null, pbt: pbt(s, s.growth[scn], s.margin_delta[scn]) }; }
    out.scenarios[scn] = { segments: segOut, total_pbt: total((s) => ({ g: s.growth[scn], dm: s.margin_delta[scn] })) };
  }
  const sens = input.sensitivity;
  out.sensitivity = { axes: { growth_shift: [...sens.growth_shift], margin_shift: [...sens.margin_shift] }, rows: sens.growth_shift.map((dg) => ({ growth_shift: dg, cells: sens.margin_shift.map((dmv) => total((s) => ({ g: s.growth.base + dg, dm: s.margin_delta.base + dmv }))) })) };
  if (nonFinite) out.status = 'NON_FINITE';
  return out;
}
