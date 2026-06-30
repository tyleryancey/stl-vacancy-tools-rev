// Percentile ranking of a parcel's score against the whole vacant-parcel
// distribution (a local, data-backed stand-in for the original's "Comparison to
// All Vacant Properties", §7.11 — which used precomputed histograms we lack).
import { getParcels } from "@/data/parcels";

const cache: Partial<Record<"Vacancy" | "Burden", number[]>> = {};

function sortedValues(field: "Vacancy" | "Burden"): number[] {
  if (cache[field]) return cache[field]!;
  const arr = getParcels()
    .map((f) => f.properties[field])
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  cache[field] = arr;
  return arr;
}

// Percent of vacant parcels at or below `value` (0–100).
export function percentileOf(field: "Vacancy" | "Burden", value: number): number {
  const arr = sortedValues(field);
  if (arr.length === 0) return 0;
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return Math.round((lo / arr.length) * 100);
}

const BANDS = [
  "Extremely Low", "Very Low", "Quite Low", "Low", "Below Average",
  "Slightly Below Avg", "Average", "Slightly Above Avg", "Above Average",
  "High", "Quite High", "Very High", "Extremely High",
];

export function percentileDesc(p: number): string {
  return BANDS[Math.min(BANDS.length - 1, Math.floor((p / 100) * BANDS.length))];
}
