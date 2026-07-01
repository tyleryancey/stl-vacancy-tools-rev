// Download the public STL vacancy CSV to data/raw/. Reproducible source step.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const URL = "https://www.publicgoodness.org/stlv/csv/stl_vacancy_data.csv";
const OUT = path.join(ROOT, "data/raw/stl_vacancy_data.csv");

// Retry on transient failures (the upstream occasionally returns a non-200,
// which would otherwise abort the whole CI deploy/refresh).
async function fetchCsv(attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(URL, { headers: { "User-Agent": "stl-vacancy-rebuild/0.1" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (i === attempts) throw new Error(`download failed after ${attempts} attempts: ${e.message}`);
      console.warn(`  download attempt ${i} failed (${e.message}); retrying…`);
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

const buf = await fetchCsv();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buf);
console.log(`downloaded ${buf.length} bytes -> ${path.relative(ROOT, OUT)}`);
