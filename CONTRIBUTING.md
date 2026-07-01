# Contributing

This is an open rebuild of the STL Vacancy Explorer. This guide covers local setup,
the dev loop, testing, and the project's layout and conventions. For *why* the
architecture is the way it is, see the ADRs in [`docs/adr/`](docs/adr/); for the
data pipeline see [`docs/DATA-PIPELINE.md`](docs/DATA-PIPELINE.md); for deploys see
[`docs/DEPLOY.md`](docs/DEPLOY.md).

## Prerequisites

- **Node 20+** (CI runs Node 22; the data scripts use `node:` built-ins and modern ESM).
- **[tippecanoe](https://github.com/felt/tippecanoe)** — only needed to (re)bake the
  polygon vector tiles (`npm run tiles`). The app runs fine without it if
  `public/data/parcels-poly.pmtiles` already exists.
- No API keys. The public explorer uses the free OpenFreeMap base style and the
  open `vcpp.stldata.org` city-data endpoint (CORS-open). The default backend is a
  self-contained mock — no Firebase project required.

## First run

```bash
npm install
npm run data:download   # fetch the public vacancy CSV → data/raw/  (once)
npm run data            # CSV → public/data/*.json  (backbone, mpo, stats, meta)
npm run dev             # http://localhost:5173
```

`data/raw/` and `public/data/*` are gitignored — they're regenerated artifacts, not
source. If the map loads but shows no polygon fills when you zoom in, you haven't run
`npm run data:geometry` + `npm run tiles` yet (the circle dot-map works without them).

## Dev loop

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest unit tests (scorer + data pipeline), one shot |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright e2e + axe a11y, against a hermetic fixture dataset |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve the production build locally |

Before opening a PR, the bar CI enforces is: **`npm run typecheck && npm test && npm run test:e2e`** all green.

## Testing

Two layers, both required in CI (`.github/workflows/ci.yml`):

- **Unit (Vitest)** — pure logic, no network. The scoring engine is covered by
  *characterization tests* against four real `vcpp` payloads checked in under
  `src/scoring/__fixtures__/` (captured once, `now` pinned for determinism — see the
  fixture README). The zero-dependency data pipeline (`csv.mjs`, `mapping.mjs`,
  `build-mpo.mjs`) has its own unit tests colocated as `*.test.mjs`.
- **E2E (Playwright + `@axe-core/playwright`)** — real browser flows (filter, search,
  MPO panel, login → cases, the deep-link round-trips, keyboard/ARIA behavior) plus
  automated accessibility checks on the List/Cases/header/search/dialog surfaces.

  The e2e suite runs against a **small hermetic fixture dataset** (11 real St. Louis
  parcels in `e2e/fixtures/sample.csv`, expanded by `e2e/fixtures/build.mjs` into
  `e2e/fixtures/public/data/*`) served via a Vite `publicDir` override
  (`VITE_PUBLIC_DIR`). It never touches the real data pipeline or the network —
  `vcpp.stldata.org` and the polygon PMTiles request are stubbed in `e2e/helpers.ts`.
  The MapLibre canvas is invisible to axe and to Playwright locators, so the
  accessible data path (List/Cases views) is what the a11y tests assert on; map
  *rendering* is verified manually with Playwright `evaluate` + Lighthouse (see below).

### Accessibility & performance checks

Accessibility is gated automatically (axe, in the e2e job) and target is **Lighthouse
a11y 100** on both mobile and desktop. To reproduce a Lighthouse run locally against a
production build with real data:

```bash
npm run build && npm run preview   # or audit the live site
CHROME_PATH="/path/to/Chrome" npx lighthouse http://localhost:4173/ \
  --preset=desktop --only-categories=accessibility --output=json --quiet
```

Note: the **performance** score is dominated by external OpenFreeMap base-tile latency
and swings run-to-run (LCP has been observed from 3s to 11s at an *unchanged* commit).
Treat single perf runs with suspicion — take the median of ≥5, and prefer reliable
byte-level metrics (transfer size, `total-byte-weight`) when reasoning about payload
changes. See [ADR 0002](docs/adr/0002-pmtiles-and-no-point-tiling.md).

## Project layout

```
src/
  main.tsx, App.tsx        entry + top-level view switch (map / list / stats / cases, ?embed)
  state/store.ts           Zustand store — the modern equivalent of the original's window.stlv
  config/                  constants.ts (zooms, source ids, asset() base-path helper), colors.ts (paint ramps)
  data/                    parcels.ts (loads + caches the backbone/mpo), percentile.ts, timelines.ts
  map/
    MapView.tsx            map lifecycle; adds circle layers eagerly, polygon fills lazily on zoom
    applyFilters.ts        filter UI state → MapLibre filter expressions
    layers/                publicLayers, lsemLayers, highlights, caseMarkers
  scoring/                 the ported vacancy scoring engine (pure, framework-free) + __fixtures__/
  components/              FilterPanel, SearchBar, MpoPanel, ListView, StatsPage, CasesView,
                           SidePanel, ScorePanel, Legend, LoginModal, ViewNav
  services/                DataProvider abstraction — mock/ (default) + a Firebase slot; types.ts
  lib/                     searchIndex, select, deeplink, exportData, format
scripts/                   zero-dependency Node data pipeline (see docs/DATA-PIPELINE.md)
e2e/                       Playwright specs + fixtures/ (hermetic dataset builder)
docs/adr/                  architecture decision records
```

The store is the source of truth; components are mostly presentational and subscribe to
slices. The map reads the same store and re-renders via effects in `MapView.tsx`.

## Conventions & gotchas

- **TypeScript is strict** and `noUnusedLocals`/`noUnusedParameters` are on. Test files
  are excluded from the app `tsconfig` (`src/**/*.test.ts`) and typechecked by Vitest.
- **Match the surrounding style.** Comments explain *why* / cite the reverse-engineering
  spec section (`§n`), not *what*. Keep that density.
- **Adding a parcel field to the UI is a two-step change.** The shipped backbone
  (`public/data/parcels.json`) carries only the fields listed in `INDEX_FIELDS` in
  `scripts/build-parcels.mjs` — 13 never-read fields are dropped to save bytes. If you
  write a component that reads a new `parcel.Foo`, you must also add `"Foo"` to
  `INDEX_FIELDS` (and make it required in the `Parcel` type) or it will be `undefined`
  at runtime even though `mapping.mjs` produces it. See
  [ADR 0002](docs/adr/0002-pmtiles-and-no-point-tiling.md) and `src/types/parcel.ts`.
- **Never commit real generated data or real PII.** `data/raw/`, `data/build/`, and
  `public/data/*` are gitignored. All LSEM case data in this repo is fictional sample
  data — see the security note below.
- **Map interactions can't be caught by the test suite** (canvas is opaque to axe and
  Playwright). Verify circle/fill rendering, highlights, and hover manually with
  Playwright `evaluate` (`window.stlvMap.querySourceFeatures(...)`, `getPaintProperty`,
  rendered-feature counts) before shipping map-layer changes.

## Security: server-side case visibility (read before touching the Firebase path)

The mock provider filters case visibility **client-side** because its data is fictional.
In any real backend, the client-side role is **cosmetic** — real protection must be
server-side (Firebase security rules scoping `/apiCases` reads per role + Cloud Function
`idToken` verification; see `REVERSE-ENGINEERING.md` §4.3/§11 and the guardrail comment
on `DataProvider.getCasesForUser` in `src/services/types.ts`). A real provider **must
enforce visibility on the server** and never deliver a case the user isn't authorized to
see. Do **not** port the mock's "fetch all, then `.slice()`" pattern to real legal-aid
PII. This is the single most important constraint in the codebase.

## Commit / PR conventions

- Branch off `main`; keep commits focused and the working tree green (`typecheck`,
  `test`, `test:e2e`).
- Commit messages: a concise imperative subject, then a body explaining the *why* and
  what was verified. This project tags AI-assisted commits with a `Co-Authored-By:`
  trailer.
- Pushing to `main` triggers a live deploy (`docs/DEPLOY.md`) — make sure CI is green.
