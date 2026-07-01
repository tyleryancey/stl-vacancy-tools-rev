import { VACANCY_LEGEND, VACANCY_LEGEND_CVD } from "@/config/colors";
import { useStore } from "@/state/store";

export function Legend() {
  const colorblind = useStore((s) => s.colorblind);
  const toggleColorblind = useStore((s) => s.toggleColorblind);
  const legend = colorblind ? VACANCY_LEGEND_CVD : VACANCY_LEGEND;

  return (
    <div className="legend">
      <div className="legend-title">Likelihood vacant</div>
      <div className="legend-cols">
        <div>
          <div className="legend-subtitle">Buildings</div>
          {legend.building.map((s) => (
            <div className="legend-item" key={s.label}>
              <span className="legend-swatch" style={{ background: s.color }} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="legend-subtitle">Empty lots</div>
          {legend.lot.map((s) => (
            <div className="legend-item" key={s.label}>
              <span className="legend-swatch" style={{ background: s.color }} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
      <label className="legend-cvd">
        <input type="checkbox" checked={colorblind} onChange={toggleColorblind} />
        <span>Colorblind-safe colors</span>
      </label>
    </div>
  );
}
