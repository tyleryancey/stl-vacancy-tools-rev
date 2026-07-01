# 0005 — Vitest units + Playwright/axe e2e against a hermetic fixture dataset

Status: accepted

## Context

The two riskiest, least-visible parts of the app are (1) the ported scoring engine —
subtle, and validated only ad-hoc against the published CSV — and (2) the URL deep-link
round-trips, which had real bugs. The map itself is a MapLibre **canvas**, opaque to both
axe and DOM-based test runners, so it can't be asserted on directly. Tests must be fast
and must not depend on the network (`vcpp`, base tiles) or the 17 MB real dataset.

## Decision

Two layers, both gated in CI (`.github/workflows/ci.yml`):

- **Vitest unit tests** — the scorer (`diminish`, verbal bands, `scoreAndTimeline`,
  `vacancyTimeline`) as **characterization tests** against four real `vcpp` payloads
  checked in under `src/scoring/__fixtures__/`, with `now` pinned for determinism; plus
  the zero-dependency pipeline (`csv.mjs`, `mapping.mjs`, `build-mpo.mjs`). Never hits the
  network.
- **Playwright + `@axe-core/playwright` e2e** — the real user flows (filter/search/MPO/
  login→cases, the four deep-link round-trips, keyboard/ARIA behavior) and automated a11y
  checks. Runs against a **hermetic fixture dataset** — 11 real parcels in
  `e2e/fixtures/sample.csv`, expanded by `build.mjs` (reusing the production `slimParcel`)
  into a fixture `public/data/` served via a Vite `publicDir` override. `vcpp` and the
  polygon PMTiles request are stubbed.

## Consequences

- CI is fast and fully offline; the scorer is protected against regressions across future
  refactors and the ingestion track (ADR 0004).
- The **canvas is untestable** by this suite: a11y tests assert on the accessible data
  path (List/Cases views), and map rendering/highlights/hover are verified **manually**
  with Playwright `evaluate` (`querySourceFeatures`, `getPaintProperty`, rendered-feature
  counts) + Lighthouse. Map-layer changes need that manual check before shipping.
- The fixture builder shares `slimParcel` with production, so the fixtures mirror the real
  backbone's field set — a component that reads a dropped field fails the same way in
  tests as in prod.
- Accessibility target is Lighthouse a11y **100** (mobile + desktop); the e2e a11y checks
  caught real WCAG contrast/target-size defects the visual design pass missed.
