# Firebase case-tier security model (G-i)

This is the **documented schema + security-rules spec** for the authenticated LSEM
case tier — the design a real `FirebaseProvider` must implement. It is deliberately
*spec + skeleton + tests*, not a live project: the mock provider stays the default, no
real Firebase project or PII is involved, and all case data anywhere in this repo is
fictional sample data. See [ADR 0006](adr/0006-firestore-case-tier-security.md) for why
Firestore + custom claims, and [ADR 0003](adr/0003-swappable-dataprovider-mock-default.md)
for the provider abstraction.

## The one invariant that matters

> **Security rules gate reads *per-path / per-query*. They cannot filter a collection
> down to a per-user subset. So the read a role can even *issue* must differ by role —
> and the rules must reject any broader read at the database layer.**

If a role can issue a read the rules allow and *then* narrows the result client-side,
the data was already delivered to that client — the filtering is cosmetic. That is the
mock's `getCasesForUser` `.slice()` pattern, and it must **not** be ported to real PII
(the guardrail on `DataProvider.getCasesForUser` in `src/services/types.ts`).

| Role | Read it may **issue** | Enforced by |
|---|---|---|
| `Staff`, `Evaluator` | the whole `apiCases` collection | rule allows list/get for these roles |
| `Ext Firm`, `Neighborhood Client` | **only** `where('assigneeEmails','array-contains', token.email)`, and only if `email_verified` | rule requires each returned doc to contain the caller's email → an *unconstrained* list is **denied**, forcing the client to add the filter |
| `Guest`, null, unauthenticated | nothing under `apiCases` | rule denies |

Firestore evaluates a `list`/query rule against every candidate document and rejects the
whole query unless it can prove *all* returned docs satisfy the rule. So a scoped role
that tries `getDocs(collection('apiCases'))` is **denied outright** — it can succeed only
by adding the `array-contains` filter. That is how "server-enforced subset" is expressed
natively in Firestore rules, with no Cloud Function in the read path.

## Identity & role source: custom claims (not a client-readable `/roles` node)

The original read `stlv.user.role` from `/roles/{uid}` in RTDB — client-readable, so
purely cosmetic; real enforcement lived in server rules the client couldn't see. This
rebuild uses **Firebase Auth custom claims** instead:

- `request.auth.token.role` — one of `Staff | Evaluator | Ext Firm | Neighborhood Client | Guest`.
  Set **only** by a trusted server via the Admin SDK (`admin.auth().setCustomUserClaims`);
  never writable from the client, and readable directly in rules (no extra DB read).
- `request.auth.token.email_verified` — Firebase's built-in verified flag; scoped roles
  are gated on it (mirrors the original's `emailVerified` check for Ext Firm / Neighborhood
  Client).
- `request.auth.token.email` — the caller's verified email, the **only** assignment
  identity the rules trust. This closes the original's weakness (§8.1/§13): its
  `getAssignedCases?email=&uid=` trusted client-supplied `email`+`uid` query params.

Roles are assigned out-of-band by an admin tool that calls the Admin SDK — see
"Role assignment" below.

## Firestore schema

The public vacancy map needs **no** Firestore — it's static files (`public/data/*`,
[DATA-PIPELINE.md](DATA-PIPELINE.md)). Firestore exists only for the case tier.

### `apiCases/{caseId}`

One document per case. Mirrors the original's `/apiCases` RTDB tree (RE §8.2), with one
added field that makes scoped access enforceable:

| Field | Type | Notes |
|---|---|---|
| `caseId`, `handle`, `parcelId` | string | joins to a parcel by `handle` |
| `address`, `neighborhood`, `lat`, `lng` | string / number | |
| `legalCode` | number | drives marker color |
| `caseTitle`, `assignment`, `openDate`, `disposition`, `partyName`, `status`, `court`, `docket` | string | the sensitive PII fields |
| **`assigneeEmails`** | `string[]` | **the access key** — every email allowed to see this case. Written by the server sync (see below), never by the client. `Neighborhood Client` scoping is expressed by the sync adding that client's email to every case in their neighborhood, so *all* scoped roles share one read shape. |

### `users/{uid}` (optional profile store)

Self-service profile only, mirroring the original's `/users` auto-provision. A user may
read/write **only their own** doc (`request.auth.uid == uid`). It carries **no role** —
role is a custom claim, not a client-writable field. Nothing security-relevant lives here.

## The rules

See [`firestore.rules`](../firestore.rules). Shape:

```
match /apiCases/{caseId} {
  allow read: if isSignedIn() && (
    isAdminRole()                       // Staff / Evaluator → whole collection
    || (isVerifiedScopedRole()          // Ext Firm / Neighborhood Client, verified…
        && caller() in resource.data.assigneeEmails)   // …and only their own cases
  );
  allow write: if false;                // clients never write cases (server sync only)
}
match /users/{uid} {
  allow read, write: if isSignedIn() && request.auth.uid == uid;  // own profile only
}
match /{document=**} { allow read, write: if false; }             // deny by default
```

`isAdminRole()` / `isVerifiedScopedRole()` read `request.auth.token.role` +
`request.auth.token.email_verified`; `caller()` is `request.auth.token.email`. Because the
scoped branch references `resource.data.assigneeEmails`, an unconstrained `list` is
rejected — the client must issue the `array-contains` query.

## The client read shape (what `FirebaseProvider` must do)

`src/services/firebase/provider.ts` (skeleton) implements the differentiated shape, and
`provider.test.ts` locks it against a fake Firestore seam:

```ts
async getCasesForUser(user) {
  if (user.role === "Staff" || user.role === "Evaluator") {
    return read(collection("apiCases"));                       // rules allow the whole set
  }
  if (user.role === "Ext Firm" || user.role === "Neighborhood Client") {
    if (!user.emailVerified) return [];                        // rules would deny anyway
    return read(query(collection("apiCases"),
                      where("assigneeEmails", "array-contains", user.email)));
  }
  return [];   // Guest / null → issue NO read at all
}
```

It **never** reads the collection and slices for a scoped role. The role comes from the
verified token's custom claims (`getIdTokenResult().claims.role`), not from any
client-writable location.

## Role assignment (out-of-band, server-only)

Roles are **not** self-service. An admin process (a Cloud Function callable restricted to
existing Staff, or a CLI run with a service account) sets the claim:

```js
await admin.auth().setCustomUserClaims(uid, { role: "Ext Firm" });
// the user must refresh their ID token (re-login or getIdToken(true)) to pick it up
```

Assignment of *which cases* a scoped user sees is data, not identity: the server sync that
populates `apiCases` writes each case's `assigneeEmails`. Neither the role claim nor
`assigneeEmails` is ever client-writable.

## Verification

- **Rules (server enforcement)** — [`firebase/rules.test.mjs`](../firebase/rules.test.mjs)
  runs against the Firestore emulator (`@firebase/rules-unit-testing`) and asserts the
  invariant: Staff lists all; a scoped role is **denied** an unconstrained list but
  **allowed** the `array-contains` query and only sees its own cases; unverified scoped,
  Guest, and unauthenticated are denied; no client can write `apiCases` or another user's
  profile. The emulator needs Java, so this suite is **CI-gated** (`.github/workflows/ci.yml`
  `rules` job); run locally with `npm run test:rules` if you have the emulator.
- **Client read shape** — [`src/services/firebase/provider.test.ts`](../src/services/firebase/provider.test.ts)
  runs in plain Vitest (no emulator) and asserts the provider issues the constrained query
  for scoped roles, the full read only for admin roles, and **no read** for Guest/null.

## Wiring a real project (intentionally not committed)

Kept out of the default install so no heavy dependency enters the tree for a path with no
live backend. To actually run it:

1. `npm i firebase` and create a project (Auth email/password + Firestore).
2. Deploy `firestore.rules` (`firebase deploy --only firestore:rules`).
3. Provide config via env and construct the SDK handles (`getAuth`, `getFirestore`), then
   pass them to `createFirebaseProvider({ auth, db })` — the skeleton's factory takes the
   minimal surface it needs (see `firestore-seam.ts`), so only that wiring file imports the
   real SDK.
4. Select it at runtime with `VITE_DATA_PROVIDER=firebase`. Absent → the mock (default).
5. Stand up the Admin-SDK role-assignment tool and the `apiCases` sync (writes
   `assigneeEmails`). **Load only fictional sample data** unless this is a real LSEM
   deployment with the proper data agreements.
