// Runtime parcel shape (mirrors scripts/lib/mapping.mjs output and the
// original app's vector-tile property names, REVERSE-ENGINEERING.md §6).

export type VacDesc =
  | "Definite"
  | "Very Likely"
  | "Possible"
  | "Indeterminant"
  | "Not Vacant";

export type ParcelCategory = "building" | "lot";

export interface Parcel {
  ParcelId: string;
  Handle: string;
  Address: string;
  StAddrNum: string;
  StNameFull: string;
  Zip: string;
  Ward20: number;
  NhdName: string;
  CensTract20: string;
  lat: number;
  lng: number;
  Type: string;
  category: ParcelCategory;
  SqFt: number;
  OwnerName: string;
  OwnerState: string;
  OwnerZip: string;
  OwnerLoc: "city" | "mo" | "outofstate" | "unknown";
  BldgAge: number;
  Vacancy: number;
  VacDesc: VacDesc;
  Vacancy2: number;
  VacDesc2: string;
  Burden: number;
  BurdenCat: string;
  BoardUp: boolean;
  IsLra: boolean;
  IsLcra: boolean;
  TaxYrsDel: number;
  VacRegMonths: number;
  Forestry: string;
  CSBVacancy: number;
  CSBNuisance: number;
  Condemned: boolean;
  BldgsRes: number;
  BldgsCom: number;
  ResUnits: number;
  isMpo: boolean; // owner holds >1 vacant property (LSEM single/multi split)
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
