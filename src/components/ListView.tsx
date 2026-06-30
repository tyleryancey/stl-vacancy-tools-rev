import { useMemo, useState } from "react";
import { useStore, ALL_VAC_DESC, type ListQuery } from "@/state/store";
import { getParcels } from "@/data/parcels";
import { selectAndFly } from "@/lib/select";
import { toTitleCase, fixOwnerName } from "@/lib/format";
import { download, toGeoJson, dateStamp } from "@/lib/exportData";
import type { Parcel } from "@/types/parcel";

// Sortable, exportable table view (REVERSE-ENGINEERING.md §10.7:
// renderListView / sortList / csvFromTable).

type SortDir = "asc" | "desc";

interface Column {
  key: string;
  label: string;
  // Display + CSV text for a cell.
  cell: (p: Parcel) => string;
  // Comparable value used when sorting on this column.
  sort: (p: Parcel) => string | number;
}

// Rank vacancy tiers in their semantic order (Definite first) so sorting the
// Vacancy column is meaningful rather than alphabetical.
const VAC_RANK: Record<string, number> = ALL_VAC_DESC.reduce(
  (acc, d, i) => {
    acc[d] = i;
    return acc;
  },
  {} as Record<string, number>,
);

const COLUMNS: Column[] = [
  {
    key: "address",
    label: "Address",
    cell: (p) => toTitleCase(p.Address),
    sort: (p) => (p.Address || "").toLowerCase(),
  },
  {
    key: "type",
    label: "Type",
    cell: (p) => p.Type || "",
    sort: (p) => (p.Type || "").toLowerCase(),
  },
  {
    key: "vacancy",
    label: "Vacancy",
    cell: (p) => p.VacDesc || "",
    sort: (p) => VAC_RANK[p.VacDesc] ?? 99,
  },
  {
    key: "owner",
    label: "Owner",
    cell: (p) => fixOwnerName(p.OwnerName),
    sort: (p) => (p.OwnerName || "").toLowerCase(),
  },
  {
    key: "burden",
    label: "Burden",
    cell: (p) => p.BurdenCat || "",
    sort: (p) => (p.BurdenCat || "").toLowerCase(),
  },
  {
    key: "taxyrs",
    label: "Tax Yrs",
    cell: (p) => String(p.TaxYrsDel ?? 0),
    sort: (p) => p.TaxYrsDel ?? 0,
  },
  {
    key: "parcelid",
    label: "ParcelId",
    cell: (p) => p.ParcelId || "",
    sort: (p) => (p.ParcelId || "").toLowerCase(),
  },
];

const WARDS: number[] = Array.from({ length: 28 }, (_, i) => i + 1);

function compare(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function matchesQuery(p: Parcel, q: ListQuery): boolean {
  switch (q.type) {
    case "neighborhood":
      return p.NhdName === q.value;
    case "ward":
      return p.Ward20 === Number(q.value);
    case "condemned":
      return p.Condemned === true;
  }
}

function csvEscape(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function buildCsv(rows: Parcel[]): string {
  const header = COLUMNS.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((p) => COLUMNS.map((c) => csvEscape(c.cell(p))).join(","));
  // UTF-8 BOM so Excel reads the file as UTF-8.
  return "﻿" + [header, ...lines].join("\r\n");
}

function queryLabel(q: ListQuery): string {
  switch (q.type) {
    case "neighborhood":
      return q.value ? toTitleCase(q.value) : "neighborhood";
    case "ward":
      return `Ward ${q.value}`;
    case "condemned":
      return "All condemned parcels";
  }
}

export function ListView() {
  const view = useStore((s) => s.view);
  const dataReady = useStore((s) => s.dataReady);
  const listQuery = useStore((s) => s.listQuery);
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({
    key: "address",
    dir: "asc",
  });

  // Distinct neighborhoods (sorted) + the largest one (used as the default when
  // nothing has been picked yet).
  const { neighborhoods, largestNhd } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of getParcels()) {
      const n = f.properties.NhdName;
      if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    const names = [...counts.keys()].sort((a, b) => a.localeCompare(b));
    let largest = "";
    let max = -1;
    for (const [n, c] of counts) {
      if (c > max) {
        max = c;
        largest = n;
      }
    }
    return { neighborhoods: names, largestNhd: largest };
  }, [dataReady]);

  // Sensible default until the user picks: the largest neighborhood.
  const effectiveQuery: ListQuery = listQuery ?? {
    type: "neighborhood",
    value: largestNhd,
  };

  const rows = useMemo(() => {
    const filtered = getParcels()
      .filter((f) => f.properties.Address && matchesQuery(f.properties, effectiveQuery))
      .map((f) => f.properties);
    const col = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[0];
    const sign = sort.dir === "asc" ? 1 : -1;
    filtered.sort((a, b) => sign * compare(col.sort(a), col.sort(b)));
    return filtered;
    // effectiveQuery is rebuilt every render; depend on its primitive fields.
  }, [effectiveQuery.type, effectiveQuery.value, sort.key, sort.dir, dataReady]);

  if (view !== "list") return null;
  if (!dataReady) {
    return (
      <div className="list-view">
        <p className="list-empty">Loading parcel data…</p>
      </div>
    );
  }

  const onSort = (key: string) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );

  const onPickNeighborhood = (value: string) => {
    if (value) useStore.getState().setListQuery({ type: "neighborhood", value });
  };
  const onPickWard = (value: string) => {
    if (value) useStore.getState().setListQuery({ type: "ward", value });
  };
  const onPickCondemned = () =>
    useStore.getState().setListQuery({ type: "condemned", value: "all" });

  const raw = effectiveQuery.type === "condemned" ? "condemned" : effectiveQuery.value;
  const safeName = String(raw).replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "parcels";
  const exportCsv = () => download(`${safeName}_${dateStamp()}.csv`, buildCsv(rows), "text/csv");
  const exportGeoJson = () =>
    download(`${safeName}_${dateStamp()}.geojson`, toGeoJson(rows), "application/geo+json");

  const nhdValue = effectiveQuery.type === "neighborhood" ? effectiveQuery.value : "";
  const wardValue = effectiveQuery.type === "ward" ? effectiveQuery.value : "";

  return (
    <div className="list-view">
      <div className="list-toolbar">
        <div className="list-picker">
          <select
            className="list-select"
            aria-label="Neighborhood"
            value={nhdValue}
            onChange={(e) => onPickNeighborhood(e.target.value)}
          >
            <option value="">Neighborhood…</option>
            {neighborhoods.map((n) => (
              <option key={n} value={n}>
                {toTitleCase(n)}
              </option>
            ))}
          </select>

          <select
            className="list-select"
            aria-label="Ward"
            value={wardValue}
            onChange={(e) => onPickWard(e.target.value)}
          >
            <option value="">Ward…</option>
            {WARDS.map((w) => (
              <option key={w} value={String(w)}>
                Ward {w}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={
              effectiveQuery.type === "condemned"
                ? "list-pick-btn active"
                : "list-pick-btn"
            }
            onClick={onPickCondemned}
          >
            Condemned (all)
          </button>
        </div>

        <div className="list-meta">
          <span className="list-title">{queryLabel(effectiveQuery)}</span>
          <span className="list-count">{rows.length.toLocaleString()} parcels</span>
          <button
            type="button"
            className="list-export"
            onClick={exportCsv}
            disabled={rows.length === 0}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="list-export"
            onClick={exportGeoJson}
            disabled={rows.length === 0}
          >
            Export GeoJSON
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="list-empty">No parcels match this selection.</p>
      ) : (
        <div className="list-table-wrap">
          <table className="list-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={sort.key === c.key ? "sorted" : undefined}
                    onClick={() => onSort(c.key)}
                  >
                    {c.label}
                    {sort.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.ParcelId} onClick={() => selectAndFly(p)}>
                  {COLUMNS.map((c) => (
                    <td key={c.key}>{c.cell(p)}</td>
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
