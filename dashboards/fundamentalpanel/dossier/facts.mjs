// Sourced company facts: schema validation, loading, per-ticker content availability and the growth-comparability guard.
// Pure and DOM-free. A fact is accepted only with an issuer, a period/scope/unit (numbers), and a source that names an https URL on the
// document's allowlisted hosts, a retrieval date and an evidence locator. Rejections are returned per fact with a code; nothing is repaired.
// Facts are rendered with textContent only (render.mjs); the schema additionally refuses markup.
import { NAV_IDS_ORIGINAL } from './sections.mjs';

export const SCHEMA = 'panel-facts/1';
export const SAFE_HOST_SUFFIX_SYNTH = '.invalid';
export const FACT_SECTIONS = ['gioithieu', 'nhamay', 'mang', 'ruiro', 'dhcd', 'phamvi'];
const KINDS = ['text', 'number', 'document', 'scope_change', 'comparability'];
const BASES = ['ACTUAL', 'PLAN', 'ESTIMATE', 'NARRATIVE'];
const UNITS = ['VND', 'million_VND', 'billion_VND', 'USD', 'billion_USD', 'percent', 'ratio', 'count'];
const SCOPES = ['CONSOLIDATED', 'SEPARATE', 'SEGMENT', 'UNSPECIFIED'];
const TICKER_RE = /^[A-Z0-9]{2,10}$/;
const MAX_TEXT = 800;
export const AGM_CATEGORIES = ['DIVIDEND', 'EARNINGS_PLAN', 'CAPITAL', 'INVESTMENT', 'ESOP', 'GOVERNANCE', 'OTHER'];
export const AGM_STATUSES = ['APPROVED_PLAN', 'EXECUTED_CONFIRMED', 'EXECUTION_NOT_CONFIRMED', 'SUPERSEDED'];
export const SOURCE_KINDS = ['NEWS', 'ANNUAL_REPORT_MANAGEMENT', 'AUDITED_NOTE', 'AGM_RESOLUTION', 'STRATEGY_PAGE', 'OTHER'];

// Validated facts are IMMUTABLE SNAPSHOTS (deep clone + deep freeze): later edits to the caller's input, or attempts to alter a loaded result, can neither
// change what was validated nor slip a compensating edit past the reconciliation. Registry of objects that came out of validateFactsDoc. Model inputs may only be built from these (a caller cannot attest that a plain object is validated).
const VALIDATED_FACTS = new WeakSet(), VALIDATED_RESULTS = new WeakSet();
export const isValidatedFact = (f) => !!f && typeof f === 'object' && VALIDATED_FACTS.has(f);
export const isValidatedResult = (r) => !!r && typeof r === 'object' && VALIDATED_RESULTS.has(r);
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const isYear = (n) => Number.isInteger(n) && n >= 1990 && n <= 2100;

function checkUrl(url, hosts) {
  let u;
  try { u = new URL(url); } catch { return 'INVALID'; }
  if (u.protocol === 'http:') return 'NOT_HTTPS';
  if (u.protocol !== 'https:' || u.username || u.password) return 'INVALID';
  if (!hosts.includes(u.hostname)) return 'HOST_NOT_ALLOWED';
  return null;
}
function checkText(s) {
  if (typeof s !== 'string' || s.trim() === '') return 'TEXT_EMPTY';
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s)) return 'TEXT_HAS_CONTROL';
  if (/<\/?[a-zA-Z!]/.test(s)) return 'TEXT_HAS_MARKUP';
  if (s.length > MAX_TEXT) return 'TEXT_TOO_LONG';
  return null;
}

export function validateFactsDoc(doc, { ticker }) {
  const fail = (code, message) => ({ ok: false, facts: [], rejected: [], issues: [{ code, message }], groups: [], group_issues: [], meta: null });
  if (!isObj(doc)) return fail('BAD_DOCUMENT', 'not an object');
  if (doc.schema !== SCHEMA) return fail('BAD_SCHEMA', `schema must be ${SCHEMA}`);
  if (doc.ticker !== ticker) return fail('TICKER_MISMATCH', `document is for ${JSON.stringify(doc.ticker)}, not ${ticker}`);
  if (!['SOURCED_ACTUALS', 'SYNTHETIC_FIXTURE'].includes(doc.data_kind)) return fail('BAD_DATA_KIND', 'data_kind must be SOURCED_ACTUALS or SYNTHETIC_FIXTURE');
  if (!isObj(doc.issuer) || typeof doc.issuer.name !== 'string' || !doc.issuer.name.trim()) return fail('NO_ISSUER', 'issuer.name is required');
  if (!Array.isArray(doc.allowed_hosts) || !doc.allowed_hosts.length || !doc.allowed_hosts.every((h) => typeof h === 'string' && /^[a-z0-9.-]+$/.test(h))) return fail('NO_ALLOWED_HOSTS', 'allowed_hosts must list the hostnames facts may cite');
  if (!Array.isArray(doc.facts)) return fail('BAD_DOCUMENT', 'facts must be an array');
  const hosts = doc.allowed_hosts, synth = doc.data_kind === 'SYNTHETIC_FIXTURE';
  const { groups, group_issues } = validateSegmentGroups(doc.segment_groups);
  const facts = [], rejected = [], seen = new Set(), cells = new Set();
  for (const [index, f] of doc.facts.entries()) {
    const rej = (code, message) => rejected.push({ index, id: isObj(f) && typeof f.id === 'string' ? f.id : null, code, message });
    const code = factProblem(f, { hosts, synth, issuer: doc.issuer.name, seen, groups, cells });
    if (code) { rej(code, code); continue; }
    seen.add(f.id); if (f.segment) cells.add(`${f.segment.group}|${f.segment.segment}|${f.segment.metric}`);
    const snap = deepFreeze(structuredClone(f)); facts.push(snap); VALIDATED_FACTS.add(snap);
  }
  deepFreeze(groups);
  const result = { ok: true, facts: Object.freeze(facts), rejected: Object.freeze(rejected), issues: Object.freeze([]), groups, group_issues: Object.freeze(group_issues), meta: Object.freeze({ ticker, data_kind: doc.data_kind, issuer: doc.issuer.name, allowed_hosts: hosts, generated_at: typeof doc.generated_at === 'string' ? doc.generated_at : null }) };
  VALIDATED_RESULTS.add(Object.freeze(result));
  return result;
}
// Structured AGM block metadata: what the resolution says (category/metric/segment), which document and meeting it comes from, whether it is only an approved plan or an execution
// confirmed by a separate source, and the planned target date. A target date that has passed NEVER turns a plan into an executed fact; only status EXECUTED_CONFIRMED with its own executed_date does.
function agmProblem(f) {
  const a = f.agm;
  if (f.section !== 'dhcd') return 'AGM_WRONG_SECTION';
  if (!isObj(a)) return 'AGM_INVALID';
  if (!AGM_CATEGORIES.includes(a.category) || !AGM_STATUSES.includes(a.status)) return 'AGM_INVALID';
  if (!isObj(a.meeting) || !isYear(a.meeting.year) || (a.meeting.date !== undefined && !isDate(a.meeting.date))) return 'AGM_MEETING_INVALID';
  if (!isObj(a.document) || typeof a.document.title !== 'string' || !a.document.title.trim() || checkText(a.document.title) || !isDate(a.document.date) || (a.document.number !== undefined && (typeof a.document.number !== 'string' || a.document.number.length > 60 || checkText(a.document.number)))) return 'AGM_DOCUMENT_INVALID';
  if (a.target_date !== undefined && !isDate(a.target_date)) return 'AGM_DATE_INVALID';
  if (a.status === 'EXECUTED_CONFIRMED' ? !isDate(a.executed_date) : a.executed_date !== undefined) return 'AGM_EXECUTION_INCONSISTENT';
  for (const k of ['metric', 'segment']) if (a[k] !== undefined && !(typeof a[k] === 'string' && /^[A-Za-z0-9_.-]{1,60}$/.test(a[k]))) return 'AGM_INVALID';
  if (f.kind === 'number' && !a.metric) return 'AGM_METRIC_MISSING';
  return null;
}
function factProblem(f, { hosts, synth, issuer, seen, groups, cells }) {
  if (!isObj(f)) return 'BAD_FACT';
  if (typeof f.id !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(f.id)) return 'BAD_ID';
  if (seen.has(f.id)) return 'DUPLICATE_ID';
  if (!FACT_SECTIONS.includes(f.section)) return 'BAD_SECTION';
  if (!KINDS.includes(f.kind)) return 'BAD_KIND';
  if (!BASES.includes(f.basis)) return 'BAD_BASIS';
  if (f.issuer !== issuer) return 'ISSUER_MISMATCH';
  const tc = checkText(f.statement); if (tc) return tc;
  const s = f.source;
  if (!isObj(s)) return 'SOURCE_MISSING';
  const uc = typeof s.url === 'string' ? checkUrl(s.url, hosts) : 'INVALID';
  if (uc) return { INVALID: 'SOURCE_URL_INVALID', NOT_HTTPS: 'SOURCE_URL_NOT_HTTPS', HOST_NOT_ALLOWED: 'SOURCE_HOST_NOT_ALLOWED' }[uc];
  if (!isDate(s.retrieved)) return 'SOURCE_RETRIEVED_INVALID';
  if (s.published !== undefined && s.published !== null && !isDate(s.published)) return 'SOURCE_PUBLISHED_INVALID';
  if (!isObj(s.locator) || !['quote', 'page', 'anchor'].includes(s.locator.type) || typeof s.locator.value !== 'string' || !s.locator.value.trim()) return 'SOURCE_LOCATOR_MISSING';
  const host = new URL(s.url).hostname, onInvalid = host.endsWith(SAFE_HOST_SUFFIX_SYNTH);
  if (synth && !onInvalid) return 'SYNTHETIC_ON_REAL_HOST';
  if (!synth) {
    if (onInvalid) return 'SOURCED_ON_INVALID_HOST';
    if (typeof s.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(s.sha256)) return 'SOURCED_NEEDS_SHA256';
  }
  if (f.source_kind !== undefined && !SOURCE_KINDS.includes(f.source_kind)) return 'SOURCE_KIND_INVALID';
  if (f.document_version !== undefined && (typeof f.document_version !== 'string' || f.document_version.length > 120 || checkText(f.document_version))) return 'DOCUMENT_VERSION_INVALID';
  if (f.agm !== undefined) { const ac = agmProblem(f); if (ac) return ac; }
  if (f.basis === 'ESTIMATE' && !(typeof f.estimated_by === 'string' && f.estimated_by.trim())) return 'ESTIMATE_WITHOUT_AUTHOR';
  if (f.ssi_field !== undefined && !(typeof f.ssi_field === 'string' && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(f.ssi_field))) return 'SSI_FIELD_INVALID';
  if (f.kind === 'number') {
    if (typeof f.value !== 'number' || !Number.isFinite(f.value)) return 'NUMBER_NOT_FINITE';
    if (f.unit === undefined || f.unit === null) return 'NUMBER_UNIT_MISSING';
    if (!UNITS.includes(f.unit)) return 'NUMBER_UNIT_UNKNOWN';
    if (!isObj(f.period) || typeof f.period.label !== 'string' || !f.period.label.trim()) return 'NUMBER_PERIOD_MISSING';
    if (!SCOPES.includes(f.scope)) return 'NUMBER_SCOPE_INVALID';
    if (!('restated' in f) || ![true, false, null].includes(f.restated)) return 'NUMBER_RESTATED_MISSING';
  }
  if (f.kind === 'document') { const dc = typeof f.document_url === 'string' ? checkUrl(f.document_url, hosts) : 'INVALID'; if (dc) return 'DOCUMENT_URL_INVALID'; }
  if (f.kind === 'scope_change') { if (f.section !== 'phamvi') return 'BAD_SECTION'; if (!isYear(f.effective_year)) return 'SCOPE_YEAR_INVALID'; }
  if (f.kind === 'comparability') {
    if (f.section !== 'phamvi') return 'BAD_SECTION';
    if (!isYear(f.from_year) || !isYear(f.to_year) || f.from_year > f.to_year) return 'COMPARABILITY_YEARS_INVALID';
    if (!['COMPARABLE', 'NOT_COMPARABLE'].includes(f.verdict)) return 'COMPARABILITY_VERDICT_INVALID';
  }
  if (f.section === 'phamvi' && !['scope_change', 'comparability'].includes(f.kind)) return 'BAD_KIND';
  if (f.segment !== undefined) {
    if (f.kind !== 'number') return 'SEGMENT_NOT_NUMBER';
    if (f.section !== 'mang') return 'SEGMENT_WRONG_SECTION';
    const sg = f.segment, g = isObj(sg) ? groups.find((x) => x.id === sg.group) : null;
    if (!g) return 'SEGMENT_GROUP_UNKNOWN';
    if (!g.segments.some((x) => x.id === sg.segment)) return 'SEGMENT_UNKNOWN';
    if (!g.metrics.some((x) => x.id === sg.metric)) return 'SEGMENT_METRIC_UNKNOWN';
    if (f.unit !== g.unit || f.period.label !== g.period.label || f.scope !== g.scope || f.basis !== g.basis) return 'SEGMENT_BINDING_MISMATCH';
    if (cells.has(`${sg.group}|${sg.segment}|${sg.metric}`)) return 'DUPLICATE_SEGMENT_CELL';
  }
  return null;
}

// ---- loading --------------------------------------------------------------------------------------------------------
export async function loadFacts(ticker, { fetch: f = globalThis.fetch, base = 'data' } = {}) {
  if (typeof ticker !== 'string' || !TICKER_RE.test(ticker)) throw new Error(`invalid ticker: ${JSON.stringify(ticker)}`);
  if (!/^(\.\.\/qrw\/)?data$/.test(base)) throw new Error(`unsupported data base: ${base}`);
  const get = async (rel) => { try { const r = await f(`${base}/${rel}`); return r.ok ? await r.json() : null; } catch { return null; } };
  const index = await get('facts/index.json');
  const none = (state, extra = {}) => ({ state, facts: [], rejected: [], issues: [], groups: [], group_issues: [], meta: null, ...extra });
  if (!index || !Array.isArray(index.tickers)) return none('NO_FACTS_INDEX');
  if (!index.tickers.includes(ticker)) return none('NOT_ACQUIRED');
  const doc = await get(`facts/${ticker}.json`);
  if (!doc) return none('NOT_ACQUIRED', { issues: [{ code: 'FACTS_FILE_UNREADABLE', message: `facts/${ticker}.json is listed but unreadable` }] });
  const v = validateFactsDoc(doc, { ticker });
  return { state: v.ok ? 'LOADED' : 'INVALID', facts: v.facts, rejected: v.rejected, issues: v.issues, groups: v.groups || [], group_issues: v.group_issues || [], meta: v.meta, loaded: v.ok ? v : null };
}

// ---- content availability (per ticker; NOT the implementation registry) --------------------------------------------
const DATA_AREAS = { gia: 'hasPrices', nganh: 'peersOk' };
export function contentAvailability({ facts, hasPrices, peersOk, groups, statements = false, models = null }) {
  const by = {};
  for (const f of facts || []) by[f.section] = (by[f.section] || 0) + 1;
  const flags = { hasPrices: !!hasPrices, peersOk: !!peersOk };
  const areas = NAV_IDS_ORIGINAL.map((id) => {
    if (['nhamay', 'mang', 'ruiro', 'dhcd'].includes(id)) return by[id] ? { id, state: 'SOURCED', n: by[id] } : { id, state: 'NONE', n: 0 };
    if (id in DATA_AREAS) return flags[DATA_AREAS[id]] ? { id, state: 'DATA_ONLY', n: 0 } : { id, state: 'NONE', n: 0 };
    if (statements && (id === 'h1' || id === 'kqkd')) return { id, state: 'SOURCED', n: 0 };
    if (models && id in models) return models[id] ? { id, state: 'MODELED', n: 0 } : { id, state: 'NONE', n: 0 };
    if (id === 'h1' || id === 'kqkd') return groups > 0 ? { id, state: 'DATA_ONLY', n: 0 } : { id, state: 'NONE', n: 0 };
    return { id, state: 'NONE', n: 0 };
  });
  const counts = { SOURCED: 0, ...(models ? { MODELED: 0 } : {}), DATA_ONLY: 0, NONE: 0 };
  for (const a of areas) counts[a.state]++;
  return { areas, counts, intro: by.gioithieu ? 'SOURCED' : 'NONE' };
}

// ---- comparability --------------------------------------------------------------------------------------------------
// Same raw (lengthReport, ttmType) labels one yearReport apart do not prove the same accounting scope. A growth figure needs evidence.
export function comparability(facts, cur, prior) {
  const lo = prior.yearReport, hi = cur.yearReport;
  const ev = (facts || []).filter((f) => f.kind === 'comparability' && f.from_year <= lo && f.to_year >= hi);
  if (ev.some((f) => f.verdict === 'NOT_COMPARABLE')) return { status: 'NOT_COMPARABLE', fact: ev.find((f) => f.verdict === 'NOT_COMPARABLE') };
  if (ev.some((f) => f.verdict === 'COMPARABLE')) return { status: 'COMPARABLE_VERIFIED', fact: ev.find((f) => f.verdict === 'COMPARABLE') };
  const sc = (facts || []).find((f) => f.kind === 'scope_change' && f.effective_year > lo && f.effective_year <= hi);
  if (sc) return { status: 'CHANGED_SCOPE', fact: sc };
  return { status: 'UNVERIFIED', fact: null };
}

// ---- segment groups: explicit metadata binding a set of number facts into one analysis table ------------------------------
// A group names its taxonomy, period, basis, unit and scope once; each fact says which group/segment/metric it fills. Nothing is inferred from
// text or ids. Management presentation and note 34(a) style taxonomies are separate groups and are never merged.
export const SEGMENT_TAXONOMIES = ['NOTE_34A', 'MANAGEMENT_PRESENTATION', 'OTHER_DECLARED'];
export const SEGMENT_ROLES = ['operating', 'elimination', 'total'];
export function validateSegmentGroups(list) {
  const groups = [], group_issues = [];
  if (list === undefined) return { groups, group_issues };
  if (!Array.isArray(list)) return { groups, group_issues: [{ group: null, code: 'GROUPS_NOT_ARRAY' }] };
  const ids = new Set();
  for (const g of list) {
    const bad = (code) => group_issues.push({ group: isObj(g) && typeof g.id === 'string' ? g.id : null, code });
    if (!isObj(g)) { bad('GROUP_NOT_OBJECT'); continue; }
    if (typeof g.id !== 'string' || !/^[a-z0-9_]{1,40}$/.test(g.id)) { bad('GROUP_ID_INVALID'); continue; }
    if (ids.has(g.id)) { bad('GROUP_ID_DUPLICATE'); continue; }
    if (!SEGMENT_TAXONOMIES.includes(g.taxonomy)) { bad('GROUP_TAXONOMY_INVALID'); continue; }
    if (typeof g.title !== 'string' || !g.title.trim() || checkText(g.title)) { bad('GROUP_TITLE_INVALID'); continue; }
    if (!isObj(g.period) || typeof g.period.label !== 'string' || !g.period.label.trim()) { bad('GROUP_PERIOD_MISSING'); continue; }
    // Explicit, verified period metadata (never parsed from the label): fiscal year, period kind and optional ISO bounds that must agree with them.
    const pe = g.period, KINDS_P = ['FY', 'H1', 'H2', 'Q1', 'Q2', 'Q3', 'Q4', 'TTM'];
    if ((pe.fiscal_year != null && !(Number.isInteger(pe.fiscal_year) && pe.fiscal_year >= 1990 && pe.fiscal_year <= 2100)) || (pe.kind != null && !KINDS_P.includes(pe.kind))
      || [pe.start, pe.end].some((d) => d != null && !isDate(d)) || (pe.start && pe.end && pe.start > pe.end) || (pe.end && pe.fiscal_year != null && Number(pe.end.slice(0, 4)) !== pe.fiscal_year)) { bad('GROUP_PERIOD_INVALID'); continue; }
    if (!BASES.includes(g.basis)) { bad('GROUP_BASIS_INVALID'); continue; }
    if (!UNITS.includes(g.unit)) { bad('GROUP_UNIT_INVALID'); continue; }
    if (!SCOPES.includes(g.scope)) { bad('GROUP_SCOPE_INVALID'); continue; }
    if (!Array.isArray(g.metrics) || !g.metrics.length) { bad('GROUP_NO_METRICS'); continue; }
    const mids = new Set(); let ok = true;
    for (const m of g.metrics) { if (!isObj(m) || typeof m.id !== 'string' || !/^[a-z][a-z0-9_]{0,23}$/.test(m.id) || typeof m.label !== 'string' || !m.label.trim() || mids.has(m.id)) { ok = false; break; } mids.add(m.id); }
    if (!ok) { bad('GROUP_METRIC_INVALID'); continue; }
    const sids = new Set(); let dup = false, roleBad = false, totals = 0, ops = 0;
    for (const x of Array.isArray(g.segments) ? g.segments : []) {
      if (!isObj(x) || typeof x.id !== 'string' || !/^[a-z0-9_]{1,40}$/.test(x.id) || typeof x.label !== 'string' || !x.label.trim() || checkText(x.label)) { roleBad = true; break; }
      if (!SEGMENT_ROLES.includes(x.role)) { roleBad = true; break; }
      if (sids.has(x.id)) { dup = true; break; }
      sids.add(x.id); if (x.role === 'total') totals++; if (x.role === 'operating') ops++;
    }
    if (dup) { bad('GROUP_SEGMENT_DUPLICATE'); continue; }
    if (roleBad) { bad('GROUP_ROLE_INVALID'); continue; }
    if (totals > 1) { bad('GROUP_MULTIPLE_TOTALS'); continue; }
    if (ops < 1) { bad('GROUP_NO_OPERATING_SEGMENT'); continue; }
    ids.add(g.id);
    groups.push({ id: g.id, title: g.title, taxonomy: g.taxonomy, period: { label: g.period.label, fiscal_year: g.period.fiscal_year ?? null, kind: g.period.kind ?? null, start: g.period.start ?? null, end: g.period.end ?? null }, basis: g.basis, unit: g.unit, scope: g.scope, note: typeof g.note === 'string' && !checkText(g.note) ? g.note : null,
      metrics: g.metrics.map((m) => ({ id: m.id, label: m.label })), segments: g.segments.map((x) => ({ id: x.id, label: x.label, role: x.role })) });
  }
  return { groups, group_issues };
}
