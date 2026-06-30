// Maps the published CSV schema (REVERSE-ENGINEERING.md §6.2) onto the
// runtime-style property set the client renders/filters on (§6.1 "renamed"
// bucket). Keeps names aligned with the original app's vector-tile properties
// so the layer paint expressions read naturally.

const LOT_TYPES = new Set(["Empty Lot"]);

export function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
export function bool(v) {
  return v === "true" || v === true || v === "1";
}

// Type -> derived structure counts, so building/commercial/unit filters work
// later without separate geometry data.
function deriveStructure(type) {
  switch (type) {
    case "Single-Family":
      return { BldgsRes: 1, BldgsCom: 0, ResUnits: 1 };
    case "Duplex":
      return { BldgsRes: 1, BldgsCom: 0, ResUnits: 2 };
    case "Multi-Unit":
      return { BldgsRes: 1, BldgsCom: 0, ResUnits: 3 };
    case "Commercial":
      return { BldgsRes: 0, BldgsCom: 1, ResUnits: 0 };
    case "Mixed-Use":
      return { BldgsRes: 1, BldgsCom: 1, ResUnits: 1 };
    case "Empty Lot":
    default:
      return { BldgsRes: 0, BldgsCom: 0, ResUnits: 0 };
  }
}

// Owner ZIP -> location class used by the LSEM "Owner Location" filter (§10.8).
export function ownerLocation(zip) {
  const z = parseInt(zip, 10);
  if (!Number.isFinite(z)) return "unknown";
  if (z >= 63101 && z <= 63199) return "city";
  if ((z >= 63005 && z <= 63100) || (z >= 63200 && z <= 65899)) return "mo";
  return "outofstate";
}

export function mapParcel(r) {
  const type = r.Type || "";
  const isLot = LOT_TYPES.has(type);
  const struct = deriveStructure(type);
  const addr = [r.StAddrNum, r.StNameFull].filter(Boolean).join(" ").trim();

  return {
    ParcelId: r.ParcelId,
    Handle: r.Handle,
    Address: addr,
    StAddrNum: r.StAddrNum,
    StNameFull: r.StNameFull,
    Zip: r.Zip,
    Ward20: num(r.Ward20),
    NhdName: r.NhdName,
    CensTract20: r.CensTract20,
    lat: num(r.Lat),
    lng: num(r.Lng),
    Type: type,
    category: isLot ? "lot" : "building",
    SqFt: num(r.ParcelSqFt),
    OwnerName: r.OwnerName,
    OwnerState: r.OwnerState,
    OwnerZip: r.OwnerZip,
    OwnerLoc: ownerLocation(r.OwnerZip),
    BldgAge: num(r.BldgAge),
    // Vacancy: graduated 0-100 score; VacDesc: verbal band == CSV VacancyCat.
    Vacancy: num(r.Vacancy),
    VacDesc: r.VacancyCat || "Not Vacant",
    Vacancy2: num(r.Vacancy2),
    VacDesc2: r.VacancyCat2 || "",
    Burden: num(r.Burden),
    BurdenCat: r.BurdenCat || "Zero",
    BoardUp: bool(r.BoardUp),
    IsLra: bool(r.IsLRA),
    IsLcra: false, // not distinguished in the public CSV; tilesets split it
    TaxYrsDel: num(r.TaxYrsDel),
    VacRegMonths: num(r.VacRegMonths),
    Forestry: r.Forestry || "",
    CSBVacancy: num(r.CSBVacancy),
    CSBNuisance: num(r.CSBNuisance),
    Condemned: bool(r.Condemned),
    ...struct,
  };
}
