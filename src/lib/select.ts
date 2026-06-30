import maplibregl, { type Marker } from "maplibre-gl";
import { useStore } from "@/state/store";
import type { Parcel } from "@/types/parcel";

// Parcel selection + camera control (ports of selectParcel/jumpToHandle, §10.3).

let selectedMarker: Marker | null = null;

export function flyToParcel(parcel: Parcel): void {
  const map = useStore.getState().map;
  if (!map || !parcel.lng || !parcel.lat) return;
  map.flyTo({ center: [parcel.lng + 0.0008, parcel.lat], zoom: Math.max(map.getZoom(), 16) });
}

export function dropSelectedMarker(parcel: Parcel): void {
  const map = useStore.getState().map;
  if (!map || !parcel.lng || !parcel.lat) return;
  if (selectedMarker) selectedMarker.remove();
  const el = document.createElement("div");
  el.className = "selected-marker";
  selectedMarker = new maplibregl.Marker({ element: el })
    .setLngLat([parcel.lng, parcel.lat])
    .addTo(map);
}

export function clearSelectedMarker(): void {
  if (selectedMarker) {
    selectedMarker.remove();
    selectedMarker = null;
  }
}

// Open a parcel: select (opens side panel), fly, drop marker, switch to map view.
export function selectAndFly(parcel: Parcel, fly = true): void {
  const s = useStore.getState();
  s.setView("map");
  s.selectParcel(parcel);
  dropSelectedMarker(parcel);
  if (fly) flyToParcel(parcel);
}

// Find a parcel by Handle (jumpToHandle) from the loaded data.
export function findByHandle(handle: string, parcels: { properties: Parcel }[]): Parcel | null {
  const f = parcels.find((p) => p.properties.Handle === handle);
  return f ? f.properties : null;
}

export function findByParcelId(parcelId: string, parcels: { properties: Parcel }[]): Parcel | null {
  const f = parcels.find((p) => p.properties.ParcelId === parcelId);
  return f ? f.properties : null;
}
