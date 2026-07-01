import { describe, expect, it } from "vitest";
import { createFirebaseProvider } from "./provider";
import type { FirebaseDeps, SeamQuery } from "./firestore-seam";
import type { Role, User } from "@/services/types";

// The security guarantee lives in firestore.rules (proven by firebase/rules.test.mjs on
// the emulator). These tests lock the CLIENT half of the invariant: the provider must
// issue the whole-collection read ONLY for admin roles, the array-contains-constrained
// query for verified scoped roles, and NO read at all for unverified/guest/null — never
// "read all then slice". A fake Firestore seam records what query shape was requested.

function makeDeps(): { deps: FirebaseDeps; issued: SeamQuery[] } {
  const issued: SeamQuery[] = [];
  const deps: FirebaseDeps = {
    auth: {
      async signInWithEmailAndPassword() {
        return { uid: "u1", email: "x@y.z", emailVerified: true };
      },
      async signOut() {},
      getCurrentUser() {
        return null;
      },
      async getRoleClaim() {
        return null;
      },
    },
    db: {
      collection(path) {
        return { path, constraint: null };
      },
      queryArrayContains(path, field, value) {
        return { path, constraint: { field, op: "array-contains", value } };
      },
      async getDocs(q) {
        issued.push(q);
        return []; // shape is what we assert on, not contents
      },
    },
  };
  return { deps, issued };
}

function user(role: Role, emailVerified = true): User {
  return { uid: "u1", email: "firm@example.org", displayName: "Test", role, emailVerified };
}

describe("FirebaseProvider.getCasesForUser read shape", () => {
  it("Staff / Evaluator issue an unconstrained whole-collection read", async () => {
    for (const role of ["Staff", "Evaluator"] as const) {
      const { deps, issued } = makeDeps();
      await createFirebaseProvider(deps).getCasesForUser(user(role));
      expect(issued).toHaveLength(1);
      expect(issued[0]).toEqual({ path: "apiCases", constraint: null });
    }
  });

  it("verified scoped roles issue ONLY the array-contains(assigneeEmails, own email) query", async () => {
    for (const role of ["Ext Firm", "Neighborhood Client"] as const) {
      const { deps, issued } = makeDeps();
      await createFirebaseProvider(deps).getCasesForUser(user(role));
      expect(issued).toHaveLength(1);
      expect(issued[0].constraint).toEqual({
        field: "assigneeEmails",
        op: "array-contains",
        value: "firm@example.org",
      });
      // Critically, it must NOT be the unconstrained collection read.
      expect(issued[0].constraint).not.toBeNull();
    }
  });

  it("an unverified scoped role issues NO read (rules would deny it anyway)", async () => {
    const { deps, issued } = makeDeps();
    const cases = await createFirebaseProvider(deps).getCasesForUser(user("Ext Firm", false));
    expect(cases).toEqual([]);
    expect(issued).toHaveLength(0);
  });

  it("Guest and null roles issue NO read", async () => {
    for (const role of ["Guest", null] as const) {
      const { deps, issued } = makeDeps();
      const cases = await createFirebaseProvider(deps).getCasesForUser(user(role));
      expect(cases).toEqual([]);
      expect(issued).toHaveLength(0);
    }
  });
});
