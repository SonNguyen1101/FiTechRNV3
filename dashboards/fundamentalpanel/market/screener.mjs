// Market screener rows: ONE row per universe ticker, computed from the already-installed export (universe, market summary, SSI peers file, zone thresholds, facts and
// statements indexes). Pure and DOM-free; the CLI (scripts/build-screener.mjs) does the file reading. Nothing is invented: a missing input is null with its reason, a price
// older than the market date carries its own date and a PRICE_STALE flag, and SSI figures are marked unverified (★ in the UI).
import { priceStats } from '../dossier/model.mjs';
import { validateThresholds, zoneLevels, weakReasons } from '../dossier/zones.mjs';
import { sectorModelFor } from '../dossier/models.mjs';

export const SCREENER_SCHEMA = 'fundamental-panel/screener/v1';
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => (fin(v) ? v : null);
const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
const tally = (obj, key) => { obj[key] = (obj[key] || 0) + 1; };
const WINDOWS = ['1M', '3M', '6M', '12M'];

function identity(r) {
  const icb = (r.sector && r.sector.icb) || {}, gics = (r.sector && r.sector.gics) || {};
  return { name: r.company && r.company.status === 'SOURCE_BACKED' && typeof r.company.name === 'string' ? r.company.name : null, exchange: r.exchange ?? null, listing_status: r.universe_status ?? null,
    sector: { icb_level1: icb.level1 ?? null, icb_level2: icb.level2 ?? null, icb_level4: icb.level4 ?? null, gics_l2: gics.sector_l2 ?? null } };
}

function priceBlock(r, mk, asOfMarket, bars) {
  const last = mk && mk.last && isIso(mk.last.date) && fin(mk.last.close) ? mk.last : null;
  const out = { close: last ? last.close : null, date: last ? last.date : null, days_behind_market: null, bar_status: (r.bar && r.bar.status) || null, stale: false, flag: null, integrity_flags: [] };
  if (!last) return out;
  out.days_behind_market = Math.max(0, dayDiff(last.date, asOfMarket));
  if (last.date < asOfMarket) { out.stale = true; out.flag = { code: 'PRICE_STALE', date: last.date, days_behind: out.days_behind_market }; }
  const b = Array.isArray(bars) && bars.length ? bars.reduce((m, x) => (x.date > m.date ? x : m)) : null;
  if (b && (b.date !== last.date || b.close !== last.close)) out.integrity_flags.push('PRICE_MISMATCH');
  return out;
}

function perfBlock(mk) {
  const perf = {}, unavailable = {};
  for (const w of WINDOWS) {
    const p = mk && mk.perf ? mk.perf[w] : null;
    perf[w] = p && fin(p.stock) ? { own: p.stock, index: num(p.index), relative: num(p.relative), start_date: p.start_date ?? null, end_date: p.end_date ?? null, common_end: p.common_end === true } : null;
    if (!perf[w]) unavailable[w] = (mk && mk.perf_unavailable && mk.perf_unavailable[w]) || 'NOT_COMPUTED';
  }
  return { perf, perf_unavailable: unavailable };
}

function rangeBlock(bars) {
  if (!Array.isArray(bars) || !bars.length) return null;
  let s; try { s = priceStats(bars); } catch { return null; }
  return { bars_used: s.bars_used, high: s.high, low: s.low, pos: s.rangePos, from_high: s.fromHighPct, from_low: s.fromLowPct, last: s.last };
}

// weak-threshold reasons come from the one shared rule (zones.mjs weakReasons), so the screener, the market page and the dossier always agree
function quality(t, doc, levels) {
  const est = doc && doc.estimation && typeof doc.estimation === 'object' ? doc.estimation : null;
  const flags = est && Array.isArray(est.flags) ? [...est.flags] : [];
  const reasons = weakReasons(t, levels);
  const c = est && est.counts && typeof est.counts === 'object' ? est.counts : null;
  return { data_kind: t.data_kind, crash_quarters: c && fin(c.crash) ? c.crash : null, normal_quarters: c && fin(c.normal) ? c.normal : null, quarters: t.calibration_window.quarters, flags, weak: reasons.length > 0, weak_reasons: reasons };
}

function zoneBlock({ ticker, bars, doc, listed }) {
  const v = doc ? validateThresholds(doc, { ticker }) : null;
  const thresholds = v && v.ok ? v.thresholds : null;
  const coverage = !doc ? (listed ? 'INVALID' : 'NONE') : thresholds ? 'VALID' : 'INVALID';
  const z = zoneLevels({ bars: Array.isArray(bars) ? bars : [], subject: ticker, thresholds });
  const L = z.levels, p = z.price, ver = z.verdict || { code: 'NO_BARS' };
  const out = { status: z.status, verdict: ver.code, as_of: z.as_of, stale_as_of: false, levels: L ? { peak: L.peak, n50: L.n50, c75: L.c75 } : null, prev_quarter: z.prev, inverted: z.inverted,
    vs_normal_upper: L && fin(p) ? p / L.n50 - 1 : null, vs_crash_floor: L && fin(p) ? p / L.c75 - 1 : null, to_crash_floor: fin(ver.to_floor) ? ver.to_floor : null, need_drop: fin(ver.need_drop) ? ver.need_drop : null,
    quality: thresholds ? quality(thresholds, doc, L) : null };
  return { zone: out, coverage };
}

function ssiBlock(t, peers, mk) {
  const row = peers && peers.rows && peers.rows[t], e = row && Array.isArray(row.entries) ? row.entries[0] : null, v = e && e.values;
  if (!v) return null;
  const price = mk && mk.last && fin(mk.last.close) ? mk.last.close : null;
  return { pe: num(v.pe), pb: num(v.pb), roe: num(v.roe), market_cap_bn: price !== null && fin(v.sharesOutstanding) && v.sharesOutstanding > 0 ? (price * v.sharesOutstanding) / 1e9 : null,
    market_cap_price_date: price !== null ? mk.last.date : null, period_key: e.period_key ?? null, length_report: e.lengthReport ?? null, ttm_type: e.ttmType ?? null, ambiguous: e.ambiguous === true, unverified: true };
}

function modelsBlock(r, statements, hasPrice) {
  const icb = (r.sector && r.sector.icb) || {}, m = sectorModelFor(icb.level1 || null, icb.level4 || null);
  const blocked = statements !== 'APPROVED' ? 'NO_APPROVED_STATEMENTS' : !hasPrice ? 'NO_PRICE' : null;
  return { applicable: { primary: m.primary, alternative: m.alternative, variant: m.variant, fallback: m.fallback === true }, runnable: blocked ? [] : [m.primary, m.alternative], blocked_reason: blocked, setup_checked: false };
}

export function buildScreener({ universe, market, peers = null, manifest, zonesIndex = null, factsIndex = null, statementsIndex = null, bars, thresholdDoc, statementsValid = () => false, factsValid = () => false, generatedAt, inputs = {} }) {
  if (!universe || !Array.isArray(universe.records) || !universe.records.length) throw new Error('universe: no records');
  if (!market || !market.tickers || typeof market.tickers !== 'object' || !market.benchmark) throw new Error('market: tickers and benchmark are required');
  if (!manifest || !isIso(manifest.as_of_actual)) throw new Error('manifest: as_of_actual is required');
  if (typeof generatedAt !== 'string' || Number.isNaN(Date.parse(generatedAt))) throw new Error('generatedAt must be a valid date-time');
  const seen = new Set(); for (const r of universe.records) { if (seen.has(r.ticker)) throw new Error(`duplicate ticker in universe: ${r.ticker}`); seen.add(r.ticker); }
  const asOf = manifest.as_of_actual, inSet = (idx) => new Set(idx && Array.isArray(idx.tickers) ? idx.tickers : []);
  const zIdx = inSet(zonesIndex), fIdx = inSet(factsIndex), sIdx = inSet(statementsIndex);
  const counts = { rows: 0, listing_status: {}, bar_status: {}, zone_status: {}, verdict: {}, weak_threshold: 0, stale_price: 0, with_prices: 0, with_thresholds: 0, with_ssi: 0, with_statements: 0, with_facts: 0, ssi_without_price: 0 };
  const rows = universe.records.map((r) => {
    const t = r.ticker, mk = market.tickers[t] || null, b = bars(t), id = identity(r);
    const price = priceBlock(r, mk, asOf, b), { perf, perf_unavailable } = perfBlock(mk);
    const { zone, coverage: thrCov } = zoneBlock({ ticker: t, bars: b, doc: thresholdDoc(t), listed: zIdx.has(t) });
    zone.stale_as_of = zone.as_of !== null && zone.as_of < asOf;
    const ssi = ssiBlock(t, peers, mk);
    const statements = sIdx.has(t) ? (statementsValid(t) ? 'APPROVED' : 'LISTED_INVALID') : 'NONE', facts = fIdx.has(t) ? (factsValid(t) ? 'SOURCED' : 'LISTED_INVALID') : 'NONE';
    const hasPrice = price.close !== null && Array.isArray(b) && b.length > 0;
    const row = { ticker: t, name: id.name, exchange: id.exchange, listing_status: id.listing_status, sector: id.sector, price, perf, perf_unavailable, range_12m: rangeBlock(b), zone, ssi,
      coverage: { prices: hasPrice, thresholds: thrCov, ssi: ssi !== null, statements, facts }, models: modelsBlock(r, statements, hasPrice) };
    counts.rows++; tally(counts.listing_status, row.listing_status); tally(counts.bar_status, price.bar_status); tally(counts.zone_status, zone.status); tally(counts.verdict, zone.verdict);
    if (zone.quality && zone.quality.weak) counts.weak_threshold++;
    if (price.stale) counts.stale_price++;
    if (hasPrice) counts.with_prices++;
    if (thrCov === 'VALID') counts.with_thresholds++;
    if (ssi) { counts.with_ssi++; if (!hasPrice) counts.ssi_without_price++; }
    if (statements === 'APPROVED') counts.with_statements++;
    if (facts === 'SOURCED') counts.with_facts++;
    return row;
  });
  const bm = market.benchmark;
  return { schema: SCREENER_SCHEMA, generated_at: generatedAt, as_of_market: asOf, data_kind: manifest.data_kind ?? null,
    benchmark: { code: bm.code ?? null, last_date: bm.last_date ?? null, covers_latest_price: bm.covers_latest_price === true, lag_days: bm.lag_days ?? null }, counts, inputs, rows };
}
