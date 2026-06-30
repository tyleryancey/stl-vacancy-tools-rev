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
    // A FirebaseProvider (Auth + RTDB /apiCases) would be constructed here.
    // Not implemented in the open rebuild — the mock keeps it runnable with no
    // external services and no real LSEM PII. Falls through to mock.
    console.warn("VITE_DATA_PROVIDER=firebase requested but no Firebase provider is bundled; using mock.");
  }
  provider = new MockProvider();
  return provider;
}

export * from "./types";
export { DEMO_LOGINS } from "./mock/provider";
