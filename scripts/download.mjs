// Download the public STL vacancy CSV to data/raw/. Reproducible source step.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const URL = "https://www.publicgoodness.org/stlv/csv/stl_vacancy_data.csv";
const OUT = path.join(ROOT, "data/raw/stl_vacancy_data.csv");

const res = await fetch(URL, { headers: { "User-Agent": "stl-vacancy-rebuild/0.1" } });
if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
const buf = Buffer.from(await res.arrayBuffer());
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buf);
console.log(`downloaded ${buf.length} bytes -> ${path.relative(ROOT, OUT)}`);
