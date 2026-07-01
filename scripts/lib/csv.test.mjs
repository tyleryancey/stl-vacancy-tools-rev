import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseCsv, readCsvObjects } from "./csv.mjs";

describe("parseCsv", () => {
  it("parses a simple quoted row", () => {
    expect(parseCsv('"a","b","c"\n')).toEqual([["a", "b", "c"]]);
  });

  it("handles embedded commas inside quotes", () => {
    expect(parseCsv('"1127 N GRAND BLVD, Apt 2","63106"\n')).toEqual([
      ["1127 N GRAND BLVD, Apt 2", "63106"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('"6827 ""back building""","note"\n')).toEqual([
      ['6827 "back building"', "note"],
    ]);
  });

  it("handles embedded newlines inside quotes", () => {
    expect(parseCsv('"line one\nline two","b"\n')).toEqual([["line one\nline two", "b"]]);
  });

  it("strips carriage returns from CRLF line endings", () => {
    expect(parseCsv('"a","b"\r\n"c","d"\r\n')).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("flushes a trailing row with no terminating newline", () => {
    expect(parseCsv('"a","b"\n"c","d"')).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("readCsvObjects", () => {
  const tmpFiles = [];

  afterEach(() => {
    for (const f of tmpFiles.splice(0)) fs.rmSync(f, { force: true });
  });

  function writeTmp(contents) {
    const p = path.join(os.tmpdir(), `csv-test-${Math.random().toString(36).slice(2)}.csv`);
    fs.writeFileSync(p, contents);
    tmpFiles.push(p);
    return p;
  }

  it("maps each row onto the header", () => {
    const p = writeTmp('"ParcelId","OwnerName"\n"123","JONES, MARY"\n"456","LRA"\n');
    expect(readCsvObjects(p)).toEqual([
      { ParcelId: "123", OwnerName: "JONES, MARY" },
      { ParcelId: "456", OwnerName: "LRA" },
    ]);
  });

  it("skips blank trailing lines", () => {
    const p = writeTmp('"ParcelId"\n"123"\n\n');
    expect(readCsvObjects(p)).toEqual([{ ParcelId: "123" }]);
  });

  it("returns an empty array for an empty file", () => {
    const p = writeTmp("");
    expect(readCsvObjects(p)).toEqual([]);
  });
});
