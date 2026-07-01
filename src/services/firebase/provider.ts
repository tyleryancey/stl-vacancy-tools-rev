// FirebaseProvider skeleton (roadmap G-i). Implements the DataProvider contract against
// the minimal Firestore/Auth seam (firestore-seam.ts) so it compiles and is unit-tested
// with no `firebase` dependency. The SECURITY-critical part is getCasesForUser's
// role-differentiated read shape — see docs/FIREBASE-SECURITY.md and firestore.rules.
//
// This is a documented skeleton, not a live integration: the mock provider remains the
// default and no real Firebase project/PII is involved. To run it for real, install
// `firebase`, adapt the SDK to FirebaseDeps, and select via VITE_DATA_PROVIDER=firebase.
import type { DataProvider, User, CaseRecord } from "@/services/types";
import type { FirebaseDeps } from "./firestore-seam";

const CASES = "apiCases";

function displayNameFrom(email: string): string {
  return email.split("@")[0] || email;
}

function toCaseRecord(d: Record<string, unknown>): CaseRecord {
  // Firestore docs are untyped; coerce defensively. A real deployment would validate.
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  const n = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : 0);
  return {
    caseId: s("caseId"),
    handle: s("handle"),
    parcelId: s("parcelId"),
    address: s("address"),
    lat: n("lat"),
    lng: n("lng"),
    neighborhood: s("neighborhood"),
    legalCode: n("legalCode"),
    caseTitle: s("caseTitle"),
    assignment: s("assignment"),
    openDate: s("openDate"),
    disposition: s("disposition"),
    partyName: s("partyName"),
    status: s("status"),
    court: s("court"),
    docket: s("docket"),
  };
}

export function createFirebaseProvider(deps: FirebaseDeps): DataProvider {
  const { auth, db } = deps;
  let cached: User | null = null;

  async function buildUser(): Promise<User | null> {
    const au = auth.getCurrentUser();
    if (!au || !au.email) return null;
    const role = await auth.getRoleClaim(); // from the verified token, not client state
    return {
      uid: au.uid,
      email: au.email,
      displayName: displayNameFrom(au.email),
      role,
      emailVerified: au.emailVerified,
    };
  }

  return {
    async signIn(email, password) {
      await auth.signInWithEmailAndPassword(email, password);
      const user = await buildUser();
      if (!user) throw new Error("Sign-in succeeded but no current user is available");
      cached = user;
      return user;
    },

    async signOut() {
      await auth.signOut();
      cached = null;
    },

    // NB: in-memory only. A production impl rehydrates via onAuthStateChanged on reload
    // and refreshes the role claim; the interface here is synchronous like the mock.
    currentUser() {
      return cached;
    },

    async getCasesForUser(user) {
      // The read shape differs by role, and the rules enforce it server-side. We must
      // NEVER read the whole collection and slice for a scoped role (that would ship the
      // full case set to the client) — the guardrail on this method in types.ts.
      if (user.role === "Staff" || user.role === "Evaluator") {
        // Admin roles: the rules permit the whole collection.
        const docs = await db.getDocs(db.collection(CASES));
        return docs.map(toCaseRecord);
      }
      if (user.role === "Ext Firm" || user.role === "Neighborhood Client") {
        // Scoped roles: only cases listing this verified caller. The rules reject any
        // broader (unconstrained) list, so this constrained query is the only one that
        // can succeed. Unverified → the rules deny it anyway; don't even issue the read.
        if (!user.emailVerified) return [];
        const q = db.queryArrayContains(CASES, "assigneeEmails", user.email);
        const docs = await db.getDocs(q);
        return docs.map(toCaseRecord);
      }
      // Guest / null: no case-data path at all — issue no read.
      return [];
    },
  };
}
