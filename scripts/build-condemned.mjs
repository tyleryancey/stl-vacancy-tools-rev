// Re-scores parcels against LIVE city data to derive the CURRENTLY-condemned set
// (matching how the original queries its live Firestore, not the stale CSV flag).
// The published CSV's `Condemned` column is a point-in-time snapshot (~2,376);
// re-scoring drops condemnations that have since been resolved (demolished /
// occupancy restored / cleared by the open-valve logic), yielding ~1,900.
//
// SCOPE=condemned (default): only re-score CSV-condemned parcels — fast (~2.4k
//   vcpp requests); refines the known set. SCOPE=all: re-score every parcel
//   (~22k requests) to also catch newly-condemned parcels absent from the CSV.
// LIMIT=N samples. Output: public/data/condemned.json { condemned:[ids], scanned:[ids] }.
import fs from "node:fs";
import path from "node:path";
import { scoreAndTimeline } from "../src/scoring/scoreAndTimeline.ts";

const ROOT = process.cwd();
const PARCELS = path.join(ROOT, "public/data/parcels.json");
const OUT = path.join(ROOT, "public/data/condemned.json");
const VCPP = process.env.VITE_CITY_DATA_BASE || "https://vcpp.stldata.org/parcel_data/";
const SCOPE = process.env.SCOPE || "condemned";
const LIMIT = parseInt(process.env.LIMIT || "0", 10);
const CONCURRENCY = 6;
const UA = "stl-vacancy-rebuild/0.1";

async function fetchVcpp(id, attempt = 1) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(VCPP + id, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    return r.ok ? await r.json() : null;
  } catch {
    if (attempt < 2) { await new Promise((s) => setTimeout(s, 600)); return fetchVcpp(id, attempt + 1); }
    return null;
  } finally {
    clearTimeout(t);
  }
}

const parcels = JSON.parse(fs.readFileSync(PARCELS, "utf8")).features.map((f) => f.properties);
let candidates = SCOPE === "all" ? parcels : parcels.filter((p) => p.Condemned);
if (LIMIT > 0) candidates = candidates.slice(0, LIMIT);
console.log(`Re-scoring ${candidates.length} parcels (scope=${SCOPE}) for current condemnation status...`);

const condemned = [];
const scanned = [];
let done = 0, fail = 0;

async function worker(queue) {
  while (queue.length) {
    const p = queue.shift();
    const data = await fetchVcpp(p.ParcelId);
    done++;
    if (!data) { fail++; continue; }
    try {
      const r = scoreAndTimeline(data, {
        Type: p.Type, OwnerName: p.OwnerName, Handle: p.Handle, ParcelId: p.ParcelId, IsLra: p.IsLra, IsLcra: p.IsLcra,
      });
      scanned.push(p.ParcelId); // only count as scanned if scoring succeeded
      if (r.condemned) condemned.push(p.ParcelId);
    } catch (e) {
      // A single malformed vcpp payload must not abort the whole batch.
      fail++;
      if (fail <= 5) console.warn(`  scoring failed for ${p.ParcelId}: ${e.message}`);
    }
    if (done % 250 === 0) console.log(`  ${done}/${candidates.length} (${condemned.length} condemned, ${fail} fetch-fail)`);
  }
}

const queue = [...candidates]; // one shared queue drained by all workers
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

fs.writeFileSync(OUT, JSON.stringify({ scope: SCOPE, scanned, condemned }));
console.log(`Done: scanned ${scanned.length}, currently condemned ${condemned.length} (was ${parcels.filter((p) => p.Condemned).length} in CSV), ${fail} fetch-fails -> public/data/condemned.json`);
