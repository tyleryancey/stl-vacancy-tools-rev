// St. Louis viewport (from the original; bbox confirmed against the dataset).
export const STL_CENTER: [number, number] = [-90.25007, 38.668139];
export const STL_DEFAULT_ZOOM = 12.5;
export const STL_BBOX: [number, number, number, number] = [
  -90.33112, 38.53117, -90.16769, 38.77602,
];

export const MAP_STYLE =
  import.meta.env.VITE_MAP_STYLE ||
  "https://tiles.openfreemap.org/styles/positron";

// Zoom at which the circle map should give way to polygon fills (Phase 1).
export const FILL_CROSSFADE_ZOOM = 13;

export type Brand = "public" | "lsem";

export const PARCELS_SOURCE = "parcels"; // centroid points (circles, low zoom)
export const PARCELS_POLY_SOURCE = "parcels_poly"; // real polygons (fills, high zoom)
export const DATA_URL = "/data/parcels.geojson";
export const DATA_POLY_URL = "/data/parcels-poly.geojson";
export const META_URL = "/data/meta.json";
