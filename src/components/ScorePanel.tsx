import { useEffect, useState } from "react";
import { useStore } from "@/state/store";
import { fetchCityData } from "@/scoring/cityData";
import { scoreAndTimeline, type ScoreResult, type ScoreCategory, type Contribution, type TimelineEvent } from "@/scoring/scoreAndTimeline";
import { numberWithCommas } from "@/lib/format";
import type { Parcel } from "@/types/parcel";

// Live score breakdown + event timeline, recomputed in-browser from vcpp city
// data (REVERSE-ENGINEERING.md §7) — the analytical heart of the original.

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; result: ScoreResult };

const HUE: Record<string, string> = {
  vacancy: "#c12226",
  burden: "#e07b1a",
  nuisance: "#e07b1a",
  tax: "#caa21a",
};

function ScoreSection({ label, score, contributions, kind }: {
  label: string;
  score: ScoreCategory;
  contributions: Contribution[];
  kind: "vacancy" | "burden" | "nuisance" | "tax";
}) {
  const [expanded, setExpanded] = useState(false);
  const top = expanded ? contributions : contributions.slice(0, 3);
  return (
    <div className="score-section">
      <div className="score-head">
        <span className="score-name">{label}</span>
        <span className="score-verbal" title={`${score.total}/100`} style={{ opacity: score.total > 40 ? score.total / 100 : 0.5 }}>
          {score.verbal}
        </span>
      </div>
      <div className="score-bar">
        <div className="score-fill" style={{ width: `${score.total}%`, background: HUE[kind] }} />
      </div>
      {contributions.length > 0 && (
        <ul className="score-contribs">
          {top.map((c, i) => (
            <li key={i}>
              <span className="contrib-cat">{c.category}:</span> <span className="contrib-type">{c.type}</span>
              <span className="contrib-amt">{Math.round(c.amount)}</span>
            </li>
          ))}
          {contributions.length > 3 && (
            <li className="contrib-more" onClick={() => setExpanded((e) => !e)}>
              {expanded ? "show less" : `${contributions.length - 3} more`}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function eventDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}.${d.getMonth() + 1}`;
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  const [open, setOpen] = useState(false);
  const shown = events.filter((e) => Number.isFinite(e.date) && e.date <= Date.now());
  if (shown.length === 0) return null;
  return (
    <section className="event-timeline">
      <button className="timeline-toggle" onClick={() => setOpen((o) => !o)}>
        Indicators Over Time ({shown.length}) <span className={`tl-arrow ${open ? "down" : ""}`}>▸</span>
      </button>
      {open && (
        <table className="timeline-table">
          <tbody>
            {shown.map((e, i) => (
              <tr key={i}>
                <td className="tl-date">{eventDate(e.date)}</td>
                <td>
                  <span className="tl-cat">{e.category}:</span> <span className="tl-type">{e.type}</span>
                  {(e.desc || e.amt) && (
                    <span className="tl-desc">
                      {" "}
                      ({e.desc || ""}{e.amt ? `${e.desc ? "; " : ""}$${numberWithCommas(e.amt)}` : ""})
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function ScorePanel({ parcel }: { parcel: Parcel }) {
  const brand = useStore((s) => s.brand);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchCityData(parcel.ParcelId).then((data) => {
      if (cancelled) return;
      if (!data) {
        setState({ status: "error" });
        return;
      }
      const result = scoreAndTimeline(data, {
        Type: parcel.Type,
        OwnerName: parcel.OwnerName,
        Handle: parcel.Handle,
        ParcelId: parcel.ParcelId,
        IsLra: parcel.IsLra,
        IsLcra: parcel.IsLcra,
      });
      setState({ status: "ok", result });
    });
    return () => {
      cancelled = true;
    };
  }, [parcel.ParcelId, parcel.Type, parcel.OwnerName, parcel.Handle, parcel.IsLra, parcel.IsLcra]);

  if (state.status === "loading") {
    return <div className="score-panel score-loading">Computing live score from city records…</div>;
  }
  if (state.status === "error") {
    return (
      <div className="score-panel score-error">
        Live city data unavailable for this parcel (the St. Louis VCPP service may be down).
      </div>
    );
  }

  const r = state.result;

  // Confirmed-vacant factors
  const vacancyLabel = r.vacant ? "Vacancy: Definite" : "Vacancy";

  return (
    <div className="score-panel">
      <ScoreSection label={vacancyLabel} score={r.vacancy} contributions={r.contributions.vacancy} kind="vacancy" />
      {r.vacant && r.vacantFactors.length > 0 && (
        <ul className="vacant-factors">
          {r.vacantFactors.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}

      {brand === "lsem" ? (
        <>
          <ScoreSection label="Nuisance" score={r.nuisance} contributions={r.contributions.nuisance} kind="nuisance" />
          <ScoreSection label="Tax" score={r.tax} contributions={r.contributions.tax} kind="tax" />
        </>
      ) : (
        r.vacancy.total >= 30 && (
          <ScoreSection label="Public Burden" score={r.burden} contributions={r.contributions.burden} kind="burden" />
        )
      )}

      <Timeline events={r.timeline} />
    </div>
  );
}
