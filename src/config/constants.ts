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
export const POLY_SOURCE_LAYER = "poly"; // tippecanoe layer name

// Base-path-aware asset URL. import.meta.env.BASE_URL is "/" locally and
// "/<repo>/" under a GitHub project Pages subpath; it always ends with "/".
export const asset = (p: string): string => import.meta.env.BASE_URL + p.replace(/^\//, "");

// Backbone served as .json (not .geojson) so static hosts gzip it (octet-stream
// .geojson is shipped uncompressed). The polygon layer is served as PMTiles.
export const DATA_URL = asset("data/parcels.json");
export const POLY_PMTILES_PATH = asset("data/parcels-poly.pmtiles");
export const META_URL = asset("data/meta.json");
export const MPO_URL = asset("data/mpo.json");
export const STATS_URL = asset("data/stats.json");
export const TIMELINES_URL = asset("data/timelines.json");
