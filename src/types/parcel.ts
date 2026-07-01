// Runtime parcel shape (mirrors scripts/lib/mapping.mjs output and the
// original app's vector-tile property names, REVERSE-ENGINEERING.md §6).

export type VacDesc =
  | "Definite"
  | "Very Likely"
  | "Possible"
  | "Indeterminant"
  | "Not Vacant";

export type ParcelCategory = "building" | "lot";

// The shipped points backbone (public/data/parcels.json) carries only the fields
// the client actually reads — see INDEX_FIELDS / slimParcel in
// scripts/build-parcels.mjs. Those are the required members below. The optional
// members are produced by the CSV pipeline (mapping.mjs) but dropped from the
// shipped backbone to save ~21% of its bytes; nothing in src/ reads them today,
// so they're marked optional to flag any future access as possibly-undefined.
export interface Parcel {
  ParcelId: string;
  Handle: string;
  Address: string;
  Ward20: number;
  NhdName: string;
  lat: number;
  lng: number;
  Type: string;
  category: ParcelCategory;
  SqFt: number;
  OwnerName: string;
  OwnerState: string;
  OwnerLoc: "city" | "mo" | "outofstate" | "unknown";
  Vacancy: number;
  VacDesc: VacDesc;
  Burden: number;
  BurdenCat: string;
  BoardUp: boolean;
  IsLra: boolean;
  IsLcra: boolean;
  TaxYrsDel: number;
  VacRegMonths: number;
  Forestry: string;
  Condemned: boolean;
  isMpo: boolean; // owner holds >1 vacant property (LSEM single/multi split)

  // Dropped from the shipped backbone (0 client reads) — present only in the
  // raw CSV mapping output:
  StAddrNum?: string;
  StNameFull?: string;
  Zip?: string;
  CensTract20?: string;
  OwnerZip?: string;
  BldgAge?: number;
  Vacancy2?: number;
  VacDesc2?: string;
  CSBVacancy?: number;
  CSBNuisance?: number;
  BldgsRes?: number;
  BldgsCom?: number;
  ResUnits?: number;
}

export interface DataMeta {
  count: number;
  buildings: number;
  lots: number;
  lra: number;
  condemned: number;
  bbox: [number, number, number, number];
  center: [number, number];
}
