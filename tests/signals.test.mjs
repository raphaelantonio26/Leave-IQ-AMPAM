import { test } from "node:test";
import assert from "node:assert/strict";
import {
  payrollFlags, primaryPayrollFlag, nextRecertDue, ffdStatus, adaExposure,
  adaStatus, crossCaseSignals, exhaustionAlerts, RECERT_INTERVALS,
} from "../src/lib/compliance/signals.js";

const ASOF = "2026-06-01";

/* ── payroll flags ──────────────────────────────────────────────────────── */
test("payroll: PDL in CA flags SDI offset with a coordinate-by date", () => {
  const f = payrollFlags({ leave_designation: "PDL", reason: "pregnancy_disability", start_date: "2026-06-01" }, { state: "CA" });
  const sdi = f.find((x) => x.kind === "sdi_offset");
  assert.ok(sdi);
  assert.equal(sdi.severity, "high");
  assert.equal(sdi.coordinate_by, "2026-06-08");
});

test("payroll: bonding flags PFL; intermittent flags timekeeping; both can coexist", () => {
  const f = payrollFlags({ leave_designation: "CFRA", reason: "bonding", intermittent: true, start_date: "2026-06-01" }, { state: "CA" });
  assert.ok(f.find((x) => x.kind === "pfl_wage"));
  assert.ok(f.find((x) => x.kind === "intermittent_timekeeping"));
});

test("payroll: blank designation produces no flags (nothing to coordinate yet)", () => {
  assert.deepEqual(payrollFlags({ leave_designation: "", reason: "", start_date: "2026-06-01" }, { state: "CA" }), []);
});

test("payroll: primary flag picks the highest severity", () => {
  const p = primaryPayrollFlag({ leave_designation: "PDL", reason: "pregnancy_disability", intermittent: true, start_date: "2026-06-01" }, { state: "CA" });
  assert.equal(p.kind, "sdi_offset");
});

test("payroll: non-CA employee gets no CA-specific flags", () => {
  const f = payrollFlags({ leave_designation: "PDL", reason: "pregnancy_disability", start_date: "2026-06-01" }, { state: "TX" });
  assert.equal(f.find((x) => x.kind === "sdi_offset"), undefined);
});

/* ── recertification chain ──────────────────────────────────────────────── */
test("recert: intermittent FMLA recertifies 30 days after last received cert", () => {
  const r = nextRecertDue(
    { leave_designation: "FMLA", reason: "own_serious_health", intermittent: true, status: "Active", end_date: "2026-12-01" },
    [{ kind: "medical", received_at: "2026-05-01" }]
  );
  assert.equal(r.due_date, "2026-05-31");
  assert.equal(r.requested, false);
  assert.equal(r.interval, RECERT_INTERVALS.intermittent_days);
});

test("recert: continuous leave uses the 6-month interval", () => {
  const r = nextRecertDue(
    { leave_designation: "FMLA", reason: "own_serious_health", intermittent: false, status: "Active", end_date: "2027-01-01" },
    [{ kind: "medical", received_at: "2026-01-15" }]
  );
  assert.equal(r.due_date, "2026-07-14");
});

test("recert: chain — the most recent received cert (initial or recert) anchors the next interval", () => {
  const r = nextRecertDue(
    { leave_designation: "FMLA", reason: "own_serious_health", intermittent: true, status: "Active", end_date: "2026-12-01" },
    [{ kind: "medical", received_at: "2026-03-01" }, { kind: "recert", received_at: "2026-05-10" }]
  );
  assert.equal(r.due_date, "2026-06-09");
});

test("recert: an open (unreceived) recert request owns the due date", () => {
  const r = nextRecertDue(
    { leave_designation: "FMLA", reason: "own_serious_health", intermittent: true, status: "Active", end_date: "2026-12-01" },
    [{ kind: "medical", received_at: "2026-05-01" }, { kind: "recert", due_date: "2026-06-05" }]
  );
  assert.equal(r.requested, true);
  assert.equal(r.due_date, "2026-06-05");
});

test("recert: not applicable — bonding, blank designation, leave ending first, or no initial cert", () => {
  assert.equal(nextRecertDue({ leave_designation: "CFRA", reason: "bonding", status: "Active" }, [{ kind: "medical", received_at: "2026-05-01" }]), null);
  assert.equal(nextRecertDue({ leave_designation: "", reason: "own_serious_health", status: "Pending" }, []), null);
  assert.equal(nextRecertDue({ leave_designation: "FMLA", reason: "own_serious_health", intermittent: true, status: "Active", end_date: "2026-05-15" }, [{ kind: "medical", received_at: "2026-05-01" }]), null);
  assert.equal(nextRecertDue({ leave_designation: "FMLA", reason: "own_serious_health", intermittent: true, status: "Active" }, []), null);
});

/* ── fitness-for-duty ───────────────────────────────────────────────────── */
test("ffd: checklist progresses required → requested → received → cleared", () => {
  const s = ffdStatus({ ffd: { required: true, requested_at: "2026-05-20", received_at: null, cleared_at: null }, end_date: "2026-09-01" });
  assert.equal(s.complete, false);
  assert.equal(s.nextStep, "received");
  assert.equal(s.steps.filter((x) => x.done).length, 2);
});

test("ffd: RTW within 14 days with FFD required but not cleared ⇒ blocked", () => {
  const soon = new Date(); soon.setDate(soon.getDate() + 7);
  const s = ffdStatus({ ffd: { required: true, requested_at: "2026-05-20" }, end_date: soon.toISOString().slice(0, 10) });
  assert.equal(s.blocked, true);
});

test("ffd: explicitly waived (required=false) is complete and never blocks", () => {
  const s = ffdStatus({ ffd: { required: false }, end_date: "2026-06-05" });
  assert.equal(s.waived, true);
  assert.equal(s.blocked, false);
});

/* ── ADA tracker ────────────────────────────────────────────────────────── */
test("ada: exposure fires on own-serious-health nearing exhaustion, not on bonding", () => {
  assert.equal(adaExposure({ reason: "own_serious_health", status: "Active", total_hours: 480, used_hours: 400 }), true);
  assert.equal(adaExposure({ reason: "bonding", status: "Active", total_hours: 480, used_hours: 470 }), false);
  assert.equal(adaExposure({ reason: "own_serious_health", status: "Active", total_hours: 480, used_hours: 100 }), false);
});

test("ada: status walks the five milestones and reports the next step", () => {
  const s = adaStatus({ ada: { tracked: true, requested: "2026-05-01", initiated: "2026-05-05" } });
  assert.equal(s.open, true);
  assert.equal(s.nextStep, "offered");
  assert.equal(s.complete, false);
});

/* ── cross-case signals ─────────────────────────────────────────────────── */
const EMPS = [{ id: 1, name: "Worker A", entity_code: "AMPAM" }, { id: 2, name: "Worker B", entity_code: "SEAL" }];

test("signals: two intermittent cases within 12 months flags the pattern", () => {
  const sig = crossCaseSignals({
    employees: EMPS, asOf: ASOF,
    cases: [
      { id: 1, ref: "LV-1", employee_id: 1, intermittent: true, start_date: "2025-09-01", status: "Closed" },
      { id: 2, ref: "LV-2", employee_id: 1, intermittent: true, start_date: "2026-04-01", status: "Active" },
    ],
  });
  const m = sig.find((s) => s.kind === "multiple_intermittent");
  assert.ok(m);
  assert.deepEqual(m.cases, ["LV-1", "LV-2"]);
});

test("signals: leave opened within 30 days after a corrective action is high severity", () => {
  const sig = crossCaseSignals({
    employees: EMPS, asOf: ASOF,
    cases: [{ id: 3, ref: "LV-3", employee_id: 2, start_date: "2026-05-10", status: "Active" }],
    correctiveActions: [{ employee_id: 2, kind: "written_warning", action_date: "2026-04-25" }],
  });
  const s = sig.find((x) => x.kind === "leave_after_corrective");
  assert.equal(s.severity, "high");
  assert.ok(s.title.includes("15 days"));
});

test("signals: active leave + recent PIP fires; leave 31+ days after action does not fire proximity", () => {
  const sig = crossCaseSignals({
    employees: EMPS, asOf: ASOF,
    cases: [{ id: 4, ref: "LV-4", employee_id: 1, start_date: "2026-03-01", status: "Active" }],
    correctiveActions: [{ employee_id: 1, kind: "PIP", action_date: "2026-05-01" }],
  });
  assert.ok(sig.find((x) => x.kind === "active_leave_with_pip"));
  assert.equal(sig.find((x) => x.kind === "leave_after_corrective"), undefined); // leave predates the PIP
});

/* ── exhaustion alerts ──────────────────────────────────────────────────── */
test("exhaustion: intermittent burn projecting inside 60 days raises an alert", () => {
  const alerts = exhaustionAlerts({
    asOf: ASOF, withinDays: 60,
    cases: [{ id: 5, ref: "LV-5", employee_id: 1, status: "Active", intermittent: true, concurrent_clocks: ["FMLA", "CFRA"], total_hours: 480, used_hours: 420 }],
    intermittentLog: [
      { case_id: 5, usage_date: "2026-05-15", hours_used: 20 },
      { case_id: 5, usage_date: "2026-05-25", hours_used: 20 },
    ], // 10h/wk burn, 60h left ⇒ ~6 weeks
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].remaining, 60);
  assert.ok(alerts[0].projectedDate <= "2026-07-31");
});

test("exhaustion: non-FMLA clocks and distant projections are excluded", () => {
  const alerts = exhaustionAlerts({
    asOf: ASOF, withinDays: 60,
    cases: [
      { id: 6, ref: "LV-6", employee_id: 1, status: "Active", intermittent: true, concurrent_clocks: ["CFRA"], total_hours: 480, used_hours: 470 },
      { id: 7, ref: "LV-7", employee_id: 2, status: "Active", intermittent: true, concurrent_clocks: ["FMLA"], total_hours: 480, used_hours: 40, },
    ],
    intermittentLog: [{ case_id: 7, usage_date: "2026-05-25", hours_used: 4 }], // 1h/wk ⇒ years out
  });
  assert.equal(alerts.length, 0);
});
