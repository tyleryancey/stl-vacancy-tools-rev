import { describe, expect, it } from "vitest";
import { STL_DEFAULT_ZOOM, FILL_CROSSFADE_ZOOM, POLY_LOAD_ZOOM } from "./constants";

// POLY_LOAD_ZOOM gates when the ~1.2MB polygon PMTiles source is fetched
// (MapView.tsx). Get this ordering wrong and it either defeats the deferral
// (fires on initial load) or pops in visibly late (fires after the crossfade
// has already started fading fills in).
describe("POLY_LOAD_ZOOM ordering", () => {
  it("stays above the default zoom so it doesn't fire on initial load", () => {
    expect(POLY_LOAD_ZOOM).toBeGreaterThan(STL_DEFAULT_ZOOM);
  });

  it("stays below where the crossfade opacity blend starts (12.9)", () => {
    expect(POLY_LOAD_ZOOM).toBeLessThan(FILL_CROSSFADE_ZOOM - 0.1);
  });
});
