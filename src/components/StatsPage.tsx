import { useEffect, useState } from "react";
import { useStore } from "@/state/store";
import { STATS_URL } from "@/config/constants";
import { fixOwnerName, numberWithCommas } from "@/lib/format";

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
