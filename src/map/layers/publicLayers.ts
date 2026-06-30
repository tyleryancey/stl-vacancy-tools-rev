import type { Map as MlMap, CircleLayerSpecification, FilterSpecification } from "maplibre-gl";
import { PARCELS_SOURCE } from "@/config/constants";
import { publicBuildingColor, publicLotColor } from "@/config/colors";

// Phase 0: parcels are rendered as colored circles from centroids (faithful to
// the original "Lean"/centroid layer). Phase 1 adds polygon fills + the
// circle<->fill zoom crossfade once real parcel geometry is baked into PMTiles.

const notVacantExcluded: FilterSpecification = ["!=", ["get", "VacDesc"], "Not Vacant"];

const buildingFilter: FilterSpecification = [
  "all",
  ["==", ["get", "category"], "building"],
  notVacantExcluded,
];
const lotFilter: FilterSpecification = [
  "all",
  ["==", ["get", "category"], "lot"],
  notVacantExcluded,
];

// Radius grows with zoom so the dot map reads as parcels when zoomed in.
const radius: CircleLayerSpecification["paint"] = {
  "circle-radius": [
    "interpolate",
    ["linear"],
    ["zoom"],
    10, 2,
    13, 3.5,
    16, 7,
    18, 11,
  ],
  "circle-stroke-width": [
    "interpolate",
    ["linear"],
    ["zoom"],
    13, 0,
    15, 0.6,
  ],
  "circle-stroke-color": "rgba(255,255,255,0.7)",
};

export const PUBLIC_LAYER_IDS = ["public_lot", "public_bldg"] as const;

export function addPublicLayers(map: MlMap): void {
  // lots first so buildings (the priority signal) paint on top
  map.addLayer({
    id: "public_lot",
    type: "circle",
    source: PARCELS_SOURCE,
    filter: lotFilter,
    paint: { ...radius, "circle-color": publicLotColor },
  });
  map.addLayer({
    id: "public_bldg",
    type: "circle",
    source: PARCELS_SOURCE,
    filter: buildingFilter,
    paint: { ...radius, "circle-color": publicBuildingColor },
  });
}

export function removePublicLayers(map: MlMap): void {
  for (const id of PUBLIC_LAYER_IDS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
}
