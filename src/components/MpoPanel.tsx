import { useEffect, useState } from "react";
import { useStore } from "@/state/store";
import { getParcels, getAliases, getLeadName } from "@/data/parcels";
import { selectAndFly } from "@/lib/select";
import { setOwnerHighlight } from "@/map/layers/highlights";
import { fixOwnerName, toTitleCase, numberWithCommas } from "@/lib/format";
import type { Parcel } from "@/types/parcel";

// "Other properties owned by this owner" panel (§10.6, renderOtherPropertiesOwned).
// Left-docked so it doesn't collide with the right-docked SidePanel.

// Government / land-bank owners hold thousands of parcels; we skip the full list.
const GOV_RE = /^(LRA|LCRA|CITY OF ST|UNITED STATES)/i;

function vacancyClass(p: Parcel): string {
  return p.category === "building" ? "badge-red" : "badge-green";
}

export function MpoPanel() {
  const mpoOwner = useStore((s) => s.mpoOwner);
  const dataReady = useStore((s) => s.dataReady);
  const [aliases, setAliases] = useState<string[]>([]);
  const [items, setItems] = useState<Parcel[]>([]);

  useEffect(() => {
    // Nothing to compute/highlight until we have an owner, data, and a non-gov owner.
    if (!mpoOwner || !dataReady || GOV_RE.test(mpoOwner)) {
      setAliases([]);
      setItems([]);
      return;
    }

    const al = getAliases(mpoOwner);
    const names = new Set(al);
    const props = getParcels()
      .filter((f) => names.has(f.properties.OwnerName))
      .map((f) => f.properties)
      .sort((a, b) => b.Vacancy - a.Vacancy);

    setAliases(al);
    setItems(props);

    const map = useStore.getState().map;
    if (map) setOwnerHighlight(map, al);

    return () => {
      const m = useStore.getState().map;
      if (m) setOwnerHighlight(m, null);
    };
  }, [mpoOwner, dataReady]);

  if (mpoOwner === null) return null;

  const close = () => useStore.getState().openMpoPanel(null);
  const leadName = fixOwnerName(getLeadName(mpoOwner));
  const isGov = GOV_RE.test(mpoOwner);
  const count = items.length;

  // Alias variants other than the lead name (deduped, fixed-up).
  const otherAliases = Array.from(new Set(aliases.map(fixOwnerName))).filter(
    (a) => a !== leadName,
  );

  return (
    <aside className="mpo-panel" aria-label="Owner portfolio">
      <button className="panel-close" onClick={close} aria-label="Close">
        ×
      </button>

      <h2 className="mpo-owner-name">{leadName}</h2>

      {!dataReady ? (
        <div className="mpo-loading">Loading…</div>
      ) : isGov ? (
        <div className="mpo-gov-note">
          Government / land-bank owner — individual properties are not listed here.
        </div>
      ) : (
        <>
          <div className="mpo-count">
            {numberWithCommas(count)} {count === 1 ? "property" : "properties"}
          </div>

          {aliases.length > 1 && otherAliases.length > 0 && (
            <div className="mpo-aliases">also recorded as: {otherAliases.join("; ")}</div>
          )}

          <div className="mpo-list">
            {items.map((p) => (
              <button
                key={p.ParcelId}
                type="button"
                className="mpo-row"
                onClick={() => selectAndFly(p)}
              >
                <span className="mpo-row-address">
                  {toTitleCase(p.Address) || "Vacant Parcel"}
                </span>
                <span className="mpo-row-type">{p.Type}</span>
                <span className={`badge ${vacancyClass(p)}`}>{p.VacDesc}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
