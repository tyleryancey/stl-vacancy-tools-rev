# Architecture Decision Records

Short records of the load-bearing technical decisions in this rebuild — the context,
the decision, and its consequences — so the *why* survives past the commit that made it.

| # | Decision |
|---|---|
| [0001](0001-maplibre-over-mapbox.md) | MapLibre GL + OpenFreeMap instead of Mapbox |
| [0002](0002-pmtiles-and-no-point-tiling.md) | PMTiles for polygons; points stay slim GeoJSON (point-tiling measured & rejected) |
| [0003](0003-swappable-dataprovider-mock-default.md) | Swappable `DataProvider`, mock default, server-side case visibility for real backends |
| [0004](0004-published-csv-vs-independent-ingestion.md) | Consume the published CSV by default; independent ingestion is a research track |
| [0005](0005-testing-strategy.md) | Vitest units + Playwright/axe e2e against a hermetic fixture dataset |
| [0006](0006-firestore-case-tier-security.md) | Firestore + custom claims for the case tier, query-constrained rules (server-enforced visibility) |

Format: Context / Decision / Consequences. Keep them short. Supersede rather than
rewrite when a decision changes.
