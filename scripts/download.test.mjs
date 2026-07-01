import { describe, expect, it } from "vitest";
import { validateCsv } from "./download.mjs";

// Regression guard: the upstream has twice returned a bad body with HTTP 200 (a 415
// error page, then a ~12KB placeholder), which passed the status check and produced 0
// parsed rows — failing only at data:assert with no retry. validateCsv must reject a
// bad body so fetchCsv retries instead.
const bigValidHeader = '"ParcelId","Handle","StAddrNum"\n' + "x".repeat(600_000);

describe("validateCsv", () => {
  it("accepts a large body whose header row has the ParcelId column", () => {
    expect(validateCsv(Buffer.from(bigValidHeader))).toBeNull();
  });

  it("tolerates a leading UTF-8 BOM before the header", () => {
    expect(validateCsv(Buffer.from("﻿" + bigValidHeader))).toBeNull();
  });

  it("rejects a too-small body (the ~12KB placeholder case)", () => {
    const msg = validateCsv(Buffer.from('"ParcelId","Handle"\n' + "x".repeat(12_000)));
    expect(msg).toMatch(/too small/);
  });

  it("rejects an HTML error page even if it's large", () => {
    const html = "<!DOCTYPE html><html>" + "<p>error</p>".repeat(50_000);
    expect(validateCsv(Buffer.from(html))).toMatch(/HTML/);
  });

  it("rejects a large body that lacks the expected header column", () => {
    const wrong = '"SomethingElse","Nope"\n' + "x".repeat(600_000);
    expect(validateCsv(Buffer.from(wrong))).toMatch(/header row missing/);
  });
});
