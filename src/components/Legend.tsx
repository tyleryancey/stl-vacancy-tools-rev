import { VACANCY_LEGEND } from "@/config/colors";

export function Legend() {
  return (
    <div className="legend">
      <div className="legend-title">Likelihood vacant</div>
      <div className="legend-cols">
        <div>
          <div className="legend-subtitle">Buildings</div>
          {VACANCY_LEGEND.building.map((s) => (
            <div className="legend-item" key={s.label}>
              <span className="legend-swatch" style={{ background: s.color }} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="legend-subtitle">Empty lots</div>
          {VACANCY_LEGEND.lot.map((s) => (
            <div className="legend-item" key={s.label}>
              <span className="legend-swatch" style={{ background: s.color }} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
