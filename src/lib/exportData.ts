// Client-side file export helpers (plan C-i). Shared by the list view's CSV and
// GeoJSON exports.
import type { Parcel } from "@/types/parcel";

export function download(filename: string, content: string, mime: string): void {
  // Blob + object URL (not a data: URI) so large exports don't hit the browser's
  // data-URI size cap (~2MB in Chrome) and silently fail.
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// FeatureCollection of parcel centroids with full properties.
export function toGeoJson(parcels: Parcel[]): string {
  return JSON.stringify({
    type: "FeatureCollection",
    features: parcels.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: p,
    })),
  });
}

export function dateStamp(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
