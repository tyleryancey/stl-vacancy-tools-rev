import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scoreAndTimeline, vacancyTimeline } from "./scoreAndTimeline";
import type { CityData } from "./cityData";

// Real vcpp.stldata.org payloads captured once (2026-06-30) and checked in as
// fixtures — see src/scoring/__fixtures__/README.md. Tests must stay
// network-free, so `now` is pinned rather than computed live.
const FIXED_NOW = Date.parse("2026-07-02T00:00:00.000Z");
const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function loadFixture(name: string): CityData {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, `${name}.json`), "utf8"));
}

describe("scoreAndTimeline (characterization tests against real vcpp fixtures)", () => {
  it("single-family, active violations/permits: Possible vacancy, Medium High burden", () => {
    const data = loadFixture("single-family-very-likely");
    const r = scoreAndTimeline(data, { Type: "Single-Family", ParcelId: "44779475000" }, FIXED_NOW);
    expect(r.vacancy).toEqual({ total: 69, verbal: "Possible", count: 5 });
    expect(r.burden).toEqual({ total: 56, verbal: "Medium High", count: 3 });
    expect(r.nuisance).toEqual({ total: 56, verbal: "Medium High", count: 3 });
    expect(r.tax).toEqual({ total: 0, verbal: "Zero", count: 0 });
    expect(r.vacant).toBe(false);
    expect(r.anyScore).toBe(true);
  });

  it("commercial, heavy tax delinquency: Very Likely vacancy, capped tax score", () => {
    const data = loadFixture("commercial-very-likely");
    const r = scoreAndTimeline(data, { Type: "Commercial", ParcelId: "15639050000" }, FIXED_NOW);
    expect(r.vacancy).toEqual({ total: 97, verbal: "Very Likely", count: 5 });
    expect(r.burden).toEqual({ total: 100, verbal: "Extremely High", count: 6 });
    expect(r.tax).toEqual({ total: 100, verbal: "Extremely High", count: 4 });
    expect(r.taxYrsDel).toBe(4);
    expect(r.taxAmt).toBe(26074);
  });

  it("multi-unit with repeated board-ups: diminishing 1/n board-up scoring", () => {
    const data = loadFixture("multi-unit-boardups");
    const r = scoreAndTimeline(data, { Type: "Multi-Unit", ParcelId: "30049090000" }, FIXED_NOW);
    expect(r.vacancy).toEqual({ total: 70, verbal: "Very Likely", count: 11 });
    expect(r.burden).toEqual({ total: 85, verbal: "Very High", count: 16 });
    expect(r.condemned).toBe(false);
  });

  it("single-family with a long, quiet history: near-zero score", () => {
    const data = loadFixture("single-family-not-vacant");
    const r = scoreAndTimeline(data, { Type: "Single-Family", ParcelId: "37539150000" }, FIXED_NOW);
    expect(r.vacancy).toEqual({ total: 3, verbal: "Not Vacant", count: 1 });
    expect(r.burden.total).toBe(0);
    expect(r.tax.total).toBe(0);
  });

  it("marks vacant=true and 'Definite' vacancy when IsLra is set, regardless of timeline", () => {
    const data = loadFixture("single-family-not-vacant");
    const r = scoreAndTimeline(data, { Type: "Single-Family", ParcelId: "37539150000", IsLra: true }, FIXED_NOW);
    expect(r.vacant).toBe(true);
    expect(r.vacancy.total).toBe(100);
    expect(r.vacancy.verbal).toBe("Definite");
    expect(r.vacantFactors).toContain("Owned by LRA");
  });

  it("timeline is sorted newest-first with no NaN dates", () => {
    const data = loadFixture("multi-unit-boardups");
    const r = scoreAndTimeline(data, { Type: "Multi-Unit", ParcelId: "30049090000" }, FIXED_NOW);
    for (const e of r.timeline) expect(Number.isFinite(e.date)).toBe(true);
    for (let i = 1; i < r.timeline.length; i++) {
      expect(r.timeline[i - 1].date).toBeGreaterThanOrEqual(r.timeline[i].date);
    }
  });
});

describe("vacancyTimeline", () => {
  it("returns 48 months, oldest to newest, ending at the current vacancy score", () => {
    const data = loadFixture("commercial-very-likely");
    const parcel = { Type: "Commercial", ParcelId: "15639050000" };
    const series = vacancyTimeline(data, parcel, FIXED_NOW);
    expect(series).toHaveLength(48);
    expect(series[47]).toBe(scoreAndTimeline(data, parcel, FIXED_NOW).vacancy.total);
  });
});
