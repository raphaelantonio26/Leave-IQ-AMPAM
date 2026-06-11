import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseRoster, normalizeFileNumber, toISODate, normalizeEntity } from "../src/lib/adp/parseRoster.js";
import { diffRoster } from "../src/lib/adp/diff.js";

function makeRoster(rows) {
  const header = [
    "File Number", "Payroll Name", "Work Email", "Company Code",
    "Home Department Description", "Job Title Description", "Work State",
    "Hire Date", "Standard Hours", "Hours Worked (12 Mo)",
    "Full Time/Part Time", "Position Status",
    "Leave Start Date", "Expected Return Date", "Leave Designation", "Leave Status",
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  // File numbers as explicit text cells to mirror the ADP export
  rows.forEach((r, i) => {
    const addr = `A${i + 2}`;
    ws[addr] = { t: "s", v: String(r[0]) };
  });
  XLSX.utils.book_append_sheet(wb, ws, "1"); // ADP worksheet is named "1"
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

test("parseRoster reads worksheet '1' and preserves leading-zero file numbers", () => {
  const buf = makeRoster([
    ["001482", "Field Tech A", "a@ampam.example", "AMP", "Plumbing", "Journeyman Plumber", "CA", "03/15/2021", 40, 1900, "Full Time", "Active", "", "", "", ""],
  ]);
  const { rows, errors } = parseRoster(buf);
  assert.equal(errors.length, 0);
  assert.equal(rows[0].file_number, "001482");
  assert.equal(rows[0].hire_date, "2021-03-15");
  assert.equal(rows[0].entity_code, "AMPAM");
});

test("numeric file numbers are padded back to 6 digits with a warning", () => {
  assert.equal(normalizeFileNumber(1482), "001482");
});

test("date coercion handles US strings, ISO, and Excel serials", () => {
  assert.equal(toISODate("06/01/2026"), "2026-06-01");
  assert.equal(toISODate("2026-06-01"), "2026-06-01");
  assert.equal(toISODate(45000) !== "", true); // Excel serial parses to a date
  assert.equal(toISODate(""), "");
});

test("entity codes map to the three legal entities", () => {
  assert.equal(normalizeEntity("AMP"), "AMPAM");
  assert.equal(normalizeEntity("MUL"), "MULTIMECH");
  assert.equal(normalizeEntity("SEAL ELECTRIC"), "SEAL");
});

test("missing required fields are flagged per row", () => {
  const buf = makeRoster([
    ["", "Nameless Row", "", "AMP", "", "", "CA", "", "", "", "", "Active", "", "", "", ""],
  ]);
  const { rows, errors } = parseRoster(buf);
  assert.equal(rows.length, 0);
  assert.ok(errors[0].includes("missing file number"));
});

test("duplicate file numbers with conflicting names are errors; leave rows for same person are fine", () => {
  const buf = makeRoster([
    ["000777", "Worker One", "", "AMP", "HVAC", "Installer", "CA", "01/10/2020", 40, 2000, "Full Time", "Leave", "02/01/2026", "04/01/2026", "FMLA", "Open"],
    ["000777", "Worker One", "", "AMP", "HVAC", "Installer", "CA", "01/10/2020", 40, 2000, "Full Time", "Leave", "05/01/2026", "", "", "Open"],
    ["000888", "Person A", "", "AMP", "HVAC", "Installer", "CA", "01/10/2020", 40, 2000, "Full Time", "Active", "", "", "", ""],
    ["000888", "Person B", "", "AMP", "HVAC", "Installer", "CA", "01/10/2020", 40, 2000, "Full Time", "Active", "", "", "", ""],
  ]);
  const { rows, errors } = parseRoster(buf);
  assert.equal(rows.length, 4);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("000888"));
});

test("diff: new employee, field update, and unchanged are classified correctly", () => {
  const buf = makeRoster([
    ["000100", "Existing Same", "", "AMP", "Plumbing", "Foreman", "CA", "01/01/2019", 40, 2080, "Full Time", "Active", "", "", "", ""],
    ["000200", "Existing Moved", "", "MUL", "Sheet Metal", "Installer", "CA", "02/01/2020", 40, 2080, "Full Time", "Active", "", "", "", ""],
    ["000300", "Brand New", "", "SE", "Electrical", "Apprentice", "CA", "03/01/2026", 40, 400, "Full Time", "Active", "", "", "", ""],
  ]);
  const { rows } = parseRoster(buf);
  const existing = [
    { file_number: "000100", name: "Existing Same", entity_code: "AMPAM", department: "Plumbing", position: "Foreman", state: "CA", hire_date: "2019-01-01", hours_per_week: 40, hours_worked_12mo: 2080, employment_type: "full-time", status: "Active", email: "" },
    { file_number: "000200", name: "Existing Moved", entity_code: "AMPAM", department: "Plumbing", position: "Installer", state: "CA", hire_date: "2020-02-01", hours_per_week: 40, hours_worked_12mo: 2080, employment_type: "full-time", status: "Active", email: "" },
  ];
  const d = diffRoster(rows, existing, []);
  assert.equal(d.newEmployees.length, 1);
  assert.equal(d.newEmployees[0].file_number, "000300");
  assert.equal(d.updatedEmployees.length, 1);
  const fields = d.updatedEmployees[0].changes.map((c) => c.field).sort();
  assert.deepEqual(fields, ["department", "entity_code"]);
  assert.equal(d.unchanged, 1);
});

test("diff: auto-created cases stay Pending with blank designation; duplicate-case guard by file+start date", () => {
  const buf = makeRoster([
    ["000777", "Worker One", "", "AMP", "HVAC", "Installer", "CA", "01/10/2020", 40, 2000, "Full Time", "Leave", "02/01/2026", "04/01/2026", "", "Open"],
    ["000777", "Worker One", "", "AMP", "HVAC", "Installer", "CA", "01/10/2020", 40, 2000, "Full Time", "Leave", "05/01/2026", "", "FMLA", "Open"],
  ]);
  const { rows } = parseRoster(buf);
  const existingCases = [{ file_number: "000777", start_date: "2026-02-01" }]; // already imported
  const d = diffRoster(rows, [{ file_number: "000777", name: "Worker One" }], existingCases);
  assert.equal(d.casesToCreate.length, 1);
  assert.equal(d.casesToCreate[0].start_date, "2026-05-01");
  assert.equal(d.casesToCreate[0].status, "Pending");
  assert.equal(d.casesToCreate[0].leave_designation, "FMLA");
});

test("diff: unrecognized designation imports blank with a warning (HR assigns)", () => {
  const buf = makeRoster([
    ["000555", "Worker Two", "", "AMP", "Service", "Tech", "CA", "01/10/2022", 40, 2000, "Full Time", "Leave", "05/15/2026", "", "MYSTERY-LOA", "Open"],
  ]);
  const { rows } = parseRoster(buf);
  const d = diffRoster(rows, [], []);
  assert.equal(d.casesToCreate[0].leave_designation, "");
  assert.equal(d.warnings.length, 1);
});
