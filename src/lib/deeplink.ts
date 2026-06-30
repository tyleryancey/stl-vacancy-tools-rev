// URL / hash deep-linking (REVERSE-ENGINEERING.md §10.4). Run once after parcel
// data is loaded. Supported:
//   #<ParcelId>            -> open that parcel
//   ?mpo=<ownerName>       -> open the owner portfolio panel
//   ?nbrhd=<name>          -> highlight a neighborhood
//   ?list / ?stats         -> switch view
import { useStore } from "@/state/store";
import { getParcels } from "@/data/parcels";
import { selectAndFly, findByParcelId } from "@/lib/select";

export function applyDeepLink(): void {
  const params = new URLSearchParams(window.location.search);
  const s = useStore.getState();

  if (params.has("list")) s.setView("list");
  if (params.has("stats")) s.setView("stats");

  const mpo = params.get("mpo");
  if (mpo) s.openMpoPanel(mpo);

  const nbrhd = params.get("nbrhd");
  if (nbrhd) {
    s.setHighlightedNeighborhood(nbrhd);
    s.setListQuery({ type: "neighborhood", value: nbrhd });
  }

  const hash = window.location.hash.replace(/^#/, "").trim();
  if (hash) {
    const parcel = findByParcelId(hash, getParcels());
    if (parcel) selectAndFly(parcel);
  }
}
