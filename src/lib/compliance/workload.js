/* Workload & capacity metrics (v2.0 · Feature 6).
 * Pure, read-only analytics: one specialist managing three entities needs to
 * see load, cycle time, cert health, and the RTW pipeline at a glance. Also
 * feeds the structured digest behind the morning-briefing AI prompt. */
import { ffdStatus, nextRecertDue } from "./signals.js";

const toDate = (d) => (d instanceof Date ? new Date(d.getTime()) : new Date(`${String(d).slice(0, 10)}T00:00:00`));
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
const OPEN = ["Active", "Pending", "Approved"];

/** Business days between two dates (Mon–Fri), inclusive-exclusive. */
export function businessDaysBetween(a, b) {
  let d = toDate(a), end = toDate(b), n = 0;
  if (d > end) return 0;
  while (d < end) { const dow = d.getDay(); if (dow !== 0 && dow !== 6) n++; d.setDate(d.getDate() + 1); }
  return n;
}

/** Does this case need an action from HR right now / is it overdue? */
export function caseActionState(c, certs = [], asOf = new Date()) {
  const open = OPEN.includes(c.status);
  if (!open) return { pending: false, overdue: false, reasons: [] };
  const reasons = [];
  let overdue = false;
  if (!c.type && !c.leave_designation) reasons.push("awaiting designation");
  if (!c.cert_received && c.cert_due) { reasons.push("cert outstanding"); if (toDate(c.cert_due) < toDate(asOf)) { overdue = true; } }
  const openRecert = certs.find((x) => x.case_id === c.id && x.kind === "recert" && !x.received_at && x.due_date && toDate(x.due_date) < toDate(asOf));
  if (openRecert) { reasons.push("recert overdue"); overdue = true; }
  if (c.payroll_flag && !c.payroll_flag.acknowledged) reasons.push("payroll flag unacked");
  const ffd = ffdStatus(c);
  if (ffd.blocked) { reasons.push("FFD not cleared, RTW ≤14d"); }
  if (c.end_date && toDate(c.end_date) < toDate(asOf) && c.ffd?.required === true && !c.ffd?.cleared_at) { reasons.push("RTW passed without clearance"); overdue = true; }
  return { pending: reasons.length > 0, overdue, reasons };
}

export function workloadMetrics({ cases = [], certifications = [], hrUsers = [], asOf = new Date() } = {}) {
  const open = cases.filter((c) => OPEN.includes(c.status));

  /* cases per specialist */
  const owners = [...new Set([...hrUsers.filter((u) => ["specialist", "admin"].includes(u.role)).map((u) => u.name), ...open.map((c) => c.owner)].filter(Boolean))];
  const perSpecialist = owners.map((name) => {
    const mine = open.filter((c) => c.owner === name);
    const states = mine.map((c) => caseActionState(c, certifications, asOf));
    return { name, open: mine.length, pendingAction: states.filter((s) => s.pending).length, overdueAction: states.filter((s) => s.overdue).length };
  }).sort((a, b) => b.open - a.open);

  /* average case age by designation */
  const byType = {};
  for (const c of open) {
    const t = c.type || "Unassigned";
    byType[t] = byType[t] || { total: 0, n: 0 };
    byType[t].total += Math.max(0, daysBetween(c.created_at || c.start_date, asOf));
    byType[t].n++;
  }
  const avgAgeByType = Object.entries(byType).map(([type, v]) => ({ type, avgDays: Math.round(v.total / v.n), n: v.n })).sort((a, b) => b.avgDays - a.avgDays);

  /* intake-to-designation cycle time (target ≤3 business days) */
  const intakeCases = cases.filter((c) => c.source === "intake");
  const cycle = intakeCases.map((c) => {
    const designatedAt = c.designated_at || (c.type ? c.updated_at : null);
    const days = designatedAt ? businessDaysBetween(c.created_at, designatedAt) : businessDaysBetween(c.created_at, asOf);
    return { ref: c.ref, days, designated: !!c.type, exceeds: days > 3 };
  });
  const cycleStats = {
    n: cycle.length,
    avgBusinessDays: cycle.length ? Math.round((cycle.reduce((s, x) => s + x.days, 0) / cycle.length) * 10) / 10 : 0,
    exceeding: cycle.filter((x) => x.exceeds),
  };

  /* certification chain health */
  const clocked = open.filter((c) => c.type && c.type !== "Personal");
  let current = 0, overdueRecert = 0, awaitingInitial = 0;
  for (const c of clocked) {
    const chain = certifications.filter((x) => x.case_id === c.id);
    const hasReceived = chain.some((x) => x.received_at);
    if (!hasReceived) { awaitingInitial++; continue; }
    const od = chain.some((x) => x.kind === "recert" && !x.received_at && x.due_date && toDate(x.due_date) < toDate(asOf));
    if (od) overdueRecert++; else current++;
  }
  const certHealth = {
    n: clocked.length,
    pctCurrent: clocked.length ? Math.round((current / clocked.length) * 100) : 0,
    pctOverdueRecert: clocked.length ? Math.round((overdueRecert / clocked.length) * 100) : 0,
    pctAwaitingInitial: clocked.length ? Math.round((awaitingInitial / clocked.length) * 100) : 0,
  };

  /* RTW pipeline — next 8 weeks by expected return week */
  const weeks = [];
  for (let w = 0; w < 8; w++) {
    const start = toDate(asOf); start.setDate(start.getDate() + w * 7);
    const end = toDate(start); end.setDate(end.getDate() + 7);
    const returning = open.filter((c) => c.end_date && toDate(c.end_date) >= start && toDate(c.end_date) < end);
    weeks.push({
      week: w + 1,
      startsISO: start.toISOString().slice(0, 10),
      count: returning.length,
      cleared: returning.filter((c) => c.ffd?.required === false || c.ffd?.cleared_at).length,
      blocked: returning.filter((c) => ffdStatus(c).blocked).length,
      refs: returning.map((c) => c.ref),
    });
  }

  return { perSpecialist, avgAgeByType, cycleStats, certHealth, rtwPipeline: weeks };
}

/** Structured digest for the morning-briefing AI prompt (Feature 1b). */
export function briefingDigest({ cases = [], certifications = [], asOf = new Date() } = {}) {
  const open = cases.filter((c) => OPEN.includes(c.status));
  const du = (d) => daysBetween(asOf, d);
  return {
    asOf: toDate(asOf).toISOString().slice(0, 10),
    certsDue7: open.filter((c) => !c.cert_received && c.cert_due && du(c.cert_due) >= 0 && du(c.cert_due) <= 7).map((c) => ({ ref: c.ref, due: c.cert_due })),
    overdueRecerts: open.flatMap((c) => certifications.filter((x) => x.case_id === c.id && x.kind === "recert" && !x.received_at && x.due_date && toDate(x.due_date) < toDate(asOf)).map((x) => ({ ref: c.ref, daysLate: -du(x.due_date) }))),
    unackedPayroll: open.filter((c) => c.payroll_flag && !c.payroll_flag.acknowledged).map((c) => ({ ref: c.ref, kind: c.payroll_flag.kind, by: c.payroll_flag.coordinate_by })),
    adaOverdue: open.filter((c) => c.ada?.tracked && !c.ada?.resolved).map((c) => ({ ref: c.ref, nextStep: ["requested", "initiated", "offered", "decision", "resolved"].find((k) => !c.ada[k]) || "resolved" })),
    rtwWithoutFfd: open.filter((c) => c.end_date && du(c.end_date) >= 0 && du(c.end_date) <= 14 && c.ffd?.required === true && !c.ffd?.cleared_at).map((c) => ({ ref: c.ref, days: du(c.end_date) })),
    newIntakes: cases.filter((c) => c.source === "intake" && c.status === "Pending" && !c.type).map((c) => ({ ref: c.ref, employee: String(c.updated_by || "").replace("Employee intake", "").trim() || "employee" })),
  };
}
