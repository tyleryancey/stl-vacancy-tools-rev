# 0002 — PMTiles for polygons; points stay slim GeoJSON

Status: accepted

## Context

The map has two representations of the same ~22k vacant parcels: **centroid circles**
(low zoom) and **real polygon fills** (high zoom, crossfading at z≈13). Naively both come
from data the browser must download. The polygon GeoJSON is ~18 MB; the points GeoJSON
was ~17 MB. Shipping either in full on first load is unacceptable.

## Decision

**Polygons → PMTiles.** Bake `parcels-poly.geojson` into `parcels-poly.pmtiles`
(tippecanoe) served via the `pmtiles://` protocol. MapLibre range-requests only the
visible tiles, and the source + fill layers are registered **lazily** — not on map load,
but the first time the user zooms in past `POLY_LOAD_ZOOM` (12.7, just under the z12.9
crossfade). Below that zoom the fills are fully transparent anyway, so the ~1.2 MB of
polygon tiles never loads for the common city-wide view.

**Points → slim GeoJSON, not tiles.** The points backbone stays a single GeoJSON file,
trimmed to the 25 fields the client actually reads (`INDEX_FIELDS` / `slimParcel` in
`build-parcels.mjs`; 13 never-read fields dropped, −21%).

### Why *not* tile the points too

This was measured, not assumed. Point-tiling the backbone was built and profiled:

- At the **city-wide default zoom the entire dataset is in view**, so all point tiles
  load. The tileset range-fetched **~2.4 MB** at z11–13 vs the current **1.3 MB** gzipped
  JSON — *worse*. MVT stores each tile's strings in a per-tile dictionary; when the whole
  dataset is on screen, many small per-tile gzip streams lose to one big gzip stream that
  dedupes repeated keys/values across all 22k features.
- Separately, `parcels.json` is **not the LCP bottleneck**: it's fetched in parallel with
  the map style, there are no render-blocking resources, and LCP ≈ FCP. LCP is bound by
  map/JS init and external base-tile latency, which swings run-to-run (LCP observed 3–11s
  at an unchanged commit).

So point-tiling would regress the exact metric it targeted, for a payload that isn't the
constraint. Rejected.

## Consequences

- First-load critical path carries the slim points GeoJSON (~1.05 MB gzipped) and no
  polygon data; fills stream in on demand.
- The points backbone serves **two roles** (map source *and* the JS data layer for
  search/list/MPO/percentile/detail), which is why it must stay JS-iterable GeoJSON —
  tiles aren't queryable as a flat array in JS.
- **Adding a UI field requires updating `INDEX_FIELDS`** or the field is `undefined` at
  runtime (the `Parcel` type marks dropped fields optional to catch this).
- Performance scores are dominated by the external base map, not our payload — reason
  about payload changes with byte-level metrics, not single Lighthouse runs.
