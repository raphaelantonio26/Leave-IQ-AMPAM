import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scheduleOn, hoursPerWeekOn, sumScheduledHours, entitlementHoursScheduled,
  validateUsage, perDiemAvgWeeklyHours, isPerDiem,
} from "../src/lib/compliance/schedule.js";
import { scheduledHoursPerWeek, clocksFor, entitlementHours, fmlaEligibility } from "../src/lib/compliance/engine.js";
import { crossCaseSignals } from "../src/lib/compliance/signals.js";
import { registerJurisdiction } from "../src/lawdata.js";
import { formContext, formBody, FORM_TYPES } from "../src/pdf/forms.js";
import { DemoESign, nextEsignStatus, ESIGN_STATUSES } from "../src/lib/esign/index.js";
import { businessDaysBetween, caseActionState } from "../src/lib/compliance/workload.js";

const ASOF = "2026-06-01";

/* ── variable schedule engine (Feature 3) ───────────────────────────────── */
const EMP_4X10 = { name: "Field A", hours_per_week: 40, scheduleHistory: [{ effectiveDate: "2024-01-01", type: "4x10", hoursPerWeek: 40, daysPerWeek: 4 }] };
const EMP_VARIABLE = { name: "Field B", hours_per_week: 40, scheduleHistory: [{ effectiveDate: "2024-01-01", type: "variable", hoursPerWeek: 32, daysPerWeek: 4 }] };
const EMP_CHANGE = { name: "Field C", scheduleHistory: [
  { effectiveDate: "2024-01-01", type: "standard_40", hoursPerWeek: 40, daysPerWeek: 5 },
  { effectiveDate: "2026-07-01", type: "variable", hoursPerWeek: 20, daysPerWeek: 5 },
] };
const EMP_PERDIEM = { name: "Field D", hours_per_week: 0, hours_worked_12mo: 1560, scheduleHistory: [{ effectiveDate: "2024-01-01", type: "per_diem", hoursPerWeek: 0, daysPerWeek: 0 }] };

test("schedule: 4/10 PDL entitlement integrates 17⅓ weeks at 40h (693.33h), and a variable 32h week prorates", () => {
  assert.equal(entitlementHoursScheduled("PDL", EMP_4X10, "2026-06-01"), 693.33);
  assert.equal(entitlementHoursScheduled("PDL", EMP_VARIABLE, "2026-06-01"), 554.67); // 32 × 17.333
});

test("schedule: mid-leave schedule change — entitlement integrates each period (retroactive recompute basis)", () => {
  // 12-week FMLA window starting 2026-06-01: ~4.29 weeks at 40h, remainder at 20h
  const v = entitlementHoursScheduled("FMLA", EMP_CHANGE, "2026-06-01");
  assert.ok(v > 240 && v < 480, `expected between pure-20h (240) and pure-40h (480), got ${v}`);
  const before = entitlementHoursScheduled("FMLA", EMP_CHANGE, "2025-01-01"); // entirely in the 40h period
  assert.equal(before, 480);
  const after = entitlementHoursScheduled("FMLA", EMP_CHANGE, "2026-08-01"); // entirely in the 20h period
  assert.equal(after, 240);
});

test("schedule: per diem — eligibility uses ACTUAL hours; entitlement uses the 12-mo weekly average", () => {
  const elig = fmlaEligibility({ ...EMP_PERDIEM, hire_date: "2023-01-01" }, ASOF);
  assert.equal(elig.eligible, true);              // 1,560 actual hours ≥ 1,250 despite 0 scheduled
  assert.equal(perDiemAvgWeeklyHours(EMP_PERDIEM), 30);
  assert.equal(scheduledHoursPerWeek(EMP_PERDIEM), 30);   // engine seam resolves per-diem average
  assert.equal(entitlementHoursScheduled("PDL", EMP_PERDIEM, "2026-06-01"), 520); // 30 × 17.333
  assert.equal(isPerDiem(EMP_PERDIEM), true);
});

test("schedule: usage validates against the schedule in effect ON the usage date", () => {
  // 4×10: 10h day OK, 11h blocked
  assert.equal(validateUsage(EMP_4X10, "2026-06-02", 10).ok, true);
  assert.equal(validateUsage(EMP_4X10, "2026-06-02", 11).ok, false);
  // schedule change: 8h OK before 2026-07-01 (40h/5d), blocked after (20h/5d ⇒ 4h day)
  assert.equal(validateUsage(EMP_CHANGE, "2026-06-15", 8).ok, true);
  assert.equal(validateUsage(EMP_CHANGE, "2026-07-15", 8).ok, false);
  assert.equal(validateUsage(EMP_CHANGE, "2026-07-15", 4).ok, true);
  // per diem: sanity cap only
  assert.equal(validateUsage(EMP_PERDIEM, "2026-06-02", 12).ok, true);
  assert.equal(validateUsage(EMP_PERDIEM, "2026-06-02", 25).ok, false);
});

test("schedule: scheduleOn picks the entry in effect; engine hpw follows the current entry", () => {
  assert.equal(scheduleOn(EMP_CHANGE, "2026-06-30").hoursPerWeek, 40);
  assert.equal(scheduleOn(EMP_CHANGE, "2026-07-01").hoursPerWeek, 20);
  assert.equal(hoursPerWeekOn(EMP_CHANGE, "2026-08-01"), 20);
  assert.equal(scheduledHoursPerWeek(EMP_CHANGE, "2026-08-01"), 20);
});

/* ── six new risk signals (Feature 7) ───────────────────────────────────── */
const EMPS = [{ id: 1, name: "W A", entity_code: "AMPAM" }, { id: 2, name: "W B", entity_code: "SEAL" }];
const sig = (args) => crossCaseSignals({ employees: EMPS, asOf: ASOF, ...args });

test("signal 4: >60% Mon/Fri intermittent usage flags the pattern (min 5 entries)", () => {
  const log = ["2026-04-03", "2026-04-06", "2026-04-10", "2026-04-13", "2026-04-17", "2026-04-21"] // F,M,F,M,F,Tu = 5/6
    .map((d, i) => ({ case_id: 9, usage_date: d, hours_used: 8 }));
  const s = sig({ cases: [{ id: 9, ref: "LV-9", employee_id: 1, intermittent: true, status: "Active", start_date: "2026-03-01" }], intermittentLog: log });
  const m = s.find((x) => x.kind === "monday_friday_pattern");
  assert.ok(m); assert.equal(m.severity, "medium"); assert.ok(m.recommendedAction.includes("825.308"));
  // below threshold or too few entries: silent
  const s2 = sig({ cases: [{ id: 9, ref: "LV-9", employee_id: 1, intermittent: true, status: "Active", start_date: "2026-03-01" }], intermittentLog: log.slice(0, 4) });
  assert.equal(s2.find((x) => x.kind === "monday_friday_pattern"), undefined);
});

test("signal 5: PDL closed ≥30 days with no CFRA bonding case fires; bonding case silences it", () => {
  const pdl = { id: 10, ref: "LV-10", employee_id: 1, designations: ["PDL"], type: "PDL", status: "Closed", start_date: "2025-12-01", end_date: "2026-04-15" };
  const s = sig({ cases: [pdl] });
  assert.ok(s.find((x) => x.kind === "pdl_no_bonding"));
  const s2 = sig({ cases: [pdl, { id: 11, ref: "LV-11", employee_id: 1, reason: "bonding", designations: ["CFRA"], status: "Active", start_date: "2026-04-20" }] });
  assert.equal(s2.find((x) => x.kind === "pdl_no_bonding"), undefined);
});

test("signal 6: medical leave ≥90 days with no ADA milestone is high severity + counsel export", () => {
  const c = { id: 12, ref: "LV-12", employee_id: 2, reason: "own_serious_health", status: "Active", start_date: "2026-02-01" };
  const s = sig({ cases: [c] });
  const m = s.find((x) => x.kind === "ada_gap");
  assert.ok(m); assert.equal(m.severity, "high"); assert.equal(m.counselExport, true);
  const s2 = sig({ cases: [{ ...c, ada: { tracked: true, requested: "2026-03-01" } }] });
  assert.equal(s2.find((x) => x.kind === "ada_gap"), undefined);
});

test("signal 7: open recert past due on an active case", () => {
  const c = { id: 13, ref: "LV-13", employee_id: 1, status: "Active", start_date: "2026-01-01", reason: "own_serious_health" };
  const s = sig({ cases: [c], certifications: [{ case_id: 13, kind: "recert", due_date: "2026-05-10", received_at: null }] });
  const m = s.find((x) => x.kind === "recert_overdue_active");
  assert.ok(m); assert.ok(m.title.includes("22 day"));
});

test("signal 8: RTW date passed without FFD clearance on an open case", () => {
  const c = { id: 14, ref: "LV-14", employee_id: 1, status: "Active", start_date: "2026-03-01", end_date: "2026-05-20", ffd: { required: true, requested_at: "2026-05-01" } };
  const m = sig({ cases: [c] }).find((x) => x.kind === "rtw_clearance_gap");
  assert.ok(m); assert.equal(m.severity, "high");
  const cleared = sig({ cases: [{ ...c, ffd: { required: true, cleared_at: "2026-05-19" } }] }).find((x) => x.kind === "rtw_clearance_gap");
  assert.equal(cleared, undefined);
});

test("signal 9: overlapping cases across entities flag integrated-employer stacking", () => {
  const a = { id: 15, ref: "LV-15", employee_id: 2, entity_code: "SEAL", status: "Active", start_date: "2026-04-01", end_date: "2026-07-01" };
  const b = { id: 16, ref: "LV-16", employee_id: 2, entity_code: "AMPAM", status: "Active", start_date: "2026-05-01", end_date: "2026-08-01" };
  const m = sig({ cases: [a, b] }).find((x) => x.kind === "cross_entity_stack");
  assert.ok(m); assert.deepEqual(m.cases.sort(), ["LV-15", "LV-16"]); assert.equal(m.counselExport, true);
  // same entity overlap: no signal
  const same = sig({ cases: [a, { ...b, entity_code: "SEAL" }] }).find((x) => x.kind === "cross_entity_stack");
  assert.equal(same, undefined);
});

/* ── jurisdiction dispatch (Feature 5) ──────────────────────────────────── */
test("jurisdiction: same case yields different clocks and entitlement under CA vs a TEST jurisdiction", () => {
  registerJurisdiction({
    key: "TEST", name: "Testland",
    programs: { FMLA: { weeks: 12, eligibility: { tenureMonths: 6, hours12mo: 500 } }, TESTFAM: { weeks: 10 } },
    employerThresholds: { FMLA: 50 },
    payrollCoordination: {},
    concurrency: { stateFamilyClock: "TESTFAM", pregnancyClock: null, bondingAfterPregnancyChargesStateOnly: false },
  });
  // own serious health: CA → FMLA+CFRA; TEST → FMLA+TESTFAM
  assert.deepEqual(clocksFor("FMLA", "own_serious_health", { jurisdiction: "CA" }).sort(), ["CFRA", "FMLA"]);
  assert.deepEqual(clocksFor("FMLA", "own_serious_health", { jurisdiction: "TEST" }).sort(), ["FMLA", "TESTFAM"]);
  // pregnancy: CA → PDL+FMLA; TEST (no pregnancy clock) → FMLA only
  assert.deepEqual(clocksFor("PDL", "pregnancy_disability", { jurisdiction: "CA" }), ["PDL", "FMLA"]);
  assert.deepEqual(clocksFor("PDL", "pregnancy_disability", { jurisdiction: "TEST" }), ["FMLA"]);
  // entitlement weeks dispatch
  assert.equal(entitlementHours("TESTFAM", { hoursPerWeek: 40, jurisdiction: "TEST" }), 400);
  assert.equal(entitlementHours("CFRA", { hoursPerWeek: 40, jurisdiction: "CA" }), 480);
  // eligibility thresholds dispatch
  const emp = { hire_date: "2025-09-01", hours_worked_12mo: 800 };
  assert.equal(fmlaEligibility(emp, ASOF, "CA").eligible, false);
  assert.equal(fmlaEligibility(emp, ASOF, "TEST").eligible, true);
});

/* ── form generation (Feature 2) ────────────────────────────────────────── */
const FORM_CASE = { ref: "LV-2026-1042", leave_designation: "FMLA + CFRA", type: "FMLA + CFRA", reason: "own_serious_health", status: "Approved", start_date: "2026-06-15", end_date: "2026-08-10", cert_due: "2026-06-30", total_hours: 480, used_hours: 120 };
const FORM_EMP = { name: "Maria Lopez", file_number: "001482", hire_date: "2022-01-10", hours_worked_12mo: 1900, hours_per_week: 40, dept: "Field Operations" };
const FORM_ENT = { legal_name: "Seal Electric, Inc.", ein_masked: "EIN xx-xxx4821", hr_contact_name: "Jordan Avery", hr_contact_title: "HR Administrator", mailing_address: "825 E Carson St, Carson, CA 90745" };

test("forms: WH-381 merges employee, dates, eligibility verdict, and entity letterhead fields", () => {
  const ctx = formContext({ caseData: FORM_CASE, employee: FORM_EMP, entity: FORM_ENT });
  const body = formBody("WH-381", ctx);
  assert.ok(body.includes("Maria Lopez"));
  assert.ok(body.includes("File 001482"));                       // leading zeros survive
  assert.ok(body.includes("June 15, 2026"));
  assert.ok(body.includes("You ARE eligible"));
  assert.ok(body.includes("June 30, 2026"));                     // cert due
  assert.ok(body.includes("Seal Electric, Inc."));
  assert.ok(body.includes("Jordan Avery"));
});

test("forms: CFRA designation notice is distinct from WH-382 and carries CA-specific terms", () => {
  const ctx = formContext({ caseData: FORM_CASE, employee: FORM_EMP, entity: FORM_ENT });
  const cfra = formBody("CFRA_DESIG", ctx);
  const wh382 = formBody("WH-382", ctx);
  assert.notEqual(cfra, wh382);
  assert.ok(cfra.includes("California Family Rights Act"));
  assert.ok(cfra.includes("designated person"));                  // CFRA's broader family circle
  assert.ok(cfra.includes("Nothing in this notice waives"));      // FEHA/CFRA/FMLA non-waiver
  assert.ok(wh382.includes("FMLA DESIGNATION NOTICE"));
  assert.ok(!wh382.includes("designated person"));
  // ineligible employee flips the WH-381 verdict
  const ctx2 = formContext({ caseData: FORM_CASE, employee: { ...FORM_EMP, hours_worked_12mo: 900 }, entity: FORM_ENT });
  assert.ok(formBody("WH-381", ctx2).includes("NOT eligible"));
});

test("forms: all 11 form types render a body with the case ref or employee merged", () => {
  const ctx = formContext({ caseData: FORM_CASE, employee: FORM_EMP, entity: FORM_ENT });
  for (const f of FORM_TYPES) {
    const body = formBody(f.id, ctx);
    assert.ok(body.length > 200, `${f.id} too short`);
    assert.ok(body.includes("LV-2026-1042") || body.includes("Maria Lopez"), `${f.id} missing merge`);
  }
});

/* ── e-sign stub (Feature 2) ────────────────────────────────────────────── */
test("esign: sign() returns the audit payload shape; status ladder advances and clamps", async () => {
  const e = new DemoESign();
  const r = await e.sign(42, 7);
  assert.equal(r.document_id, 42);
  assert.equal(r.signer_user_id, 7);
  assert.equal(r.status, "signed");
  assert.equal(r.provider, "demo-internal");
  assert.ok(!isNaN(Date.parse(r.signed_at)));
  assert.ok(r.evidence && r.evidence.method === "in_app_click");
  const d = await e.deliver(42);
  assert.equal(d.status, "delivered");
  assert.deepEqual(ESIGN_STATUSES, ["generated", "pending_hr_signature", "signed", "delivered"]);
  assert.equal(nextEsignStatus("generated"), "pending_hr_signature");
  assert.equal(nextEsignStatus("signed"), "delivered");
  assert.equal(nextEsignStatus("delivered"), "delivered");
});

/* ── workload metrics (Feature 6) ───────────────────────────────────────── */
test("workload: business-day cycle math and action-state classification", () => {
  assert.equal(businessDaysBetween("2026-06-01", "2026-06-08"), 5); // Mon→Mon
  const st = caseActionState({ status: "Active", type: "FMLA", cert_received: false, cert_due: "2026-05-01", end_date: "2026-09-01" }, [], ASOF);
  assert.equal(st.pending, true);
  assert.equal(st.overdue, true);
  assert.ok(st.reasons.includes("cert outstanding"));
});
