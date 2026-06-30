// Scoring constants ported verbatim from the original (REVERSE-ENGINEERING.md §7).

// CSB (Citizens' Service Bureau 311) problem codes that indicate vacancy vs nuisance.
export const CSB_VACANCY_INDICATORS = [
  "Debris-Vacant Bldg", "Debris-Vacant Lot", "Missed Cut - VBldg", "Missed Cut - V Lot",
  "Unsatisfy Cut - VLot", "Unsatisfy Cut -VBldg", "Vacnt Bldg Unsecured",
  "Weeds-Vacant Bldg", "Weeds-Vacant Lot", "WTR-VACANT-BLDG",
];

export const CSB_NUISANCE_INDICATORS = [
  "Building Collapse", "Debris-Occupied Bldg", "Graffiti-Private", "Illegal dumpg report",
  "Illegl Use-Opn Storg", "LRA Board up", "LRA Demo Submission", "Misc-LRA",
  "Property Damage-LRA", "Ppty Maint Code-Ext", "Public Nuisance Rpt", "Rats (Exterior)",
  "Raw Garbage, Ext", "Stagnant Water", "Stray Cat", "Stray Dog At Large",
  "Tire Storage, Ext", "Vehicle Towing", "Wastewater, Ext", "Weeds-Occupied Ppty",
  "Missed Cut - VBldg", "Missed Cut - V Lot", "Unsatisfy Cut - V Lot", "Unsatisfy Cut - V Bldg",
  "Vacnt Bldg Unsecured", "Weeds - Vacant Bldg", "Weeds - Vacant Lot", "Wtr - Vacant - Bldg",
];

// Age-decay multipliers by months-ago (full weight for first 3 months → 0.69 at 12 months).
export const DIMINISH_BY = [1, 1, 1, 0.99, 0.97, 0.94, 0.91, 0.87, 0.83, 0.79, 0.75, 0.72, 0.69];

export function diminish(amount: number, time: number, factor = 0.95): number {
  time = Math.trunc(time);
  if (time < 0) time = 0;
  if (time < DIMINISH_BY.length) return amount * DIMINISH_BY[time];
  amount = amount * DIMINISH_BY[DIMINISH_BY.length - 1];
  let q = DIMINISH_BY.length - 1;
  while (q < time) {
    q++;
    amount = amount * factor;
  }
  return amount;
}

// Verbal band for the vacancy score (0–100).
export function vacancyVerbal(total: number): string {
  if (total >= 70) return "Very Likely";
  if (total >= 30) return "Possible";
  if (total >= 10) return "Indeterminant";
  return "Not Vacant";
}

// Verbal band for burden / nuisance / tax scores (0–100).
export function magnitudeVerbal(total: number): string {
  if (total >= 90) return "Extremely High";
  if (total >= 80) return "Very High";
  if (total >= 70) return "High";
  if (total >= 60) return "Somewhat High";
  if (total >= 50) return "Medium High";
  if (total >= 40) return "Medium";
  if (total >= 30) return "Medium Low";
  if (total >= 20) return "Low";
  if (total >= 10) return "Very Low";
  if (total > 0) return "Minimal";
  return "Zero";
}
