import { useEffect, useState } from "react";
import { useStore } from "@/state/store";
import { STATS_URL } from "@/config/constants";
import { loadParcels } from "@/data/parcels";
import { loadTimelines } from "@/data/timelines";
import { fixOwnerName, numberWithCommas, toTitleCase } from "@/lib/format";

// Aggregate dashboard (REVERSE-ENGINEERING.md §10.10, stats.html). Reads a
// pre-baked /data/stats.json (built by scripts/build-stats.mjs) so the page is
// instant and independent of the big parcels.geojson load.

interface KeyCount {
  key: string;
  count: number;
}
interface OwnerCount {
  name: string;
  count: number;
}
interface Stats {
  totals: { parcels: number; buildings: number; lots: number };
  byNeighborhood: KeyCount[];
  byWard: KeyCount[];
  byType: KeyCount[];
  byBurdenCat: KeyCount[];
  byVacDesc: KeyCount[];
  topOwners: OwnerCount[];
}

// Certainty colors mirror the building Reds ramp (config/colors.ts) so the
// VacDesc distribution reads the same as the map legend.
const VAC_DESC_COLOR: Record<string, string> = {
  Definite: "rgb(193,34,38)",
  "Very Likely": "rgb(235,106,79)",
  Possible: "rgb(243,174,149)",
  Indeterminant: "rgb(251,228,218)",
  "Not Vacant": "rgb(180,180,180)",
};

function BarRow({
  label,
  count,
  max,
  color,
  onClick,
}: {
  label: React.ReactNode;
  count: number;
  max: number;
  color?: string;
  onClick?: () => void;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="stat-bar-row">
      <div className="stat-bar-label">
        {onClick ? (
          <button className="stat-bar-link" onClick={onClick}>
            {label}
          </button>
        ) : (
          <span>{label}</span>
        )}
      </div>
      <div className="stat-bar-track">
        <div
          className="stat-bar-fill"
          style={color ? { width: `${pct}%`, background: color } : { width: `${pct}%` }}
        />
      </div>
      <div className="stat-bar-count">{numberWithCommas(count)}</div>
    </div>
  );
}

interface Trend {
  nhd: string;
  n: number;
  avg: number[]; // 48-month average vacancy
}

// Aggregates the pre-baked per-parcel timelines into per-neighborhood 4-year
// vacancy trends (plan C-i). Renders nothing if no timeline data is available.
function NeighborhoodTrends() {
  const [trends, setTrends] = useState<Trend[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadParcels(), loadTimelines()]).then(([fc, tl]) => {
      if (cancelled) return;
      // Hide the section entirely when no timelines have been pre-baked — a
      // trend built purely from flat-filled values would be uninformative.
      if (Object.keys(tl).length === 0) return;
      const acc = new Map<string, { sum: number[]; n: number }>();
      // Average over EVERY vacant parcel in the neighborhood: use its stored
      // (varying) 48-month series when present, else a flat series at its current
      // score. Aggregating only over parcels-that-changed would exclude the
      // stably-vacant majority and bias the trend low.
      for (const f of fc.features) {
        const p = f.properties;
        if (!p.NhdName) continue;
        const series = tl[p.ParcelId];
        const hasSeries = Array.isArray(series) && series.length === 48;
        let e = acc.get(p.NhdName);
        if (!e) { e = { sum: new Array(48).fill(0), n: 0 }; acc.set(p.NhdName, e); }
        for (let i = 0; i < 48; i++) e.sum[i] += hasSeries ? series[i] : p.Vacancy;
        e.n++;
      }
      const out = [...acc.entries()]
        .filter(([, e]) => e.n >= 5)
        .map(([nhd, e]) => ({ nhd, n: e.n, avg: e.sum.map((s) => s / e.n) }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 12);
      setTrends(out);
    });
    return () => { cancelled = true; };
  }, []);

  if (trends.length === 0) return null;

  const W = 120, H = 36;
  return (
    <section className="stats-section">
      <h2>Vacancy trend by neighborhood (last 4 years)</h2>
      <p className="trend-note">Average vacancy score over time, for neighborhoods with pre-computed timelines.</p>
      <div className="trend-grid">
        {trends.map((t) => {
          const pts = t.avg.map((v, i) => `${((i / 47) * W).toFixed(1)},${(H - (v / 100) * H).toFixed(1)}`).join(" ");
          const delta = Math.round(t.avg[47] - t.avg[0]);
          return (
            <div className="trend-cell" key={t.nhd}>
              <div className="trend-label">{toTitleCase(t.nhd)}</div>
              <svg className="trend-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                <polyline points={pts} />
              </svg>
              <div className="trend-meta">
                {t.n} parcels · {delta > 0 ? "+" : ""}{delta} pts
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function StatsPage() {
  const view = useStore((s) => s.view);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(STATS_URL)
      .then((r) => r.json())
      .then((d: Stats) => {
        if (!cancelled) setStats(d);
      })
      .catch(() => {
        /* leave stats null -> loading placeholder */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (view !== "stats") return null;

  if (!stats) {
    return (
      <div className="stats-page">
        <div className="stats-loading">Loading statistics…</div>
      </div>
    );
  }

  const nhdTop = stats.byNeighborhood.slice(0, 15);
  const nhdMax = Math.max(1, ...nhdTop.map((d) => d.count));
  const ownersTop = stats.topOwners.slice(0, 20);
  const ownerMax = Math.max(1, ...ownersTop.map((d) => d.count));
  const vacMax = Math.max(1, ...stats.byVacDesc.map((d) => d.count));
  const typeMax = Math.max(1, ...stats.byType.map((d) => d.count));

  const openNeighborhood = (key: string) => {
    const s = useStore.getState();
    s.setListQuery({ type: "neighborhood", value: key });
    s.setView("list");
  };

  const openOwner = (name: string) => {
    const s = useStore.getState();
    s.openMpoPanel(name);
    s.setView("map");
  };

  return (
    <div className="stats-page">
      <header className="stats-header">
        <h1>Vacancy by the numbers</h1>
        <p className="stats-subtitle">
          A snapshot of likely-vacant parcels across the City of St. Louis.
        </p>
      </header>

      <section className="stats-toplines">
        <div className="stat-card">
          <div className="stat-card-num">{numberWithCommas(stats.totals.parcels)}</div>
          <div className="stat-card-label">Vacant Parcels</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-num">{numberWithCommas(stats.totals.buildings)}</div>
          <div className="stat-card-label">Buildings</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-num">{numberWithCommas(stats.totals.lots)}</div>
          <div className="stat-card-label">Empty Lots</div>
        </div>
      </section>

      <section className="stats-section">
        <h2>Neighborhoods with the most vacancy</h2>
        <div className="stat-bars">
          {nhdTop.map((n) => (
            <BarRow
              key={n.key}
              label={n.key}
              count={n.count}
              max={nhdMax}
              onClick={() => openNeighborhood(n.key)}
            />
          ))}
        </div>
      </section>

      <section className="stats-section">
        <h2>Private owners with the most vacant properties</h2>
        <div className="stat-bars">
          {ownersTop.map((o) => (
            <BarRow
              key={o.name}
              label={fixOwnerName(o.name)}
              count={o.count}
              max={ownerMax}
              onClick={() => openOwner(o.name)}
            />
          ))}
        </div>
      </section>

      <NeighborhoodTrends />

      <div className="stats-dist">
        <section className="stats-section">
          <h2>Likelihood vacant</h2>
          <div className="stat-bars">
            {stats.byVacDesc.map((d) => (
              <BarRow
                key={d.key}
                label={d.key}
                count={d.count}
                max={vacMax}
                color={VAC_DESC_COLOR[d.key]}
              />
            ))}
          </div>
        </section>

        <section className="stats-section">
          <h2>Property type</h2>
          <div className="stat-bars">
            {stats.byType.map((d) => (
              <BarRow key={d.key} label={d.key} count={d.count} max={typeMax} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
