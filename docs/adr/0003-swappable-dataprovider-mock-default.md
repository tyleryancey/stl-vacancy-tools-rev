# 0003 — Swappable `DataProvider`, mock default, server-side case visibility

Status: accepted

## Context

The original has two tiers: a public vacancy map and an **authenticated LSEM**
(Legal Services of Eastern Missouri) case-management tier backed by Firebase Auth +
Firestore/RTDB + ~10 Cloud Functions. The real case data is legal-aid **PII** and its
backend is not accessible (and must not be probed). But the rebuild still needs to
demonstrate the auth/roles/two-tier model runnably, with no external services required.

## Decision

Define a backend-agnostic **`DataProvider`** interface (`src/services/types.ts`): auth
(`signIn`/`signOut`/`currentUser`) + `getCasesForUser`. Ship a self-contained **mock**
implementation as the default (demo accounts, fictional sample cases joined to real
parcels). A **Firebase** implementation can be selected via `VITE_DATA_PROVIDER=firebase`
against a documented schema + security-rules spec. All case data in the repo is clearly
labeled fictional.

## Consequences

- The app runs with no Firebase project and no Java emulators — the mock is the default.
- **Security guardrail (the most important constraint in the codebase):** the mock
  filters case visibility **client-side** *only because its data is fictional*. In the
  original, the client-side role is **cosmetic** — real protection is server-side
  (Firebase security rules scoping `/apiCases` reads per role + Cloud Function `idToken`
  verification). A real provider **must enforce visibility on the server** and never send
  the browser a case the user isn't authorized to see. The "fetch all, then `.slice()`"
  pattern in the mock must **not** be ported to real PII. This is documented on
  `DataProvider.getCasesForUser` and in `CONTRIBUTING.md`.
- Roles (`Staff`/`Evaluator` see all cases; others see a subset) live in `types.ts`
  (`LSEM_ROLES`, `ALL_CASES_ROLES`) so a real backend and the mock agree on the model.
