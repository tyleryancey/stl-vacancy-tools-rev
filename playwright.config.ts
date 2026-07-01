import { defineConfig, devices } from "@playwright/test";

// The e2e suite runs against a dev server serving the small, hermetic fixture
// dataset in e2e/fixtures/public/ (see e2e/fixtures/build.mjs) rather than the
// real generated public/data/*, so it never depends on live data or network.
const PORT = 5183;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `node e2e/fixtures/build.mjs && npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: { VITE_PUBLIC_DIR: "e2e/fixtures/public" },
  },
});
