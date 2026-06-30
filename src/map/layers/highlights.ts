import type { Map as MlMap } from "maplibre-gl";
import { PARCELS_SOURCE } from "@/config/constants";

// Selection/highlight + condemnation overlay layers, all driven off the same
// parcels source (REVERSE-ENGINEERING.md §5.7). Highlights paint as yellow halos
// *behind* the colored parcel dots; the condemnation overlay paints on top.

const NBRHD_HL = "nbrhd_highlight";
const OWNER_HL = "owner_highlight";
const CONDEMNED = "overlay_condemned";

function firstParcelLayer(map: MlMap): string | undefined {
  return map.getLayer("public_lot") ? "public_lot" : undefined;
}

export function setNeighborhoodHighlight(map: MlMap, nhd: string | null): void {
  if (map.getLayer(NBRHD_HL)) map.removeLayer(NBRHD_HL);
  if (!nhd) return;
  map.addLayer(
    {
      id: NBRHD_HL,
      type: "circle",
      source: PARCELS_SOURCE,
      filter: ["==", ["get", "NhdName"], nhd],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 16, 12],
        "circle-color": "rgba(255,210,28,0.55)",
        "circle-blur": 0.4,
      },
    },
    firstParcelLayer(map)
  );
}

export function setOwnerHighlight(map: MlMap, owners: string[] | null): void {
  if (map.getLayer(OWNER_HL)) map.removeLayer(OWNER_HL);
  if (!owners || owners.length === 0) return;
  map.addLayer(
    {
      id: OWNER_HL,
      type: "circle",
      source: PARCELS_SOURCE,
      filter: ["in", ["get", "OwnerName"], ["literal", owners]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 16, 14],
        "circle-color": "rgba(255,235,0,0.85)",
        "circle-stroke-color": "rgba(180,140,0,0.9)",
        "circle-stroke-width": 1,
      },
    },
    firstParcelLayer(map)
  );
}

export function setCondemnedOverlay(map: MlMap, on: boolean): void {
  if (map.getLayer(CONDEMNED)) map.removeLayer(CONDEMNED);
  if (!on) return;
  map.addLayer({
    id: CONDEMNED,
    type: "circle",
    source: PARCELS_SOURCE,
    filter: ["==", ["get", "Condemned"], true],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3, 18, 14],
      "circle-color": "rgba(255,135,0,0.9)",
      "circle-stroke-color": "#000",
      "circle-stroke-width": 1,
    },
  });
}
