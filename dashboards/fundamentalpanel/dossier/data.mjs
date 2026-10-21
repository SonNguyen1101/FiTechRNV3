// Data loading for the dossier. fetch is injected so the logic is testable without a browser. Same-origin relative paths only;
// the ticker is validated before any path is built. Optional files that are absent become explicit `problems`, never silent gaps.
import { loadFacts } from './facts.mjs';
import { loadZoneThresholds } from './zones.mjs';
import { loadStatements } from './statements.mjs';
const TICKER_RE = /^[A-Z0-9]{2,10}$/;
const HISTORY_RE = /^fundamentals\/[A-Z0-9]{2,10}\.json$/;

export async function loadDossierData(ticker, { fetch: f = globalThis.fetch, base = 'data' } = {}) {
  if (typeof ticker !== 'string' || !TICKER_RE.test(ticker)) throw new Error(`invalid ticker: ${JSON.stringify(ticker)}`);
  if (!/^(\.\.\/qrw\/)?data$/.test(base)) throw new Error(`unsupported data base: ${base}`);
  const out = { ticker, record: null, manifest: null, history: null, prices: null, peers: null, facts: null, zones: null, statements: null, market: null, problems: [] };
  const get = async (rel) => { try { const r = await f(`${base}/${rel}`); return r.ok ? await r.json() : null; } catch { return null; } };
  const universe = await get('universe.json');
  if (!universe || !Array.isArray(universe.records)) { out.problems.push({ code: 'UNIVERSE_UNAVAILABLE', message: 'Không tải được universe.json; chạy export trước.' }); return out; }
  out.record = universe.records.find((r) => r.ticker === ticker) || null;
  if (!out.record) { out.problems.push({ code: 'TICKER_NOT_IN_UNIVERSE', message: `Mã ${ticker} không có trong universe đã xuất.` }); return out; }
  out.manifest = await get('manifest.json');
  if (!out.manifest) out.problems.push({ code: 'MANIFEST_UNAVAILABLE', message: 'Không tải được manifest.json.' });
  // Public snapshot excludes full raw price and finance histories.
  out.problems.push({code:'PRICES_PUBLIC_HISTORY_OMITTED',message:'Chuỗi giá và lịch sử finance thô không xuất công khai; xem chỉ số tổng hợp đã chụp và bảng Thị trường.'});
  const screen = await get('screener.json');
  out.snapshotRow = screen?.rows?.find(r => r.ticker === ticker) || null;
  const peers = await get('peers.json');
  if (!peers) out.problems.push({ code: 'PEERS_NOT_EXPORTED', message: 'Chưa có chỉ mục so sánh ngành (export với --fitechtrade-root).' });
  else out.peers = peers;
  // Market summary (last close + performance aligned to the benchmark); optional, absence is an explicit state in the peer table.
  out.market = out.manifest && out.manifest.price_series ? await get('market.json') : null;
  // Reviewed statements (income/balance/cash flow per period); absence is an explicit state, never a default from another ticker.
  out.statements = await loadStatements(ticker, { fetch: f, base });
  // Sourced company facts (CC-03E): listed in data/facts/index.json by the acquisition command; absence is an explicit state.
  out.facts = await loadFacts(ticker, { fetch: f, base });
  // Ticker-specific buy-zone thresholds (CC-03E amendment); absence is an explicit state, never a default taken from another ticker.
  out.zones = await loadZoneThresholds(ticker, { fetch: f, base });
  return out;
}
