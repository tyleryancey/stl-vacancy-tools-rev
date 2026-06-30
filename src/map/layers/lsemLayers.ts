import type { Map as MlMap, ExpressionSpecification, FilterSpecification } from "maplibre-gl";
import { PARCELS_SOURCE, PARCELS_POLY_SOURCE, FILL_CROSSFADE_ZOOM as Z } from "@/config/constants";

// Authenticated LSEM layer set (REVERSE-ENGINEERING.md §5.4/§5.5). Private
// vacancies ramp on composite distress S = Vacancy + Burden (a faithful proxy
// for the original's Vacancy + Nuisance + Tax, which the public CSV lacks):
// single-owner gray→blue, multi-owner (MPO) gray→red. Each class is a circle
// (low zoom) + polygon fill (high zoom) crossfading at z≈13.

const S: ExpressionSpecification = ["+", ["get", "Vacancy"], ["get", "Burden"]];
const grayToBlue: ExpressionSpecification = ["interpolate", ["linear"], S, 0, "rgb(210,210,210)", 255, "rgb(0,0,245)"];
const grayToRed: ExpressionSpecification = ["interpolate", ["linear"], S, 0, "rgb(210,210,210)", 255, "rgb(245,0,0)"];

const circleOpacity: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 12.9, 1, Z + 0.2, 0];
const fillOpacity: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 12.9, 0, Z + 0.2, 0.85];
const radius: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 9, 1.5, 12, 3, 13, 3.5];

const distressed: ExpressionSpecification = ["all", [">", ["get", "Vacancy"], 10], [">", ["get", "Burden"], 5]];
const isLot: ExpressionSpecification = ["==", ["get", "category"], "lot"];
const isBldg: ExpressionSpecification = ["==", ["get", "category"], "building"];
const isLra: ExpressionSpecification = ["==", ["get", "IsLra"], true];
const notLra: ExpressionSpecification = ["!=", ["get", "IsLra"], true];
const isMpo: ExpressionSpecification = ["==", ["get", "isMpo"], true];
const notMpo: ExpressionSpecification = ["!=", ["get", "isMpo"], true];

interface Def {
  base: string;
  filter: FilterSpecification;
  color: string | ExpressionSpecification;
}
const DEFS: Def[] = [
  { base: "lsem_private_vacant_lots", filter: ["all", notLra, isLot], color: "rgba(130,130,50,0.85)" },
  { base: "lsem_lra_vacant_lots", filter: ["all", isLra, isLot], color: "rgba(150,100,50,0.6)" },
  { base: "lsem_lra_vacant_bldgs", filter: ["all", isLra, isBldg], color: "rgba(150,100,50,0.9)" },
  { base: "lsem_private_vacancies", filter: ["all", notLra, isBldg, notMpo, distressed], color: grayToBlue },
  { base: "lsem_private_vacancies_multi", filter: ["all", notLra, isBldg, isMpo, distressed], color: grayToRed },
];

export const LSEM_LAYER_IDS = DEFS.flatMap((d) => [d.base, d.base + "_fill"]);

export function addLsemLayers(map: MlMap): void {
  // circles (low zoom)
  for (const d of DEFS) {
    map.addLayer({
      id: d.base,
      type: "circle",
      source: PARCELS_SOURCE,
      filter: d.filter,
      paint: { "circle-radius": radius, "circle-color": d.color, "circle-opacity": circleOpacity },
    });
  }
  // polygon fills (high zoom)
  for (const d of DEFS) {
    map.addLayer({
      id: d.base + "_fill",
      type: "fill",
      source: PARCELS_POLY_SOURCE,
      filter: d.filter,
      paint: { "fill-color": d.color, "fill-opacity": fillOpacity, "fill-outline-color": "rgba(80,80,80,0.5)" },
    });
  }
}

export function removeLsemLayers(map: MlMap): void {
  for (const id of LSEM_LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id);
}
