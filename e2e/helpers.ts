import type { ConsoleMessage, Page } from "@playwright/test";

// The 11-parcel fixture dataset built by e2e/fixtures/build.mjs (see its
// header comment for what each ParcelId covers).
export const WELLS_GOODFELLOW_PARCEL_IDS = ["55529430000", "59329290000", "49979290000"];
export const KIPILLA_OWNER = "KIPILLA, RONNIE"; // owns 22939200000 + 22939220000
export const CONDEMNED_PARCEL_ID = "00429010000";
export const LRA_PARCEL_ID = "00209030000";

// ScorePanel fetches vcpp.stldata.org live; stub it so e2e stays network-free
// and deterministic (an empty payload scores as a quiet/near-zero parcel,
// which is enough to assert the panel renders without erroring).
export async function stubCityData(page: Page): Promise<void> {
  await page.route("https://vcpp.stldata.org/parcel_data/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
}

// The fixture dataset has no real parcels-poly.pmtiles (that's a ~19MB
// tippecanoe output, out of scope for a hermetic e2e fixture — see
// e2e/fixtures/build.mjs). Vite's dev-server SPA fallback serves index.html
// for the missing path, which pmtiles.js then fails to parse as a "Wrong
// magic number" archive. A real static host 404s a missing file, so mirror
// that instead of letting the dev-only fallback leak a spurious console error.
export async function stub404PolyTiles(page: Page): Promise<void> {
  await page.route("**/data/parcels-poly.pmtiles", (route) => route.fulfill({ status: 404, body: "" }));
}

// pmtiles.js (and the browser's own resource-load log) emit console errors
// for the 404 stubbed in above — a real static host has no polygon tileset
// either in a fresh fixture-only checkout, so this is expected fixture noise,
// not a regression signal.
export function isUnexpectedConsoleError(msg: ConsoleMessage): boolean {
  if (/pmtiles|bad response code: 404/i.test(msg.text())) return false;
  if (/parcels-poly\.pmtiles/i.test(msg.location().url)) return false;
  return true;
}

// Waits for the initial parcel/meta/mpo fetch to resolve. The "loading…"
// banner is the one readiness signal present regardless of view — SearchBar
// only mounts on the map view, so it disappears for view=stats/list/cases
// deeplinks and can't be used as a universal readiness check.
export async function gotoReady(page: Page, path = "/"): Promise<void> {
  await stubCityData(page);
  await stub404PolyTiles(page);
  await page.goto(path);
  await page.locator(".loading").waitFor({ state: "hidden", timeout: 20000 });
}
