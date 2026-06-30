import type { ExpressionSpecification } from "maplibre-gl";

// Data-driven vacancy coloring, ported verbatim from the original public map
// (REVERSE-ENGINEERING.md §5.5). PUBLIC layers encode *model confidence that a
// parcel is vacant* via a categorical ["case"] ladder — buildings in Reds,
// lots in Greens — with LRA/LCRA-owned and registered-vacant parcels forced to
// the most-certain swatch. No numeric score is exposed publicly.

// ColorBrewer-style Reds ramp keyed by VacDesc certainty (buildings).
export const publicBuildingColor: ExpressionSpecification = [
  "case",
  ["==", ["get", "IsLra"], true], "rgba(193,34,38,1)",
  ["==", ["get", "IsLcra"], true], "rgba(193,34,38,1)",
  [">", ["get", "VacRegMonths"], 0], "rgba(193,34,38,1)",
  ["==", ["get", "VacDesc"], "Definite"], "rgba(193,34,38,1)", // darkest
  ["==", ["get", "VacDesc"], "Very Likely"], "rgba(235,106,79,1)",
  ["==", ["get", "VacDesc"], "Possible"], "rgba(243,174,149,1)",
  ["==", ["get", "VacDesc"], "Indeterminant"], "rgba(251,228,218,1)", // lightest
  "rgba(0,0,255,1)", // blue fallback (filtered out in practice)
];

// Identical structure, Greens ramp 112,164,130 (darkest) -> 223,240,229 (lightest).
export const publicLotColor: ExpressionSpecification = [
  "case",
  ["==", ["get", "IsLra"], true], "rgba(112,164,130,1)",
  ["==", ["get", "IsLcra"], true], "rgba(112,164,130,1)",
  [">", ["get", "VacRegMonths"], 0], "rgba(112,164,130,1)",
  ["==", ["get", "VacDesc"], "Definite"], "rgba(112,164,130,1)",
  ["==", ["get", "VacDesc"], "Very Likely"], "rgba(149,189,164,1)",
  ["==", ["get", "VacDesc"], "Possible"], "rgba(186,214,196,1)",
  ["==", ["get", "VacDesc"], "Indeterminant"], "rgba(223,240,229,1)",
  "rgba(0,0,255,1)",
];

// Legend swatches (UI).
export const VACANCY_LEGEND = {
  building: [
    { label: "Definite / LRA / registered", color: "rgb(193,34,38)" },
    { label: "Very Likely", color: "rgb(235,106,79)" },
    { label: "Possible", color: "rgb(243,174,149)" },
    { label: "Indeterminant", color: "rgb(251,228,218)" },
  ],
  lot: [
    { label: "Definite / LRA / registered", color: "rgb(112,164,130)" },
    { label: "Very Likely", color: "rgb(149,189,164)" },
    { label: "Possible", color: "rgb(186,214,196)" },
    { label: "Indeterminant", color: "rgb(223,240,229)" },
  ],
} as const;

// LSEM continuous composite-distress color (gray->blue single owner, gray->red
// multi-owner) — used in Phase 3. S = Vacancy + Nuisance + Tax, clamped to 255.
export function lsemColor(S: number, multiOwner: boolean): string {
  const s = Math.min(Math.max(S, 0), 255);
  if (multiOwner) {
    const r = Math.round(210 + 35 * (s / 255));
    const gb = Math.round(210 * ((255 - s) / 255));
    return `rgb(${r},${gb},${gb})`;
  }
  const rg = Math.round(210 * ((255 - s) / 255));
  const b = Math.round(210 + 35 * (s / 255));
  return `rgb(${rg},${rg},${b})`;
}
