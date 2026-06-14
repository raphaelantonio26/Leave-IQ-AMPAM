/* ADP "Leave Roster*.xlsx" parser.
 *
 * Source contract (matches the export the HR team pulls from ADP today):
 *  - worksheet named "1"
 *  - File Number stored as TEXT with leading zeros — preserved verbatim
 *  - 32 columns; we map the ones LeaveIQ needs by header alias, ignore the rest
 *
 * The parser is the swappable edge of the import layer: `parseRoster` turns a
 * file into normalized rows, and everything downstream (diff → preview →
 * commit) only sees normalized rows. A future direct ADP API connector
 * replaces parseRoster with an API fetch that emits the same shape — no case
 * logic changes.
 */
import * as XLSX from "xlsx";

export const SHEET_NAME = "1";

/** Header aliases → normalized field. Matching is case/space-insensitive. */
const COLUMN_MAP = {
  file_number: ["file number", "file #", "employee file number", "associate id"],
  name: ["payroll name", "employee name", "name", "legal name"],
  email: ["work email", "email", "work contact: work email"],
  entity_code: ["company code", "legal entity", "company", "entity"],
  department: ["home department description", "department", "home department", "dept"],
  position: ["job title description", "job title", "position", "position description"],
  state: ["work state", "state", "location state", "worked in state"],
  hire_date: ["hire date", "most recent hire date", "rehire date"],
  hours_per_week: ["standard hours", "scheduled hours", "standard weekly hours"],
  hours_worked_12mo: ["hours worked (12 mo)", "hours last 12 months", "hours worked 12 months"],
  hours_worked_ytd: ["hours worked ytd", "ytd hours", "hours worked"],
  employment_type: ["full time/part time", "worker category", "employment type", "full/part time"],
  status: ["position status", "status", "employment status"],
  leave_start_date: ["leave start date", "leave begin date", "absence start date"],
  leave_end_date: ["expected return date", "leave end date", "estimated return to work"],
  leave_designation: ["leave designation", "leave type", "absence type", "leave reason"],
  leave_status: ["leave status", "absence status"],
};

const REQUIRED = ["file_number", "name"];

/** Parse-boundary safety caps (defense-in-depth around the xlsx reader). */
export const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — far above any real ADP roster
export const MAX_ROWS = 50000;             // bound memory/CPU on a hostile workbook
export const MAX_COLS = 256;

/** ADP company codes → LeaveIQ entity codes. */
export const ENTITY_CODE_MAP = {
  AMP: "AMPAM", AMPAM: "AMPAM", "AMPAM PARKS MECHANICAL": "AMPAM",
  MM: "MULTIMECH", MUL: "MULTIMECH", MULTIMECH: "MULTIMECH",
  SE: "SEAL", SEAL: "SEAL", "SEAL ELECTRIC": "SEAL",
};

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function buildHeaderIndex(headerRow) {
  const idx = {};
  headerRow.forEach((h, i) => {
    const n = norm(h);
    for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
      if (idx[field] == null && aliases.includes(n)) idx[field] = i;
    }
  });
  return idx;
}

/** Excel serial or string → ISO yyyy-mm-dd ("" if blank/invalid). */
export function toISODate(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number" && isFinite(v)) {
    if (v < 1 || v > 2958465) return ""; // outside Excel's date range
    // Excel serial → date (1900 system; epoch 1899-12-30 absorbs the leap-year bug)
    const ms = Math.round((v - 25569) * 86400000); // 25569 = days from 1899-12-30 to 1970-01-01
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(s);
  return isNaN(d) ? "" : d.toISOString().slice(0, 10);
}

/** File numbers are identity — keep them as text, leading zeros intact. */
export function normalizeFileNumber(v) {
  if (v == null) return "";
  if (typeof v === "number") {
    // A numeric cell means Excel already ate the leading zeros once; pad back
    // to the 6-digit ADP convention and flag upstream via warning.
    return String(v).padStart(6, "0");
  }
  return String(v).trim();
}

export function normalizeEntity(v) {
  const key = String(v ?? "").trim().toUpperCase();
  return ENTITY_CODE_MAP[key] || (key || "AMPAM");
}

function normalizeEmploymentType(v) {
  const s = norm(v);
  if (s.startsWith("p")) return "part-time";
  return "full-time";
}

/**
 * Parse an ADP roster workbook.
 * @param {ArrayBuffer|Uint8Array|Buffer} data raw .xlsx bytes
 * @returns {{ rows: object[], errors: string[], warnings: string[], meta: object }}
 */
export function parseRoster(data) {
  const errors = [], warnings = [];

  // ── parse-boundary guard: reject oversized input before reading anything ──
  const size = data?.byteLength ?? data?.length ?? 0;
  if (size > MAX_BYTES) {
    return { rows: [], errors: [`File too large: ${(size / 1048576).toFixed(1)} MB exceeds the ${Math.round(MAX_BYTES / 1048576)} MB cap.`], warnings, meta: {} };
  }

  let wb, sheetName, grid;
  try {
    wb = XLSX.read(data, { type: data instanceof ArrayBuffer ? "array" : "buffer", cellDates: false });
    sheetName = wb.SheetNames.includes(SHEET_NAME) ? SHEET_NAME : wb.SheetNames[0];
    grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: "" });
  } catch (e) {
    return { rows: [], errors: [`Could not read workbook: ${e.message}`], warnings, meta: {} };
  }
  if (sheetName !== SHEET_NAME) warnings.push(`Worksheet "${SHEET_NAME}" not found — using "${sheetName}".`);
  if (!grid.length) return { rows: [], errors: ["Worksheet is empty."], warnings, meta: { sheetName } };

  // Cap rows/columns so a workbook claiming millions of cells can't exhaust memory/CPU.
  if (grid.length > MAX_ROWS + 1) {
    warnings.push(`Workbook has ${grid.length - 1} data rows; only the first ${MAX_ROWS} were processed.`);
    grid = grid.slice(0, MAX_ROWS + 1);
  }
  if (Array.isArray(grid[0]) && grid[0].length > MAX_COLS) {
    warnings.push(`Workbook has ${grid[0].length} columns; only the first ${MAX_COLS} were scanned.`);
    grid = grid.map((row) => (Array.isArray(row) ? row.slice(0, MAX_COLS) : row));
  }

  const idx = buildHeaderIndex(grid[0]);
  for (const f of REQUIRED) {
    if (idx[f] == null) errors.push(`Required column missing: ${COLUMN_MAP[f][0]} (${f}).`);
  }
  if (errors.length) return { rows: [], errors, warnings, meta: { sheetName, columns: grid[0].length } };

  const rows = [];
  const seen = new Map();
  for (let r = 1; r < grid.length; r++) {
    const raw = grid[r];
    if (!raw || raw.every((c) => c === "" || c == null)) continue;
    const cell = (f) => (idx[f] == null ? "" : raw[idx[f]]);
    const rowNo = r + 1;

    if (typeof cell("file_number") === "number") {
      warnings.push(`Row ${rowNo}: file number arrived numeric — leading zeros restored by padding to 6 digits. Re-export with the column formatted as text.`);
    }
    const file_number = normalizeFileNumber(cell("file_number"));
    const name = String(cell("name") ?? "").trim();
    if (!file_number) { errors.push(`Row ${rowNo}: missing file number.`); continue; }
    if (!name) { errors.push(`Row ${rowNo}: missing employee name (file ${file_number}).`); continue; }

    const hire_date = toISODate(cell("hire_date"));
    if (idx.hire_date != null && cell("hire_date") !== "" && !hire_date) {
      warnings.push(`Row ${rowNo}: unreadable hire date "${cell("hire_date")}" (file ${file_number}).`);
    }

    const row = {
      file_number,
      name,
      email: String(cell("email") ?? "").trim(),
      entity_code: normalizeEntity(cell("entity_code")),
      department: String(cell("department") ?? "").trim(),
      position: String(cell("position") ?? "").trim(),
      state: String(cell("state") ?? "").trim().toUpperCase() || "CA",
      hire_date,
      hours_per_week: Number(cell("hours_per_week")) || null, // blank ⇒ full-time assumed downstream
      hours_worked_12mo: Number(cell("hours_worked_12mo")) || null,
      hours_worked_ytd: Number(cell("hours_worked_ytd")) || null,
      employment_type: normalizeEmploymentType(cell("employment_type")),
      status: String(cell("status") ?? "Active").trim() || "Active",
      leave_start_date: toISODate(cell("leave_start_date")),
      leave_end_date: toISODate(cell("leave_end_date")),
      leave_designation: String(cell("leave_designation") ?? "").trim(), // blank stays blank — HR designates
      leave_status: String(cell("leave_status") ?? "").trim(),
      _row: rowNo,
    };

    // Duplicate file numbers: allowed when they are leave rows for the same
    // person (one row per leave), flagged when demographics conflict.
    if (seen.has(file_number)) {
      const first = seen.get(file_number);
      if (first.name !== row.name) {
        errors.push(`Rows ${first._row} & ${rowNo}: duplicate file number ${file_number} with different names ("${first.name}" vs "${row.name}").`);
      }
    } else {
      seen.set(file_number, row);
    }
    rows.push(row);
  }

  return { rows, errors, warnings, meta: { sheetName, columns: grid[0].length, dataRows: rows.length } };
}
