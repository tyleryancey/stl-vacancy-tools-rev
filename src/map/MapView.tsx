import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MlMap, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { MAP_STYLE, STL_CENTER, STL_DEFAULT_ZOOM, PARCELS_SOURCE, PARCELS_POLY_SOURCE, POLY_PMTILES_PATH } from "@/config/constants";

// Register the pmtiles:// protocol once so MapLibre can read the polygon vector
// tiles via HTTP range requests (only visible tiles load, not the full 18MB).
const pmtilesProtocol = new Protocol();
maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);
import { addPublicLayers, removePublicLayers, applyPalette, PUBLIC_LAYER_IDS } from "@/map/layers/publicLayers";
import { addLsemLayers, removeLsemLayers, LSEM_LAYER_IDS } from "@/map/layers/lsemLayers";
import { applyPublicFilters } from "@/map/applyFilters";
import { setNeighborhoodHighlight, setCondemnedOverlay } from "@/map/layers/highlights";
import { setCaseMarkers, clearCaseMarkers } from "@/map/layers/caseMarkers";
import { loadParcels, getParcels } from "@/data/parcels";
import { dropSelectedMarker, clearSelectedMarker, selectAndFly, findByParcelId } from "@/lib/select";
import { useStore } from "@/state/store";
import type { Parcel } from "@/types/parcel";

const CLICKABLE_LAYERS = [...PUBLIC_LAYER_IDS, ...LSEM_LAYER_IDS] as string[];

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [loaded, setLoaded] = useState(false);

  const filters = useStore((s) => s.filters);
  const certaintyVisible = useStore((s) => s.certaintyVisible);
  const highlightedNeighborhood = useStore((s) => s.highlightedNeighborhood);
  const overlayCondemned = useStore((s) => s.overlayCondemned);
  const selectedParcel = useStore((s) => s.selectedParcel);
  const brand = useStore((s) => s.brand);
  const cases = useStore((s) => s.cases);
  const colorblind = useStore((s) => s.colorblind);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: STL_CENTER,
      zoom: STL_DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    (window as unknown as { stlvMap: MlMap }).stlvMap = map;
    useStore.getState().setMap(map);

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");

    const hoverPopup = new Popup({ closeButton: false, closeOnClick: false, className: "address-popup" });

    map.on("load", async () => {
      const geojson = await loadParcels();
      map.addSource(PARCELS_SOURCE, { type: "geojson", data: geojson });
      map.addSource(PARCELS_POLY_SOURCE, {
        type: "vector",
        url: `pmtiles://${window.location.origin}${POLY_PMTILES_PATH}`,
      });
      if (useStore.getState().brand === "lsem") addLsemLayers(map);
      else addPublicLayers(map);
      applyPalette(map, useStore.getState().colorblind); // honor persisted CVD setting
      setLoaded(true);
      useStore.getState().setDataReady(true);

      // Bind click/hover for every parcel layer (public + LSEM); MapLibre fires
      // these only for layers that currently exist.
      for (const layerId of CLICKABLE_LAYERS) {
        map.on("click", layerId, (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as unknown as Parcel;
          useStore.getState().selectParcel(p);
          dropSelectedMarker(p);
        });
        map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; hoverPopup.remove(); });
        map.on("mousemove", layerId, (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as unknown as Parcel;
          hoverPopup.setLngLat(e.lngLat).setHTML(`<strong>${p.Address || "Unknown address"}</strong>`).addTo(map);
        });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      useStore.getState().setMap(null);
    };
  }, []);

  // Swap layer sets on brand change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (brand === "lsem") {
      removePublicLayers(map);
      if (!map.getLayer(LSEM_LAYER_IDS[0])) addLsemLayers(map);
    } else {
      removeLsemLayers(map);
      if (!map.getLayer("public_lot")) addPublicLayers(map);
      applyPalette(map, useStore.getState().colorblind);
      applyPublicFilters(map, { filters: useStore.getState().filters, certaintyVisible: useStore.getState().certaintyVisible });
    }
  }, [brand, loaded]);

  // Case markers (LSEM only)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (brand === "lsem" && cases.length) {
      setCaseMarkers(map, cases, (caseId) => {
        const c = useStore.getState().cases.find((x) => x.caseId === caseId);
        useStore.getState().selectCase(caseId);
        if (c) {
          const parcel = findByParcelId(c.parcelId, getParcels());
          if (parcel) selectAndFly(parcel);
        }
      });
    } else {
      clearCaseMarkers();
    }
  }, [brand, cases, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && loaded) applyPublicFilters(map, { filters, certaintyVisible });
  }, [filters, certaintyVisible, loaded]);

  // reactive: colorblind-safe palette
  useEffect(() => {
    const map = mapRef.current;
    if (map && loaded) applyPalette(map, colorblind);
  }, [colorblind, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && loaded) setNeighborhoodHighlight(map, highlightedNeighborhood);
  }, [highlightedNeighborhood, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && loaded) setCondemnedOverlay(map, overlayCondemned);
  }, [overlayCondemned, loaded]);

  useEffect(() => {
    if (!selectedParcel) clearSelectedMarker();
  }, [selectedParcel]);

  return <div ref={containerRef} className="map-container" />;
}
