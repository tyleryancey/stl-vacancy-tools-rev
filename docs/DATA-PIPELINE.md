# Data pipeline

Everything the client renders is generated from public data by a zero-dependency
Node pipeline in `scripts/`. No database, no build-time secrets. This doc maps the
sources → scripts → artifacts and the refresh cadence.

## Sources (all public)

| Source | What | Used by |
|---|---|---|
| `publicgoodness.org/stlv/csv/stl_vacancy_data.csv` | The published vacancy dataset — ~22k vacant parcels, 36 columns (owner, location, vacancy category, burden, tax years delinquent, condemned/boarded flags, forestry). | the default data path |
| `maps8.stlouis-mo.gov/.../Assessor_Public_Parcels/MapServer/11` | City assessor parcel polygons (ArcGIS, ~135k parcels), joined to our parcels by `Handle`. | `data:geometry` |
| `vcpp.stldata.org/parcel_data/{ParcelId}` | Per-parcel raw city records (permits, tax history, inspections, board-ups, CSB 311, forestry, vacant-building registry). CORS-open — the browser fetches it directly for live scoring. | live scoring, `data:timelines`, `data:condemned`, `data:ingest` |

## Scripts → artifacts

```
data:download   download.mjs        →  data/raw/stl_vacancy_data.csv       (gitignored)
data:geometry   fetch-geometry.mjs  →  data/raw/parcel_geometry.json       (gitignored; keyed by Handle)
data            build-all.mjs       →  runs the three builders below:
  · build-parcels.mjs  →  public/data/parcels.json   (slim points backbone, SHIPPED)
                          data/build/parcels-poly.geojson  (polygon intermediate, NOT shipped)
                          public/data/meta.json
  · build-mpo.mjs      →  public/data/mpo.json        (multi-property-owner groups)
  · build-stats.mjs    →  public/data/stats.json      (Stats-page aggregates)
tiles           tippecanoe          →  public/data/parcels-poly.pmtiles    (SHIPPED vector tiles)
data:condemned  build-condemned.mjs →  public/data/condemned.json          (optional; re-scored status)
data:timelines  build-timelines.mjs →  public/data/timelines.json          (optional; 48-mo sparklines)
data:ingest     ingest/ingest.mjs   →  data/build/ingested.csv             (experimental research track)
```

`data/raw/`, `data/build/`, and `public/data/*` are all gitignored — regenerate, don't commit.
The `.mjs` scorer-driven scripts (`build-timelines`, `build-condemned`, `ingest`) are esbuild-
bundled first (`--bundle --platform=node`) so they can import the TypeScript scoring modules in Node.

## The two roles of the points backbone (and why it's slim)

`public/data/parcels.json` is a GeoJSON `FeatureCollection` of parcel centroids that
serves **two** jobs at once:

1. **The map's circle layer** — MapLibre renders + filters the dots from this source.
2. **The JS data layer** — search, list, MPO panel, percentile bars, deep-link
   selection, case-marker joins, and the side-panel detail all iterate it in JS
   (`getParcels()` in `src/data/parcels.ts`).

Because it's on the first-load critical path, `build-parcels.mjs` ships **only the 25
fields any client code actually reads** (`INDEX_FIELDS` / `slimParcel`). Thirteen fields
that `mapping.mjs` produces but nothing reads — `StAddrNum, StNameFull, Zip, CensTract20,
OwnerZip, BldgAge, Vacancy2, VacDesc2, CSBVacancy, CSBNuisance, BldgsRes, BldgsCom,
ResUnits` — are dropped, trimming the backbone ~21% (1.33 → 1.05 MB gzipped). The
`Parcel` type marks those optional so any future read is flagged at compile time.

> **Adding a UI field?** Add its name to `INDEX_FIELDS` in `build-parcels.mjs` (and make
> it required in `src/types/parcel.ts`), or it will be `undefined` at runtime.

The **polygon** layer keeps the full property set — it's lazy-loaded via PMTiles range
requests (only when the user zooms in past z≈12.7), so its size isn't on the critical
path. See [ADR 0002](adr/0002-pmtiles-and-no-point-tiling.md) for why the *points* are
plain GeoJSON and not tiled.

## Live scoring vs. precomputed snapshots

The analytical heart — the vacancy/burden/nuisance/tax score and the event timeline —
is **recomputed in the browser** from `vcpp` city data when a parcel's side panel opens
(`src/scoring/`, a faithful TS port of the original engine). No score is precomputed into
the backbone; the CSV's `VacancyCat` is only the coarse band.

Two optional artifacts move expensive work server-side; both degrade gracefully to a
live path if absent:

- **`timelines.json`** (`data:timelines`) — pre-baked 48-month vacancy sparklines
  (running the scorer 48× per parcel via `backDate`). Absent → the client recomputes the
  sparkline live. ~13k `vcpp` requests, so it's a quarterly/manual job, not per-deploy.
- **`condemned.json`** (`data:condemned`) — the CSV's `Condemned` flag is a stale
  snapshot (2,376); this re-scores parcels against *current* city data (~1,939, matching
  the live original's ~1,953). On load the client patches the flag so the
  overlay/filter/list reflect current status. Absent → the CSV flag is used.

## Independent ingestion (experimental)

`data:ingest` (`scripts/ingest/`) is a research-track proof that the dataset can be
regenerated **without** the published CSV: start from the assessor parcel list, pull each
parcel's `vcpp` data, run the same scoring engine, and *derive* vacancy from the result.
On a 180-parcel sample it reproduced the published bands 26/26. It is **not** the default
data path (a full ~135k-parcel run is heavy) and consuming the published CSV remains the
shipped default. See [ADR 0004](adr/0004-published-csv-vs-independent-ingestion.md).

## Refresh cadence

| Artifact | Cadence | Mechanism |
|---|---|---|
| CSV → backbone/mpo/stats/tiles | every deploy (push, weekly cron, manual) | `deploy.yml` |
| `parcel_geometry.json` | quarterly / on-demand | `refresh-geometry.yml` → `geometry` Release asset, seeded by `deploy.yml` |
| `timelines.json`, `condemned.json` | quarterly / on-demand | `refresh-timelines.yml` → `timelines` Release asset, seeded by `deploy.yml` |

See [`DEPLOY.md`](DEPLOY.md) for how the deploy seeds these Release assets so it doesn't
re-fetch geometry or re-score 13k parcels on every push.
