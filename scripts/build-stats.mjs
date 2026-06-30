// CSV -> precomputed aggregates for the Stats page (REVERSE-ENGINEERING.md §10.10).
// The original reads precomputed Firestore docs; we precompute the equivalents.
import fs from "node:fs";
import path from "node:path";
import { readCsvObjects } from "./lib/csv.mjs";
import { mapParcel } from "./lib/mapping.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "data/raw/stl_vacancy_data.csv");
const OUT_DIR = path.join(ROOT, "public/data");

const inc = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);

export function buildStats() {
  const rows = readCsvObjects(SRC).map(mapParcel);

  const total = rows.length;
  let buildings = 0,
    lots = 0;
  const byNhd = new Map();
  const byWard = new Map();
  const byType = new Map();
  const byBurdenCat = new Map();
  const byVacDesc = new Map();
  const ownerCounts = new Map();

  for (const p of rows) {
    if (p.category === "lot") lots++;
    else buildings++;
    if (p.NhdName) inc(byNhd, p.NhdName);
    if (p.Ward20) inc(byWard, String(p.Ward20));
    inc(byType, p.Type || "Unknown");
    inc(byBurdenCat, p.BurdenCat);
    inc(byVacDesc, p.VacDesc);
    const o = (p.OwnerName || "").trim().toUpperCase();
    const isGov =
      o === "LRA" ||
      o === "LCRA" ||
      o.startsWith("CITY OF ST") ||
      o.startsWith("LAND REUTILIZATION") ||
      o.startsWith("UNITED STATES") ||
      o.startsWith("STATE OF MISSOURI");
    if (o && !isGov) inc(ownerCounts, p.OwnerName);
  }

  const topOwners = [...ownerCounts.entries()]
    .filter(([, c]) => c >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([name, count]) => ({ name, count }));

  const sortDesc = (m) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, count: v }));

  const stats = {
    totals: { parcels: total, buildings, lots },
    byNeighborhood: sortDesc(byNhd),
    byWard: sortDesc(byWard),
    byType: sortDesc(byType),
    byBurdenCat: sortDesc(byBurdenCat),
    byVacDesc: sortDesc(byVacDesc),
    topOwners,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "stats.json"), JSON.stringify(stats));
  console.log(
    `stats.json: ${total} parcels, ${stats.byNeighborhood.length} neighborhoods, ${topOwners.length} owners with 5+`
  );
  return stats;
}

if (import.meta.url === `file://${process.argv[1]}`) buildStats();
