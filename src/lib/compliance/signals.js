/* LeaveIQ v1.2 — operational & risk signal engine.
 * Pure, dependency-free, shared by UI / alerts / edge function logic.
 *
 *  - payrollFlags:      pay-coordination flags (SDI offset, PFL, timekeeping)
 *  - nextRecertDue:     recertification chain intervals (29 CFR 825.308)
 *  - ffdStatus:         fitness-for-duty pre-RTW checklist state
 *  - crossCaseSignals:  overlapping-pattern flags (flag, never act)
 *  - exhaustionAlerts:  employees projected to exhaust FMLA within N days
 *
 * NOT legal advice; signals are surfaced for human review only.
 */
import { exhaustionProjection, resolveJurisdiction } from "./engine.js";

const toDate = (d) => (d instanceof Date ? new Date(d.getTime()) : new Date(`${String(d).slice(0, 10)}T00:00:00`));
const addDays = (d, n) => { const x = toDate(d); x.setDate(x.getDate() + n); return x; };
const iso = (d) => toDate(d).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);

/* ── Tier 1 · payroll coordination flags ────────────────────────────────── */
/**
 * Case-level pay-coordination flags. We never calculate pay — we surface what
 * payroll needs to know and by when. Returns [] for blank-designation cases
 * (nothing to coordinate until HR designates).
 */
export function payrollFlags(caseData, employee = {}, jurisdiction) {
  if (!caseData?.leave_designation && !caseData?.type) return [];
  const desig = caseData.leave_designation || caseData.type;
  const state = employee.state || caseData.state || "CA";
  const J = resolveJurisdiction(jurisdiction ?? caseData.jurisdiction ?? state);
  const pc = J?.payrollCoordination || {};
  const by = (n) => iso(addDays(caseData.start_date, n));
  const flags = [];
  if (pc.SDI_offset && state === "CA" && desig.includes("PDL")) {
    flags.push({ kind: "sdi_offset", severity: "high", message: "On PDL — CA SDI wage-replacement offset likely applies. Coordinate benefit integration with payroll.", coordinate_by: by(7) });
  }
  if (pc.PFL_bonding && state === "CA" && (caseData.reason === "bonding" || caseData.reason === "family_care")) {
    flags.push({ kind: "pfl_wage", severity: "medium", message: "Bonding/family-care leave — CA PFL wage replacement may apply. Confirm EDD claim status with payroll.", coordinate_by: by(7) });
  }
  if (pc.intermittent_timekeeping !== false && caseData.intermittent) {
    flags.push({ kind: "intermittent_timekeeping", severity: "medium", message: "Intermittent schedule — confirm timekeeping/earnings coding with payroll so partial days post correctly.", coordinate_by: by(5) });
  }
  if (pc.SDI_continuous && state === "CA" && desig.includes("FMLA") && caseData.reason === "own_serious_health" && !caseData.intermittent) {
    flags.push({ kind: "sdi_possible", severity: "low", message: "Continuous medical leave — employee may file for CA SDI. Flag for payroll awareness.", coordinate_by: by(10) });
  }
  return flags;
}

/** The single flag a case carries (highest severity wins). */
export function primaryPayrollFlag(caseData, employee, jurisdiction) {
  const rank = { high: 3, medium: 2, low: 1 };
  return payrollFlags(caseData, employee, jurisdiction).sort((a, b) => rank[b.severity] - rank[a.severity])[0] || null;
}

/** v2.0 alias with explicit jurisdiction-first naming. */
export const payrollFlagsFor = (jurisdiction, caseData, employee) => payrollFlags(caseData, employee, jurisdiction);

/* ── Tier 2 · recertification chain ─────────────────────────────────────── */
export const RECERT_INTERVALS = {
  intermittent_days: 30,   // 29 CFR 825.308(c): recert every 30 days for intermittent (absent longer minimum duration)
  continuous_days: 180,    // every 6 months in connection with an absence (825.308(b))
};

/**
 * Given a case and its certification chain (sorted or not), when is the next
 * recertification due? Returns null when recert doesn't apply (no medical
 * basis, blank designation, closed case, or no initial cert received yet).
 * chain rows: { kind: 'medical'|'recert'|'fitness_for_duty', due_date, received_at }
 */
export function nextRecertDue(caseData, chain = []) {
  const desig = caseData.leave_designation || caseData.type;
  if (!desig || desig === "Personal") return null;
  if (!["own_serious_health", "family_care", "pregnancy_disability", "military_caregiver"].includes(caseData.reason)) return null;
  if (["Closed", "Denied"].includes(caseData.status)) return null;
  const medical = chain.filter((c) => c.kind === "medical" || c.kind === "recert");
  const lastReceived = medical.filter((c) => c.received_at).sort((a, b) => toDate(b.received_at) - toDate(a.received_at))[0];
  if (!lastReceived) return null; // initial certification still outstanding — tracked by cert_due
  const interval = caseData.intermittent ? RECERT_INTERVALS.intermittent_days : RECERT_INTERVALS.continuous_days;
  let due = addDays(lastReceived.received_at, interval);
  if (caseData.end_date && toDate(caseData.end_date) < due) return null; // leave ends before recert window
  // already requested? the open (unreceived) recert in the chain owns the date
  const openRecert = medical.find((c) => !c.received_at && c.kind === "recert");
  if (openRecert) return { due_date: openRecert.due_date, requested: true, interval };
  return { due_date: iso(due), requested: false, interval };
}

/* ── Tier 2 · fitness-for-duty checklist ────────────────────────────────── */
export const FFD_STEPS = [
  { id: "required", label: "FFD certification required" },
  { id: "requested", label: "FFD certification requested" },
  { id: "received", label: "FFD certification received" },
  { id: "cleared", label: "Cleared to return" },
];

/**
 * Checklist state from the case's FFD record:
 * ffd = { required, requested_at, received_at, cleared_at }
 * Returns { steps:[{id,label,done,date}], complete, blocked, nextStep }
 */
export function ffdStatus(caseData) {
  const f = caseData.ffd || {};
  if (f.required === false) return { steps: [], complete: true, blocked: false, nextStep: null, waived: true };
  const steps = [
    { id: "required", label: FFD_STEPS[0].label, done: f.required === true, date: null },
    { id: "requested", label: FFD_STEPS[1].label, done: !!f.requested_at, date: f.requested_at || null },
    { id: "received", label: FFD_STEPS[2].label, done: !!f.received_at, date: f.received_at || null },
    { id: "cleared", label: FFD_STEPS[3].label, done: !!f.cleared_at, date: f.cleared_at || null },
  ];
  const complete = steps.every((s) => s.done);
  const rtwSoon = caseData.end_date ? daysBetween(new Date(), caseData.end_date) <= 14 && daysBetween(new Date(), caseData.end_date) >= 0 : false;
  return { steps, complete, blocked: rtwSoon && f.required === true && !f.cleared_at, nextStep: steps.find((s) => !s.done)?.id ?? null, waived: false };
}

/* ── Tier 2/3 · ADA interactive process ─────────────────────────────────── */
export const ADA_MILESTONES = [
  { id: "requested", label: "Accommodation requested" },
  { id: "initiated", label: "Interactive process initiated" },
  { id: "offered", label: "Accommodation offered" },
  { id: "decision", label: "Accepted / declined" },
  { id: "resolved", label: "Resolution documented" },
];

/** Does this case carry ADA exposure worth tracking? (heuristic flag) */
export function adaExposure(caseData, projection = null) {
  if (caseData.ada?.tracked) return true; // manually opened tracker
  if (!["own_serious_health", "pregnancy_disability"].includes(caseData.reason)) return false;
  if (["Closed", "Denied"].includes(caseData.status)) return false;
  const total = Number(caseData.total_hours) || 0;
  const usedPct = total > 0 ? (Number(caseData.used_hours) || 0) / total : 0;
  return usedPct >= 0.75 || !!projection; // nearing exhaustion ⇒ accommodation conversation territory
}

export function adaStatus(caseData) {
  const a = caseData.ada || {};
  const steps = ADA_MILESTONES.map((m) => ({ ...m, done: !!a[m.id], date: a[m.id] || null }));
  const open = steps.some((s) => s.done) && !a.resolved;
  return { steps, open, complete: !!a.resolved, nextStep: steps.find((s) => !s.done)?.id ?? null, tracked: !!a.tracked || steps.some((s) => s.done) };
}

/* ── Tier 3 · cross-case risk signals ───────────────────────────────────── */
/**
 * Overlapping-pattern detection. These are FLAGS for legal/HR review — the
 * platform never acts on them. Each signal carries its rationale so the
 * reviewer sees exactly why it fired.
 *
 * correctiveActions rows: { employee_id, kind: 'PIP'|'written_warning'|'final_warning'|'verbal', action_date }
 */
export function crossCaseSignals({ employees = [], cases = [], correctiveActions = [], intermittentLog = [], certifications = [], asOf = new Date() } = {}) {
  const signals = [];
  const logByCase = new Map();
  for (const l of intermittentLog) { if (!logByCase.has(l.case_id)) logByCase.set(l.case_id, []); logByCase.get(l.case_id).push(l); }
  const certsByCase = new Map();
  for (const c of certifications) { if (!certsByCase.has(c.case_id)) certsByCase.set(c.case_id, []); certsByCase.get(c.case_id).push(c); }
  const byEmp = new Map();
  for (const c of cases) { if (!byEmp.has(c.employee_id)) byEmp.set(c.employee_id, []); byEmp.get(c.employee_id).push(c); }
  const caByEmp = new Map();
  for (const a of correctiveActions) { if (!caByEmp.has(a.employee_id)) caByEmp.set(a.employee_id, []); caByEmp.get(a.employee_id).push(a); }
  const now = toDate(asOf);

  for (const emp of employees) {
    const empCases = byEmp.get(emp.id) || [];
    const empCA = caByEmp.get(emp.id) || [];

    // 1) multiple intermittent cases opened in the trailing 12 months
    const yearAgo = addDays(now, -365);
    const recentIntermittent = empCases.filter((c) => c.intermittent && toDate(c.start_date) > yearAgo);
    if (recentIntermittent.length >= 2) {
      signals.push({
        id: `multi-int-${emp.id}`, employee_id: emp.id, employee: emp.name, entity_code: emp.entity_code,
        kind: "multiple_intermittent", severity: "medium",
        title: `${recentIntermittent.length} intermittent cases opened within 12 months`,
        rationale: `Cases ${recentIntermittent.map((c) => c.ref).join(", ")} — review certification adequacy and pattern consistency.`,
        recommendedAction: "Review the certification chain for adequacy; consider whether changed circumstances support recertification (29 CFR 825.308(c)).",
        counselExport: false,
        cases: recentIntermittent.map((c) => c.ref),
      });
    }

    // 2) leave opened within 30 days AFTER a corrective action
    for (const c of empCases) {
      for (const a of empCA) {
        const gap = daysBetween(a.action_date, c.start_date);
        if (gap >= 0 && gap <= 30) {
          signals.push({
            id: `post-ca-${c.id}-${a.action_date}`, employee_id: emp.id, employee: emp.name, entity_code: emp.entity_code,
            kind: "leave_after_corrective", severity: "high",
            title: `Leave opened ${gap} day${gap === 1 ? "" : "s"} after ${a.kind.replace("_", " ")}`,
            rationale: `${c.ref} started ${c.start_date}; ${a.kind.replace("_", " ")} dated ${a.action_date}. Timing proximity warrants documentation review before any adverse action.`,
            recommendedAction: "Freeze any pending discipline decisions; assemble the corrective-action file and route to counsel before proceeding.",
            counselExport: true,
            cases: [c.ref],
          });
        }
      }
    }

    // 3) active leave + corrective action within the last 90 days (PIP weighted highest)
    const activeCase = empCases.find((c) => ["Active", "Approved"].includes(c.status));
    if (activeCase) {
      const recentCA = empCA.filter((a) => daysBetween(a.action_date, now) >= 0 && daysBetween(a.action_date, now) <= 90);
      const pip = recentCA.find((a) => a.kind === "PIP");
      if (pip) {
        signals.push({
          id: `pip-${activeCase.id}`, employee_id: emp.id, employee: emp.name, entity_code: emp.entity_code,
          kind: "active_leave_with_pip", severity: "high",
          title: "Active leave concurrent with recent PIP",
          rationale: `${activeCase.ref} is ${activeCase.status.toLowerCase()}; PIP dated ${pip.action_date}. Freeze PIP clock decisions pending counsel review — protected leave time generally cannot count against performance timelines.`,
          recommendedAction: "Pause the PIP clock for the duration of protected leave and document the pause; route to counsel.",
          counselExport: true,
          cases: [activeCase.ref],
        });
      } else if (recentCA.length) {
        signals.push({
          id: `ca90-${activeCase.id}`, employee_id: emp.id, employee: emp.name, entity_code: emp.entity_code,
          kind: "active_leave_recent_corrective", severity: "medium",
          title: "Active leave with corrective action in the last 90 days",
          rationale: `${activeCase.ref} active; ${recentCA[0].kind.replace("_", " ")} dated ${recentCA[0].action_date}.`,
          recommendedAction: "Note the overlap in the case file; avoid new discipline during leave without counsel sign-off.",
          counselExport: false,
          cases: [activeCase.ref],
        });
      }
    }

    // 4) Mon/Fri usage pattern on intermittent cases (>60% of dates, min 5 entries)
    for (const c of empCases.filter((x) => x.intermittent)) {
      const entries = logByCase.get(c.id) || [];
      if (entries.length >= 5) {
        const mf = entries.filter((l) => { const dow = toDate(l.usage_date).getDay(); return dow === 1 || dow === 5; }).length;
        const pct = Math.round((mf / entries.length) * 100);
        if (mf / entries.length > 0.6) {
          signals.push({
            id: `monfri-${c.id}`, employee_id: emp.id, employee: emp.name, entity_code: emp.entity_code,
            kind: "monday_friday_pattern", severity: "medium",
            title: `${pct}% of intermittent usage falls on Mondays/Fridays`,
            rationale: `${c.ref}: ${mf} of ${entries.length} logged dates are Mon/Fri. A weekend-adjacent pattern can constitute changed circumstances casting doubt on the stated reason.`,
            recommendedAction: "Consider recertification for changed circumstances (29 CFR 825.308(e)) — pattern alone is not misuse; do not confront the employee without counsel guidance.",
            counselExport: false,
            cases: [c.ref],
          });
        }
      }
    }

    // 5) PDL closed ≥30 days, no CFRA bonding case opened
    for (const c of empCases) {
      const isPdl = (c.designations || []).includes("PDL") || (c.type || "").includes("PDL");
      if (isPdl && c.status === "Closed" && c.end_date && daysBetween(c.end_date, now) >= 30) {
        const bonding = empCases.some((x) => x.id !== c.id && (x.reason === "bonding" || ((x.designations || []).includes("CFRA") && toDate(x.start_date) >= toDate(c.end_date))));
        if (!bonding) {
          signals.push({
            id: `pdl-nobond-${c.id}`, employee_id: emp.id, employee: emp.name, entity_code: emp.entity_code,
            kind: "pdl_no_bonding", severity: "medium",
            title: `PDL closed ${daysBetween(c.end_date, now)} days ago — no CFRA bonding case opened`,
            rationale: `${c.ref} ended ${c.end_date}. CFRA bonding is a separate, additional entitlement after PDL; failure to advise of bonding rights is an interference exposure.`,
            recommendedAction: "Send the CFRA bonding notice and confirm the employee's intent; open the bonding case if elected.",
            counselExport: false,
            cases: [c.ref],
          });
        }
      }
    }

    // 6) ADA exposure without interactive process (medical leave ≥90 days, no milestones)
    for (const c of empCases) {
      const medical = ["own_serious_health", "pregnancy_disability"].includes(c.reason);
      const active = ["Active", "Approved"].includes(c.status);
      const ninety = c.start_date && daysBetween(c.start_date, now) >= 90;
      const noAda = !c.ada || !["requested", "initiated", "offered", "decision", "resolved"].some((k) => c.ada[k]);
      if (medical && active && ninety && noAda) {
        signals.push({
          id: `ada-gap-${c.id}`, employee_id: emp.id, employee: emp.name, entity_code: emp.entity_code,
          kind: "ada_gap", severity: "high",
          title: `Medical leave ${daysBetween(c.start_date, now)} days in — interactive process never initiated`,
          rationale: `${c.ref} started ${c.start_date}. Extended medical leave is itself notice of a possible disability; FEHA requires a timely, good-faith interactive process independent of any formal request.`,
          recommendedAction: "Open the ADA tracker on the case and send the interactive-process initiation letter this week.",
          counselExport: true,
          cases: [c.ref],
        });
      }
    }

    // 7) Recert overdue while leave still active
    for (const c of empCases.filter((x) => ["Active", "Approved"].includes(x.status))) {
      const openRecert = (certsByCase.get(c.id) || []).find((x) => x.kind === "recert" && !x.received_at && x.due_date && toDate(x.due_date) < now);
      if (openRecert) {
        const late = daysBetween(openRecert.due_date, now);
        signals.push({
          id: `recert-od-${c.id}`, employee_id: emp.id, employee: emp.name, entity_code: emp.entity_code,
          kind: "recert_overdue_active", severity: "medium",
          title: `Recertification ${late} day${late === 1 ? "" : "s"} overdue on an active leave`,
          rationale: `${c.ref}: recert was due ${openRecert.due_date} and has not been received. Continued absence without a current certification weakens both the approval record and any later defense.`,
          recommendedAction: "Issue a written follow-up with a 7-day cure window; document the contact in the case file.",
          counselExport: false,
          cases: [c.ref],
        });
      }
    }

    // 8) RTW clearance gap — return date passed, FFD not cleared, case still open
    for (const c of empCases) {
      const open = !["Closed", "Denied"].includes(c.status);
      const past = c.end_date && toDate(c.end_date) < now;
      const ffdRequired = c.ffd?.required === true && !c.ffd?.cleared_at;
      if (open && past && ffdRequired) {
        signals.push({
          id: `rtw-gap-${c.id}`, employee_id: emp.id, employee: emp.name, entity_code: emp.entity_code,
          kind: "rtw_clearance_gap", severity: "high",
          title: `Return date passed ${daysBetween(c.end_date, now)} day${daysBetween(c.end_date, now) === 1 ? "" : "s"} ago without FFD clearance`,
          rationale: `${c.ref} was scheduled to end ${c.end_date}; fitness-for-duty is required and not cleared, and the case remains open. The employee's current work status is undocumented.`,
          recommendedAction: "Determine actual status today: extend the leave, obtain the FFD certification, or document the absence — then close the gap in the record.",
          counselExport: true,
          cases: [c.ref],
        });
      }
    }

    // 9) Cross-entity leave stacking — overlapping cases under different entities
    for (let i = 0; i < empCases.length; i++) for (let j = i + 1; j < empCases.length; j++) {
      const a = empCases[i], b = empCases[j];
      if (!a.entity_code || !b.entity_code || a.entity_code === b.entity_code) continue;
      const aEnd = a.end_date || "2099-01-01", bEnd = b.end_date || "2099-01-01";
      const overlap = toDate(a.start_date) <= toDate(bEnd) && toDate(b.start_date) <= toDate(aEnd);
      if (overlap) {
        signals.push({
          id: `xent-${a.id}-${b.id}`, employee_id: emp.id, employee: emp.name, entity_code: emp.entity_code,
          kind: "cross_entity_stack", severity: "high",
          title: `Overlapping leave cases across entities (${a.entity_code} + ${b.entity_code})`,
          rationale: `${a.ref} (${a.entity_code}) and ${b.ref} (${b.entity_code}) overlap. Under the integrated-employer doctrine the AMPAM entities share one FMLA employer — entitlement must not double-count across entities.`,
          recommendedAction: "Consolidate the clock accounting: confirm both cases charge the same rolling window and merge or close the duplicate.",
          counselExport: true,
          cases: [a.ref, b.ref],
        });
      }
    }
  }
  const rank = { high: 3, medium: 2, low: 1 };
  return signals.sort((a, b) => rank[b.severity] - rank[a.severity]);
}

/* ── Tier 3 · proactive exhaustion alerts ───────────────────────────────── */
/**
 * Employees projected to exhaust an FMLA-charged entitlement within
 * `withinDays`. Uses the trailing-4-week burn projection for intermittent
 * cases and the scheduled end-vs-balance for continuous ones.
 */
export function exhaustionAlerts({ cases = [], intermittentLog = [], withinDays = 60, asOf = new Date() } = {}) {
  const horizon = addDays(asOf, withinDays);
  const out = [];
  for (const c of cases) {
    if (!["Active", "Approved", "Pending"].includes(c.status)) continue;
    if (!(c.concurrent_clocks || []).includes("FMLA")) continue;
    const total = Number(c.total_hours) || 0;
    if (!total) continue;
    const remaining = Math.max(0, total - (Number(c.used_hours) || 0));
    let projectedDate = null, basis = null;
    if (c.intermittent) {
      const entries = intermittentLog.filter((l) => l.case_id === c.id);
      const p = exhaustionProjection({ remaining, entries, asOf });
      if (p) { projectedDate = p.projectedDate; basis = `${p.burnPerWeek}h/wk burn`; }
    } else if (c.end_date && remaining > 0) {
      // continuous: exhausts at the earlier of scheduled end or balance run-out at full schedule
      const usedPct = (total - remaining) / total;
      if (usedPct >= 0.5) { projectedDate = c.end_date; basis = "continuous schedule"; }
    }
    if (projectedDate && toDate(projectedDate) <= horizon && toDate(projectedDate) >= toDate(asOf)) {
      out.push({ case_id: c.id, ref: c.ref, employee_id: c.employee_id, projectedDate, remaining: Math.round(remaining), basis });
    }
  }
  return out.sort((a, b) => toDate(a.projectedDate) - toDate(b.projectedDate));
}
