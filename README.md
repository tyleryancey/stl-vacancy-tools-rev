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

## Data pipeline (`scripts/`, zero-dependency Node)

- `download.mjs` — fetch the public vacancy CSV (22k parcels) to `data/raw/`.
- `build-parcels.mjs` — CSV → `public/data/parcels.geojson` (+ `meta.json`).
- `build-mpo.mjs` — rebuild of the original `multi_property_processor`: owner tally → multi-property owners → fuzzy alias grouping → `public/data/mpo.json`.
- `build-stats.mjs` — aggregates for the Stats page → `public/data/stats.json`.
- `build-all.mjs` — runs all of the above (`npm run data`).

## Status

- [x] **Phase 0** — scaffold, data pipeline, MapLibre map of all parcels colored by vacancy certainty, click → side panel.
- [x] **Phase 1** — public-explorer parity: filters (type / certainty / ownership / owner-location / tax-delinquency / condemned / boarded), search (address / owner / neighborhood), MPO owner panel + map highlight, list view + CSV export, stats page, condemned overlay, neighborhood highlight, URL/hash deep-linking. _Deferred:_ real parcel **polygons + PMTiles** (needs St. Louis parcel geometry from city open data — currently rendered as centroid circles, which matches the original's low-zoom layer); Prop-NS / poverty-zone overlays and the vacancy-onset slider (fields absent from the public CSV).
- [x] **Phase 2** — vacancy scoring & timeline engine: faithful TS port of `scoreAndTimeline` + `diminish` + the open-valve loop + Forestry/LRA kickers + verbal bands (`src/scoring/`), fed by **live `vcpp.stldata.org` city data** (CORS-open, fetched directly). Side panel shows the live Vacancy/Burden breakdown (per-factor contributions) + an "Indicators Over Time" event timeline. Validated against the published CSV scores (band agreement within ±2 points; all confirmed-vacant cases exact). _Deferred:_ the 48-month historical sparkline (needs stored monthly snapshots) and the crime/CSB/valuation **percentile comparison** (needs the `misc/compareData` histograms).
- [x] **Phase 3** — auth + roles + the two-tier model: a swappable **data provider** (`src/services/` — self-contained **mock** default + a Firebase slot), a login gate ("LSEM staff only", faithful to §4.1) with demo accounts, the public↔LSEM **brand flip**, LSEM continuous-distress ramps (gray→blue single-owner / gray→red multi-owner via `Vacancy + Burden`) + LRA layers, color-coded **case markers**, a sortable **Cases table**, and a case-info block in the side panel. **All case data is clearly-labeled fictional sample data — no real LSEM PII.** _Deferred:_ most Cloud-Function enrichments (Street View / Zillow / CSB / OpenCorporates — need server secrets) and the legacy bulk case-upload tool.
- [ ] **Phase 4** — design-system polish, responsive/print, latent-bug fixes, parity verification vs the live site, and the data-dependent deferrals (parcel polygons + PMTiles, historical sparkline, percentile comparison).

### Demo logins (mock provider, any password)

| Email | Role | Sees |
|---|---|---|
| `staff@stlv.demo` | Staff | all cases |
| `evaluator@stlv.demo` | Evaluator | all cases |
| `firm@stlv.demo` | Ext Firm | assigned subset |
| `neighbor@stlv.demo` | Neighborhood Client | one neighborhood |

## Color encoding (faithful to the original, §5.5)

The public map encodes *model confidence a parcel is vacant*: **buildings in Reds, empty lots in Greens**, with LRA/LCRA-owned and registered-vacant parcels forced to the most-certain swatch. No numeric score is shown publicly (that is gated behind the authenticated LSEM tier).
