import { useEffect, useState } from "react";
import { useStore } from "@/state/store";
import { fetchCityData } from "@/scoring/cityData";
import { scoreAndTimeline, vacancyTimeline, type ScoreResult, type ScoreCategory, type Contribution, type TimelineEvent } from "@/scoring/scoreAndTimeline";
import { loadTimelines, getPrebakedTimeline } from "@/data/timelines";
import { numberWithCommas } from "@/lib/format";
import type { Parcel } from "@/types/parcel";

// Live score breakdown + event timeline, recomputed in-browser from vcpp city
// data (REVERSE-ENGINEERING.md §7) — the analytical heart of the original.

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ok"; result: ScoreResult; timeline: number[] | null };

// 48-month vacancy-score sparkline ("Indicators Over Time", §7.9).
function Sparkline({ values }: { values: number[] }) {
  const unchanged = values.every((v) => v === values[values.length - 1]);
  if (unchanged) {
    return (
      <section className="indicators-time">
        <div className="score-name">Indicators Over Time</div>
        <p className="sparkline-flat">Unchanged over the last 4 years.</p>
      </section>
    );
  }
  const step = 4.5;
  const h = 48;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - h * (v / 100) + 1).toFixed(1)}`);
  const poly = `0,${h + 1} ${pts.join(" ")} ${((values.length - 1) * step).toFixed(1)},${h + 1}`;
  return (
    <section className="indicators-time">
      <div className="score-name">Indicators Over Time</div>
      <svg className="sparkline" viewBox={`0 0 ${(values.length - 1) * step} ${h + 2}`} preserveAspectRatio="none">
        <polygon points={poly} />
      </svg>
      <div className="sparkline-axis">
        <span>4 yrs ago</span>
        <span>2 yrs</span>
        <span>now</span>
      </div>
    </section>
  );
}

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
        Event timeline ({shown.length}) <span className={`tl-arrow ${open ? "down" : ""}`}>▸</span>
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
    // Load the (optional) pre-baked timelines in parallel so getPrebakedTimeline
    // below reflects it; loadTimelines is memoized so this fetches at most once.
    Promise.all([fetchCityData(parcel.ParcelId), loadTimelines()]).then(([data]) => {
      if (cancelled) return;
      if (!data) {
        setState({ status: "error" });
        return;
      }
      const sp = {
        Type: parcel.Type,
        OwnerName: parcel.OwnerName,
        Handle: parcel.Handle,
        ParcelId: parcel.ParcelId,
        IsLra: parcel.IsLra,
        IsLcra: parcel.IsLcra,
      };
      const result = scoreAndTimeline(data, sp);
      // Sparkline only for non-confirmed-vacant parcels (LRA/registry/condemned
      // are pinned to 100 every month → flat), matching the original. Prefer the
      // pre-baked snapshot (plan A-iii); fall back to the live 48× recompute.
      const timeline = result.vacant
        ? null
        : getPrebakedTimeline(parcel.ParcelId) ?? vacancyTimeline(data, sp);
      setState({ status: "ok", result, timeline });
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
      {state.timeline && <Sparkline values={state.timeline} />}
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
