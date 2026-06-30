import { useStore } from "@/state/store";
import { fixOwnerName, ordinal, numberWithCommas, toTitleCase } from "@/lib/format";
import { ScorePanel } from "@/components/ScorePanel";
import type { Parcel } from "@/types/parcel";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === "" || value === null || value === undefined) return null;
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

function vacancyClass(p: Parcel): string {
  return p.category === "building" ? "badge-red" : "badge-green";
}

export function SidePanel() {
  const parcel = useStore((s) => s.selectedParcel);
  const close = useStore((s) => s.selectParcel);
  const cases = useStore((s) => s.cases);
  const lookup = useStore((s) => s.lookupCaseByHandle);

  if (!parcel) return null;

  const caseId = lookup[parcel.Handle];
  const caseRec = caseId ? cases.find((c) => c.caseId === caseId) : undefined;

  const ward = parcel.Ward20 ? `${ordinal(parcel.Ward20)} Ward` : "";
  const nhd = parcel.NhdName ? toTitleCase(parcel.NhdName) : "";
  const locale = [nhd, ward].filter(Boolean).join(", ");

  return (
    <aside className="side-panel" aria-label="Parcel details">
      <button className="panel-close" onClick={() => close(null)} aria-label="Close">
        ×
      </button>

      <h2 className="panel-address">{toTitleCase(parcel.Address) || "Vacant Parcel"}</h2>
      {locale && <div className="panel-locale">in {locale}</div>}

      <div className="badge-row">
        <span className={`badge ${vacancyClass(parcel)}`}>{parcel.VacDesc}</span>
        {parcel.IsLra && <span className="badge badge-lra">LRA-owned</span>}
        {parcel.Condemned && <span className="badge badge-warn">Condemned</span>}
        {parcel.BoardUp && <span className="badge badge-muted">Boarded up</span>}
      </div>

      {caseRec && (
        <section className="panel-section case-info">
          <h3>LSEM Case Information</h3>
          <Row label="Case ID" value={caseRec.caseId} />
          <Row label="Legal code" value={caseRec.legalCode} />
          <Row label="Assigned" value={caseRec.assignment} />
          <Row label="Opened" value={caseRec.openDate} />
          <Row label="Disposition" value={caseRec.disposition} />
          <Row label="Status" value={caseRec.status} />
          <Row label="Docket" value={caseRec.docket} />
          <div className="case-sample-note">⚠ fictional sample case data</div>
        </section>
      )}

      <section className="panel-section">
        <h3>Parcel Information</h3>
        <Row label="Type" value={parcel.Type} />
        <Row label="Owner" value={fixOwnerName(parcel.OwnerName)} />
        <Row
          label="Owner location"
          value={
            parcel.OwnerLoc === "city"
              ? "City of St. Louis"
              : parcel.OwnerLoc === "mo"
                ? "Missouri (outside city)"
                : parcel.OwnerLoc === "outofstate"
                  ? `Out of state (${parcel.OwnerState})`
                  : ""
          }
        />
        <Row label="Parcel ID" value={parcel.ParcelId} />
        <Row label="Handle" value={parcel.Handle} />
        <Row label="Sq. Feet" value={parcel.SqFt ? numberWithCommas(parcel.SqFt) : ""} />
        {parcel.Forestry && <Row label="Forestry" value={parcel.Forestry} />}
      </section>

      <section className="panel-section">
        <h3>Vacancy &amp; burden (live)</h3>
        <ScorePanel parcel={parcel} />
      </section>

      <a
        className="panel-link"
        href={`https://www.stlouis-mo.gov/government/departments/sldc/real-estate/lra-owned-property-search.cfm?action=detail&parcelId=${parcel.ParcelId}`}
        target="_blank"
        rel="noreferrer"
      >
        View on stlouis-mo.gov →
      </a>
    </aside>
  );
}
