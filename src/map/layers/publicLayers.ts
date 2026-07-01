import type { Map as MlMap, CircleLayerSpecification, FilterSpecification, ExpressionSpecification } from "maplibre-gl";
import { PARCELS_SOURCE, PARCELS_POLY_SOURCE, POLY_SOURCE_LAYER, FILL_CROSSFADE_ZOOM as Z } from "@/config/constants";
import { publicBuildingColor, publicLotColor, publicBuildingColorCVD, publicLotColorCVD } from "@/config/colors";

// Public vacancy layers. Faithful to the original (§5.3/§5.5): each class is drawn
// twice — a circle from centroids (low zoom) and a polygon fill from real
// geometry (high zoom) — crossfading at z≈13. Buildings paint in Reds, lots in
// Greens, by VacDesc certainty.

const notVacant: FilterSpecification = ["!=", ["get", "VacDesc"], "Not Vacant"];
export const BUILDING_FILTER: FilterSpecification = ["all", ["==", ["get", "category"], "building"], notVacant];
export const LOT_FILTER: FilterSpecification = ["all", ["==", ["get", "category"], "lot"], notVacant];

// Circle radius (low zoom) + fade OUT just past z13.
const circlePaint = (color: ExpressionSpecification): CircleLayerSpecification["paint"] => ({
  "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 1.5, 12, 3, 13, 3.5],
  "circle-color": color,
  "circle-opacity": ["interpolate", ["linear"], ["zoom"], 12.9, 1, Z + 0.2, 0],
  "circle-stroke-width": 0,
});

// Polygon fill (high zoom) + fade IN just past z13.
const fillPaint = (color: ExpressionSpecification) => ({
  "fill-color": color,
  "fill-opacity": ["interpolate", ["linear"], ["zoom"], 12.9, 0, Z + 0.2, 0.9] as ExpressionSpecification,
  "fill-outline-color": "rgba(80,80,80,0.5)" as const,
});

export const PUBLIC_LAYER_IDS = ["public_lot", "public_bldg", "public_lot_fill", "public_bldg_fill"] as const;

// Pairs of (layerId, circle|fill, baseFilter) for the filter engine.
export const PUBLIC_FILTER_TARGETS: { id: string; base: FilterSpecification }[] = [
  { id: "public_lot", base: LOT_FILTER },
  { id: "public_lot_fill", base: LOT_FILTER },
  { id: "public_bldg", base: BUILDING_FILTER },
  { id: "public_bldg_fill", base: BUILDING_FILTER },
];

export function addPublicLayers(map: MlMap): void {
  map.addLayer({ id: "public_lot", type: "circle", source: PARCELS_SOURCE, filter: LOT_FILTER, paint: circlePaint(publicLotColor) });
  map.addLayer({ id: "public_bldg", type: "circle", source: PARCELS_SOURCE, filter: BUILDING_FILTER, paint: circlePaint(publicBuildingColor) });
  map.addLayer({ id: "public_lot_fill", type: "fill", source: PARCELS_POLY_SOURCE, "source-layer": POLY_SOURCE_LAYER, filter: LOT_FILTER, paint: fillPaint(publicLotColor) });
  map.addLayer({ id: "public_bldg_fill", type: "fill", source: PARCELS_POLY_SOURCE, "source-layer": POLY_SOURCE_LAYER, filter: BUILDING_FILTER, paint: fillPaint(publicBuildingColor) });
}

export function removePublicLayers(map: MlMap): void {
  for (const id of PUBLIC_LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id);
}

// Swap the public building/lot colors between the default Reds/Greens and the
// colorblind-safe Oranges/Blues (design-review P1). Safe to call anytime.
export function applyPalette(map: MlMap, colorblind: boolean): void {
  const bldg = colorblind ? publicBuildingColorCVD : publicBuildingColor;
  const lot = colorblind ? publicLotColorCVD : publicLotColor;
  if (map.getLayer("public_bldg")) map.setPaintProperty("public_bldg", "circle-color", bldg);
  if (map.getLayer("public_bldg_fill")) map.setPaintProperty("public_bldg_fill", "fill-color", bldg);
  if (map.getLayer("public_lot")) map.setPaintProperty("public_lot", "circle-color", lot);
  if (map.getLayer("public_lot_fill")) map.setPaintProperty("public_lot_fill", "fill-color", lot);
}
