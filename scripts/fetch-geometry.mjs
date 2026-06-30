// Fetches real parcel polygon geometry from the City of St. Louis assessor
// ArcGIS service and keeps only the ~22k parcels in our vacancy dataset (joined
// by Handle). Server-side simplified (maxAllowableOffset) + 6-decimal precision
// to keep size down. Output: data/raw/parcel_geometry.json  ({ [handle]: coords }).
import fs from "node:fs";
import path from "node:path";
import { readCsvObjects } from "./lib/csv.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "data/raw/stl_vacancy_data.csv");
const OUT = path.join(ROOT, "data/raw/parcel_geometry.json");
const LAYER =
  "https://maps8.stlouis-mo.gov/arcgis/rest/services/ASSESSOR/Assessor_Public_Parcels/MapServer/11";
const PAGE = 2000;
const TOTAL = 135021;
const CONCURRENCY = 6;
const UA = "stl-vacancy-rebuild/0.1";

// Our target handles
const wanted = new Set(readCsvObjects(SRC).map((r) => (r.Handle || "").trim()).filter(Boolean));
console.log(`Target handles: ${wanted.size}`);

const offsets = [];
for (let o = 0; o < TOTAL; o += PAGE) offsets.push(o);

function url(offset) {
  const q = new URLSearchParams({
    where: "1=1",
    outFields: "Handle",
    returnGeometry: "true",
    geometryPrecision: "6",
    maxAllowableOffset: "0.00001",
    outSR: "4326",
    f: "geojson",
    resultOffset: String(offset),
    resultRecordCount: String(PAGE),
  });
  return `${LAYER}/query?${q}`;
}

async function fetchBatch(offset, attempt = 1) {
  try {
    const res = await fetch(url(offset), { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.features || [];
  } catch (e) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 800 * attempt));
      return fetchBatch(offset, attempt + 1);
    }
    console.warn(`  batch @${offset} failed: ${e.message}`);
    return [];
  }
}

const geom = {};
let matched = 0;
let done = 0;

async function worker(queue) {
  while (queue.length) {
    const offset = queue.shift();
    const feats = await fetchBatch(offset);
    for (const f of feats) {
      const h = (f.properties?.Handle || "").trim();
      if (h && wanted.has(h) && f.geometry) {
        geom[h] = f.geometry; // full geometry (type + coordinates; Polygon or MultiPolygon)
        matched++;
      }
    }
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${offsets.length} batches, ${matched} matched`);
  }
}

const queue = [...offsets];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

fs.writeFileSync(OUT, JSON.stringify(geom));
console.log(`Done: ${matched}/${wanted.size} handles matched -> ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
