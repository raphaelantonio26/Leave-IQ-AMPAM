/* HRIS roster connector seam (v1.2, Tier 3).
 *
 * THE CONTRACT — everything downstream (diff → preview → commit → audit)
 * consumes exactly one shape, produced by RosterSource.fetch():
 *
 *   {
 *     rows:     NormalizedRosterRow[],   // see below
 *     errors:   string[],                // blocking — import cannot proceed
 *     warnings: string[],                // surfaced, non-blocking
 *     meta:     { sourceName, fetchedAt, ...sourceSpecific }
 *   }
 *
 *   NormalizedRosterRow = {
 *     file_number: string        // TEXT, leading zeros preserved — identity key
 *     name: string
 *     email: string
 *     entity_code: 'AMPAM'|'MULTIMECH'|'SEAL'
 *     department: string, position: string, state: string
 *     hire_date: 'yyyy-mm-dd'|''
 *     hours_per_week: number|null          // null ⇒ full-time assumed by engine
 *     hours_worked_12mo: number|null, hours_worked_ytd: number|null
 *     employment_type: 'full-time'|'part-time'
 *     status: string
 *     leave_start_date: 'yyyy-mm-dd'|'', leave_end_date: 'yyyy-mm-dd'|''
 *     leave_designation: string            // '' stays '' — HR designates
 *     leave_status: string
 *   }
 *
 * Swapping to a live ADP API connector = implementing fetch() with the same
 * return shape and registering it below. diff.js, ImportADP.jsx, the commit
 * RPC, and the audit trail need zero changes — they never know where rows
 * came from. See docs/HRIS_CONNECTOR.md for the API-side mapping notes.
 */
import { parseRoster } from "./parseRoster.js";

/** File-based source: wraps today's Leave Roster*.xlsx upload. */
export class FileRosterSource {
  constructor(file) { this.file = file; }
  get name() { return `file:${this.file?.name || "roster.xlsx"}`; }
  async fetch() {
    const buf = await this.file.arrayBuffer();
    const r = parseRoster(buf);
    return { ...r, meta: { ...r.meta, sourceName: this.name, fetchedAt: new Date().toISOString() } };
  }
}

/**
 * Live ADP Workforce Now source — STUB, intentionally unimplemented.
 * Implementation notes for whoever wires it (target: ADP Workers v2 API):
 *   - OAuth2 client-credentials against accounts.adp.com with the mutual-TLS
 *     cert ADP issues per client; token server-side ONLY (Supabase edge
 *     function `adp-sync`, never the browser).
 *   - GET /hr/v2/workers?$top=100 paginated; map:
 *       workers[].workerID.idValue            → file_number  (KEEP AS STRING)
 *       workers[].person.legalName.formatted  → name
 *       workAssignments[0].homeOrganizationalUnits → entity_code/department
 *       workAssignments[0].standardHours      → hours_per_week
 *       workerDates.originalHireDate          → hire_date
 *   - Leave rows come from the Time Off / Leaves of Absence endpoint; map the
 *     ADP absence type code through the same KNOWN_DESIGNATIONS gate in
 *     diff.js (unknown codes ⇒ blank ⇒ await designation, unchanged).
 *   - Return the contract shape above. Nothing else changes.
 */
export class AdpApiRosterSource {
  get name() { return "adp-api:workers-v2"; }
  async fetch() {
    return {
      rows: [], warnings: [],
      errors: ["ADP API connector is not configured. Use the file upload, or implement AdpApiRosterSource.fetch() per docs/HRIS_CONNECTOR.md."],
      meta: { sourceName: this.name, fetchedAt: new Date().toISOString() },
    };
  }
}

export function getRosterSource(kind, file) {
  if (kind === "adp-api") return new AdpApiRosterSource();
  return new FileRosterSource(file);
}
