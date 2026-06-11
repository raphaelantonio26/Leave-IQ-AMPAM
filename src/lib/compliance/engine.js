/* LeaveIQ compliance engine
 *
 * Pure, dependency-free module implementing the statutory math used everywhere
 * in the application (UI, ADP import, reports). Mirrors the verified logic of
 * the Excel Leave Operations Center v2.0:
 *
 *  - FMLA: 12-month rolling BACKWARD lookback measured from each usage date
 *    (29 CFR 825.200(b)(4)) — not calendar year, not fixed year.
 *  - Eligibility: 12+ months tenure AND 1,250+ hours in the preceding 12 months.
 *  - CFRA: runs concurrently with FMLA for most qualifying reasons; baby-bonding
 *    is a SEPARATE, ADDITIONAL entitlement that does not run concurrently with PDL.
 *  - PDL: up to 4 months, computed in HOURS from the employee's schedule
 *    (4 months = 17 1/3 workweeks per 2 CCR 11042(a)); concurrent with FMLA,
 *    never with CFRA.
 *  - Part-time proration: entitlement_hours = (weekly_scheduled_hours / 40) * standard.
 *  - Blank/zero scheduled hours ⇒ full-time (40) assumed (confirmed design decision).
 *  - Await-designation: blank leave designation ⇒ no clocks charged.
 *
 * NOT legal advice. Verify determinations with HR/counsel.
 */

import { getJurisdiction } from "../../lawdata.js";

export const FULL_TIME_HOURS = 40;
export const ROLLING_MONTHS = 12;

/** Resolve a jurisdiction argument: key string, config object, or null.
 *  Falls back to CA when unknown — the engine never silently drops rules. */
export function resolveJurisdiction(jurisdiction) {
  if (jurisdiction && typeof jurisdiction === "object" && jurisdiction.key) return jurisdiction;
  return getJurisdiction(typeof jurisdiction === "string" ? jurisdiction : "CA") || getJurisdiction("CA");
}

/** Statutory entitlements expressed in workweeks at the employee's schedule. */
export const ENTITLEMENT_WEEKS = {
  FMLA: 12,
  FMLA_MILITARY_CAREGIVER: 26,
  CFRA: 12,
  PDL: 52 / 3, // 4 months = 17 1/3 workweeks (2 CCR 11042(a))
  PFL: 8,
  PFML: 12,
  OFLA: 12,
  FAMLI: 12,
  Personal: 0,
};

export const LEAVE_REASONS = [
  { id: "own_serious_health", label: "Own serious health condition" },
  { id: "family_care", label: "Care for family member" },
  { id: "bonding", label: "Baby bonding / new child" },
  { id: "pregnancy_disability", label: "Pregnancy disability" },
  { id: "military_caregiver", label: "Military caregiver" },
  { id: "military_exigency", label: "Qualifying military exigency" },
  { id: "personal", label: "Personal (non-statutory)" },
];

/* ── schedule ───────────────────────────────────────────────────────────── */

/** Blank, null, or zero standard hours ⇒ full-time assumed.
 *  v2.0: when scheduleHistory exists, the CURRENT schedule wins —
 *  per-diem resolves to the trailing-12-month average of actual hours
 *  (see src/lib/compliance/schedule.js for window-integrated math). */
export function scheduledHoursPerWeek(employee, asOf = new Date()) {
  const hist = Array.isArray(employee?.scheduleHistory) ? employee.scheduleHistory.filter((s) => s?.effectiveDate) : [];
  if (hist.length) {
    const d = asOf instanceof Date ? asOf : new Date(`${String(asOf).slice(0, 10)}T00:00:00`);
    const sorted = [...hist].sort((a, b) => new Date(a.effectiveDate) - new Date(b.effectiveDate));
    let cur = sorted[0];
    for (const s of sorted) if (new Date(`${String(s.effectiveDate).slice(0, 10)}T00:00:00`) <= d) cur = s;
    if (cur.type === "per_diem") {
      const avg = (Number(employee?.hours_worked_12mo ?? employee?.hours_worked) || 0) / 52;
      return avg > 0 ? Math.round(avg * 100) / 100 : FULL_TIME_HOURS;
    }
    const h = Number(cur.hoursPerWeek);
    if (Number.isFinite(h) && h > 0) return h;
    if (cur.type === "standard_40" || cur.type === "4x10") return 40;
    if (cur.type === "3x12") return 36;
  }
  const h = Number(employee?.hours_per_week);
  return Number.isFinite(h) && h > 0 ? h : FULL_TIME_HOURS;
}

/* ── entitlement (with part-time proration built in) ───────────────────── */

/**
 * Entitlement in hours for a leave type at a given weekly schedule.
 * Proration is inherent: weeks × scheduled hours/week.
 * PDL is already schedule-based by statute (4 months of the employee's
 * normal schedule), so the same formula is correct for it.
 */
export function entitlementHours(type, { hoursPerWeek = FULL_TIME_HOURS, militaryCaregiver = false, jurisdiction = "CA" } = {}) {
  const J = resolveJurisdiction(jurisdiction);
  const prog = J?.programs?.[type];
  let weeks = type === "FMLA" && militaryCaregiver
    ? (prog?.militaryCaregiverWeeks ?? ENTITLEMENT_WEEKS.FMLA_MILITARY_CAREGIVER)
    : (prog?.weeks ?? ENTITLEMENT_WEEKS[type]);
  if (weeks == null) return 0;
  const hpw = Number.isFinite(Number(hoursPerWeek)) && Number(hoursPerWeek) > 0 ? Number(hoursPerWeek) : FULL_TIME_HOURS;
  return round2(weeks * hpw);
}

function round2(n) { return Math.round(n * 100) / 100; }

/* ── rolling 12-month window ────────────────────────────────────────────── */

function toDate(d) { return d instanceof Date ? new Date(d.getTime()) : new Date(`${String(d).slice(0, 10)}T00:00:00`); }

export function windowStart(asOf) {
  const d = toDate(asOf);
  d.setMonth(d.getMonth() - ROLLING_MONTHS);
  return d;
}

/**
 * Hours consumed inside the rolling 12-month window measured backward from
 * `asOf`. Entries are usage-dated rows: { usage_date, hours_used }.
 * An entry counts when windowStart(asOf) < usage_date <= asOf.
 * Keyed to USAGE DATE, not case start date — this is what lets long-running
 * intermittent leaves replenish correctly as old usage ages out.
 */
export function rollingWindowUsed(entries, asOf = new Date()) {
  const end = toDate(asOf);
  const start = windowStart(end);
  let sum = 0;
  for (const e of entries || []) {
    if (!e || e.usage_date == null) continue;
    const d = toDate(e.usage_date);
    if (d > start && d <= end) sum += Number(e.hours_used) || 0;
  }
  return round2(sum);
}

/**
 * Remaining entitlement under one statutory clock as of a date.
 * `entries` must be the usage rows charged to THAT clock for this employee
 * (across all of their cases — usage attributes to the case via
 * file number + leave start date, then aggregates per clock here).
 */
export function remainingHours({ type, hoursPerWeek, entries = [], asOf = new Date(), militaryCaregiver = false }) {
  const total = entitlementHours(type, { hoursPerWeek, militaryCaregiver });
  const used = rollingWindowUsed(entries, asOf);
  return { total, used, remaining: round2(Math.max(0, total - used)) };
}

/* ── eligibility ────────────────────────────────────────────────────────── */

export function tenureMonths(hireDate, asOf = new Date()) {
  const h = toDate(hireDate), n = toDate(asOf);
  if (isNaN(h)) return 0;
  let m = (n.getFullYear() - h.getFullYear()) * 12 + (n.getMonth() - h.getMonth());
  if (n.getDate() < h.getDate()) m -= 1;
  return Math.max(0, m);
}

/**
 * FMLA eligibility: 12+ months tenure AND 1,250+ hours worked in the
 * preceding 12 months. `hoursLast12mo` should come from payroll
 * (employees.hours_worked_12mo); falls back to hours_worked_ytd when that is
 * all the source system provides, flagged as approximate.
 */
export function fmlaEligibility(employee, asOf = new Date(), jurisdiction = "CA") {
  const J = resolveJurisdiction(jurisdiction);
  const req = J?.programs?.FMLA?.eligibility || { tenureMonths: 12, hours12mo: 1250 };
  const months = tenureMonths(employee?.hire_date, asOf);
  const hours = Number(employee?.hours_worked_12mo ?? employee?.hours_worked ?? employee?.hours_worked_ytd) || 0;
  const approximate = employee?.hours_worked_12mo == null;
  return {
    tenureMonths: months,
    hoursLast12mo: hours,
    approximate,
    meetsTenure: months >= req.tenureMonths,
    meetsHours: hours >= req.hours12mo,
    eligible: months >= req.tenureMonths && hours >= req.hours12mo,
  };
}

/**
 * CFRA applies to employers with 5+ employees — all three AMPAM entities
 * qualify, so CFRA eligibility mirrors FMLA's tenure/hours test (Gov. Code
 * 12945.2(a)). PDL has NO tenure or hours threshold (it applies from day one).
 */
export function cfraEligibility(employee, asOf = new Date()) {
  return fmlaEligibility(employee, asOf); // same 12-month / 1,250-hour test
}

/* ── concurrent statutory clocks ────────────────────────────────────────── */

/**
 * Which statutory clocks a case charges simultaneously. This drives the
 * Concurrent Clocks column — critical for audit defense.
 *
 * California rules encoded:
 *  - Own serious health / family care: FMLA + CFRA run concurrently.
 *  - Pregnancy disability: PDL + FMLA run concurrently; CFRA is NEVER charged
 *    by pregnancy disability (CFRA excludes it as a "serious health condition"
 *    for the employee's own pregnancy).
 *  - Baby bonding: CFRA bonding is a separate, additional block. When PDL
 *    preceded it (typical for the birth parent), FMLA was already consumed
 *    during PDL, so the bonding block charges CFRA alone. When no PDL preceded
 *    (other parent, adoption), FMLA + CFRA bonding run concurrently.
 *  - Military caregiver / exigency: federal-only clocks.
 *  - Blank designation: NO clocks (await-designation behavior).
 */
export function clocksFor(designation, reason, { state = "CA", pdlPreceded = false, jurisdiction } = {}) {
  if (!designation) return []; // await designation — clocks do not start
  const J = resolveJurisdiction(jurisdiction ?? state);
  // No registered jurisdiction config for this state key: federal clock plus
  // the named state program only (legacy non-CA behavior).
  if (!J || (jurisdiction == null && state !== "CA" && !getJurisdiction(state))) {
    return designation === "FMLA" ? ["FMLA"] : [designation, "FMLA"].filter((v, i, a) => a.indexOf(v) === i);
  }
  const conc = J.concurrency || {};
  const FAM = conc.stateFamilyClock || null;     // e.g. CFRA
  const PREG = conc.pregnancyClock || null;      // e.g. PDL
  switch (reason) {
    case "pregnancy_disability":
      return PREG ? [PREG, "FMLA"] : ["FMLA"];
    case "bonding":
      if (pdlPreceded && PREG && conc.bondingAfterPregnancyChargesStateOnly && FAM) return [FAM];
      return FAM ? ["FMLA", FAM] : ["FMLA"];
    case "military_caregiver":
    case "military_exigency":
      return ["FMLA"];
    case "own_serious_health":
    case "family_care":
      if (designation === PREG && PREG) return [PREG, "FMLA"];
      return FAM ? ["FMLA", FAM] : ["FMLA"];
    case "personal":
      return [];
    default:
      // Designation set but reason unknown — charge only the named clock.
      return [designation];
  }
}

/**
 * Full remaining-balance picture for an employee across their statutory
 * clocks, given all usage entries grouped by clock:
 *   usageByClock = { FMLA: [entries], CFRA: [entries], PDL: [entries] }
 */
export function clockBalances(employee, usageByClock = {}, asOf = new Date()) {
  const hpw = scheduledHoursPerWeek(employee);
  const out = {};
  for (const clock of ["FMLA", "CFRA", "PDL"]) {
    out[clock] = remainingHours({ type: clock, hoursPerWeek: hpw, entries: usageByClock[clock] || [], asOf });
  }
  return out;
}

/* ── projections & risk ─────────────────────────────────────────────────── */

/**
 * Exhaustion projection: at the burn rate observed over the trailing 4 weeks
 * of usage entries, when does the remaining balance hit zero?
 * Returns null when there is no recent usage (no projection possible).
 */
export function exhaustionProjection({ remaining, entries = [], asOf = new Date() }) {
  const end = toDate(asOf);
  const start = new Date(end); start.setDate(start.getDate() - 28);
  let recent = 0;
  for (const e of entries) {
    const d = toDate(e.usage_date);
    if (d > start && d <= end) recent += Number(e.hours_used) || 0;
  }
  if (recent <= 0) return null;
  const perWeek = recent / 4;
  const weeksLeft = remaining / perWeek;
  const date = new Date(end); date.setDate(date.getDate() + Math.round(weeksLeft * 7));
  return { burnPerWeek: round2(perWeek), weeksToExhaustion: round2(weeksLeft), projectedDate: date.toISOString().slice(0, 10) };
}

/** Heuristic case risk score (same weights as the demo, kept stable for UI). */
export function computeRisk(c) {
  let score = c.priority === "High" ? 3 : c.priority === "Medium" ? 2 : 1;
  const total = Number(c.total_hours) || 0;
  const u = total > 0 ? (Number(c.used_hours) || 0) / total : 0;
  score += u > 0.8 ? 3 : u > 0.5 ? 2 : 1;
  const w = Math.abs(toDate(c.end_date) - toDate(c.start_date)) / (86400000 * 7);
  score += w > 10 ? 2 : w > 6 ? 1 : 0;
  if (c.intermittent) score += 1;
  return score >= 7 ? "High" : score >= 4 ? "Moderate" : "Low";
}

/* ── UI-shape wrapper (keeps the demo's component contract) ─────────────── */

export function computeEligibility(emp, asOf = new Date()) {
  if (!emp) return null;
  const f = fmlaEligibility(emp, asOf);
  const hpw = scheduledHoursPerWeek(emp);
  const isCA = (emp.state || "CA") === "CA";
  const applicable = [];
  if (f.eligible) applicable.push("FMLA");
  if (isCA) {
    if (f.eligible) applicable.push("CFRA"); // same test, 5+ employee employer
    applicable.push("PDL"); // no threshold
  }
  const entitlementWeeks = f.eligible ? 12 : isCA ? Math.round(ENTITLEMENT_WEEKS.PDL * 10) / 10 : 0;
  return {
    tenureMonths: f.tenureMonths,
    hoursWorked: f.hoursLast12mo,
    fmlaEligible: f.eligible,
    meetsTenure: f.meetsTenure,
    meetsHours: f.meetsHours,
    approximate: f.approximate,
    lawApplied: f.eligible ? "FMLA" : applicable[0] || "None",
    applicableLaws: applicable,
    entitlementWeeks,
    entitlementHoursFMLA: entitlementHours("FMLA", { hoursPerWeek: hpw }),
    entitlementHoursPDL: isCA ? entitlementHours("PDL", { hoursPerWeek: hpw }) : 0,
    hoursPerWeek: hpw,
    remainingBalance: entitlementWeeks * hpw,
    complianceRisk: !f.eligible && !isCA ? "High" : "Low",
  };
}
