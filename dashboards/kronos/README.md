# Kronos VN v2 — PUBLIC_STATIC_SNAPSHOT

Read-only export of the actual served dashboard, preserving its production React UI, CSS, navigation, dark/light theme, catalog search and pagination, SSI hierarchy browsing, saved draft policies, saved diagnostic metadata and original unimplemented model pages.

Open `index.html` via static HTTP hosting. All assets use relative paths, including under `/FiTechRNV3/dashboards/kronos/`. It requires no local server, authentication or child API after publication. A static web server is required; `file://` cannot fetch the JSON snapshot.

## Scope and limitations

- The yellow banner identifies the capture time and `PUBLIC_STATIC_SNAPSHOT`. Health, readiness, queue counts and capabilities are captured facts, never current service status.
- No jobs, imports, training, forecast, policy writes or previews can run. The fetch adapter rejects every non-GET and every unknown route; buttons and forms are also locked.
- No credentials, session endpoint, raw OHLCV rows, source file paths, local private configuration, job inputs/artifacts, transcripts or logs are captured. Public JSON uses explicit field allowlists. Quality details show metadata only.
- Captures four actual catalog versions, three SSI hierarchy registries and only the latest three saved diagnostic tables. Older registry summaries remain viewable; their missing four-level hierarchy is explicit. No new results are calculated. Aggregate state labels and model eligibility are preserved.
- Raw price/amount/volume diagnostic metrics are omitted; “—” therefore means not exported, not zero. Historical diagnostic context/session counts are retained. Some detailed source comparisons and source QC line references are omitted.
- Backend CSV exports, revision diff and log streams are disabled. Registry readiness is the captured metadata, not recalculated when changing a date. The source's five future-engine pages remain unimplemented.
- A source “technically verified” or completed technical job is not user acceptance, model validation or permission to train. No milestone or model acceptance is inferred.

## Refresh

The integration maintainer runs `python refresh_snapshot.py` from the parent staging directory while the already-running local Kronos dashboard is accessible. The helper is intentionally excluded from public deployment. It only performs allowlisted GET reads and writes under its own `public/` subdirectory. It does not import, execute or modify source project code, start the app or run producer/research jobs. It explicitly refuses credential, bar, event, artifact and export endpoint reads.

The helper refreshes sanitized `snapshot.json`, original frontend assets with narrow snapshot safety/text patches, `index.html` and `provenance.json`. `provenance.json` records source URLs, UTC capture times, raw response SHA-256 hashes (raw responses are not retained), limitations and exported file hashes. Check and approve the refreshed public data before the coordinator publishes it. No Git or GitHub operation is performed here.

## Files

- `index.html`, `assets/*`: actual frontend shell and production assets, with static safety patches.
- `static-client.js`: in-memory API-shaped adapter over sanitized JSON; mutation and unknown-route refusal; form/action locking.
- `snapshot.css`: visible snapshot banner and disabled-action labels.
- `snapshot.json`: allowlisted captured metadata; no backend dependency.
- `provenance.json`: source and file integrity evidence.
- The parent staging directory retains the refresh helper, publication manifest and verification; none are public deployable assets.

## Documentation closeout

This export is integration work in FiTechHub, not a Kronos scientific/runtime milestone. Child source documents remain read-only; no child acceptance state changes. Parent progress/roadmap and publication are coordinator-owned. No commit is created. Entry point is `./index.html#overview`. This README records architecture, setup, verification scope and limitations for the exported child. No research result or new standing policy is created.
