import type { Map as MlMap, FilterSpecification, ExpressionSpecification } from "maplibre-gl";
import type { Filters } from "@/state/store";
import type { VacDesc } from "@/types/parcel";

// Translates the filter UI state into Mapbox/MapLibre filter expressions and
// applies them to the public layers (REVERSE-ENGINEERING.md §5.6 / §10.8).

export interface FilterInputs {
  filters: Filters;
  certaintyVisible: Record<VacDesc, boolean>;
}

function commonClauses({ filters, certaintyVisible }: FilterInputs): ExpressionSpecification[] {
  const clauses: ExpressionSpecification[] = [];

  // certainty tiers
  const visible = (Object.keys(certaintyVisible) as VacDesc[]).filter(
    (d) => certaintyVisible[d] && d !== "Not Vacant"
  );
  clauses.push(["in", ["get", "VacDesc"], ["literal", visible]] as ExpressionSpecification);

  // ownership
  if (filters.ownership === "lra") clauses.push(["==", ["get", "IsLra"], true]);
  else if (filters.ownership === "private") clauses.push(["!=", ["get", "IsLra"], true]);

  // owner location
  if (filters.ownerLoc !== "all")
    clauses.push(["==", ["get", "OwnerLoc"], filters.ownerLoc]);

  // tax delinquency
  if (filters.minTaxYrsDel > 0)
    clauses.push([">=", ["get", "TaxYrsDel"], filters.minTaxYrsDel]);

  if (filters.condemnedOnly) clauses.push(["==", ["get", "Condemned"], true]);
  if (filters.boardedOnly) clauses.push(["==", ["get", "BoardUp"], true]);

  return clauses;
}

export function applyPublicFilters(map: MlMap, inputs: FilterInputs): void {
  const common = commonClauses(inputs);

  const bldgFilter: FilterSpecification = [
    "all",
    ["==", ["get", "category"], "building"],
    ...common,
  ];
  const lotFilter: FilterSpecification = [
    "all",
    ["==", ["get", "category"], "lot"],
    ...common,
  ];

  if (map.getLayer("public_bldg")) {
    map.setFilter("public_bldg", bldgFilter);
    map.setLayoutProperty(
      "public_bldg",
      "visibility",
      inputs.filters.showBuildings ? "visible" : "none"
    );
  }
  if (map.getLayer("public_lot")) {
    map.setFilter("public_lot", lotFilter);
    map.setLayoutProperty(
      "public_lot",
      "visibility",
      inputs.filters.showLots ? "visible" : "none"
    );
  }
}
