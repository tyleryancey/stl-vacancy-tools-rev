// Self-contained mock backend: demo accounts + fictional sample cases. Default
// provider so the app runs with no Firebase project / no Java emulators.
import type { DataProvider, User, Role, CaseRecord } from "@/services/types";
import { ALL_CASES_ROLES } from "@/services/types";
import { buildSampleCases } from "./sampleCases";

const LS_KEY = "stlv.mockUser";

// Demo accounts (any password). Email local-part picks the role.
const DEMO_ACCOUNTS: Record<string, { role: Role; displayName: string }> = {
  "staff@stlv.demo": { role: "Staff", displayName: "Sam Staff" },
  "evaluator@stlv.demo": { role: "Evaluator", displayName: "Eve Evaluator" },
  "firm@stlv.demo": { role: "Ext Firm", displayName: "Frank Firm" },
  "neighbor@stlv.demo": { role: "Neighborhood Client", displayName: "Nadia Neighbor" },
};

export const DEMO_LOGINS = Object.entries(DEMO_ACCOUNTS).map(([email, a]) => ({
  email,
  role: a.role,
}));

export class MockProvider implements DataProvider {
  private user: User | null = null;

  constructor() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) this.user = JSON.parse(raw);
    } catch {
      /* ignore */
    }
  }

  async signIn(email: string, _password: string): Promise<User> {
    void _password;
    const key = email.trim().toLowerCase();
    const acct = DEMO_ACCOUNTS[key];
    // Unknown emails authenticate as a logged-in user with NO LSEM role
    // (i.e. they still see only the public experience) — mirrors the original,
    // where "public" is not synonymous with "anonymous" (§4.3).
    const user: User = acct
      ? { email: key, displayName: acct.displayName, role: acct.role, emailVerified: true }
      : { email: key, displayName: email.split("@")[0], role: null, emailVerified: true };
    this.user = user;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(user));
    } catch {
      /* ignore */
    }
    return user;
  }

  async signOut(): Promise<void> {
    this.user = null;
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
  }

  currentUser(): User | null {
    return this.user;
  }

  async getCasesForUser(user: User): Promise<CaseRecord[]> {
    const all = buildSampleCases(20);
    if (ALL_CASES_ROLES.includes(user.role)) return all;
    if (user.role === "Ext Firm") return all.slice(0, 6); // "assigned" subset
    if (user.role === "Neighborhood Client") {
      // assigned to a single neighborhood
      const nhd = all[0]?.neighborhood;
      return all.filter((c) => c.neighborhood === nhd);
    }
    return []; // Guest / null role
  }
}
