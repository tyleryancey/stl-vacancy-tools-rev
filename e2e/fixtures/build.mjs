// Builds the small, hermetic e2e dataset from e2e/fixtures/sample.csv — 11 real
// St. Louis parcels (public assessor records) picked to cover the interactions
// the e2e suite exercises: multiple neighborhoods/vacancy tiers/wards, an
// LRA-owned parcel, a condemned parcel, a board-up, tax delinquency, and a
// same-owner pair (KIPILLA, RONNIE) for the multi-property-owner panel.
// Re-run with `node e2e/fixtures/build.mjs` whenever sample.csv changes.
import fs from "node:fs";
import path from "node:path";
import { readCsvObjects } from "../../scripts/lib/csv.mjs";
import { mapParcel } from "../../scripts/lib/mapping.mjs";
import { computeMpo } from "../../scripts/build-mpo.mjs";
import { GOV_OWNER, slimParcel } from "../../scripts/build-parcels.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SRC = path.join(ROOT, "e2e/fixtures/sample.csv");
const OUT_DIR = path.join(ROOT, "e2e/fixtures/public/data");

const rows = readCsvObjects(SRC);

const ownerCounts = new Map();
for (const r of rows) {
  const o = (r.OwnerName || "").trim();
  if (!o || GOV_OWNER.test(o)) continue;
  ownerCounts.set(o, (ownerCounts.get(o) || 0) + 1);
}

const features = [];
let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
let buildings = 0, lots = 0, lra = 0, condemned = 0;

for (const r of rows) {
  const p = mapParcel(r);
  p.isMpo = (ownerCounts.get((p.OwnerName || "").trim()) || 0) > 1;
  minLat = Math.min(minLat, p.lat);
  maxLat = Math.max(maxLat, p.lat);
  minLng = Math.min(minLng, p.lng);
  maxLng = Math.max(maxLng, p.lng);
  if (p.category === "lot") lots++;
  else buildings++;
  if (p.IsLra) lra++;
  if (p.Condemned) condemned++;
  features.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    properties: slimParcel(p), // mirror the production backbone's slim field set
  });
}

const meta = {
  generatedFrom: "e2e/fixtures/sample.csv",
  count: features.length,
  buildings,
  lots,
  lra,
  condemned,
  bbox: [minLng, minLat, maxLng, maxLat],
  center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
};

const { mpos, mpoGroups } = computeMpo(rows);

const inc = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
const byNhd = new Map(), byWard = new Map(), byType = new Map(), byBurdenCat = new Map(), byVacDesc = new Map();
for (const f of features) {
  const p = f.properties;
  if (p.NhdName) inc(byNhd, p.NhdName);
  if (p.Ward20) inc(byWard, String(p.Ward20));
  inc(byType, p.Type || "Unknown");
  inc(byBurdenCat, p.BurdenCat);
  inc(byVacDesc, p.VacDesc);
}
const sortDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
const stats = {
  totals: { parcels: features.length, buildings, lots },
  byNeighborhood: sortDesc(byNhd),
  byWard: sortDesc(byWard),
  byType: sortDesc(byType),
  byBurdenCat: sortDesc(byBurdenCat),
  byVacDesc: sortDesc(byVacDesc),
  topOwners: [],
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "parcels.json"), JSON.stringify({ type: "FeatureCollection", features }));
fs.writeFileSync(path.join(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2));
fs.writeFileSync(path.join(OUT_DIR, "mpo.json"), JSON.stringify({ mpos, mpoGroups }));
fs.writeFileSync(path.join(OUT_DIR, "stats.json"), JSON.stringify(stats));

console.log(`e2e fixtures: ${features.length} parcels, ${mpos.length} MPOs -> ${OUT_DIR}`);
