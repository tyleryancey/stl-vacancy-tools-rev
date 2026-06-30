import maplibregl, { type Map as MlMap, type Marker } from "maplibre-gl";
import type { CaseRecord } from "@/services/types";

// LSEM case markers as HTML markers, color-coded by legal problem code
// (ports drawCaseMarkers, REVERSE-ENGINEERING.md §8.2). The original keys
// classes off legalCode 62 / 91.

let markers: Marker[] = [];

export function setCaseMarkers(
  map: MlMap,
  cases: CaseRecord[],
  onClick: (caseId: string) => void
): void {
  clearCaseMarkers();
  for (const c of cases) {
    if (!c.lat || !c.lng) continue;
    const el = document.createElement("div");
    el.className =
      "case-marker" +
      (c.legalCode === 62 ? " code62" : "") +
      (c.legalCode === 91 ? " code91" : "");
    el.title = `${c.caseId} — ${c.caseTitle}`;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick(c.caseId);
    });
    const m = new maplibregl.Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(map);
    markers.push(m);
  }
}

export function clearCaseMarkers(): void {
  for (const m of markers) m.remove();
  markers = [];
}
