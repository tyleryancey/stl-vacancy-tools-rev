import { useStore } from "@/state/store";
import type { ViewMode } from "@/state/store";

export function ViewNav() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const brand = useStore((s) => s.brand);
  const user = useStore((s) => s.user);
  const setLoginOpen = useStore((s) => s.setLoginOpen);
  const logout = useStore((s) => s.logout);

  const views: { id: ViewMode; label: string }[] = [
    { id: "map", label: "Map" },
    { id: "list", label: "List" },
    { id: "stats", label: "Stats" },
  ];
  if (brand === "lsem") views.push({ id: "cases", label: "Cases" });

  const title = brand === "lsem" ? "LSEM Vacancy Explorer" : "STL Vacancy Explorer";

  return (
    <>
      <h1 className="brand-title">
        {title}
        {brand === "lsem" && <span className="lsem-tag">LSEM</span>}
      </h1>

      <nav className="view-nav" aria-label="Views">
        {views.map((v) => (
          <button
            key={v.id}
            className={`view-nav-btn${view === v.id ? " active" : ""}`}
            aria-current={view === v.id ? "page" : undefined}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </nav>

      <div className="header-nav">
        {user ? (
          <>
            <span className="logged-in-as">
              {user.displayName}
              {user.role && <span className="user-role">{user.role}</span>}
            </span>
            <button className="auth-btn" onClick={() => logout()}>Log out</button>
          </>
        ) : (
          <button className="auth-btn" onClick={() => setLoginOpen(true)}>Log in</button>
        )}
        <a className="header-link" href="https://www.stlvacancy.com/" target="_blank" rel="noreferrer">
          Vacancy Collaborative
        </a>
      </div>
    </>
  );
}
