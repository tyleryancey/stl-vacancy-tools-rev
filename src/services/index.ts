// Provider selection. Default: the self-contained mock. A Firebase provider
// implementing the same DataProvider interface can be added under
// services/firebase/ and selected with VITE_DATA_PROVIDER=firebase.
import type { DataProvider } from "./types";
import { MockProvider } from "./mock/provider";

let provider: DataProvider | null = null;

export function getProvider(): DataProvider {
  if (provider) return provider;
  const kind = import.meta.env.VITE_DATA_PROVIDER || "mock";
  if (kind === "firebase") {
    // A FirebaseProvider skeleton exists (services/firebase/provider.ts,
    // createFirebaseProvider) with the correct server-enforced read shape + rules
    // (docs/FIREBASE-SECURITY.md), but it isn't wired to a live project here: the
    // `firebase` SDK is intentionally not bundled and no real LSEM PII is involved.
    // To activate it, install `firebase`, adapt the SDK to the FirebaseDeps seam, and
    // construct createFirebaseProvider({ auth, db }). Until then, fall through to mock.
    console.warn("VITE_DATA_PROVIDER=firebase requested but no live Firebase provider is wired; using mock. See docs/FIREBASE-SECURITY.md.");
  }
  provider = new MockProvider();
  return provider;
}

export * from "./types";
export { DEMO_LOGINS } from "./mock/provider";
