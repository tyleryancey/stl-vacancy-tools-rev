import type { Map as MlMap, ExpressionSpecification, FilterSpecification, CircleLayerSpecification } from "maplibre-gl";
import { PARCELS_SOURCE } from "@/config/constants";

// Authenticated LSEM layer set (REVERSE-ENGINEERING.md §5.4/§5.5). The original
// colors private vacancies on a continuous composite-distress ramp from
// S = Vacancy + Nuisance + Tax. The public CSV lacks separate Nuisance/Tax, so we
// use S = Vacancy + Burden (Burden aggregates nuisance + tax liability) — a
// faithful proxy. Single-owner parcels ramp gray→blue, multi-owner (MPO) gray→red.

// Composite distress score input.
const S: ExpressionSpecification = ["+", ["get", "Vacancy"], ["get", "Burden"]];

const grayToBlue: ExpressionSpecification = [
  "interpolate", ["linear"], S,
  0, "rgb(210,210,210)",
  255, "rgb(0,0,245)",
];
const grayToRed: ExpressionSpecification = [
  "interpolate", ["linear"], S,
  0, "rgb(210,210,210)",
  255, "rgb(245,0,0)",
];

const radius: CircleLayerSpecification["paint"] = {
  "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2, 13, 3.5, 16, 7, 18, 11],
  "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 13, 0, 15, 0.5],
  "circle-stroke-color": "rgba(255,255,255,0.6)",
};

// Live thresholds proxy for "Vacancy>10 & Tax>5 & Nuisance>5" (§5.5).
const distressed: ExpressionSpecification = [
  "all",
  [">", ["get", "Vacancy"], 10],
  [">", ["get", "Burden"], 5],
];

const isLot: ExpressionSpecification = ["==", ["get", "category"], "lot"];
const isBldg: ExpressionSpecification = ["==", ["get", "category"], "building"];
const isLra: ExpressionSpecification = ["==", ["get", "IsLra"], true];
const notLra: ExpressionSpecification = ["!=", ["get", "IsLra"], true];
const isMpo: ExpressionSpecification = ["==", ["get", "isMpo"], true];
const notMpo: ExpressionSpecification = ["!=", ["get", "isMpo"], true];

export const LSEM_LAYER_IDS = [
  "lsem_private_vacant_lots",
  "lsem_lra_vacant_lots",
  "lsem_lra_vacant_bldgs",
  "lsem_private_vacancies",
  "lsem_private_vacancies_multi",
] as const;

function circleLayer(id: string, filter: FilterSpecification, color: string | ExpressionSpecification) {
  return {
    id,
    type: "circle" as const,
    source: PARCELS_SOURCE,
    filter,
    paint: { ...radius, "circle-color": color },
  };
}

export function addLsemLayers(map: MlMap): void {
  // Land/lot context first, then distress circles on top.
  map.addLayer(circleLayer("lsem_private_vacant_lots", ["all", notLra, isLot], "rgba(130,130,50,0.6)"));
  map.addLayer(circleLayer("lsem_lra_vacant_lots", ["all", isLra, isLot], "rgba(150,100,50,0.5)"));
  map.addLayer(circleLayer("lsem_lra_vacant_bldgs", ["all", isLra, isBldg], "rgba(150,100,50,0.85)"));
  map.addLayer(circleLayer("lsem_private_vacancies", ["all", notLra, isBldg, notMpo, distressed], grayToBlue));
  map.addLayer(circleLayer("lsem_private_vacancies_multi", ["all", notLra, isBldg, isMpo, distressed], grayToRed));
}

export function removeLsemLayers(map: MlMap): void {
  for (const id of LSEM_LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id);
}
