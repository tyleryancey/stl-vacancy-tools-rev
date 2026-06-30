// CI guard: fail the build loudly if the data pipeline produced a degenerate
// result. The critical case is the silent empty-polygon footgun — build-parcels
// falls back to {} geometry if data/raw/parcel_geometry.json is missing, which
// would ship an empty PMTiles and silently lose the entire polygon layer.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MIN = 1000; // we expect ~22k; anything this low means a pipeline failure

function featureCount(file) {
  if (!fs.existsSync(file)) return -1;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")).features?.length ?? -1;
  } catch {
    return -1;
  }
}

const checks = [
  { label: "points backbone (public/data/parcels.json)", file: path.join(ROOT, "public/data/parcels.json") },
  { label: "polygon intermediate (data/build/parcels-poly.geojson)", file: path.join(ROOT, "data/build/parcels-poly.geojson") },
];

let ok = true;
for (const c of checks) {
  const n = featureCount(c.file);
  if (n < MIN) {
    console.error(`✗ ${c.label}: ${n < 0 ? "missing/unreadable" : n + " features"} (expected ≥ ${MIN})`);
    ok = false;
  } else {
    console.log(`✓ ${c.label}: ${n} features`);
  }
}

if (!ok) {
  console.error(
    "\nData assertion FAILED. Most likely cause: data/raw/parcel_geometry.json was not seeded,\n" +
      "so the polygon layer is empty. Run `npm run data:geometry` (or restore the cached/Release\n" +
      "geometry) before `npm run data`."
  );
  process.exit(1);
}
console.log("assert-data: OK");
