import { describe, expect, it } from "vitest";
import { bool, mapParcel, num, ownerLocation } from "./mapping.mjs";

describe("num", () => {
  it("parses numeric strings", () => {
    expect(num("42")).toBe(42);
    expect(num("3.5")).toBe(3.5);
  });

  it("defaults to 0 for empty/non-numeric input", () => {
    expect(num("")).toBe(0);
    expect(num("N/A")).toBe(0);
    expect(num(undefined)).toBe(0);
  });
});

describe("bool", () => {
  it("treats the string 'true' and '1' as true", () => {
    expect(bool("true")).toBe(true);
    expect(bool("1")).toBe(true);
  });

  it("treats everything else — including the string 'false' — as false", () => {
    expect(bool("false")).toBe(false);
    expect(bool("")).toBe(false);
    expect(bool(undefined)).toBe(false);
  });
});

describe("ownerLocation", () => {
  it("classifies St. Louis city zips (631xx)", () => {
    expect(ownerLocation("63101")).toBe("city");
    expect(ownerLocation("63199")).toBe("city");
  });

  it("classifies other Missouri zips", () => {
    expect(ownerLocation("63005")).toBe("mo");
    expect(ownerLocation("65898")).toBe("mo");
  });

  it("classifies out-of-state zips", () => {
    expect(ownerLocation("90210")).toBe("outofstate");
    expect(ownerLocation("10001")).toBe("outofstate");
  });

  it("falls back to unknown for non-numeric zips", () => {
    expect(ownerLocation("")).toBe("unknown");
    expect(ownerLocation("N/A")).toBe("unknown");
  });
});

describe("mapParcel", () => {
  const baseRow = {
    ParcelId: "123",
    Handle: "H1",
    StAddrNum: "100",
    StNameFull: "MAIN ST",
    Zip: "63106",
    Ward20: "5",
    NhdName: "Downtown",
    Lat: "38.6",
    Lng: "-90.2",
    OwnerName: "JONES, MARY",
    OwnerZip: "63106",
    Vacancy: "80",
    VacancyCat: "Very Likely",
    IsLRA: "true",
  };

  it("derives category + structure counts by Type", () => {
    expect(mapParcel({ ...baseRow, Type: "Empty Lot" })).toMatchObject({
      category: "lot",
      BldgsRes: 0,
      BldgsCom: 0,
      ResUnits: 0,
    });
    expect(mapParcel({ ...baseRow, Type: "Single-Family" })).toMatchObject({
      category: "building",
      BldgsRes: 1,
      BldgsCom: 0,
      ResUnits: 1,
    });
    expect(mapParcel({ ...baseRow, Type: "Duplex" })).toMatchObject({ ResUnits: 2 });
    expect(mapParcel({ ...baseRow, Type: "Multi-Unit" })).toMatchObject({ ResUnits: 3 });
    expect(mapParcel({ ...baseRow, Type: "Commercial" })).toMatchObject({
      BldgsRes: 0,
      BldgsCom: 1,
    });
    expect(mapParcel({ ...baseRow, Type: "Mixed-Use" })).toMatchObject({
      BldgsRes: 1,
      BldgsCom: 1,
    });
  });

  it("joins StAddrNum + StNameFull into Address", () => {
    const p = mapParcel({ ...baseRow, Type: "Single-Family" });
    expect(p.Address).toBe("100 MAIN ST");
  });

  it("defaults VacDesc to 'Not Vacant' when VacancyCat is missing", () => {
    const p = mapParcel({ ...baseRow, Type: "Single-Family", VacancyCat: "" });
    expect(p.VacDesc).toBe("Not Vacant");
  });

  it("maps IsLRA to IsLra and always sets IsLcra false (CSV doesn't distinguish)", () => {
    const p = mapParcel({ ...baseRow, Type: "Single-Family" });
    expect(p.IsLra).toBe(true);
    expect(p.IsLcra).toBe(false);
  });
});
