// Run the full data pipeline: parcels GeoJSON, MPO grouping, stats aggregates.
import { buildParcels } from "./build-parcels.mjs";
import { buildMpo } from "./build-mpo.mjs";
import { buildStats } from "./build-stats.mjs";

console.log("Building STL vacancy data artifacts...");
buildParcels();
buildMpo();
buildStats();
console.log("Done -> public/data/");
