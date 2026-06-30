// Generates CLEARLY-FICTIONAL legal-aid cases attached to real parcels, so the
// LSEM tier (markers, Cases table, case panel) can be demonstrated without any
// real PII. Deterministic (no randomness) for a stable demo.
import { getParcels } from "@/data/parcels";
import { toTitleCase } from "@/lib/format";
import type { CaseRecord } from "@/services/types";

const ATTORNEYS = ["A. Rivera", "J. Okafor", "M. Chen", "S. Delgado", "T. Brooks", "L. Nguyen"];
const PARALEGALS = ["K. Adams", "R. Patel", "D. Romano", "P. Owens"];
const LEGAL_CODES = [62, 91, 77, 62, 91, 55];
const DISPOSITIONS = ["Open", "In Litigation", "Negotiating", "Referred", "Resolved"];
const STATUSES = ["Active", "Active", "Active", "Closed"];

// Fictional party-name stand-ins — explicitly marked sample data, never real people.
function fakeParty(i: number): string {
  const last = ["SAMPLE-A", "SAMPLE-B", "SAMPLE-C", "SAMPLE-D", "SAMPLE-E", "SAMPLE-F", "SAMPLE-G"][i % 7];
  return `DOE (${last}), SAMPLE`;
}

export function buildSampleCases(limit = 20): CaseRecord[] {
  const parcels = getParcels();
  if (parcels.length === 0) return [];

  // Pick building parcels with a real address, spread deterministically across
  // a few high-vacancy neighborhoods.
  const targetNhds = new Set(["Greater Ville", "Wells Goodfellow", "The Ville", "Hamilton Heights", "Penrose"]);
  const candidates = parcels.filter(
    (f) => f.properties.category === "building" && f.properties.Address && targetNhds.has(f.properties.NhdName)
  );

  const cases: CaseRecord[] = [];
  const step = Math.max(1, Math.floor(candidates.length / limit));
  for (let n = 0; n < limit && n * step < candidates.length; n++) {
    const p = candidates[n * step].properties;
    const year = 2022 + (n % 4);
    const month = ((n * 3) % 12) + 1;
    const attorney = ATTORNEYS[n % ATTORNEYS.length];
    const paralegal = PARALEGALS[n % PARALEGALS.length];
    cases.push({
      caseId: `SAMPLE-${1000 + n}`,
      handle: p.Handle,
      parcelId: p.ParcelId,
      address: p.Address,
      lat: p.lat,
      lng: p.lng,
      neighborhood: p.NhdName,
      legalCode: LEGAL_CODES[n % LEGAL_CODES.length],
      caseTitle: toTitleCase(p.Address),
      assignment: `${attorney}(Primary), ${paralegal}(Paralegal)`,
      openDate: `${year}-${String(month).padStart(2, "0")}-15`,
      disposition: DISPOSITIONS[n % DISPOSITIONS.length],
      partyName: fakeParty(n),
      status: STATUSES[n % STATUSES.length],
      court: "St. Louis City Circuit Court",
      docket: `${year}-CC-${String(1000 + n * 7).padStart(5, "0")}`,
    });
  }
  return cases;
}
