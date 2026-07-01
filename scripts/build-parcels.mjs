// CSV -> GeoJSON FeatureCollection of parcel centroids (Points).
// Phase 0 renders these as circles (faithful to the original "Lean"/centroid
// layer). Phase 1 will join real parcel polygons + bake PMTiles.
import fs from "node:fs";
import path from "node:path";
import { readCsvObjects } from "./lib/csv.mjs";
import { mapParcel } from "./lib/mapping.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "data/raw/stl_vacancy_data.csv");
const GEOM = path.join(ROOT, "data/raw/parcel_geometry.json");
const OUT_DIR = path.join(ROOT, "public/data"); // shipped to dist by Vite
const BUILD_DIR = path.join(ROOT, "data/build"); // intermediates (NOT shipped)

export const GOV_OWNER = /^(LRA|LCRA|CITY OF ST|LAND REUTILIZATION|UNITED STATES|STATE OF MISSOURI)/i;

// The only parcel fields any client code reads (verified by inventory during the
// B-iii perf pass). The shipped points backbone carries just these — dropping the
// 13 never-read fields (StAddrNum/StNameFull/Zip/CensTract20/OwnerZip/BldgAge/
// Vacancy2/VacDesc2/CSBVacancy/CSBNuisance/BldgsRes/BldgsCom/ResUnits) trims the
// backbone ~21% (1300->1022 KB gzipped) with no behavior change. NB: point-tiling
// the backbone was measured and rejected — at the city-wide default zoom the whole
// dataset is in view, so a points PMTiles fetches ~2.4MB (worse than the gzipped
// JSON). Keep this in sync with the fields consumed in src/ (types/parcel.ts marks
// the dropped ones optional).
export const INDEX_FIELDS = [
  "ParcelId", "Handle", "Address", "Ward20", "NhdName", "lat", "lng", "Type",
  "category", "SqFt", "OwnerName", "OwnerState", "OwnerLoc", "Vacancy", "VacDesc",
  "Burden", "BurdenCat", "BoardUp", "IsLra", "IsLcra", "TaxYrsDel", "VacRegMonths",
  "Forestry", "Condemned", "isMpo",
];

export function slimParcel(p) {
  const o = {};
  for (const k of INDEX_FIELDS) o[k] = p[k];
  return o;
}

export function buildParcels() {
  const rows = readCsvObjects(SRC);

  // Pass 1: tally owners so we can flag multi-property owners (isMpo) — drives
  // the LSEM single-owner (blue) vs multi-owner (red) layer split.
  const ownerCounts = new Map();
  for (const r of rows) {
    const o = (r.OwnerName || "").trim();
    if (!o || GOV_OWNER.test(o)) continue;
    ownerCounts.set(o, (ownerCounts.get(o) || 0) + 1);
  }

  // Real parcel polygon geometry (from scripts/fetch-geometry.mjs), keyed by Handle.
  let geometry = {};
  if (fs.existsSync(GEOM)) {
    geometry = JSON.parse(fs.readFileSync(GEOM, "utf8"));
  }

  const features = [];
  const polyFeatures = [];
  let withGeom = 0;
  let minLat = 90,
    maxLat = -90,
    minLng = 180,
    maxLng = -180;
  let buildings = 0,
    lots = 0,
    lra = 0,
    condemned = 0;

  for (const r of rows) {
    const p = mapParcel(r);
    if (!p.lat || !p.lng) continue;
    p.isMpo = (ownerCounts.get((p.OwnerName || "").trim()) || 0) > 1;
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
    if (p.category === "lot") lots++;
    else buildings++;
    if (p.IsLra) lra++;
    if (p.Condemned) condemned++;
    // Points backbone ships only the fields the client reads (slimParcel);
    // the polygon layer keeps the full property set (it's lazy-loaded via
    // PMTiles range requests, so its size isn't on the first-load critical path).
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: slimParcel(p),
    });

    // Polygon feature (full properties) when we have real geometry for this Handle.
    const g = geometry[p.Handle];
    if (g) {
      withGeom++;
      polyFeatures.push({ type: "Feature", geometry: g, properties: p });
    }
  }

  const fc = { type: "FeatureCollection", features };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  // Points backbone shipped as .json (gzips on static hosts; .geojson often ships
  // as uncompressed octet-stream).
  fs.writeFileSync(path.join(OUT_DIR, "parcels.json"), JSON.stringify(fc));
  // Polygon GeoJSON is an intermediate consumed only by `npm run tiles` → PMTiles;
  // write it OUTSIDE public/ so the 19MB file is not copied into dist/.
  fs.writeFileSync(
    path.join(BUILD_DIR, "parcels-poly.geojson"),
    JSON.stringify({ type: "FeatureCollection", features: polyFeatures })
  );

  const meta = {
    generatedFrom: "stl_vacancy_data.csv",
    count: features.length,
    buildings,
    lots,
    lra,
    condemned,
    bbox: [minLng, minLat, maxLng, maxLat],
    center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
  };
  fs.writeFileSync(path.join(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2));
  console.log(
    `parcels.json: ${features.length} features (${buildings} buildings, ${lots} lots, ${lra} LRA, ${condemned} condemned)`
  );
  console.log(
    `data/build/parcels-poly.geojson: ${polyFeatures.length} polygons (${((withGeom / features.length) * 100).toFixed(1)}% have real geometry)`
  );
  return { features, meta };
}

if (import.meta.url === `file://${process.argv[1]}`) buildParcels();
