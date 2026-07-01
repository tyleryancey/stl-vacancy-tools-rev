# Deploy runbook

The site is a static build published to **GitHub Pages** via GitHub Actions. Live:
<https://tyleryancey.github.io/stl-vacancy-tools-rev/>.

## How it deploys

Pushing to `main` triggers two workflows:

- **`ci.yml`** — `typecheck` + Vitest (`test` job) and Playwright + axe (`e2e` job).
  Gate for correctness; does not deploy.
- **`deploy.yml`** — rebuilds data and publishes `dist/`. Triggers: push to `main`, a
  **weekly cron** (`0 7 * * 1`), and manual `workflow_dispatch`.

`deploy.yml` steps, in order:

1. `npm ci`
2. Restore/build **tippecanoe** (the maintained `felt/tippecanoe` fork, pinned to a
   tag; `mapbox/tippecanoe` is archived). The compiled binary is `actions/cache`d by
   version so it's built once.
3. `npm run data:download` — **must run before geometry** (the geometry step reads the
   CSV to know which parcels to keep).
4. **Seed `parcel_geometry.json`** from the `geometry` Release asset (fast path); on the
   first ever run, falls back to `npm run data:geometry` against the city ArcGIS service.
5. `npm run data` → `npm run data:assert` (fails the build if the polygon layer is
   empty — see the geometry footgun below) → `npm run tiles`.
6. **Seed optional caches** — download `timelines.json` + `condemned.json` from the
   `timelines` Release asset if present (never fails the build; the client degrades to a
   live path if absent).
7. `npm run build` (with `VITE_BASE` from the repo variable) → `upload-pages-artifact` →
   `deploy-pages`.

Only `GITHUB_TOKEN` is used. No generated artifacts are committed.

## Release-asset seeding (why deploys are fast)

Two things are expensive and change slowly, so they're **not** recomputed per deploy —
they live as GitHub Release assets that `deploy.yml` downloads:

- **`geometry` release** → `parcel_geometry.json` (parcel boundaries). Refreshed by
  **`refresh-geometry.yml`** (quarterly / on-demand).
- **`timelines` release** → `timelines.json` + `condemned.json` (48-month sparklines and
  re-scored condemnation status; ~13k `vcpp` requests to regenerate). Refreshed by
  **`refresh-timelines.yml`** (quarterly / on-demand).

To refresh one, run its workflow via `workflow_dispatch`; it regenerates the artifact and
updates the Release asset, and the next `deploy.yml` run seeds from it.

## First-time / new-fork setup

1. Enable **Pages → Source: GitHub Actions**.
2. For a **project** page (`user.github.io/<repo>/`), set repo **variable**
   `VITE_BASE=/<repo>/`. All asset URLs are base-path-aware via
   `import.meta.env.BASE_URL` (`asset()` in `src/config/constants.ts`), and the
   `pmtiles://` URL is built from `window.location.origin` + the based path. A custom
   domain or user/org page needs no `VITE_BASE`.
3. The first `deploy.yml` run has no `geometry` release to seed from, so it fetches
   geometry live (slower, one time). Optionally run `refresh-geometry.yml` first to
   populate the release.
4. `gh` CLI needs `repo` + `workflow` scopes to push workflow changes.

## Base path & compression (load-bearing gotchas)

- **Base path.** Under a project sub-path, any absolute `/data/...` or
  `pmtiles://.../data/...` URL breaks. Everything goes through `asset()` /
  `import.meta.env.BASE_URL` — keep it that way. Don't hardcode leading-slash asset paths.
- **Compression.** GitHub Pages serves `*.geojson` as uncompressed `application/octet-stream`,
  but gzips `*.json`. The shipped backbone is therefore `.json`, **not** `.geojson`
  (a 17 MB file would ship uncompressed otherwise). The polygon layer sidesteps this
  entirely by being PMTiles (binary, range-requested).

## The geometry footgun

`build-parcels.mjs` reads `data/raw/parcel_geometry.json` only if it exists and silently
falls back to `{}` — which yields an empty polygon layer, then empty PMTiles, and the
fills silently vanish. `deploy.yml` guards this two ways: it **seeds geometry durably**
(Release asset) and runs **`npm run data:assert`**, which fails the build if
`parcels-poly.geojson` has zero features. Don't remove the assert.

## History of resolved deploy failures (context for future debugging)

- **Push protection** flagged the *original* site's public API keys quoted in
  `REVERSE-ENGINEERING.md`; they were redacted across history with `git-filter-repo`
  (placeholders). Don't re-introduce third-party keys, even the original's public ones.
- **`workflow` OAuth scope** was needed to push the Actions workflows.
- **HTTP 415 on `data:download`** — `publicgoodness.org` rejects bare user agents;
  `download.mjs` sends a browser-like `User-Agent` + `Accept` header (and retries with
  backoff). Don't strip those headers.
- **Ordering** — `data:download` must precede the geometry step (geometry reads the CSV).

## Verifying a deploy

1. `gh run watch <deploy-run-id> --exit-status`.
2. Confirm the new artifact is actually served (Pages CDN can lag ~30–60s): fetch
   `data/parcels.json` and sanity-check it (e.g. field count == 25 after the B-iii slim).
3. Spot-check the live site: parcels render, PMTiles return HTTP `206` (range) when you
   zoom in, a11y = 100.
4. **Performance scores are noisy** — dominated by external OpenFreeMap base-tile
   latency (LCP has swung 3–11s at an unchanged commit). Take the median of ≥5 runs and
   trust byte-level metrics over a single score. See
   [ADR 0002](adr/0002-pmtiles-and-no-point-tiling.md).

## Rollback

`deploy.yml` builds from the pushed commit, so rolling back is a git operation: revert
the offending commit (or `git revert`) and push to `main` — the next deploy publishes the
reverted build. There's no separate artifact store to prune.
