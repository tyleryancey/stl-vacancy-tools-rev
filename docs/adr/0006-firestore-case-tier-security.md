# 0006 — Firestore + custom claims for the case tier, with query-constrained rules

Status: accepted (spec + skeleton; no live project)

## Context

Roadmap G-i: implement the authenticated LSEM case tier's real backend behind the
`DataProvider` interface (ADR 0003), with **server-enforced** case visibility — not the
mock's client-side `.slice()`. The original used Firebase Auth + an `/apiCases` **RTDB**
tree + a `getAssignedCases` Cloud Function that trusted client-supplied `email`+`uid`
(RE §8.1/§13 flag this as weak). The backend is greenfield here, so the datastore and
enforcement mechanism are a real choice, not inherited. Constraint: the mock stays the
default, and no real project/PII is involved.

## Decision

- **Firestore, not RTDB.** Firestore security rules can constrain a *query* — a `list`
  is rejected unless the client's `where` filters guarantee every returned doc satisfies
  the rule. That expresses "a scoped role may read only its own subset" natively in the
  rules, with **no Cloud Function in the read path**. RTDB rules are per-path only, which
  is what forced the original's CF-returns-IDs + per-node dance.
- **Role via Firebase custom claims** (`auth.token.role`), set only by a trusted server
  (Admin SDK), read directly in rules — instead of the original's client-readable
  `/roles/{uid}` node (which was cosmetic). `email_verified` gates scoped roles.
- **Assignment keyed on `assigneeEmails: string[]`**, checked against the verified
  `auth.token.email`. Scoped roles must issue
  `where('assigneeEmails','array-contains', <their email>)`; anything broader is denied.
  This fixes the original's trust-the-client-identity weakness.
- **Deliverable = spec + rules + skeleton + tests, no live project.** `firestore.rules`
  (real) + emulator rules tests (CI-gated — the emulator needs Java) + a zero-dependency
  `FirebaseProvider` skeleton against a local Firestore/Auth seam + a Vitest test locking
  the client read shape. The `firebase` SDK is not added to the default install; a
  documented wiring step adapts it when someone stands up a real project.

## Consequences

- The invariant is enforced at the database layer and tested from both sides: the
  emulator rules tests prove the *server* denies bad reads; the provider unit test proves
  the *client* issues the role-differentiated shape and never "reads all then slices."
- `User` gained a `uid` field (rules key on `auth.uid` for the own-profile rule); the mock
  supplies a derived id.
- All scoped roles (Ext Firm, Neighborhood Client) share one read shape (`array-contains`
  on `assigneeEmails`); a Neighborhood Client's email is added by the server sync to every
  case in their neighborhood, so there's no second query shape or extra claim to enforce.
- The public vacancy map needs no Firestore at all — it stays static files; Firestore is
  scoped to the case tier only.
- Full detail: [docs/FIREBASE-SECURITY.md](../FIREBASE-SECURITY.md).
