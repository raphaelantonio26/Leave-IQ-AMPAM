import { test } from "node:test";
import assert from "node:assert/strict";
import { clocksForSet, entitlementForSet, buildTransition, joinDesignations, normalizeDesignations } from "../src/lib/compliance/designations.js";
import { renderTemplate, usedMergeFields, mergeContext, nextTemplateVersion } from "../src/lib/docs/templates.js";
import { assemblePacket } from "../src/lib/docs/packets.js";

/* ── designation sets (Priority 7) ──────────────────────────────────────── */
test("sets: FMLA + CFRA selection yields both clocks, entitlement = 12 workweeks", () => {
  const r = clocksForSet(["FMLA", "CFRA"], "own_serious_health", { state: "CA" });
  assert.deepEqual(r.clocks.sort(), ["CFRA", "FMLA"]);
  assert.equal(entitlementForSet(["FMLA", "CFRA"], { hoursPerWeek: 40, reason: "own_serious_health" }), 480);
});

test("sets: WC and ADA are tracking designations — no hour clock, no entitlement", () => {
  const r = clocksForSet(["ADA", "WC"], "own_serious_health", { state: "CA" });
  assert.deepEqual(r.clocks, []);
  assert.deepEqual(r.trackingOnly.sort(), ["ADA", "WC"]);
  assert.equal(entitlementForSet(["ADA", "WC"], { hoursPerWeek: 40 }), 0);
});

test("sets: FMLA + CFRA + WC — statutory clocks run, WC tracked alongside", () => {
  const r = clocksForSet(["FMLA", "CFRA", "WC"], "own_serious_health", { state: "CA" });
  assert.deepEqual(r.clocks.sort(), ["CFRA", "FMLA"]);
  assert.deepEqual(r.trackingOnly, ["WC"]);
});

test("sets: PDL + CFRA never concurrent — CFRA deferred as a sequential block", () => {
  const r = clocksForSet(["PDL", "CFRA"], "pregnancy_disability", { state: "CA" });
  assert.ok(r.clocks.includes("PDL"));
  assert.ok(!r.clocks.includes("CFRA"));
  assert.deepEqual(r.deferred, ["CFRA"]);
  // entitlement governed by the PDL bank at the schedule
  assert.equal(entitlementForSet(["PDL", "CFRA"], { hoursPerWeek: 40, reason: "pregnancy_disability" }), 693.33);
});

test("sets: normalization dedupes, drops unknowns, and joins for display", () => {
  assert.deepEqual(normalizeDesignations(["FMLA", "FMLA", "BOGUS", "WC"]), ["FMLA", "WC"]);
  assert.equal(joinDesignations("FMLA + CFRA"), "FMLA + CFRA");
});

/* ── designation transitions (Priority 5) ───────────────────────────────── */
const EMP = { hours_per_week: 40, state: "CA" };

test("transition: FMLA exhausted → ADA keeps the exhausted bank visible and records state", () => {
  const c = { leave_designation: "FMLA", type: "FMLA", reason: "own_serious_health", total_hours: 480, used_hours: 480, concurrent_clocks: ["FMLA", "CFRA"], designation_history: [] };
  const { patch, historyEntry } = buildTransition(c, { to: ["ADA"], effective_date: "2026-07-01", actor: "Jordan Avery", transitionReason: "FMLA exhausted; interactive process continuing" }, EMP);
  assert.deepEqual(patch.designations, ["ADA"]);
  assert.deepEqual(patch.concurrent_clocks, []);
  assert.equal(patch.total_hours, 480);   // history stays visible — not zeroed
  assert.equal(patch.used_hours, 480);
  assert.equal(historyEntry.at_transition.exhausted, true);
  assert.deepEqual(historyEntry.from, ["FMLA"]);
  assert.equal(patch.designation_history.length, 1);
});

test("transition: WC → FMLA + CFRA starts the statutory clocks fresh", () => {
  const c = { leave_designation: "WC", type: "WC", designations: ["WC"], reason: "own_serious_health", total_hours: 0, used_hours: 0, concurrent_clocks: [], designation_history: [] };
  const { patch } = buildTransition(c, { to: ["WC", "FMLA", "CFRA"], effective_date: "2026-07-01", actor: "Jordan Avery" }, EMP);
  assert.deepEqual(patch.concurrent_clocks.sort(), ["CFRA", "FMLA"]);
  assert.equal(patch.total_hours, 480);
  assert.equal(patch.used_hours, 0);
  assert.deepEqual(patch.tracking_designations, ["WC"]);
  assert.equal(patch.leave_designation, "WC + FMLA + CFRA");
});

test("transition: PDL → CFRA bonding resets usage for the new sequential bank", () => {
  const c = { leave_designation: "PDL", type: "PDL", reason: "pregnancy_disability", total_hours: 693.33, used_hours: 693.33, concurrent_clocks: ["PDL", "FMLA"], designation_history: [] };
  const { patch } = buildTransition(c, { to: ["CFRA"], effective_date: "2026-08-01", reason: "bonding", actor: "Sarah Toledano" }, EMP);
  assert.deepEqual(patch.concurrent_clocks, ["CFRA"]);
  assert.equal(patch.total_hours, 480);
  assert.equal(patch.used_hours, 0); // CFRA bank untouched by PDL — fresh
});

test("transition: history chains across multiple transitions; validation enforced", () => {
  const c = { leave_designation: "FMLA", reason: "own_serious_health", total_hours: 480, used_hours: 200, concurrent_clocks: ["FMLA", "CFRA"], designation_history: [{ from: ["WC"], to: ["FMLA"], effective_date: "2026-01-01" }] };
  const { patch } = buildTransition(c, { to: ["ADA"], effective_date: "2026-07-01", actor: "x" }, EMP);
  assert.equal(patch.designation_history.length, 2);
  assert.throws(() => buildTransition(c, { to: [], effective_date: "2026-07-01", actor: "x" }, EMP));
  assert.throws(() => buildTransition(c, { to: ["ADA"], actor: "x" }, EMP));
});

/* ── templates (Priority 2) ─────────────────────────────────────────────── */
test("templates: merge fields render; unknown fields are visibly bracketed", () => {
  const out = renderTemplate("Dear {{employee_first}}, case {{case_ref}} starts {{start_date}}. {{missing_field}}", { employee_first: "Maria", case_ref: "LV-2026-1042", start_date: "2026-06-15" });
  assert.equal(out, "Dear Maria, case LV-2026-1042 starts 2026-06-15. ⟦missing_field⟧");
});

test("templates: usedMergeFields extracts and mergeContext supplies the standard set", () => {
  assert.deepEqual(usedMergeFields("{{employee_name}} and {{ employee_name }} and {{total_hours}}").sort(), ["employee_name", "total_hours"]);
  const ctx = mergeContext({ caseData: { ref: "LV-1", total_hours: 480, used_hours: 100, start_date: "2026-06-01", owner: "Sarah" }, employee: { name: "Maria Lopez", file_number: "000123" }, entity: { legal_name: "Seal Electric, Inc." } });
  assert.equal(ctx.remaining_hours, 380);
  assert.equal(ctx.employee_first, "Maria");
  assert.equal(ctx.entity_name, "Seal Electric, Inc.");
});

test("templates: versioning increments and snapshots the body with the actor", () => {
  const t = { version: 3, body: "old" };
  const { version, entry } = nextTemplateVersion(t, "new body", "Jordan Avery");
  assert.equal(version, 4);
  assert.equal(entry.body, "new body");
  assert.equal(entry.updated_by, "Jordan Avery");
});

/* ── packets (Priority 3) ───────────────────────────────────────────────── */
test("packets: assembly preserves configured order, skips archived, renders context", () => {
  const templates = [
    { id: 1, name: "Eligibility Notice", category: "FMLA", status: "active", body: "To {{employee_name}}: eligibility for {{designation}}." },
    { id: 2, name: "Old Form", category: "FMLA", status: "archived", body: "ARCHIVED" },
    { id: 3, name: "Cert Instructions", category: "FMLA", status: "active", body: "Return by {{cert_due}}." },
  ];
  const def = { name: "FMLA + CFRA Packet", items: [3, 2, 1] };
  const out = assemblePacket(def, templates, { employee_name: "Maria Lopez", designation: "FMLA + CFRA", cert_due: "2026-06-30" });
  assert.equal(out.length, 2);
  assert.equal(out[0].name, "Cert Instructions");
  assert.equal(out[0].body, "Return by 2026-06-30.");
  assert.equal(out[1].body, "To Maria Lopez: eligibility for FMLA + CFRA.");
});
