# 0001 — MapLibre GL + OpenFreeMap instead of Mapbox

Status: accepted

## Context

The original stlvacancytools.com uses **Mapbox GL JS v1** with a paid Mapbox account
(token, hosted style, and precomputed vector tilesets under the account `godavem`). A
faithful *open* rebuild can't depend on someone's paid Mapbox account or ship a token.

## Decision

Use **MapLibre GL JS** (the open-source fork of Mapbox GL v1, same expression/style API)
with the free **OpenFreeMap** `positron` base style. No token, no paid tiles. Our own
data layers are self-hosted (GeoJSON + PMTiles, see ADR 0002).

## Consequences

- Zero API keys to run the public explorer; anyone can `npm run dev`.
- The style/paint/filter expression API is ~identical to Mapbox GL v1, so the original's
  data-driven color ramps ported almost verbatim (`src/config/colors.ts`).
- The base map is an **external dependency** we don't control. Its tile latency is the
  dominant, highly variable factor in Lighthouse performance scores (see ADR 0002).
  Self-hosting base tiles is a possible future step if perf consistency matters more.
- MapLibre is a large JS dependency and is the landing view, so it can't be code-split
  out of the initial bundle.
