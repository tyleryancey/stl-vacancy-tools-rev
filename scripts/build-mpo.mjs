// Rebuild of the original `multi_property_processor` (REVERSE-ENGINEERING.md §6.4):
// tally OwnerName -> keep owners with >1 vacant property as `mpos` -> fuzzy-group
// name variants of the same real owner into alias groups -> emit `mpoGroups`.
import fs from "node:fs";
import path from "node:path";
import { readCsvObjects } from "./lib/csv.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "data/raw/stl_vacancy_data.csv");
const OUT_DIR = path.join(ROOT, "public/data");

// Skip government / land-bank owners the app special-cases (§6.4).
const SKIP = new Set([
  "LRA",
  "LCRA",
  "CITY OF ST. LOUIS",
  "CITY OF ST LOUIS",
  "LAND REUTILIZATION AUTHORITY",
  "UNITED STATES OF AMERICA",
  "STATE OF MISSOURI",
  "",
  " ",
]);

const SUFFIXES = [
  "LLC", "L L C", "INC", "INCORPORATED", "CORP", "CORPORATION", "CO",
  "COMPANY", "LC", "L C", "LP", "LLP", "LTD", "TRUST", "TR", "PROPERTIES",
  "PROPERTY", "PRPRTS", "PRPRTYS", "INVESTMENTS", "INVESTORS", "INVESTMENT",
  "HOLDINGS", "HOLDING", "GROUP", "ASSOCIATES", "ASSOC", "ENTERPRISES",
  "REALTY", "REAL ESTATE", "DEVELOPMENT", "DEV", "OF ST LOUIS", "OF STL",
  "ST LOUIS", "MO", "II", "III", "IV", "V",
];

function normalize(name) {
  let s = name.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  // strip trailing/embedded business-suffix tokens iteratively
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of SUFFIXES) {
      const re = new RegExp(`(^| )${suf}( |$)`, "g");
      if (re.test(s)) {
        s = s.replace(re, " ").replace(/\s+/g, " ").trim();
        changed = true;
      }
    }
  }
  return s;
}

export function buildMpo() {
  const rows = readCsvObjects(SRC);
  const counts = new Map();
  for (const r of rows) {
    const name = (r.OwnerName || "").trim();
    if (SKIP.has(name.toUpperCase())) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  // mpos = owners with >1 property (original keeps multi-property owners)
  const mpos = [...counts.entries()]
    .filter(([, c]) => c > 1)
    .map(([name]) => name);
  const indexOf = new Map(mpos.map((n, i) => [n, i]));

  // group by normalized key
  const groupsByKey = new Map();
  for (const name of mpos) {
    const key = normalize(name) || name.toUpperCase();
    if (!groupsByKey.has(key)) groupsByKey.set(key, []);
    groupsByKey.get(key).push(name);
  }

  // assign sequential 3-letter codes, sorted by total parcel count desc
  const entries = [...groupsByKey.values()].map((names) => {
    const total = names.reduce((s, n) => s + (counts.get(n) || 0), 0);
    const leadName = names.slice().sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0))[0];
    return { names, total, leadName };
  });
  entries.sort((a, b) => b.total - a.total);

  function code(i) {
    // AAA, AAB ... base-26 over 3 letters
    const a = "A".charCodeAt(0);
    return (
      String.fromCharCode(a + Math.floor(i / 676) % 26) +
      String.fromCharCode(a + Math.floor(i / 26) % 26) +
      String.fromCharCode(a + (i % 26))
    );
  }

  const mpoGroups = {};
  entries.forEach((g, i) => {
    mpoGroups[code(i)] = {
      keys: g.names.map((n) => indexOf.get(n)),
      count: g.total,
      leadName: g.leadName,
    };
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "mpo.json"),
    JSON.stringify({ mpos, mpoGroups })
  );

  const top = entries.slice(0, 5).map((g) => `${g.leadName} (${g.total})`);
  console.log(
    `mpo.json: ${mpos.length} multi-property owners, ${entries.length} alias groups. Top: ${top.join(", ")}`
  );
  return { mpos, mpoGroups };
}

if (import.meta.url === `file://${process.argv[1]}`) buildMpo();
