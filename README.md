# STL Vacancy Explorer — open rebuild

An open-source rebuild of [stlvacancytools.com](https://www.stlvacancytools.com/) (the *STL Vacancy Explorer*, run by the Public Goodness collaborative), which maps, classifies, and risk-scores every vacant property in the City of St. Louis.

This is a from-scratch reimplementation in a modern stack. The original was reverse-engineered first — see **[REVERSE-ENGINEERING.md](./REVERSE-ENGINEERING.md)** for the full technical spec this build follows.

![Map with filters, search & legend](docs/screenshots/phase1_map.png)
![Stats dashboard](docs/screenshots/phase1_stats.png)

## Stack

| Concern | Original | This rebuild |
|---|---|---|
| Framework | vanilla JS + jQuery (one 7k-line file) | React + Vite + TypeScript |
| Map | Mapbox GL JS v1 (paid token + tilesets) | **MapLibre GL** (open) + OpenFreeMap base style (no token) |
| State | `window.stlv` global | Zustand store |
| Data | precomputed Mapbox tilesets + Firestore | public CSV → generated GeoJSON (PMTiles planned) |
| Backend | Firebase + 10 Cloud Functions | swappable provider: **mock** (default) or Firebase |

No API keys or paid services are required to run the public explorer.

> **⚠ Security note for the Firebase path.** The mock provider filters case visibility *client-side* because its case data is fictional. In the real system the client-side role is **cosmetic** — protection comes from server-side Firebase security rules (scoping `/apiCases` reads per role) + Cloud Function `idToken` verification (see [REVERSE-ENGINEERING.md](./REVERSE-ENGINEERING.md) §4.3, §11). Any real backend implementing `DataProvider` **must enforce visibility server-side** and never send the browser a case the user isn't authorized to see. Do not port the mock's "fetch-all-then-slice" pattern to real PII.

## Quick start

```bash
npm install
npm run data      # build data artifacts from data/raw/stl_vacancy_data.csv
npm run dev       # http://localhost:5173
```

To refresh the source data from upstream: `npm run data:download && npm run data`.
Real parcel polygons: `npm run data:geometry && npm run data && npm run tiles` (needs [tippecanoe](https://github.com/felt/tippecanoe)).

New here? Start with **[CONTRIBUTING.md](./CONTRIBUTING.md)**.

## Documentation

| Doc | What |
|---|---|
| **[CONTRIBUTING.md](./CONTRIBUTING.md)** | Setup, dev loop, testing, project layout, conventions & gotchas |
| **[docs/DATA-PIPELINE.md](./docs/DATA-PIPELINE.md)** | Sources → scripts → artifacts, the slim backbone, live scoring vs. snapshots, refresh cadence |
| **[docs/DEPLOY.md](./docs/DEPLOY.md)** | GitHub Pages runbook, Release-asset seeding, base-path/gzip gotchas, resolved-failure history |
| **[docs/adr/](./docs/adr/)** | Architecture Decision Records (MapLibre, PMTiles/no-point-tiling, mock provider, ingestion, testing) |
| **[REVERSE-ENGINEERING.md](./REVERSE-ENGINEERING.md)** | The full technical spec of the original that this build follows |

## Testing & CI

Two layers, both gated on every push/PR by **`.github/workflows/ci.yml`**:

```bash
npm run typecheck   # tsc --noEmit (strict)
npm test            # Vitest: scorer (vs. real checked-in vcpp fixtures) + data pipeline
npm run test:e2e    # Playwright + axe-core: user flows, deep-links, keyboard/ARIA, a11y
```

Unit tests never touch the network; the scorer is covered by characterization tests
against real `vcpp` payloads in `src/scoring/__fixtures__/`. The e2e suite runs against a
hermetic 11-parcel fixture dataset (`e2e/fixtures/`) — no network, no real pipeline.
Accessibility target is **Lighthouse a11y 100** (mobile + desktop). See
[ADR 0005](./docs/adr/0005-testing-strategy.md).

Current condemnation status: `npm run data:condemned` re-scores parcels against live city data → `condemned.json`; on load the client patches the CSV's stale `Condemned` flag so the map/filter/list reflect *currently*-condemned parcels (~1,939) rather than the CSV snapshot (2,376). Matches the original site's live count (~1,953). Absent → the CSV flag is used.

### Independent ingestion (experimental)

`npm run data:ingest` (`scripts/ingest/`) is a research-track proof-of-concept for a *fully independent* clone: it starts from the City of St. Louis **assessor** parcel list (not the published CSV), pulls each parcel's city data from `vcpp`, runs the **same scoring engine** the app uses, and **derives** vacancy from the result — then emits its own CSV-compatible rows and reports fidelity vs the published CSV. On a 180-parcel sample it reproduced the published VacDesc bands 26/26 and vacancy within ±10 for 25/26 overlapping parcels. It samples (`LIMIT`) by default; a full run over all ~135k parcels is heavy and is **not** the default data path (the app consumes the published CSV).

## Deploy

Deployed to **GitHub Pages** via GitHub Actions (`.github/workflows/`):
- **`deploy.yml`** — on push to `main`, a **weekly cron**, or manual dispatch: rebuilds the data (`data:download` → `data` → asserts the polygon layer is non-empty → `tiles`), builds, and publishes `dist/`. tippecanoe is built once and cached.
- **`refresh-geometry.yml`** — quarterly/on-demand: re-fetches parcel geometry from the city ArcGIS service and publishes it as the `geometry` Release asset that `deploy.yml` seeds from (boundaries change slowly, so they aren't refetched every deploy).
- **`refresh-timelines.yml`** — quarterly/on-demand: pre-computes the 48-month vacancy sparklines (`npm run data:timelines`, ~13k `vcpp` requests) and publishes `timelines.json` as the `timelines` Release asset. Optional optimization — if absent, the client recomputes sparklines live in-browser.

For a GitHub *project* page (`user.github.io/<repo>/`), set the repo variable `VITE_BASE=/<repo>/`; all asset URLs are base-path-aware via `import.meta.env.BASE_URL`. A custom domain / user page needs no `VITE_BASE`.

## Sharing & embedding

- **Permalinks / saved views** — the **Copy link** button serializes the full view (filters, certainty tiers, ownership, view tab, owner panel, neighborhood, list query, selected parcel, map camera) into a short, readable URL (e.g. `?v=list&own=lra&nbrhd=The Ville`); loading that URL restores the view.
- **Embeddable widget** — append `?embed=1` for a stripped, header-less map (map + legend only) suitable for an `<iframe>`; it honors the same view params.

## Data pipeline (`scripts/`, zero-dependency Node)

- `download.mjs` — fetch the public vacancy CSV (22k parcels) to `data/raw/`.
- `fetch-geometry.mjs` — fetches real parcel polygon geometry from the City of St. Louis assessor ArcGIS service (`maps8.stlouis-mo.gov`, layer 11), joined to our parcels by `Handle`, server-simplified → `data/raw/parcel_geometry.json` (98.6% coverage).
- `build-parcels.mjs` — CSV → `public/data/parcels.json` (centroid backbone, shipped) + `data/build/parcels-poly.geojson` (polygon intermediate, **not** shipped — baked into PMTiles by `npm run tiles`) + `meta.json`.
- `build-mpo.mjs` — rebuild of the original `multi_property_processor`: owner tally → multi-property owners → fuzzy alias grouping → `public/data/mpo.json`.
- `build-stats.mjs` — aggregates for the Stats page → `public/data/stats.json`.
- `build-all.mjs` — runs all of the above (`npm run data`).

## Status

- [x] **Phase 0** — scaffold, data pipeline, MapLibre map of all parcels colored by vacancy certainty, click → side panel.
- [x] **Phase 1** — public-explorer parity: filters (type / certainty / ownership / owner-location / tax-delinquency / condemned / boarded), search (address / owner / neighborhood), MPO owner panel + map highlight, list view + CSV export, stats page, condemned overlay, neighborhood highlight, URL/hash deep-linking. _Deferred:_ real parcel **polygons + PMTiles** (needs St. Louis parcel geometry from city open data — currently rendered as centroid circles, which matches the original's low-zoom layer); Prop-NS / poverty-zone overlays and the vacancy-onset slider (fields absent from the public CSV).
- [x] **Phase 2** — vacancy scoring & timeline engine: faithful TS port of `scoreAndTimeline` + `diminish` + the open-valve loop + Forestry/LRA kickers + verbal bands (`src/scoring/`), fed by **live `vcpp.stldata.org` city data** (CORS-open, fetched directly). Side panel shows the live Vacancy/Burden breakdown (per-factor contributions) + an "Indicators Over Time" event timeline. Validated against the published CSV scores (band agreement within ±2 points; all confirmed-vacant cases exact). _Deferred:_ the 48-month historical sparkline (needs stored monthly snapshots) and the crime/CSB/valuation **percentile comparison** (needs the `misc/compareData` histograms).
- [x] **Phase 3** — auth + roles + the two-tier model: a swappable **data provider** (`src/services/` — self-contained **mock** default + a Firebase slot), a login gate ("LSEM staff only", faithful to §4.1) with demo accounts, the public↔LSEM **brand flip**, LSEM continuous-distress ramps (gray→blue single-owner / gray→red multi-owner via `Vacancy + Burden`) + LRA layers, color-coded **case markers**, a sortable **Cases table**, and a case-info block in the side panel. **All case data is clearly-labeled fictional sample data — no real LSEM PII.** _Deferred:_ most Cloud-Function enrichments (Street View / Zillow / CSB / OpenCorporates — need server secrets) and the legacy bulk case-upload tool.
- [~] **Phase 4** — data-dependent deferrals + polish.
  - [x] **4a — real parcel polygons + crossfade**: sourced parcel geometry from the City of St. Louis assessor ArcGIS service (joined by `Handle`, 98.6% coverage), rendered as polygon fills that crossfade from the circle dot-map at z≈13 (faithful to §5.3) — both public and LSEM layer sets.
  - [x] **4b — PMTiles vector tiles**: the 18 MB polygon GeoJSON is baked into `parcels-poly.pmtiles` (tippecanoe) and served via the `pmtiles://` protocol — MapLibre loads only the visible tiles by HTTP range request (~43 KB for a street-level view instead of 18 MB upfront). Run `npm run tiles` to (re)build (requires `tippecanoe`).
  - [x] **4c — historical sparkline + percentile + parity check**: the 48-month "Indicators Over Time" sparkline is reproduced by re-running the scorer via `backDate` per month (`vacancyTimeline`); a "Compared to all vacant parcels" percentile ranks Vacancy/Burden against the dataset (`src/data/percentile.ts`). Reviewed the original's catalogued latent bugs (§13) — the clean rebuild does not reproduce them. Verified visual + feature parity against the live original (`docs/screenshots/parity_live_original.png`).

### Post-rebuild roadmap

- [x] **A + C** — data independence & features beyond the original: GitHub Pages + Actions deploy/cron, pre-baked score snapshots, owner-portfolio heatmap, neighborhood trend charts, GeoJSON export, permalinks + `?embed=1` widget, and the experimental independent-ingestion track. (See the deploy + pipeline docs.)
- [x] **B — quality & confidence**: **Vitest** unit tests (scorer vs. checked-in `vcpp` fixtures + the data pipeline) and a **Playwright + axe-core** e2e suite (flows, deep-link round-trips, keyboard/ARIA), both gated in CI. Accessibility brought to **Lighthouse 100** on mobile *and* desktop (the a11y pass caught real WCAG contrast/target-size defects). Performance: the polygon PMTiles source is loaded lazily (only when zoomed in) and the points backbone was slimmed to the 25 fields the client reads (−21%); point-tiling the backbone was measured and rejected (worse at city-wide zoom — see [ADR 0002](./docs/adr/0002-pmtiles-and-no-point-tiling.md)).
- [x] **E — responsive/print**: mobile bottom-sheet panels, collapsible filter drawer, and a print stylesheet.
- [x] **D — docs**: this docset — [CONTRIBUTING](./CONTRIBUTING.md), [data-pipeline](./docs/DATA-PIPELINE.md), [deploy runbook](./docs/DEPLOY.md), and [ADRs](./docs/adr/).
- [ ] **G — real backend**: a Firebase `DataProvider` against a documented schema with **server-enforced** case visibility (see [ADR 0003](./docs/adr/0003-swappable-dataprovider-mock-default.md)), Cloud-Function enrichments, and the bulk case-upload tool.

### Demo logins (mock provider, any password)

| Email | Role | Sees |
|---|---|---|
| `staff@stlv.demo` | Staff | all cases |
| `evaluator@stlv.demo` | Evaluator | all cases |
| `firm@stlv.demo` | Ext Firm | assigned subset |
| `neighbor@stlv.demo` | Neighborhood Client | one neighborhood |

## Color encoding (faithful to the original, §5.5)

The public map encodes *model confidence a parcel is vacant*: **buildings in Reds, empty lots in Greens**, with LRA/LCRA-owned and registered-vacant parcels forced to the most-certain swatch. No numeric score is shown publicly (that is gated behind the authenticated LSEM tier).
