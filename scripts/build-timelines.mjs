// Pre-computes 48-month vacancy-score sparklines for the vacant set so the client
// can look them up instead of recomputing 48× on every panel open (plan A-iii).
// Reuses the SAME vacancyTimeline() the browser runs (bundled for node via
// esbuild — see the `data:timelines` npm script).
//
// Cost note: this fetches vcpp.stldata.org once per non-LRA parcel (~13k). It is
// an OCCASIONAL batch (like geometry), not part of every deploy. Use LIMIT=N to
// process a sample. LRA/LCRA parcels are skipped (their score is pinned to 100 →
// flat sparkline, which the client renders as "Unchanged" without a timeline).
import fs from "node:fs";
import path from "node:path";
import { vacancyTimeline } from "../src/scoring/scoreAndTimeline.ts";

// Anchored to cwd (repo root under npm) — this file is bundled to data/build/
// before running, so import.meta.dirname is unreliable here.
const ROOT = process.cwd();
const PARCELS = path.join(ROOT, "public/data/parcels.json");
const OUT = path.join(ROOT, "public/data/timelines.json");
const BASE = process.env.VITE_CITY_DATA_BASE || "https://vcpp.stldata.org/parcel_data/";
const CONCURRENCY = 6;
const LIMIT = parseInt(process.env.LIMIT || "0", 10); // 0 = all
const UA = "stl-vacancy-rebuild/0.1";

async function fetchCityData(id, attempt = 1) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(BASE + id, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    if (attempt < 2) {
      await new Promise((res) => setTimeout(res, 600));
      return fetchCityData(id, attempt + 1);
    }
    return null;
  } finally {
    clearTimeout(t);
  }
}

const parcels = JSON.parse(fs.readFileSync(PARCELS, "utf8")).features.map((f) => f.properties);
let targets = parcels.filter((p) => !p.IsLra && !p.IsLcra && p.ParcelId);
if (LIMIT > 0) targets = targets.slice(0, LIMIT);
console.log(`Pre-computing timelines for ${targets.length} non-LRA parcels (concurrency ${CONCURRENCY})...`);

const out = {};
let done = 0, stored = 0, failed = 0;

async function worker(queue) {
  while (queue.length) {
    const p = queue.shift();
    const data = await fetchCityData(p.ParcelId);
    done++;
    if (!data) { failed++; }
    else {
      const tl = vacancyTimeline(data, {
        Type: p.Type, OwnerName: p.OwnerName, Handle: p.Handle, ParcelId: p.ParcelId, IsLra: p.IsLra, IsLcra: p.IsLcra,
      });
      // Only store timelines that actually vary — flat ones render as "Unchanged"
      // client-side without needing the data.
      if (!tl.every((v) => v === tl[tl.length - 1])) { out[p.ParcelId] = tl; stored++; }
    }
    if (done % 250 === 0) console.log(`  ${done}/${targets.length} (${stored} stored, ${failed} failed)`);
  }
}

const queue = [...targets];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`Done: ${stored} timelines stored, ${failed} fetch failures -> public/data/timelines.json (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`);
