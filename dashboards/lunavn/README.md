# LunaVN — static demo snapshot

This folder is the deployable snapshot for `dashboards/lunavn/` on FiTechHub / FiTechRNV3 GitHub Pages.

**DEMO / SEEDED_SYNTHETIC / NOT_REAL_MARKET_DATA.** The original UI states that ticker symbols and exchanges are real, while all metrics are fixed seeded random values. Candles, volumes, news, market breadth and the equal/capital-weight ratio are demonstrations. The displayed session/run date is **2026-10-19**. Exact response capture time and SHA-256 bindings are in [provenance.json](./provenance.json).

The snapshot reuses LunaVN's actual React UI components and CSS in a production bundle. It preserves the three screener tabs (65 momentum, 43 thematic, 10 ETF rows), column filters, three-state sorting, overview/chart switch, all captured ticker charts, SMA/volume overlays, drawing controls, synthetic news controls, breadth and ratio dialogs, dark/light theme, and existing local download/share controls. Learn includes the original index and its eight article pages. About, privacy and terms preserve the source's placeholder content where present.

Navigation uses hash routes: `#/learn`, `#/about`, `#/privacy`, `#/terms`, and `#/learn/<article-slug>`. The FiTechHub return link is `../../#overview`. Every runtime data request resolves to a relative file under `./data/`; no local server or live API is needed after hosting. Fonts are included locally. Login remains disabled. Local preferences and consent choices use a separate snapshot storage namespace. Nothing is sent to a server by these controls. Downloaded chart images carry a DEMO caption; TXT/XLSX exports contain the selected real ticker/exchange names only.

This is an immutable presentation snapshot. It does not update prices, connect an account, place orders, or establish scientific/production readiness. Source article drafts, market assumptions, synthetic thresholds, and unverified statements retain their original status. Clipboard image copying depends on browser support and HTTPS permissions. PNG and XLSX operations depend on browser canvas/download support. Rendering and interaction across all browsers are not established by static checks alone.

[validation.json](./validation.json) records the child builder's compilation, data/hash, filter/sort and subpath checks. Browser acceptance is performed separately by the integrating owner. [SNAPSHOT_FILES.sha256](./SNAPSHOT_FILES.sha256) binds every other public file, and [THIRD_PARTY_LICENSES.txt](./THIRD_PARTY_LICENSES.txt) contains bundled dependency notices.

No development bundles, source maps, credentials, native filesystem paths, original project configuration, market downloads, or raw real market data are included.
