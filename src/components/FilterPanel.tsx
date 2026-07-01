import { useState } from "react";
import { useStore, ALL_VAC_DESC } from "@/state/store";
import type { Ownership, OwnerLoc } from "@/state/store";
import { VACANCY_LEGEND } from "@/config/colors";

// Floating control panel (top-left) for the public map filters. Pure
// presentational + Zustand wiring — the map reads the same store and re-renders.

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="filter-toggle">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="filter-toggle-label">{label}</span>
    </label>
  );
}

function Segmented<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="filter-segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`filter-segment${value === o.value ? " active" : ""}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const OWNERSHIP_OPTIONS: { value: Ownership; label: string }[] = [
  { value: "all", label: "All" },
  { value: "lra", label: "LRA-owned" },
  { value: "private", label: "Private" },
];

const OWNER_LOC_OPTIONS: { value: OwnerLoc; label: string }[] = [
  { value: "all", label: "All" },
  { value: "city", label: "In city" },
  { value: "mo", label: "Missouri" },
  { value: "outofstate", label: "Out of state" },
];

const TAX_YRS_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Any" },
  { value: 1, label: "1+" },
  { value: 2, label: "2+" },
  { value: 3, label: "3+" },
  { value: 4, label: "4+" },
];

export function FilterPanel() {
  // Start collapsed on small screens so the panel doesn't cover the map.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches
  );

  const dataReady = useStore((s) => s.dataReady);
  const filters = useStore((s) => s.filters);
  const certaintyVisible = useStore((s) => s.certaintyVisible);
  const overlayCondemned = useStore((s) => s.overlayCondemned);

  const setFilter = useStore((s) => s.setFilter);
  const resetFilters = useStore((s) => s.resetFilters);
  const toggleCertainty = useStore((s) => s.toggleCertainty);
  const toggleOverlayCondemned = useStore((s) => s.toggleOverlayCondemned);

  if (!dataReady) {
    return (
      <div className="filter-panel filter-panel--loading">
        <div className="filter-panel-title">Filters</div>
        <div className="filter-loading">Loading data…</div>
      </div>
    );
  }

  return (
    <div className="filter-panel" aria-label="Map filters">
      <button
        type="button"
        className="filter-panel-header"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="filter-panel-title">Filters</span>
        <span className="filter-panel-chevron" aria-hidden="true">
          {collapsed ? "+" : "−"}
        </span>
      </button>

      {!collapsed && (
        <div className="filter-panel-body">
          <section className="filter-section">
            <div className="filter-section-label">Type</div>
            <div className="filter-toggle-group">
              <Toggle
                label="Buildings"
                checked={filters.showBuildings}
                onChange={() => setFilter("showBuildings", !filters.showBuildings)}
              />
              <Toggle
                label="Empty lots"
                checked={filters.showLots}
                onChange={() => setFilter("showLots", !filters.showLots)}
              />
            </div>
          </section>

          <section className="filter-section">
            <div className="filter-section-label">Likelihood vacant</div>
            <div className="filter-certainty-list">
              {ALL_VAC_DESC.map((tier, i) => (
                <label className="filter-certainty" key={tier}>
                  <input
                    type="checkbox"
                    checked={certaintyVisible[tier]}
                    onChange={() => toggleCertainty(tier)}
                  />
                  <span className="filter-cert-swatches" aria-hidden="true">
                    <span
                      className="filter-swatch"
                      style={{ background: VACANCY_LEGEND.building[i].color }}
                    />
                    <span
                      className="filter-swatch"
                      style={{ background: VACANCY_LEGEND.lot[i].color }}
                    />
                  </span>
                  <span className="filter-cert-label">{tier}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="filter-section">
            <div className="filter-section-label">Ownership</div>
            <Segmented
              ariaLabel="Ownership"
              value={filters.ownership}
              options={OWNERSHIP_OPTIONS}
              onChange={(v) => setFilter("ownership", v)}
            />
          </section>

          <section className="filter-section">
            <label className="filter-field">
              <span className="filter-section-label">Owner location</span>
              <select
                className="filter-select"
                value={filters.ownerLoc}
                onChange={(e) => setFilter("ownerLoc", e.target.value as OwnerLoc)}
              >
                {OWNER_LOC_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="filter-section">
            <label className="filter-field">
              <span className="filter-section-label">Min. tax years delinquent</span>
              <select
                className="filter-select"
                value={filters.minTaxYrsDel}
                onChange={(e) => setFilter("minTaxYrsDel", Number(e.target.value))}
              >
                {TAX_YRS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="filter-section">
            <div className="filter-toggle-group">
              <Toggle
                label="Condemned only"
                checked={filters.condemnedOnly}
                onChange={() => setFilter("condemnedOnly", !filters.condemnedOnly)}
              />
              <Toggle
                label="Boarded up only"
                checked={filters.boardedOnly}
                onChange={() => setFilter("boardedOnly", !filters.boardedOnly)}
              />
              <Toggle
                label="Condemned overlay"
                checked={overlayCondemned}
                onChange={toggleOverlayCondemned}
              />
            </div>
          </section>

          <button type="button" className="filter-reset" onClick={resetFilters}>
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}
