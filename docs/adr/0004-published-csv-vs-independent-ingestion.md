# 0004 — Consume the published CSV by default; independent ingestion is a research track

Status: accepted

## Context

The vacancy dataset the app renders comes from `publicgoodness.org/stlv/csv`. A *fully
independent* clone would regenerate that dataset from primary city sources instead of
depending on the collaborative's published file. But "which parcels are vacant" is not a
source field — it's **derived by the scoring engine**. Reproducing the published dataset
means running the scorer over all ~135k city parcels and keeping those that score vacant,
which is heavy (per-parcel `vcpp` fetches) and carries fidelity risk.

## Decision

**Default data path = consume the published CSV.** Provide independent ingestion as a
clearly-marked **experimental research track** (`scripts/ingest/`, `npm run data:ingest`):
start from the assessor parcel list, pull each parcel's `vcpp` data, run the same scoring
engine the app uses, derive vacancy, emit CSV-compatible rows, and report fidelity vs the
published CSV. Keep it non-default until fidelity is proven at scale.

## Consequences

- The shipped site stays simple and fast to rebuild (one CSV download + transforms).
- Ingestion is validated on a sample (180 parcels reproduced the published bands 26/26)
  but a full ~135k-parcel run is not wired into deploys — it would hammer a city server
  and needs rate-limiting/caching before it could be a real cadence.
- Because vacancy is scorer-derived, the ingestion track and the live in-browser scoring
  share `src/scoring/` — a single source of truth for the model. Any scorer change is
  covered by the characterization tests (ADR 0005) so ingestion and the app stay aligned.
