import { test } from "node:test";
import assert from "node:assert/strict";
import {
  entitlementHours, scheduledHoursPerWeek, rollingWindowUsed, remainingHours,
  fmlaEligibility, tenureMonths, clocksFor, clockBalances, exhaustionProjection,
  computeEligibility, ENTITLEMENT_WEEKS,
} from "../src/lib/compliance/engine.js";

const ASOF = "2026-06-01";

test("FMLA entitlement: 12 weeks at full time = 480 hours", () => {
  assert.equal(entitlementHours("FMLA", { hoursPerWeek: 40 }), 480);
});

test("part-time proration: FMLA at 24 hrs/week = 288 hours", () => {
  assert.equal(entitlementHours("FMLA", { hoursPerWeek: 24 }), 288);
});

test("military caregiver: 26 weeks, flagged separately", () => {
  assert.equal(entitlementHours("FMLA", { hoursPerWeek: 40, militaryCaregiver: true }), 1040);
});

test("PDL is 4 months = 17 1/3 workweeks, computed in hours from schedule", () => {
  assert.equal(ENTITLEMENT_WEEKS.PDL, 52 / 3);
  assert.equal(entitlementHours("PDL", { hoursPerWeek: 40 }), 693.33);
  assert.equal(entitlementHours("PDL", { hoursPerWeek: 20 }), 346.67); // prorated by schedule
});

test("blank standard hours treated as full-time assumed", () => {
  assert.equal(scheduledHoursPerWeek({ hours_per_week: null }), 40);
  assert.equal(scheduledHoursPerWeek({ hours_per_week: 0 }), 40);
  assert.equal(scheduledHoursPerWeek({ hours_per_week: 32 }), 32);
});

test("rolling window keys to usage date: entries older than 12 months age out", () => {
  const entries = [
    { usage_date: "2025-05-15", hours_used: 80 },  // >12mo before asOf — excluded
    { usage_date: "2025-06-02", hours_used: 40 },  // inside window
    { usage_date: "2026-05-30", hours_used: 8 },   // inside window
    { usage_date: "2026-06-01", hours_used: 8 },   // boundary: == asOf, included
  ];
  assert.equal(rollingWindowUsed(entries, ASOF), 56);
});

test("rolling window boundary: usage exactly at window start is excluded", () => {
  // windowStart(2026-06-01) = 2025-06-01; entries must be strictly after it
  assert.equal(rollingWindowUsed([{ usage_date: "2025-06-01", hours_used: 10 }], ASOF), 0);
  assert.equal(rollingWindowUsed([{ usage_date: "2025-06-02", hours_used: 10 }], ASOF), 10);
});

test("remaining balance combines entitlement and rolling usage", () => {
  const r = remainingHours({ type: "FMLA", hoursPerWeek: 40, asOf: ASOF, entries: [
    { usage_date: "2026-01-10", hours_used: 200 },
    { usage_date: "2024-01-10", hours_used: 480 }, // aged out
  ]});
  assert.deepEqual(r, { total: 480, used: 200, remaining: 280 });
});

test("FMLA eligibility: 1,250 hours exactly and 12 months exactly are eligible", () => {
  const emp = { hire_date: "2025-06-01", hours_worked_12mo: 1250 };
  const e = fmlaEligibility(emp, ASOF);
  assert.equal(e.tenureMonths, 12);
  assert.equal(e.eligible, true);
});

test("FMLA eligibility: 1,249 hours or 11 months fails", () => {
  assert.equal(fmlaEligibility({ hire_date: "2025-06-01", hours_worked_12mo: 1249 }, ASOF).eligible, false);
  assert.equal(fmlaEligibility({ hire_date: "2025-07-01", hours_worked_12mo: 2000 }, ASOF).eligible, false);
});

test("tenure months respects day-of-month", () => {
  assert.equal(tenureMonths("2025-06-15", "2026-06-01"), 11);
  assert.equal(tenureMonths("2025-06-01", "2026-06-01"), 12);
});

test("concurrent clocks: own serious health in CA charges FMLA + CFRA", () => {
  assert.deepEqual(clocksFor("FMLA", "own_serious_health"), ["FMLA", "CFRA"]);
});

test("concurrent clocks: pregnancy disability charges PDL + FMLA, never CFRA", () => {
  const clocks = clocksFor("PDL", "pregnancy_disability");
  assert.deepEqual(clocks, ["PDL", "FMLA"]);
  assert.ok(!clocks.includes("CFRA"));
});

test("concurrent clocks: CFRA bonding after PDL is a separate, additional block (CFRA only)", () => {
  assert.deepEqual(clocksFor("CFRA", "bonding", { pdlPreceded: true }), ["CFRA"]);
});

test("concurrent clocks: bonding without preceding PDL runs FMLA + CFRA together", () => {
  assert.deepEqual(clocksFor("CFRA", "bonding", { pdlPreceded: false }), ["FMLA", "CFRA"]);
});

test("await-designation: blank designation charges no clocks", () => {
  assert.deepEqual(clocksFor("", "own_serious_health"), []);
  assert.deepEqual(clocksFor(null, "bonding"), []);
});

test("PDL-then-bonding sequence: full statutory stack for a CA birth parent", () => {
  // PDL block: PDL+FMLA concurrent. Bonding block afterward: CFRA alone.
  // Total protected time = PDL hours + 12 CFRA weeks — CFRA untouched by PDL.
  const emp = { hours_per_week: 40 };
  const pdlUsage = [{ usage_date: "2026-03-01", hours_used: 693.33 }];
  const balances = clockBalances(emp, { PDL: pdlUsage, FMLA: pdlUsage, CFRA: [] }, ASOF);
  assert.equal(balances.PDL.remaining, 0);
  assert.equal(balances.FMLA.remaining, 0);     // consumed concurrently with PDL
  assert.equal(balances.CFRA.remaining, 480);   // fully intact for bonding
});

test("exhaustion projection from trailing 4-week burn rate", () => {
  const entries = [
    { usage_date: "2026-05-10", hours_used: 20 },
    { usage_date: "2026-05-20", hours_used: 20 },
  ]; // 40 hrs over 4 weeks ⇒ 10 hrs/week
  const p = exhaustionProjection({ remaining: 100, entries, asOf: ASOF });
  assert.equal(p.burnPerWeek, 10);
  assert.equal(p.weeksToExhaustion, 10);
  assert.equal(p.projectedDate, "2026-08-10");
});

test("exhaustion projection is null with no recent usage", () => {
  assert.equal(exhaustionProjection({ remaining: 100, entries: [], asOf: ASOF }), null);
});

test("computeEligibility wrapper: CA employee gets PDL with no threshold", () => {
  const e = computeEligibility({ hire_date: "2026-03-01", hours_worked_12mo: 300, state: "CA", hours_per_week: 40 }, ASOF);
  assert.equal(e.fmlaEligible, false);
  assert.ok(e.applicableLaws.includes("PDL"));
  assert.ok(!e.applicableLaws.includes("FMLA"));
  assert.equal(e.entitlementHoursPDL, 693.33);
});
