// Reviewed company-statement inputs (income / balance / cash flow items per reporting period) with explicit period metadata, scope regime, units and
// per-item sources. Separate from narrative facts (facts.mjs). Immutable validated snapshots, like facts. Pure, DOM-free.
// A period id is BOUND to fiscal_year + kind and to its ISO bounds; nothing is parsed from prose. scope_regime names the accounting scope in force
// (e.g. which affiliates are consolidated); figures from different regimes are never combined unless restated comparatives are supplied.
export const STATEMENTS_SCHEMA = 'panel-statements/1';
export const ITEM_KEYS = ['revenue', 'gross_profit', 'ebitda', 'pbt', 'tax', 'np_total', 'np_parent', 'nci_profit', 'eps_published', 'dps_cash',
  'cash_and_investments', 'debt_short', 'debt_long', 'total_assets', 'total_liabilities', 'equity_total', 'equity_parent', 'nci_equity', 'bvps_published',
  'cfo', 'cfi', 'capex', 'nii', 'noii', 'provisions', 'loans', 'deposits', 'npl_ratio', 'car', 'insurance_premium', 'investment_income', 'associates_book', 'non_operating_assets',
  // income-statement detail lines (signs kept exactly as published: an expense or a deferred-tax benefit may be negative; nothing is normalised)
  'cost_of_sales', 'finance_income', 'finance_cost', 'interest_expense', 'selling_expenses', 'general_admin_expenses', 'associate_jv_profit', 'operating_profit', 'tax_current', 'tax_deferred', 'eps_diluted_published'];
const KINDS = ['FY', 'H1', 'H2', 'Q1', 'Q2', 'Q3', 'Q4'];
const UNITS = ['VND', 'million_VND', 'billion_VND'];
const STATUSES = ['AUDITED', 'LIMITED_REVIEW', 'MANAGEMENT_RELEASE', 'UNAUDITED'];
const SCOPES = ['CONSOLIDATED', 'SEPARATE'];
const SHARE_CLASSES = ['ORDINARY_OUTSTANDING'];
const ACTION_TYPES = ['STOCK_DIVIDEND', 'BONUS', 'SPLIT', 'REVERSE_SPLIT', 'RIGHTS'];
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const RESULTS = new WeakSet();
export const isValidatedStatements = (r) => !!r && typeof r === 'object' && RESULTS.has(r);
export const periodId = (fy, kind) => `${fy}${kind}`;

export function periodBounds(fy, kind) {
  const q = { Q1: ['01-01', '03-31'], Q2: ['04-01', '06-30'], Q3: ['07-01', '09-30'], Q4: ['10-01', '12-31'], H1: ['01-01', '06-30'], H2: ['07-01', '12-31'], FY: ['01-01', '12-31'] }[kind];
  return q ? { start: `${fy}-${q[0]}`, end: `${fy}-${q[1]}` } : null;
}
function checkSource(s, hosts, synth) {
  if (!isObj(s)) return 'ITEM_SOURCE_MISSING';
  let u; try { u = new URL(s.url); } catch { return 'ITEM_SOURCE_INVALID'; }
  if (u.protocol !== 'https:' || u.username || u.password || !hosts.includes(u.hostname)) return 'ITEM_SOURCE_INVALID';
  if (!isDate(s.retrieved) || !isObj(s.locator) || !['quote', 'page', 'anchor'].includes(s.locator.type) || typeof s.locator.value !== 'string' || !s.locator.value.trim()) return 'ITEM_SOURCE_INVALID';
  const onInvalid = u.hostname.endsWith('.invalid');
  if (synth && !onInvalid) return 'SYNTHETIC_ON_REAL_HOST';
  if (!synth) { if (onInvalid) return 'SOURCED_ON_INVALID_HOST'; if (typeof s.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(s.sha256)) return 'SOURCED_NEEDS_SHA256'; }
  return null;
}
function itemsProblem(items, hosts, synth) {
  if (!isObj(items) || !Object.keys(items).length) return 'PERIOD_ITEMS_MISSING';
  for (const [k, v] of Object.entries(items)) {
    if (!ITEM_KEYS.includes(k)) return 'ITEM_UNKNOWN';
    if (!isObj(v) || !fin(v.value)) return 'ITEM_NOT_FINITE';
    const sp = checkSource(v.source, hosts, synth); if (sp) return sp;
  }
  return null;
}
function periodProblem(p, { hosts, synth, seen }) {
  if (!isObj(p)) return 'PERIOD_NOT_OBJECT';
  if (!Number.isInteger(p.fiscal_year) || p.fiscal_year < 1990 || p.fiscal_year > 2100 || !KINDS.includes(p.kind)) return 'PERIOD_META_INVALID';
  if (p.id !== periodId(p.fiscal_year, p.kind)) return 'PERIOD_ID_MISMATCH';
  const b = periodBounds(p.fiscal_year, p.kind); if (!isDate(p.start) || !isDate(p.end) || p.start !== b.start || p.end !== b.end) return 'PERIOD_BOUNDS_MISMATCH';
  if (seen.has(p.id)) return 'PERIOD_DUPLICATE';
  if (!UNITS.includes(p.unit)) return 'PERIOD_UNIT_INVALID';
  if (!SCOPES.includes(p.scope)) return 'PERIOD_SCOPE_INVALID';
  if (typeof p.scope_regime !== 'string' || !p.scope_regime.trim()) return 'PERIOD_REGIME_MISSING';
  if (!STATUSES.includes(p.status)) return 'PERIOD_STATUS_INVALID';
  const ip = itemsProblem(p.items, hosts, synth); if (ip) return ip;
  if (p.restated_comparatives !== undefined) {
    if (!isObj(p.restated_comparatives)) return 'RESTATED_INVALID';
    for (const [pid, rc] of Object.entries(p.restated_comparatives)) {
      if (!/^\d{4}(FY|H1|H2|Q[1-4])$/.test(pid) || !isObj(rc) || typeof rc.scope_regime !== 'string' || !rc.scope_regime.trim() || rc.scope_regime !== p.scope_regime) return 'RESTATED_INVALID';
      const rp = itemsProblem(rc.items, hosts, synth); if (rp) return rp;
    }
  }
  return null;
}

export function validateStatementsDoc(doc, { ticker }) {
  const fail = (code) => deepFreeze({ ok: false, periods: [], shares: [], corporate_actions: [], rejected: [], warnings: [], issues: [{ code }], meta: null });
  if (!isObj(doc)) return fail('BAD_DOCUMENT');
  if (doc.schema !== STATEMENTS_SCHEMA) return fail('BAD_SCHEMA');
  if (doc.ticker !== ticker) return fail('TICKER_MISMATCH');
  if (!['SOURCED_ACTUALS', 'SYNTHETIC_FIXTURE'].includes(doc.data_kind)) return fail('BAD_DATA_KIND');
  if (!isObj(doc.issuer) || typeof doc.issuer.name !== 'string' || !doc.issuer.name.trim()) return fail('NO_ISSUER');
  if (!Array.isArray(doc.allowed_hosts) || !doc.allowed_hosts.length || !Array.isArray(doc.periods)) return fail('BAD_DOCUMENT');
  const hosts = doc.allowed_hosts, synth = doc.data_kind === 'SYNTHETIC_FIXTURE';
  const periods = [], rejected = [], warnings = [], issues = [], seen = new Set();
  for (const [index, p] of doc.periods.entries()) {
    const code = periodProblem(p, { hosts, synth, seen });
    if (code) { rejected.push({ index, id: isObj(p) && typeof p.id === 'string' ? p.id : null, code }); continue; }
    seen.add(p.id); periods.push(structuredClone(p));
    const it = p.items, tol = 1;
    if (fin(it.np_parent?.value) && fin(it.nci_profit?.value) && fin(it.np_total?.value) && Math.abs(it.np_parent.value + it.nci_profit.value - it.np_total.value) > tol * (p.unit === 'VND' ? 1e9 : p.unit === 'million_VND' ? 1e3 : 1) * 0.5) warnings.push({ period: p.id, code: 'PROFIT_IDENTITY_MISMATCH' });
  }
  const shares = [], actions = [];
  for (const s of Array.isArray(doc.shares) ? doc.shares : []) {
    if (isObj(s) && isDate(s.as_of) && fin(s.value) && s.value > 0 && SHARE_CLASSES.includes(s.class) && !checkSource(s.source, hosts, synth)) shares.push(structuredClone(s)); else issues.push({ code: 'SHARE_RECORD_INVALID' });
  }
  for (const a of Array.isArray(doc.corporate_actions) ? doc.corporate_actions : []) {
    if (isObj(a) && isDate(a.date) && ACTION_TYPES.includes(a.type) && fin(a.ratio) && a.ratio > 0 && (a.source === undefined || !checkSource(a.source, hosts, synth))) actions.push(structuredClone(a)); else issues.push({ code: 'CORPORATE_ACTION_INVALID' });
  }
  shares.sort((a, b) => (a.as_of < b.as_of ? -1 : 1)); actions.sort((a, b) => (a.date < b.date ? -1 : 1));
  const result = deepFreeze({ ok: true, periods, shares, corporate_actions: actions, rejected, warnings, issues, meta: { ticker, data_kind: doc.data_kind, issuer: doc.issuer.name } });
  RESULTS.add(result); return result;
}

// ---- loading (browser/Node, fetch injected) -------------------------------------------------------------------------------
const TICKER_RE = /^[A-Z0-9]{2,10}$/;
export async function loadStatements(ticker, { fetch: f = globalThis.fetch, base = 'data' } = {}) {
  if (typeof ticker !== 'string' || !TICKER_RE.test(ticker)) throw new Error(`invalid ticker: ${JSON.stringify(ticker)}`);
  if (!/^(\.\.\/qrw\/)?data$/.test(base)) throw new Error(`unsupported data base: ${base}`);
  const get = async (rel) => { try { const r = await f(`${base}/${rel}`); return r.ok ? await r.json() : null; } catch { return null; } };
  const none = (state) => ({ state, statements: null });
  const index = await get('statements/index.json');
  if (!index || !Array.isArray(index.tickers)) return none('NO_STATEMENTS_INDEX');
  if (!index.tickers.includes(ticker)) return none('NOT_ACQUIRED');
  const doc = await get(`statements/${ticker}.json`);
  if (!doc) return none('NOT_ACQUIRED');
  const v = validateStatementsDoc(doc, { ticker });
  return v.ok ? { state: 'LOADED', statements: v } : { state: 'INVALID', statements: null, issues: v.issues };
}
