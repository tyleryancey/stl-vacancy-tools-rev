// The minimal slice of the Firebase Auth + Firestore APIs the FirebaseProvider skeleton
// uses, declared locally so the skeleton compiles and is unit-testable with NO `firebase`
// dependency in the tree (see docs/FIREBASE-SECURITY.md → "Wiring a real project"). A
// real wiring file installs `firebase`, then adapts `getAuth()`/`getFirestore()` to these
// interfaces — that adapter is the only place the real SDK is imported.
import type { Role } from "@/services/types";

export interface SeamAuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

export interface SeamAuth {
  signInWithEmailAndPassword(email: string, password: string): Promise<SeamAuthUser>;
  signOut(): Promise<void>;
  getCurrentUser(): SeamAuthUser | null;
  // The `role` custom claim from the current user's *verified* ID token. This is the
  // authorization source of truth — it is NOT read from any client-writable location.
  getRoleClaim(): Promise<Role>;
}

// Opaque query handle. Two ways to obtain one, and that choice IS the security-relevant
// read shape: the whole collection (admin roles) vs. an array-contains-constrained query
// (scoped roles). The rules reject an unconstrained list for scoped roles, so a correct
// client must never build the collection handle for them.
export interface SeamQuery {
  readonly path: string;
  readonly constraint: { field: string; op: "array-contains"; value: string } | null;
}

export interface SeamDb {
  collection(path: string): SeamQuery;
  queryArrayContains(path: string, field: string, value: string): SeamQuery;
  getDocs(q: SeamQuery): Promise<Record<string, unknown>[]>;
}

export interface FirebaseDeps {
  auth: SeamAuth;
  db: SeamDb;
}
