import type { Map as MlMap, FilterSpecification, ExpressionSpecification } from "maplibre-gl";
import type { Filters } from "@/state/store";
import type { VacDesc } from "@/types/parcel";
import { PUBLIC_FILTER_TARGETS } from "@/map/layers/publicLayers";

// Translates filter UI state into MapLibre filter expressions and applies them to
// the public circle + fill layers (REVERSE-ENGINEERING.md §5.6 / §10.8).

export interface FilterInputs {
  filters: Filters;
  certaintyVisible: Record<VacDesc, boolean>;
}

function commonClauses({ filters, certaintyVisible }: FilterInputs): ExpressionSpecification[] {
  const clauses: ExpressionSpecification[] = [];

  const visible = (Object.keys(certaintyVisible) as VacDesc[]).filter(
    (d) => certaintyVisible[d] && d !== "Not Vacant"
  );
  clauses.push(["in", ["get", "VacDesc"], ["literal", visible]] as ExpressionSpecification);

  if (filters.ownership === "lra") clauses.push(["==", ["get", "IsLra"], true]);
  else if (filters.ownership === "private") clauses.push(["!=", ["get", "IsLra"], true]);

  if (filters.ownerLoc !== "all") clauses.push(["==", ["get", "OwnerLoc"], filters.ownerLoc]);
  if (filters.minTaxYrsDel > 0) clauses.push([">=", ["get", "TaxYrsDel"], filters.minTaxYrsDel]);
  if (filters.condemnedOnly) clauses.push(["==", ["get", "Condemned"], true]);
  if (filters.boardedOnly) clauses.push(["==", ["get", "BoardUp"], true]);

  return clauses;
}

export function applyPublicFilters(map: MlMap, inputs: FilterInputs): void {
  const common = commonClauses(inputs);
  const { showBuildings, showLots } = inputs.filters;

  for (const { id, base } of PUBLIC_FILTER_TARGETS) {
    if (!map.getLayer(id)) continue;
    const filter: FilterSpecification = ["all", base as ExpressionSpecification, ...common];
    map.setFilter(id, filter);
    const isBldg = id.includes("bldg");
    const visible = isBldg ? showBuildings : showLots;
    map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}
