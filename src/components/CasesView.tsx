import { useMemo, useState } from "react";
import { useStore } from "@/state/store";
import { getParcels } from "@/data/parcels";
import { selectAndFly, findByParcelId } from "@/lib/select";
import type { CaseRecord } from "@/services/types";

// The "Cases" tab — a sortable table over the user's visible cases
// (ports renderCasesView, §8.4). LSEM only. All data here is fictional sample data.

function assignedRole(assignment: string, role: string): string {
  // assignment is "Name(Role), Name(Role), ..."
  const part = assignment.split(",").map((s) => s.trim()).find((s) => s.toLowerCase().includes(`(${role}`.toLowerCase()));
  return part ? part.replace(/\(.*\)/, "").trim() : "";
}

interface Column {
  key: string;
  label: string;
  cell: (c: CaseRecord) => string;
  sort: (c: CaseRecord) => string | number;
}

const COLUMNS: Column[] = [
  { key: "caseId", label: "Case ID", cell: (c) => c.caseId, sort: (c) => c.caseId },
  { key: "title", label: "Property", cell: (c) => c.caseTitle, sort: (c) => c.caseTitle.toLowerCase() },
  { key: "nhd", label: "Neighborhood", cell: (c) => c.neighborhood, sort: (c) => c.neighborhood },
  { key: "code", label: "Legal Code", cell: (c) => String(c.legalCode), sort: (c) => c.legalCode },
  { key: "primary", label: "Primary", cell: (c) => assignedRole(c.assignment, "Primary"), sort: (c) => assignedRole(c.assignment, "Primary") },
  { key: "paralegal", label: "Paralegal", cell: (c) => assignedRole(c.assignment, "Paralegal"), sort: (c) => assignedRole(c.assignment, "Paralegal") },
  { key: "opened", label: "Opened", cell: (c) => c.openDate, sort: (c) => c.openDate },
  { key: "disp", label: "Disposition", cell: (c) => c.disposition, sort: (c) => c.disposition },
  { key: "status", label: "Status", cell: (c) => c.status, sort: (c) => c.status },
  { key: "docket", label: "Docket", cell: (c) => c.docket, sort: (c) => c.docket },
];

export function CasesView() {
  const view = useStore((s) => s.view);
  const cases = useStore((s) => s.cases);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "caseId", dir: "asc" });

  const rows = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[0];
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...cases].sort((a, b) => {
      const va = col.sort(a), vb = col.sort(b);
      if (typeof va === "number" && typeof vb === "number") return sign * (va - vb);
      return sign * String(va).localeCompare(String(vb));
    });
  }, [cases, sort]);

  if (view !== "cases") return null;

  const onSort = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const openCase = (c: CaseRecord) => {
    useStore.getState().selectCase(c.caseId);
    const parcel = findByParcelId(c.parcelId, getParcels());
    if (parcel) selectAndFly(parcel);
  };

  return (
    <div className="cases-view">
      <div className="cases-toolbar">
        <span className="cases-title">Cases</span>
        <span className="cases-count">{rows.length} cases</span>
        <span className="cases-sample-tag">⚠ fictional sample data — not real cases</span>
      </div>
      {rows.length === 0 ? (
        <p className="list-empty">No cases assigned to this account.</p>
      ) : (
        <div className="list-table-wrap">
          <table className="list-table cases-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} className={sort.key === c.key ? "sorted" : undefined} onClick={() => onSort(c.key)}>
                    {c.label}{sort.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.caseId} onClick={() => openCase(c)}>
                  {COLUMNS.map((col) => (
                    <td key={col.key}>{col.cell(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
