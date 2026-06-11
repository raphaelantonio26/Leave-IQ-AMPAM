/* Designation lifecycle engine (v1.3 · Priorities 5 & 7).
 *
 * Two jobs:
 *   1. SET-BASED DESIGNATIONS — a case can carry several designations at once
 *      (FMLA + CFRA, FMLA + CFRA + WC, PDL + CFRA, ADA + WC, …). Entitlement
 *      clocks come only from statutory hour banks (FMLA / CFRA / PDL); WC and
 *      ADA are tracking designations — job-protection / accommodation status
 *      with NO hour bank — so they appear in the designation set and badges
 *      but never in concurrent_clocks.
 *   2. TRANSITIONS — FMLA → ADA, WC → FMLA+CFRA, PDL → CFRA, etc., recorded
 *      as an immutable timeline (designation_history) with effective date,
 *      reason, actor, and the entitlement state captured at the moment of
 *      transition. Statutory rules stay enforced across the change.
 */
import { clocksFor, entitlementHours } from "./engine.js";

/** Every designation a case may carry. `clocked` ⇒ has a statutory hour bank. */
export const DESIGNATION_TOKENS = [
  { id: "FMLA", label: "FMLA", clocked: true },
  { id: "CFRA", label: "CFRA", clocked: true },
  { id: "PDL", label: "PDL", clocked: true },
  { id: "WC", label: "Workers' Comp", clocked: false },
  { id: "ADA", label: "ADA Accommodation", clocked: false },
  { id: "Personal", label: "Personal (non-statutory)", clocked: false },
];
const TOKEN_IDS = DESIGNATION_TOKENS.map((t) => t.id);

export function normalizeDesignations(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : String(input).split("+").map((s) => s.trim());
  const seen = new Set();
  return arr.filter((d) => TOKEN_IDS.includes(d) && !seen.has(d) && seen.add(d));
}

/** Joined display/back-compat string: ["FMLA","CFRA"] → "FMLA + CFRA". */
export const joinDesignations = (set) => normalizeDesignations(set).join(" + ");

/**
 * Concurrent entitlement clocks for a designation SET.
 * Statutory rules survive the union:
 *   - PDL and CFRA never run concurrently — if both are selected, PDL runs
 *     now and CFRA is sequential (reported via `deferred`).
 *   - Each clocked token contributes its clocksFor() result; WC/ADA/Personal
 *     contribute none.
 * Returns { clocks: [], deferred: [], trackingOnly: [] }.
 */
export function clocksForSet(designations, reason, opts = {}) {
  const set = normalizeDesignations(designations);
  const clocks = new Set();
  const trackingOnly = [];
  for (const d of set) {
    const tok = DESIGNATION_TOKENS.find((t) => t.id === d);
    if (!tok.clocked) { if (d !== "Personal") trackingOnly.push(d); continue; }
    for (const c of clocksFor(d, reason, opts)) clocks.add(c);
  }
  const deferred = [];
  if (clocks.has("PDL") && (set.includes("CFRA") || clocks.has("CFRA"))) {
    clocks.delete("CFRA");
    if (set.includes("CFRA")) deferred.push("CFRA"); // sequential block, fully intact
  }
  return { clocks: [...clocks], deferred, trackingOnly };
}

/**
 * Entitlement for a set = the longest hour bank among its active clocks (each
 * clock keeps its own balance; total_hours mirrors the governing bank, same
 * semantics as the single-designation engine).
 */
export function entitlementForSet(designations, { hoursPerWeek = 40, militaryCaregiver = false, reason, state = "CA", pdlPreceded = false } = {}) {
  const { clocks } = clocksForSet(designations, reason, { state, pdlPreceded });
  if (!clocks.length) return 0;
  return Math.max(...clocks.map((c) => entitlementHours(c, { hoursPerWeek, militaryCaregiver })));
}

/* ── transitions ────────────────────────────────────────────────────────── */
export const TRANSITION_PRESETS = [
  { id: "fmla_to_ada", label: "FMLA exhausted → ADA accommodation", to: ["ADA"] },
  { id: "fmlacfra_to_ada", label: "FMLA + CFRA exhausted → ADA accommodation", to: ["ADA"] },
  { id: "pdl_to_cfra", label: "PDL ended → CFRA bonding", to: ["CFRA"] },
  { id: "wc_to_fmlacfra", label: "Workers' Comp → run FMLA + CFRA concurrent", to: ["WC", "FMLA", "CFRA"] },
  { id: "wc_to_ada", label: "Workers' Comp → ADA accommodation", to: ["WC", "ADA"] },
  { id: "custom", label: "Custom transition…", to: null },
];

/**
 * Compute the case patch for a designation transition. Pure — the caller
 * persists and audits. Captures the prior designation's exhaustion state in
 * the history entry so the timeline answers "what was left when we switched?"
 *
 * @returns { patch, historyEntry }
 */
export function buildTransition(caseData, { to, effective_date, reason, actor, transitionReason }, employee = {}) {
  const toSet = normalizeDesignations(to);
  if (!toSet.length) throw new Error("Transition requires at least one target designation.");
  if (!effective_date) throw new Error("Effective date is required.");
  const fromSet = normalizeDesignations(caseData.designations?.length ? caseData.designations : caseData.leave_designation || caseData.type);
  const caseReason = reason ?? caseData.reason;
  const hpw = Number(employee.hours_per_week) || 40;
  // bonding that follows PDL on this case charges CFRA alone — inferred from
  // the prior designation set, not just the original intake flag
  const pdlPreceded = !!caseData.pdl_preceded || fromSet.includes("PDL");
  const opts = { state: employee.state || "CA", pdlPreceded };
  const { clocks, deferred, trackingOnly } = clocksForSet(toSet, caseReason, opts);
  const total = entitlementForSet(toSet, { hoursPerWeek: hpw, militaryCaregiver: !!caseData.military_caregiver, reason: caseReason, ...opts });
  const historyEntry = {
    from: fromSet, to: toSet,
    effective_date,
    reason: transitionReason || "",
    actor,
    at_transition: {
      total_hours: Number(caseData.total_hours) || 0,
      used_hours: Number(caseData.used_hours) || 0,
      exhausted: (Number(caseData.total_hours) || 0) > 0 && (Number(caseData.used_hours) || 0) >= (Number(caseData.total_hours) || 0),
    },
    created_at: new Date().toISOString(),
  };
  const patch = {
    designations: toSet,
    leave_designation: joinDesignations(toSet),
    type: joinDesignations(toSet),
    concurrent_clocks: clocks,
    pdl_preceded: pdlPreceded,
    deferred_clocks: deferred,
    tracking_designations: trackingOnly,
    // hour bank resets only when a NEW clocked entitlement begins; a move to
    // tracking-only (ADA/WC) keeps the exhausted bank visible as history
    total_hours: clocks.length ? total : Number(caseData.total_hours) || 0,
    used_hours: clocks.length && !clocks.some((c) => (caseData.concurrent_clocks || []).includes(c)) ? 0 : Number(caseData.used_hours) || 0,
    designation_history: [...(caseData.designation_history || []), historyEntry],
  };
  return { patch, historyEntry };
}
