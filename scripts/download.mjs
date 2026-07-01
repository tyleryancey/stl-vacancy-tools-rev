// Download the public STL vacancy CSV to data/raw/. Reproducible source step.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const URL = "https://www.publicgoodness.org/stlv/csv/stl_vacancy_data.csv";
const OUT = path.join(ROOT, "data/raw/stl_vacancy_data.csv");

// The real CSV is ~6.5MB / 22k rows. The upstream has been observed to return a
// small HTML/error placeholder with HTTP 200 (once ~12KB), which passes a status
// check but yields 0 parsed rows downstream — failing only at `data:assert` with no
// retry left. So validate the *body*, not just the status, and treat a bad body as a
// retryable failure. The header check tolerates a leading UTF-8 BOM / whitespace.
const MIN_BYTES = 500_000; // far below the real ~6.5MB, far above any error page
const EXPECTED_HEADER = "ParcelId"; // first column of the real CSV

export function validateCsv(buf) {
  if (buf.length < MIN_BYTES) return `body too small (${buf.length} bytes, expected ≥ ${MIN_BYTES})`;
  const head = buf.slice(0, 200).toString("utf8").replace(/^﻿/, "").trimStart();
  if (/^\s*</.test(head)) return "body looks like HTML/XML, not CSV";
  if (!head.includes(EXPECTED_HEADER)) return `header row missing "${EXPECTED_HEADER}"`;
  return null; // ok
}

// Retry on transient failures — a non-200 OR a 200 with an invalid body (the upstream
// does both), which would otherwise abort the whole CI deploy/refresh at assert time.
async function fetchCsv(attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    try {
      // Browser-like headers — the upstream/CDN rejects bare UAs with HTTP 415.
      const res = await fetch(URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "text/csv,text/plain,*/*",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const invalid = validateCsv(buf);
      if (invalid) throw new Error(`invalid CSV response: ${invalid}`);
      return buf;
    } catch (e) {
      if (i === attempts) throw new Error(`download failed after ${attempts} attempts: ${e.message}`);
      console.warn(`  download attempt ${i} failed (${e.message}); retrying…`);
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

// Only fetch when run directly (`node scripts/download.mjs`), so validateCsv can be
// imported by tests without triggering a network download.
if (import.meta.url === `file://${process.argv[1]}`) {
  const buf = await fetchCsv();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buf);
  console.log(`downloaded ${buf.length} bytes -> ${path.relative(ROOT, OUT)}`);
}
