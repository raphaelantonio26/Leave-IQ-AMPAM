/* Variable schedule engine (v2.0 · Feature 3).
 *
 * Field trades work 4/10s, 5/8s, 3/12s, variable and per-diem schedules that
 * change mid-leave. Entitlements therefore integrate the schedule HISTORY
 * over the leave window instead of multiplying by a point-in-time hours/week.
 *
 * Employee shape addition:
 *   scheduleHistory: [{ effectiveDate, type, hoursPerWeek, daysPerWeek, shiftsPerWeek }]
 *   types: standard_40 | 4x10 | 3x12 | variable | per_diem
 *
 * Per diem: zero scheduled hours. Eligibility's 1,250-hour test already uses
 * ACTUAL hours from the ADP import; entitlement falls back to the average
 * weekly hours over the preceding 12 months (hours_worked_12mo / 52).
 *
 * Pure module — no app imports beyond the engine's constants.
 */
import { FULL_TIME_HOURS, ENTITLEMENT_WEEKS } from "./engine.js";

export const SCHEDULE_TYPES = [
  { id: "standard_40", label: "Standard 5×8 (40h)", hoursPerWeek: 40, daysPerWeek: 5 },
  { id: "4x10", label: "4×10 compressed (40h)", hoursPerWeek: 40, daysPerWeek: 4 },
  { id: "3x12", label: "3×12 compressed (36h)", hoursPerWeek: 36, daysPerWeek: 3 },
  { id: "variable", label: "Variable (enter hours)", hoursPerWeek: null, daysPerWeek: 5 },
  { id: "per_diem", label: "Per diem (no scheduled hours)", hoursPerWeek: 0, daysPerWeek: 0 },
];

const toDate = (d) => (d instanceof Date ? new Date(d.getTime()) : new Date(`${String(d).slice(0, 10)}T00:00:00`));
const round2 = (n) => Math.round(n * 100) / 100;
const addDays = (d, n) => { const x = toDate(d); x.setDate(x.getDate() + n); return x; };

/** Normalized, effective-date-sorted schedule history (oldest first). */
export function scheduleHistoryOf(employee) {
  const hist = Array.isArray(employee?.scheduleHistory) ? employee.scheduleHistory : [];
  return [...hist]
    .filter((s) => s && s.effectiveDate)
    .sort((a, b) => toDate(a.effectiveDate) - toDate(b.effectiveDate));
}

/** The schedule entry in effect on a date (or null when no history). */
export function scheduleOn(employee, date) {
  const hist = scheduleHistoryOf(employee);
  if (!hist.length) return null;
  const d = toDate(date);
  let current = null;
  for (const s of hist) { if (toDate(s.effectiveDate) <= d) current = s; else break; }
  return current ?? hist[0]; // dates before the first entry use the first entry
}

/** Per-diem average weekly hours: actuals over the trailing 12 months. */
export function perDiemAvgWeeklyHours(employee) {
  const h = Number(employee?.hours_worked_12mo ?? employee?.hours_worked) || 0;
  return round2(h / 52);
}

/**
 * Hours/week in effect on a date. Resolution order:
 *   schedule history entry → per-diem 12-mo average → static hours_per_week →
 *   full-time assumption. Always > 0 for entitlement math.
 */
export function hoursPerWeekOn(employee, date) {
  const s = scheduleOn(employee, date);
  if (s) {
    if (s.type === "per_diem") return perDiemAvgWeeklyHours(employee) || FULL_TIME_HOURS;
    const h = Number(s.hoursPerWeek);
    if (Number.isFinite(h) && h > 0) return h;
    const t = SCHEDULE_TYPES.find((x) => x.id === s.type);
    if (t?.hoursPerWeek) return t.hoursPerWeek;
  }
  const stat = Number(employee?.hours_per_week);
  return Number.isFinite(stat) && stat > 0 ? stat : FULL_TIME_HOURS;
}

/** Scheduled days/week on a date (for per-day usage validation). */
export function daysPerWeekOn(employee, date) {
  const s = scheduleOn(employee, date);
  if (s) {
    const d = Number(s.daysPerWeek);
    if (Number.isFinite(d) && d > 0) return d;
    const t = SCHEDULE_TYPES.find((x) => x.id === s.type);
    if (t?.daysPerWeek) return t.daysPerWeek;
    if (s.type === "per_diem") return 0;
  }
  return 5;
}

/** Is the employee per diem as of a date (defaults to today)? */
export function isPerDiem(employee, date = new Date()) {
  return scheduleOn(employee, date)?.type === "per_diem";
}

/**
 * Integrate scheduled hours across `weeks` workweeks starting at `startDate`,
 * walking schedule changes day-by-day (hours/week ÷ 7 per calendar day — the
 * statutory "workweek" measure at the employee's schedule, robust to
 * mid-week schedule changes). Per-diem days integrate at the 12-mo average.
 */
export function sumScheduledHours(employee, startDate, weeks) {
  const days = Math.round(weeks * 7);
  let total = 0;
  for (let i = 0; i < days; i++) {
    total += hoursPerWeekOn(employee, addDays(startDate, i)) / 7;
  }
  // partial trailing fraction of a day for non-integer week counts (17⅓ wks)
  const frac = weeks * 7 - days;
  if (frac > 0) total += (hoursPerWeekOn(employee, addDays(startDate, days)) / 7) * frac;
  return round2(total);
}

/**
 * Schedule-aware entitlement for a clock on a case starting `startDate`.
 * FMLA/CFRA: 12 workweeks integrated over the window from leave start.
 * PDL: 17⅓ workweeks integrated over the ACTUAL window from leave start
 * (2 CCR 11042(a) — four months of the employee's normal schedule).
 * Military caregiver: 26 workweeks. Falls back to point-in-time math when no
 * schedule history exists (identical result for static schedules).
 */
export function entitlementHoursScheduled(clock, employee, startDate, { militaryCaregiver = false, jurisdictionWeeks = null } = {}) {
  const weeks = jurisdictionWeeks
    ?? (clock === "FMLA" && militaryCaregiver ? ENTITLEMENT_WEEKS.FMLA_MILITARY_CAREGIVER : ENTITLEMENT_WEEKS[clock]);
  if (!weeks) return 0;
  if (!startDate || !scheduleHistoryOf(employee).length) {
    return round2(weeks * hoursPerWeekOn(employee, startDate || new Date()));
  }
  return sumScheduledHours(employee, startDate, weeks);
}

/**
 * Validate an intermittent usage entry against the schedule in effect on the
 * usage date. Daily cap = hours/week ÷ days/week. Per-diem entries validate
 * only against a sanity cap (24h) since there are no scheduled hours.
 */
export function validateUsage(employee, usage_date, hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return { ok: false, reason: "Hours must be a positive number." };
  if (h > 24) return { ok: false, reason: "More than 24 hours in a day is not possible." };
  const s = scheduleOn(employee, usage_date);
  if (s?.type === "per_diem") return { ok: true, perDiem: true };
  const perDay = round2(hoursPerWeekOn(employee, usage_date) / Math.max(1, daysPerWeekOn(employee, usage_date)));
  if (h > perDay + 0.01) {
    return { ok: false, reason: `Exceeds the ${perDay}h scheduled day in effect on ${String(usage_date).slice(0, 10)} (${s ? s.type : "standard"} schedule).`, perDay };
  }
  return { ok: true, perDay };
}

/** Human label for the schedule in effect (badges/tooltips). */
export function scheduleLabel(employee, date = new Date()) {
  const s = scheduleOn(employee, date);
  if (!s) return null;
  const t = SCHEDULE_TYPES.find((x) => x.id === s.type);
  if (s.type === "per_diem") return "Per diem";
  if (s.type === "variable") return `Variable · ${s.hoursPerWeek}h/wk`;
  return t?.label || s.type;
}
