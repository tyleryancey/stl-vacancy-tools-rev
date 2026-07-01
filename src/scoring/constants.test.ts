import { describe, expect, it } from "vitest";
import { diminish, magnitudeVerbal, vacancyVerbal, DIMINISH_BY } from "./constants";

describe("diminish", () => {
  it("applies full weight for the first 3 months", () => {
    expect(diminish(100, 0)).toBe(100);
    expect(diminish(100, 2)).toBe(100);
  });

  it("follows the DIMINISH_BY table within its range", () => {
    expect(diminish(100, 6)).toBeCloseTo(100 * DIMINISH_BY[6]);
    expect(diminish(100, 12)).toBeCloseTo(100 * DIMINISH_BY[12]);
  });

  it("clamps negative time to 0", () => {
    expect(diminish(100, -5)).toBe(100);
  });

  it("keeps applying the decay factor past the table's end", () => {
    const atTableEnd = 100 * DIMINISH_BY[DIMINISH_BY.length - 1];
    expect(diminish(100, DIMINISH_BY.length)).toBeCloseTo(atTableEnd * 0.95);
    expect(diminish(100, DIMINISH_BY.length + 1)).toBeCloseTo(atTableEnd * 0.95 * 0.95);
  });

  it("truncates fractional months", () => {
    expect(diminish(100, 6.9)).toBeCloseTo(diminish(100, 6));
  });
});

describe("vacancyVerbal", () => {
  it("bands scores at the documented thresholds", () => {
    expect(vacancyVerbal(0)).toBe("Not Vacant");
    expect(vacancyVerbal(9)).toBe("Not Vacant");
    expect(vacancyVerbal(10)).toBe("Indeterminant");
    expect(vacancyVerbal(29)).toBe("Indeterminant");
    expect(vacancyVerbal(30)).toBe("Possible");
    expect(vacancyVerbal(69)).toBe("Possible");
    expect(vacancyVerbal(70)).toBe("Very Likely");
    expect(vacancyVerbal(100)).toBe("Very Likely");
  });
});

describe("magnitudeVerbal", () => {
  it("bands scores at the documented thresholds", () => {
    expect(magnitudeVerbal(0)).toBe("Zero");
    expect(magnitudeVerbal(1)).toBe("Minimal");
    expect(magnitudeVerbal(10)).toBe("Very Low");
    expect(magnitudeVerbal(20)).toBe("Low");
    expect(magnitudeVerbal(30)).toBe("Medium Low");
    expect(magnitudeVerbal(40)).toBe("Medium");
    expect(magnitudeVerbal(50)).toBe("Medium High");
    expect(magnitudeVerbal(60)).toBe("Somewhat High");
    expect(magnitudeVerbal(70)).toBe("High");
    expect(magnitudeVerbal(80)).toBe("Very High");
    expect(magnitudeVerbal(90)).toBe("Extremely High");
    expect(magnitudeVerbal(100)).toBe("Extremely High");
  });
});
