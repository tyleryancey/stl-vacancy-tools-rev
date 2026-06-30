import { useEffect } from "react";
import { MapView } from "@/map/MapView";
import { SidePanel } from "@/components/SidePanel";
import { Legend } from "@/components/Legend";
import { FilterPanel } from "@/components/FilterPanel";
import { SearchBar } from "@/components/SearchBar";
import { MpoPanel } from "@/components/MpoPanel";
import { ListView } from "@/components/ListView";
import { StatsPage } from "@/components/StatsPage";
import { CasesView } from "@/components/CasesView";
import { LoginModal } from "@/components/LoginModal";
import { ViewNav } from "@/components/ViewNav";
import { useStore } from "@/state/store";
import { loadMpo } from "@/data/parcels";
import { applyDeepLink } from "@/lib/deeplink";

function LsemLegend() {
  return (
    <div className="legend lsem-legend">
      <div className="legend-title">Composite distress (Vacancy + Burden)</div>
      <div className="lsem-legend-row">
        <span className="lsem-ramp single" /> Single owner (low → high)
      </div>
      <div className="lsem-legend-row">
        <span className="lsem-ramp multi" /> Multi-property owner
      </div>
      <div className="lsem-legend-row">
        <span className="legend-swatch" style={{ background: "rgba(150,100,50,0.85)" }} /> LRA / land-bank owned
      </div>
    </div>
  );
}

export default function App() {
  const dataReady = useStore((s) => s.dataReady);
  const view = useStore((s) => s.view);
  const brand = useStore((s) => s.brand);

  useEffect(() => {
    loadMpo();
    useStore.getState().initAuth();
  }, []);

  useEffect(() => {
    if (dataReady) applyDeepLink();
  }, [dataReady]);

  return (
    <div className="app">
      <header className="app-header">
        <ViewNav />
      </header>

      <main className="app-main">
        <MapView />

        {view === "map" && (
          <>
            <SearchBar />
            {brand === "public" ? <FilterPanel /> : null}
            {brand === "public" ? <Legend /> : <LsemLegend />}
            <MpoPanel />
            <SidePanel />
          </>
        )}

        <ListView />
        <StatsPage />
        <CasesView />
        <LoginModal />

        {!dataReady && <div className="loading">Loading 22,000+ vacant parcels…</div>}
      </main>
    </div>
  );
}
