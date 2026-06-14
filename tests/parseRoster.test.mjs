// Parse-boundary hardening tests (v2.2.0). Proves the ADP xlsx parse boundary
// rejects malformed / oversized / prototype-pollution-shaped workbooks without
// throwing past the boundary, and that the row shape downstream is unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseRoster, MAX_BYTES } from "../src/lib/adp/parseRoster.js";

function workbookBuffer(aoa, sheetName = "1") {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

const HEADER = ["File Number", "Payroll Name", "Work Email"];

test("parseRoster: valid roster parses to normalized rows", () => {
  const buf = workbookBuffer([HEADER, ["001482", "Pat Worker", "pat@example.com"]]);
  const out = parseRoster(buf);
  assert.equal(out.errors.length, 0);
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].file_number, "001482");
  assert.equal(out.rows[0].name, "Pat Worker");
});

test("parseRoster: oversized input is rejected before reading, never throws", () => {
  const big = Buffer.alloc(MAX_BYTES + 1024);
  let out;
  assert.doesNotThrow(() => { out = parseRoster(big); });
  assert.equal(out.rows.length, 0);
  assert.match(out.errors[0], /too large/i);
});

test("parseRoster: malformed bytes return an error, never throw past the boundary", () => {
  const junk = Buffer.from("this is plainly not a spreadsheet — just garbage. ".repeat(64));
  let out;
  assert.doesNotThrow(() => { out = parseRoster(junk); });
  assert.equal(out.rows.length, 0);
  assert.ok(out.errors.length >= 1);
});

test("parseRoster: a __proto__ header does not pollute Object.prototype and is ignored", () => {
  const buf = workbookBuffer([["__proto__", "File Number", "Payroll Name"], ["x", "001", "Pat Worker"]]);
  let out;
  assert.doesNotThrow(() => { out = parseRoster(buf); });
  // global prototype intact
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(({}).file_number, undefined);
  // the dangerous header maps to no field; the normalized row is a plain object
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].file_number, "001");
  assert.equal(Object.getPrototypeOf(out.rows[0]), Object.prototype);
  assert.deepEqual(
    Object.keys(out.rows[0]).filter((k) => k === "__proto__" || k === "constructor" || k === "prototype"),
    [],
  );
});
