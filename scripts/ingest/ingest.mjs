// EXPERIMENTAL — independent ingestion research track (plan A-ii).
//
// Proves a fully-independent path to the vacancy dataset: start from the City of
// St. Louis ASSESSOR parcel list (not Public Goodness's published CSV), pull each
// parcel's city data from vcpp, run the SAME scoring engine the app uses, and
// DERIVE vacancy from the result — then emit our own CSV-compatible rows. Also
// reports fidelity vs the published CSV for overlapping parcels.
//
// This is a proof-of-concept over a sample (LIMIT, default 150). A full run would
// page all ~135k assessor parcels and fetch vcpp for each — heavy + slow; treat
// as an occasional research batch, NOT the default data path.
import fs from "node:fs";
import path from "node:path";
import { readCsvObjects } from "../lib/csv.mjs";
import { scoreAndTimeline } from "../../src/scoring/scoreAndTimeline.ts";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data/build/ingested.csv");
const PUBLISHED = path.join(ROOT, "data/raw/stl_vacancy_data.csv");
const ASSESSOR =
  "https://maps8.stlouis-mo.gov/arcgis/rest/services/ASSESSOR/Assessor_Public_Parcels/MapServer/11";
const VCPP = process.env.VITE_CITY_DATA_BASE || "https://vcpp.stldata.org/parcel_data/";
const LIMIT = parseInt(process.env.LIMIT || "150", 10);
const CONCURRENCY = 5;
const UA = "stl-vacancy-rebuild/0.1";

const ASR_FIELDS = [
  "Handle", "ParcelId", "LowAddrNum", "StPreDir", "StName", "StType", "ZIP",
  "Ward20", "Nbrhd", "CensTract20", "OwnerName", "OwnerState", "OwnerZIP",
  "NbrOfBldgsRes", "NbrOfBldgsCom", "VacantLot",
].join(",");

async function getJson(url, attempt = 1) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (j.error) throw new Error(`ArcGIS error: ${JSON.stringify(j.error)}`);
    return j;
  } catch (e) {
    if (attempt < 3) {
      await new Promise((s) => setTimeout(s, 1000 * attempt));
      return getJson(url, attempt + 1);
    }
    throw e;
  }
}

// --- 1. Pull a sample of parcels from the assessor (the independent base) ---
async function fetchAssessorSample() {
  const q = new URLSearchParams({
    where: "1=1",
    outFields: ASR_FIELDS,
    returnGeometry: "false",
    returnCentroid: "true",
    outSR: "4326",
    f: "json",
    resultOffset: "0",
    resultRecordCount: String(LIMIT),
  });
  const j = await getJson(`${ASSESSOR}/query?${q}`);
  return (j.features || []).map((f) => ({ a: f.attributes, c: f.centroid }));
}

function deriveType(a) {
  if (a.VacantLot === "Y" || a.VacantLot === 1 || a.VacantLot === true) return "Empty Lot";
  if ((a.NbrOfBldgsCom || 0) > 0) return "Commercial";
  if ((a.NbrOfBldgsRes || 0) > 0) return "Single-Family";
  return "Empty Lot";
}
function addr(a) {
  return [a.LowAddrNum, a.StPreDir, a.StName, a.StType].filter(Boolean).join(" ").trim();
}

async function fetchVcpp(id, attempt = 1) {
  try {
    const r = await fetch(VCPP + id, { headers: { "User-Agent": UA } });
    return r.ok ? await r.json() : null;
  } catch {
    if (attempt < 2) { await new Promise((s) => setTimeout(s, 500)); return fetchVcpp(id, attempt + 1); }
    return null;
  }
}

const CSV_COLS = ["ParcelId", "Handle", "StAddrNum", "StNameFull", "Zip", "Ward20", "NhdName", "Lat", "Lng", "Type", "OwnerName", "OwnerState", "OwnerZip", "Vacancy", "VacancyCat", "Burden", "BurdenCat", "IsLRA", "TaxYrsDel", "Condemned"];
const csvCell = (v) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// --- main ---
console.log(`A-ii ingestion PoC: sampling ${LIMIT} assessor parcels...`);
const sample = await fetchAssessorSample();
console.log(`Got ${sample.length} parcels; scoring from live city data...`);

const rows = [];
let scored = 0, vacant = 0, failed = 0;

async function worker(queue) {
  while (queue.length) {
    const { a, c } = queue.shift();
    const data = await fetchVcpp(a.ParcelId);
    if (!data) { failed++; continue; }
    // LRA/LCRA ownership is a property of the owner, independent of vacancy status.
    const isLra = /^(LRA|LCRA)/i.test(a.OwnerName || "");
    try {
      const type = deriveType(a);
      // Pass IsLra so the scorer applies the LRA confirmed-vacant/burden logic.
      const r = scoreAndTimeline(data, { Type: type, OwnerName: a.OwnerName, Handle: a.Handle, ParcelId: a.ParcelId, IsLra: isLra });
      scored++;
      // DERIVE vacancy from the engine output (the independence step)
      const isVacant = r.vacant || r.vacancy.verbal !== "Not Vacant";
      if (!isVacant) continue;
      vacant++;
      rows.push({
        ParcelId: a.ParcelId, Handle: a.Handle, StAddrNum: a.LowAddrNum,
        StNameFull: [a.StPreDir, a.StName, a.StType].filter(Boolean).join(" "),
        Zip: a.ZIP, Ward20: a.Ward20, NhdName: a.Nbrhd,
        Lat: c?.y?.toFixed(5) ?? "", Lng: c?.x?.toFixed(5) ?? "",
        Type: type, OwnerName: a.OwnerName, OwnerState: a.OwnerState, OwnerZip: a.OwnerZIP,
        Vacancy: r.vacancy.total, VacancyCat: r.vacancy.verbal, Burden: r.burden.total, BurdenCat: r.burden.verbal,
        IsLRA: isLra ? "true" : "",
        TaxYrsDel: r.taxYrsDel, Condemned: r.condemned ? "true" : "",
      });
    } catch (e) {
      failed++;
      if (failed <= 5) console.warn(`  scoring failed for ${a.ParcelId}: ${e.message}`);
    }
  }
}
const queue = [...sample]; // one shared queue; workers drain it cooperatively
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, [CSV_COLS.map(csvCell).join(","), ...rows.map((r) => CSV_COLS.map((c) => csvCell(r[c])).join(","))].join("\r\n"));
console.log(`Wrote ${rows.length} vacant rows -> ${path.relative(ROOT, OUT)} (${scored} scored, ${vacant} vacant, ${failed} fetch fails)`);

// --- fidelity vs the published CSV (for overlapping parcels) ---
if (fs.existsSync(PUBLISHED)) {
  const pub = new Map(readCsvObjects(PUBLISHED).map((r) => [r.ParcelId, r]));
  let overlap = 0, bandMatch = 0, within10 = 0;
  for (const r of rows) {
    const p = pub.get(r.ParcelId);
    if (!p) continue;
    overlap++;
    if ((p.VacancyCat || "") === r.VacancyCat) bandMatch++;
    if (Math.abs((parseFloat(p.Vacancy) || 0) - r.Vacancy) <= 10) within10++;
  }
  console.log(`\nFidelity vs published CSV (overlap ${overlap}):`);
  console.log(`  VacDesc band agreement: ${bandMatch}/${overlap}`);
  console.log(`  Vacancy within ±10:     ${within10}/${overlap}`);
} else {
  console.log("Published CSV not present — skipping fidelity comparison.");
}
