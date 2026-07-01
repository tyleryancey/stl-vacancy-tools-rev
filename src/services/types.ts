// Backend data-access abstraction. The app talks to a DataProvider; the default
// implementation is a self-contained mock (sample data, runs with no external
// services). A Firebase implementation can be swapped in via VITE_DATA_PROVIDER.
// Mirrors the original's auth + /apiCases model (REVERSE-ENGINEERING.md §4, §8)
// WITHOUT any real LSEM legal-aid PII — all case data here is clearly fictional.

export type Role =
  | "Staff"
  | "Evaluator"
  | "Ext Firm"
  | "Neighborhood Client"
  | "Guest"
  | null;

// Roles that flip the app into the authenticated LSEM experience.
export const LSEM_ROLES: Role[] = ["Staff", "Evaluator", "Ext Firm", "Neighborhood Client", "Guest"];

// Roles that may see the entire case tree vs. only assigned cases (§4.3).
export const ALL_CASES_ROLES: Role[] = ["Staff", "Evaluator"];

export interface User {
  // Firebase Auth uid. The security rules key on request.auth.uid (e.g. the /users
  // own-profile rule); a real provider must supply it. The mock uses a stable
  // derived id. See docs/FIREBASE-SECURITY.md.
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  emailVerified: boolean;
}

// A legal-aid case, attached to a parcel by Handle (§8.2). FICTIONAL sample data.
export interface CaseRecord {
  caseId: string;
  handle: string;
  parcelId: string;
  address: string;
  lat: number;
  lng: number;
  neighborhood: string;
  legalCode: number; // e.g. 62, 91 — drives marker color
  caseTitle: string;
  assignment: string; // "Name(Role)" — parsed into Primary/Paralegal in the Cases view
  openDate: string;
  disposition: string;
  partyName: string;
  status: string;
  court: string;
  docket: string;
}

export interface DataProvider {
  // auth
  signIn(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  currentUser(): User | null;
  // Cases visible to the given user (all for Staff/Evaluator, assigned otherwise).
  //
  // ⚠ SECURITY (must read before implementing a real backend): the mock filters
  // visibility CLIENT-SIDE because its data is fictional. In the original, the
  // client-side role is COSMETIC — real protection is server-side (Firebase
  // security rules scoping /apiCases reads per role + Cloud Function idToken
  // verification; REVERSE-ENGINEERING.md §4.3/§11). A real provider MUST enforce
  // visibility on the server and never deliver a case the user isn't authorized
  // to see. Do NOT port the mock's "fetch all, then .slice()" pattern to real PII.
  getCasesForUser(user: User): Promise<CaseRecord[]>;
}
