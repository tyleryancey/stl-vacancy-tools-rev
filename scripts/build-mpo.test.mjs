import { describe, expect, it } from "vitest";
import { computeMpo } from "./build-mpo.mjs";

function rows(...ownerNames) {
  return ownerNames.map((OwnerName) => ({ OwnerName }));
}

describe("computeMpo", () => {
  it("keeps only owners with more than one property", () => {
    const { mpos } = computeMpo(rows("SOLO OWNER", "MULTI OWNER LLC", "MULTI OWNER LLC"));
    expect(mpos).toEqual(["MULTI OWNER LLC"]);
  });

  it("skips government/land-bank owners regardless of count", () => {
    const { mpos } = computeMpo(rows("LRA", "LRA", "CITY OF ST. LOUIS", "CITY OF ST. LOUIS", ""));
    expect(mpos).toEqual([]);
  });

  it("groups business-suffix variants of the same owner into one alias group", () => {
    const { mpoGroups } = computeMpo(
      rows(
        "SMITH PROPERTIES LLC",
        "SMITH PROPERTIES LLC",
        "SMITH PROPERTIES INC",
        "SMITH PROPERTIES INC"
      )
    );
    const groups = Object.values(mpoGroups);
    expect(groups).toHaveLength(1);
    expect(groups[0].keys).toHaveLength(2);
    expect(groups[0].count).toBe(4);
  });

  it("does not merge genuinely distinct owner names", () => {
    const { mpoGroups } = computeMpo(
      rows("ALPHA HOLDINGS LLC", "ALPHA HOLDINGS LLC", "BETA HOLDINGS LLC", "BETA HOLDINGS LLC")
    );
    expect(Object.keys(mpoGroups)).toHaveLength(2);
  });

  it("orders groups by descending total parcel count", () => {
    const { mpoGroups } = computeMpo(
      rows(
        "SMALL OWNER LLC",
        "SMALL OWNER LLC",
        "BIG OWNER LLC",
        "BIG OWNER LLC",
        "BIG OWNER LLC"
      )
    );
    const [first, second] = Object.keys(mpoGroups);
    expect(mpoGroups[first].leadName).toBe("BIG OWNER LLC");
    expect(mpoGroups[first].count).toBe(3);
    expect(mpoGroups[second].leadName).toBe("SMALL OWNER LLC");
  });
});
