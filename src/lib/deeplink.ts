// URL state serialization — permalinks / saved views (plan C-ii) + the original's
// deep-link params (§10.4). buildPermalink() snapshots the full view state into a
// short, readable URL (only non-default params are emitted); applyDeepLink()
// restores it on load. Backward-compatible with ?list / ?stats / ?mpo / ?nbrhd /
// #<ParcelId>.
import { useStore, ALL_VAC_DESC, type Ownership, type OwnerLoc, type ViewMode, type ListQuery } from "@/state/store";
import { getParcels } from "@/data/parcels";
import { selectAndFly, findByParcelId } from "@/lib/select";

export function buildPermalink(): string {
  const s = useStore.getState();
  const p = new URLSearchParams();

  if (s.view !== "map") p.set("v", s.view);

  const f = s.filters;
  if (!f.showBuildings) p.set("bld", "0");
  if (!f.showLots) p.set("lot", "0");
  if (f.ownership !== "all") p.set("own", f.ownership);
  if (f.ownerLoc !== "all") p.set("loc", f.ownerLoc);
  if (f.minTaxYrsDel) p.set("tax", String(f.minTaxYrsDel));
  if (f.condemnedOnly) p.set("cond", "1");
  if (f.boardedOnly) p.set("board", "1");
  if (s.overlayCondemned) p.set("ovl", "1");

  const visible = ALL_VAC_DESC.map((d, i) => (s.certaintyVisible[d] ? i : -1)).filter((i) => i >= 0);
  if (visible.length !== ALL_VAC_DESC.length) p.set("cert", visible.join(","));

  if (s.mpoOwner) p.set("mpo", s.mpoOwner);
  if (s.highlightedNeighborhood) p.set("nbrhd", s.highlightedNeighborhood);
  if (s.listQuery) p.set("list", `${s.listQuery.type}:${s.listQuery.value}`);
  if (s.selectedParcel) p.set("sel", s.selectedParcel.ParcelId);

  if (s.map) {
    const c = s.map.getCenter();
    p.set("map", `${c.lng.toFixed(5)},${c.lat.toFixed(5)},${s.map.getZoom().toFixed(2)}`);
  }

  return `${window.location.origin}${import.meta.env.BASE_URL}?${p.toString()}`;
}

export function applyDeepLink(): void {
  const params = new URLSearchParams(window.location.search);
  const s = useStore.getState();

  // view
  const v = params.get("v") as ViewMode | null;
  if (v && ["map", "list", "stats", "cases"].includes(v)) s.setView(v);
  else {
    // Legacy valueless ?list / ?stats view switch — must NOT trigger on the new
    // `list=type:value` param (which only carries the list query, not the view).
    if (params.get("list") === "") s.setView("list");
    if (params.get("stats") === "") s.setView("stats");
  }

  // filters
  if (params.get("bld") === "0") s.setFilter("showBuildings", false);
  if (params.get("lot") === "0") s.setFilter("showLots", false);
  const own = params.get("own");
  if (own === "lra" || own === "private") s.setFilter("ownership", own as Ownership);
  const loc = params.get("loc");
  if (loc === "city" || loc === "mo" || loc === "outofstate") s.setFilter("ownerLoc", loc as OwnerLoc);
  const tax = params.get("tax");
  if (tax) s.setFilter("minTaxYrsDel", Number(tax) || 0);
  if (params.get("cond") === "1") s.setFilter("condemnedOnly", true);
  if (params.get("board") === "1") s.setFilter("boardedOnly", true);
  if (params.get("ovl") === "1" && !s.overlayCondemned) s.toggleOverlayCondemned();

  const cert = params.get("cert");
  if (cert !== null) {
    // filter out "" first — Number("") is 0, which would wrongly re-enable tier 0
    // for an all-hidden (cert=) permalink.
    const idxs = new Set(cert.split(",").filter((x) => x !== "").map(Number));
    const cv = { ...s.certaintyVisible };
    ALL_VAC_DESC.forEach((d, i) => (cv[d] = idxs.has(i)));
    s.setCertaintyVisible(cv);
  }

  const mpo = params.get("mpo");
  if (mpo) s.openMpoPanel(mpo);
  const nbrhd = params.get("nbrhd");
  if (nbrhd) {
    s.setHighlightedNeighborhood(nbrhd);
    // Also seed the list query so the List tab shows this neighborhood (an
    // explicit list= param below overrides this if present).
    s.setListQuery({ type: "neighborhood", value: nbrhd });
  }
  const list = params.get("list");
  if (list) {
    const i = list.indexOf(":");
    const type = (i >= 0 ? list.slice(0, i) : list) as ListQuery["type"];
    const value = i >= 0 ? list.slice(i + 1) : "";
    if (type === "neighborhood" || type === "ward" || type === "condemned") s.setListQuery({ type, value });
  }

  // map camera
  const mp = params.get("map");
  if (s.map && mp) {
    const [lng, lat, z] = mp.split(",").map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      s.map.jumpTo({ center: [lng, lat], zoom: Number.isFinite(z) ? z : s.map.getZoom() });
    }
  }

  // selected parcel (sel param or legacy #ParcelId hash); flies, so apply last
  const sel = params.get("sel") || window.location.hash.replace(/^#/, "").trim();
  if (sel) {
    const parcel = findByParcelId(sel, getParcels());
    if (parcel) {
      selectAndFly(parcel); // NB: this forces view=map
      // Restore the shared view if the permalink asked for a non-map one.
      if (v && v !== "map" && ["list", "stats", "cases"].includes(v)) s.setView(v);
    }
  }
}
