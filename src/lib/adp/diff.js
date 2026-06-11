/* ADP import diff: parsed roster rows vs. current database state.
 *
 * Produces the preview HR confirms before anything is committed:
 *   - newEmployees:      file numbers not in the system
 *   - updatedEmployees:  existing employees whose tracked fields changed
 *   - unchanged:         count only
 *   - casesToCreate:     leave rows with a start date and no existing case for
 *                        (file_number, leave_start_date). Created as status
 *                        "Pending" with the designation EXACTLY as exported —
 *                        blank stays blank until HR designates (clocks do not
 *                        start until then).
 */

const TRACKED_FIELDS = [
  "name", "email", "entity_code", "department", "position", "state",
  "hire_date", "hours_per_week", "hours_worked_12mo", "hours_worked_ytd",
  "employment_type", "status",
];

const KNOWN_DESIGNATIONS = ["FMLA", "CFRA", "PDL", "PFL", "PFML", "OFLA", "FAMLI", "Personal"];

function dedupeByFileNumber(rows) {
  const byFile = new Map();
  for (const r of rows) if (!byFile.has(r.file_number)) byFile.set(r.file_number, r);
  return byFile;
}

export function diffRoster(parsedRows, existingEmployees = [], existingCases = []) {
  const empByFile = new Map(existingEmployees.map((e) => [String(e.file_number), e]));
  const caseKeys = new Set(
    existingCases.map((c) => `${String(c.file_number ?? c.employee_file_number ?? "")}|${String(c.start_date ?? "").slice(0, 10)}`)
  );
  const demographics = dedupeByFileNumber(parsedRows);

  const newEmployees = [];
  const updatedEmployees = [];
  let unchanged = 0;

  for (const row of demographics.values()) {
    const existing = empByFile.get(row.file_number);
    if (!existing) {
      newEmployees.push(row);
      continue;
    }
    const changes = [];
    for (const f of TRACKED_FIELDS) {
      const incoming = row[f];
      if (incoming == null || incoming === "") continue; // ADP blanks never erase known data
      const current = existing[f] ?? "";
      if (String(incoming) !== String(current)) changes.push({ field: f, from: current, to: incoming });
    }
    if (changes.length) updatedEmployees.push({ file_number: row.file_number, name: row.name, changes, row });
    else unchanged += 1;
  }

  const casesToCreate = [];
  const warnings = [];
  const proposedKeys = new Set();
  for (const row of parsedRows) {
    if (!row.leave_start_date) continue;
    const key = `${row.file_number}|${row.leave_start_date}`;
    if (caseKeys.has(key)) continue; // duplicate-case guard: same person + same start date
    if (proposedKeys.has(key)) continue;
    proposedKeys.add(key);
    let designation = row.leave_designation || "";
    if (designation && !KNOWN_DESIGNATIONS.includes(designation)) {
      warnings.push(`File ${row.file_number}: unrecognized designation "${designation}" — imported blank for HR to assign.`);
      designation = "";
    }
    casesToCreate.push({
      file_number: row.file_number,
      employee_name: row.name,
      entity_code: row.entity_code,
      start_date: row.leave_start_date,
      end_date: row.leave_end_date || "",
      leave_designation: designation, // blank ⇒ await designation; clocks idle
      status: "Pending",
      source: "import",
    });
  }

  return { newEmployees, updatedEmployees, unchanged, casesToCreate, warnings };
}
