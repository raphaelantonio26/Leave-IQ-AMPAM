/* Data provider. One context, two backends:
 *   - Supabase mode (env vars present): real database, RLS-scoped, audit
 *     trigger writes change rows server-side.
 *   - Demo mode: deterministic synthetic seed persisted to localStorage.
 *
 * Every mutation flows through an action here, and every action records an
 * audit event — UI components never write state or audit entries directly.
 */
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { SEED } from "./demoSeed.js";
import { supabaseConfigured, api } from "./api.js";
import { loadState, saveState } from "../ui.jsx";
import { clocksFor, entitlementHours, scheduledHoursPerWeek } from "../lib/compliance/engine.js";
import { primaryPayrollFlag } from "../lib/compliance/signals.js";
import { buildTransition, joinDesignations, normalizeDesignations, clocksForSet, entitlementForSet } from "../lib/compliance/designations.js";
import { nextTemplateVersion } from "../lib/docs/templates.js";
import { getStorage, docPath } from "../lib/storage/index.js";
import { entitlementHoursScheduled, validateUsage } from "../lib/compliance/schedule.js";
import { getESign, nextEsignStatus } from "../lib/esign/index.js";
import { buildFormPDF } from "../pdf/forms.js";
import { localTriage, triageIntake, caseContextBlock } from "../lib/ai/index.js";

const DataCtx = createContext(null);
export const useData = () => useContext(DataCtx);

const LS = { employees: "liq_employees", cases: "liq_cases", log: "liq_log", audit: "liq_audit", certs: "liq_certs", ca: "liq_ca", docs: "liq_docs", templates: "liq_templates", packets: "liq_packets", messages: "liq_messages" };
const todayISO = () => new Date().toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();

export function DataProvider({ children }) {
  const demo = !supabaseConfigured;
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState(null);
  const [entities, setEntities] = useState(SEED.entities);
  const [hrUsers, setHrUsers] = useState(SEED.hrUsers);
  const [employees, setEmployees] = useState(() => (demo ? loadState(LS.employees, SEED.employees) : []));
  const [cases, setCases] = useState(() => (demo ? loadState(LS.cases, SEED.cases) : []));
  const [intermittentLog, setLog] = useState(() => (demo ? loadState(LS.log, SEED.intermittentLog) : []));
  const [auditEvents, setAudit] = useState(() => (demo ? loadState(LS.audit, SEED.auditEvents) : []));
  const [certifications, setCerts] = useState(() => (demo ? loadState(LS.certs, SEED.certifications) : []));
  const [correctiveActions, setCA] = useState(() => (demo ? loadState(LS.ca, SEED.correctiveActions) : []));
  const [documents, setDocs] = useState(() => (demo ? loadState(LS.docs, SEED.documents) : []));
  const [templates, setTemplates] = useState(() => (demo ? loadState(LS.templates, SEED.templates) : []));
  const [packets, setPackets] = useState(() => (demo ? loadState(LS.packets, SEED.packets) : []));
  const [messages, setMessages] = useState(() => (demo ? loadState(LS.messages, SEED.messages) : []));

  useEffect(() => { if (demo) saveState(LS.employees, employees); }, [demo, employees]);
  useEffect(() => { if (demo) saveState(LS.cases, cases); }, [demo, cases]);
  useEffect(() => { if (demo) saveState(LS.log, intermittentLog); }, [demo, intermittentLog]);
  useEffect(() => { if (demo) saveState(LS.audit, auditEvents); }, [demo, auditEvents]);
  useEffect(() => { if (demo) saveState(LS.certs, certifications); }, [demo, certifications]);
  useEffect(() => { if (demo) saveState(LS.ca, correctiveActions); }, [demo, correctiveActions]);
  useEffect(() => { if (demo) saveState(LS.docs, documents); }, [demo, documents]);
  useEffect(() => { if (demo) saveState(LS.templates, templates); }, [demo, templates]);
  useEffect(() => { if (demo) saveState(LS.packets, packets); }, [demo, packets]);
  useEffect(() => { if (demo) saveState(LS.messages, messages); }, [demo, messages]);

  const refresh = useCallback(async () => {
    if (demo) return;
    setLoading(true);
    try {
      const d = await api.fetchAll();
      setEntities(d.entities); setEmployees(d.employees); setCases(d.cases);
      setLog(d.intermittentLog); setAudit(d.auditEvents); setHrUsers(d.hrUsers);
      if (d.certifications) setCerts(d.certifications); if (d.correctiveActions) setCA(d.correctiveActions);
      if (d.documents) setDocs(d.documents); if (d.templates) setTemplates(d.templates);
      if (d.packets) setPackets(d.packets); if (d.messages) setMessages(d.messages);
      setError(null);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [demo]);
  useEffect(() => { refresh(); }, [refresh]);

  const pushAudit = useCallback((ev) => {
    const row = { id: Date.now() + Math.random(), changed_at: nowISO(), source: "web", old_values: null, new_values: null, ...ev };
    if (demo) setAudit((prev) => [row, ...prev]);
    else api.logEvent({ case_id: ev.case_id ?? null, employee_id: ev.employee_id ?? null, action: ev.action, source: ev.source || "web", old_values: ev.old_values || null, new_values: ev.new_values || null }).catch(() => {});
    return row;
  }, [demo]);

  /* ── actions ──────────────────────────────────────────────────────────── */

  const createCase = useCallback(async (input, actor) => {
    const emp = employees.find((e) => e.id === Number(input.employee_id));
    const hpw = scheduledHoursPerWeek(emp);
    // v1.3: designation SETS. input.designations[] wins; a legacy single
    // string becomes a one-element set; empty = await designation.
    const desigSet = normalizeDesignations(input.designations?.length ? input.designations : input.leave_designation ?? input.type ?? "");
    const designation = joinDesignations(desigSet);
    const opts = { state: emp?.state || "CA", pdlPreceded: !!input.pdl_preceded };
    const setResult = clocksForSet(desigSet, input.reason, opts);
    const clocks = setResult.clocks;
    let total = entitlementForSet(desigSet, { hoursPerWeek: hpw, militaryCaregiver: !!input.military_caregiver, reason: input.reason, ...opts });
    // v2.0: variable schedules — integrate the schedule history over the leave
    // window instead of the point-in-time rate (identical for static schedules)
    if (emp?.scheduleHistory?.length && clocks.length && input.start_date) {
      total = Math.max(...clocks.map((cl) => entitlementHoursScheduled(cl, emp, input.start_date, { militaryCaregiver: !!input.military_caregiver })));
    }
    const today = todayISO();
    const row = {
      ...input,
      employee_id: Number(input.employee_id),
      entity_id: emp?.entity_id, entity_code: emp?.entity_code, file_number: emp?.file_number,
      type: designation, leave_designation: designation,
      designations: desigSet, deferred_clocks: setResult.deferred, tracking_designations: setResult.trackingOnly,
      designation_history: [],
      jurisdiction: emp?.jurisdiction || "CA",
      designated_at: clocks.length || desigSet.length ? today : null,
      concurrent_clocks: clocks, total_hours: total, used_hours: 0,
      cert_received: false, cert_due: input.cert_due || addDaysISO(input.start_date, 15),
      documents: [], created_at: today, updated_at: today, updated_by: actor,
    };
    if (demo) {
      const id = Math.max(0, ...cases.map((c) => c.id)) + 1;
      const ref = `LV-${new Date().getFullYear()}-${String(1000 + id)}`;
      const full = { ...row, id, ref, audit: [{ date: today, action: "Case created", user: actor, source: "web" }] };
      full.payroll_flag = primaryPayrollFlag(full, emp);
      setCases((prev) => [...prev, full]);
      if (clocks.length) {
        setCerts((prev) => [...prev, { id: Date.now(), case_id: id, kind: "medical", requested_at: today, due_date: row.cert_due, received_at: null }]);
      }
      pushAudit({ case_id: id, case_ref: ref, employee_id: full.employee_id, action: "Case created", changed_by: actor, new_values: { type: designation, start_date: row.start_date } });
      return full;
    }
    const saved = await api.createCase(stripDemoFields(row));
    await refresh();
    return saved;
  }, [demo, cases, employees, pushAudit, refresh]);

  const updateCase = useCallback(async (id, patch, actor, actionLabel = "Case updated") => {
    if (demo) {
      let oldVals = null;
      setCases((prev) => prev.map((c) => {
        if (c.id !== id) return c;
        oldVals = Object.fromEntries(Object.keys(patch).map((k) => [k, c[k]]));
        const next = { ...c, ...patch, updated_at: todayISO(), updated_by: actor };
        if (patch.leave_designation !== undefined) { // designation assigned → clocks start
          const emp = employees.find((e) => e.id === c.employee_id);
          const hpw = scheduledHoursPerWeek(emp);
          next.type = patch.leave_designation;
          next.concurrent_clocks = clocksFor(patch.leave_designation, patch.reason ?? c.reason, { state: emp?.state || "CA", pdlPreceded: !!c.pdl_preceded });
          next.total_hours = patch.leave_designation ? entitlementHours(patch.leave_designation, { hoursPerWeek: hpw, militaryCaregiver: !!c.military_caregiver }) : 0;
          next.payroll_flag = primaryPayrollFlag(next, emp);
        }
        next.audit = [...(c.audit || []), { date: todayISO(), action: actionLabel, user: actor, source: "web" }];
        return next;
      }));
      const c = cases.find((x) => x.id === id);
      pushAudit({ case_id: id, case_ref: c?.ref, employee_id: c?.employee_id, action: actionLabel, changed_by: actor, old_values: oldVals, new_values: patch });
      return;
    }
    await api.updateCase(id, patch); // DB trigger writes the audit row with old/new jsonb
    await refresh();
  }, [demo, cases, employees, pushAudit, refresh]);

  const logIntermittent = useCallback(async (entry, actor) => {
    const c = cases.find((x) => x.id === entry.case_id);
    // v2.0: usage validates against the schedule in effect ON the usage date
    const emp = employees.find((e) => e.id === c?.employee_id);
    if (emp) {
      const v = validateUsage(emp, entry.usage_date, entry.hours_used);
      if (!v.ok) throw new Error(v.reason);
    }
    const row = {
      ...entry,
      employee_id: c?.employee_id, file_number: c?.file_number,
      leave_start_date: c?.start_date, // attribution key: file number + leave start date
      approved_by: actor,
    };
    if (demo) {
      setLog((prev) => [...prev, { ...row, id: Date.now() }]);
      setCases((prev) => prev.map((x) => x.id === entry.case_id ? { ...x, used_hours: (x.used_hours || 0) + Number(entry.hours_used), updated_at: todayISO(), updated_by: actor, audit: [...(x.audit || []), { date: todayISO(), action: `Intermittent usage logged: ${entry.hours_used}h on ${entry.usage_date}`, user: actor, source: "web" }] } : x));
      pushAudit({ case_id: entry.case_id, case_ref: c?.ref, employee_id: c?.employee_id, action: `Intermittent usage logged: ${entry.hours_used}h`, changed_by: actor, new_values: { usage_date: entry.usage_date, hours_used: entry.hours_used } });
      return;
    }
    await api.logIntermittent(row); // DB trigger rolls used_hours up to the case
    await refresh();
  }, [demo, cases, pushAudit, refresh, employees]);

  const markCertReceived = useCallback(async (caseId, actor) => updateCase(caseId, { cert_received: true }, actor, "Medical certification received"), [updateCase]);

  const attachDocument = useCallback(async (caseId, meta, actor) => {
    if (demo) {
      setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, documents: [...(c.documents || []), { ...meta, generated_at: nowISO(), generated_by: actor }], audit: [...(c.audit || []), { date: todayISO(), action: `Document generated: ${meta.title} (${meta.language})`, user: actor, source: "web" }] } : c));
      const c = cases.find((x) => x.id === caseId);
      pushAudit({ case_id: caseId, case_ref: c?.ref, employee_id: c?.employee_id, action: `Document generated: ${meta.title} (${meta.language})`, changed_by: actor });
      return;
    }
    await api.logEvent({ case_id: caseId, action: `Document generated: ${meta.title} (${meta.language})` });
    await refresh();
  }, [demo, cases, pushAudit, refresh]);

  const importCommit = useCallback(async (diff, actor) => {
    if (demo) {
      let nextEmpId = Math.max(0, ...employees.map((e) => e.id)) + 1;
      const byFile = new Map(employees.map((e) => [e.file_number, e]));
      const added = [];
      for (const row of diff.newEmployees) {
        const ent = entities.find((x) => x.code === row.entity_code) || entities[0];
        const emp = { id: nextEmpId++, entity_id: ent.id, entity_code: ent.code, file_number: row.file_number, name: row.name, email: row.email, dept: row.department || "Unassigned", department: row.department || "Unassigned", position: row.position || "—", state: row.state || "CA", hire_date: row.hire_date || todayISO(), hours_per_week: row.hours_per_week, hours_worked_12mo: row.hours_worked_12mo ?? row.hours_worked_ytd ?? 0, hours_worked: row.hours_worked_12mo ?? row.hours_worked_ytd ?? 0, employment_type: row.employment_type, status: row.status || "Active" };
        added.push(emp); byFile.set(emp.file_number, emp);
      }
      const transfers = []; // v2.0: cross-entity transfer detection (integrated employer)
      const updatedEmps = employees.map((e) => {
        const u = diff.updatedEmployees.find((x) => x.file_number === e.file_number);
        if (!u) return e;
        const patch = Object.fromEntries(u.changes.map((c) => [c.field, c.to]));
        if (patch.department) patch.dept = patch.department;
        if (patch.entity_code) {
          patch.entity_id = (entities.find((x) => x.code === patch.entity_code) || entities[0]).id;
          if (patch.entity_code !== e.entity_code) transfers.push({ employee: e, from: e.entity_code, to: patch.entity_code });
        }
        if (patch.hours_worked_12mo != null) patch.hours_worked = patch.hours_worked_12mo;
        return { ...e, ...patch };
      });
      setEmployees([...updatedEmps, ...added]);
      for (const t of transfers) {
        pushAudit({ employee_id: t.employee.id, action: `Cross-entity transfer detected on ADP import: ${t.from} → ${t.to} (${t.employee.name}) — HR determination required on open leave cases`, changed_by: actor, source: "import", new_values: { from: t.from, to: t.to } });
        setCases((prev) => prev.map((c) => c.employee_id === t.employee.id && !["Closed", "Denied"].includes(c.status)
          ? { ...c, transfer_review: { from: t.from, to: t.to, detected_at: todayISO(), resolved: false }, audit: [...(c.audit || []), { date: todayISO(), action: `Cross-entity transfer detected on ADP import: ${t.from} → ${t.to}`, user: actor, source: "import" }] }
          : c));
      }
      let nextCaseId = Math.max(0, ...cases.map((c) => c.id)) + 1;
      const newCases = diff.casesToCreate.map((cc) => {
        const emp = byFile.get(cc.file_number);
        const id = nextCaseId++;
        const ref = `LV-${new Date().getFullYear()}-${String(1000 + id)}`;
        return {
          id, ref, entity_id: emp?.entity_id, entity_code: emp?.entity_code || cc.entity_code,
          employee_id: emp?.id, file_number: cc.file_number,
          type: cc.leave_designation, leave_designation: cc.leave_designation, reason: "",
          status: "Pending", priority: "Medium",
          start_date: cc.start_date, end_date: cc.end_date,
          total_hours: 0, used_hours: 0, intermittent: false,
          concurrent_clocks: [], // clocks idle until HR designates
          cert_received: false, cert_due: addDaysISO(cc.start_date, 15),
          owner: actor, notes: cc.leave_designation ? "Imported from ADP roster." : "Imported from ADP roster — HR to assign designation before clocks start.",
          documents: [], created_at: todayISO(), updated_at: todayISO(), updated_by: "System (import)",
          audit: [{ date: todayISO(), action: "Case auto-created from ADP import" + (cc.leave_designation ? "" : " — awaiting designation"), user: "System (import)", source: "import" }],
        };
      });
      setCases((prev) => [...prev, ...newCases]);
      pushAudit({ action: `ADP import committed: ${diff.newEmployees.length} new employees, ${diff.updatedEmployees.length} updated, ${newCases.length} cases created`, changed_by: actor, source: "import", new_values: { new: diff.newEmployees.length, updated: diff.updatedEmployees.length, cases: newCases.length } });
      newCases.forEach((c) => pushAudit({ case_id: c.id, case_ref: c.ref, employee_id: c.employee_id, action: "Case auto-created from ADP import", changed_by: "System (import)", source: "import" }));
      return { added: added.length, updated: diff.updatedEmployees.length, cases: newCases.length };
    }
    const res = await api.importCommit(diff); // single transaction server-side, audit rows source='import'
    await refresh();
    return res;
  }, [demo, employees, cases, entities, pushAudit, refresh]);

  /* ── v1.2 actions ─────────────────────────────────────────────────────── */

  // Employee intake (Tier 1): file-number-validated submission → Pending case,
  // blank designation, source='intake'. In production this routes through the
  // anon-callable submit_intake RPC; demo validates locally.
  const submitIntake = useCallback(async (payload) => {
    const emp = employees.find((e) => e.file_number === String(payload.file_number).trim());
    if (!emp) throw new Error("File number not found. Check your pay stub or contact HR.");
    const last = (payload.last_name || "").trim().toLowerCase();
    if (!emp.name.toLowerCase().split(/\s+/).pop().startsWith(last) || !last) throw new Error("Last name does not match our records for that file number.");
    if (!payload.start_date) throw new Error("Estimated start date is required.");
    if (demo) {
      const dup = cases.find((c) => c.file_number === emp.file_number && c.start_date === payload.start_date);
      if (dup) throw new Error(`A leave request starting ${payload.start_date} already exists (${dup.ref}).`);
      const id = Math.max(0, ...cases.map((c) => c.id)) + 1;
      const ref = `LV-${new Date().getFullYear()}-${String(1000 + id)}`;
      const today = todayISO();
      const full = {
        id, ref, entity_id: emp.entity_id, entity_code: emp.entity_code,
        employee_id: emp.id, file_number: emp.file_number,
        type: "", leave_designation: "", reason: payload.reason || "",
        status: "Pending", priority: "Medium",
        start_date: payload.start_date, end_date: payload.end_date || "",
        total_hours: 0, used_hours: 0, intermittent: !!payload.intermittent,
        concurrent_clocks: [], cert_received: false, cert_due: addDaysISO(payload.start_date, 15),
        owner: "Sarah Toledano", notes: payload.notes ? `Employee intake: ${payload.notes}` : "Submitted via employee intake — HR to review and designate.",
        documents: [], source: "intake", created_at: today, updated_at: today, updated_by: "Employee intake",
        audit: [{ date: today, action: "Case created via employee intake — awaiting HR review and designation", user: emp.name, source: "intake" }],
      };
      full.jurisdiction = emp.jurisdiction || "CA";
      // v2.0: rules-based triage runs the moment the intake arrives; AI
      // enrichment is on-demand from the case panel.
      const corrective = correctiveActions.find((a) => a.employee_id === emp.id && (() => { const gap = Math.round((new Date(payload.start_date) - new Date(a.action_date)) / 86400000); return gap >= 0 && gap <= 30; })());
      full.triage = { generated_at: new Date().toISOString(), source: "local", suggestions: localTriage({ reason: payload.reason, notes: payload.notes, intermittent: !!payload.intermittent, correctiveSignal: corrective || null }) };
      setCases((prev) => [...prev, full]);
      pushAudit({ case_id: id, case_ref: ref, employee_id: emp.id, action: "Case created via employee intake", changed_by: emp.name, source: "intake", new_values: { start_date: payload.start_date, intermittent: !!payload.intermittent, reason: payload.reason } });
      return { ref, owner: full.owner };
    }
    const res = await api.submitIntake(payload);
    await refresh();
    return res;
  }, [demo, employees, cases, correctiveActions, pushAudit, refresh]);

  // Payroll flag acknowledgment (Tier 1)
  const ackPayrollFlag = useCallback(async (caseId, actor) => {
    if (demo) {
      setCases((prev) => prev.map((c) => c.id === caseId && c.payroll_flag ? { ...c, payroll_flag: { ...c.payroll_flag, acknowledged: true, acknowledged_by: actor, acknowledged_at: todayISO() }, audit: [...(c.audit || []), { date: todayISO(), action: "Payroll coordination acknowledged", user: actor, source: "web" }] } : c));
      const c = cases.find((x) => x.id === caseId);
      pushAudit({ case_id: caseId, case_ref: c?.ref, employee_id: c?.employee_id, action: "Payroll coordination acknowledged", changed_by: actor });
      return;
    }
    const c = cases.find((x) => x.id === caseId);
    await api.updateCase(caseId, { payroll_flag: { ...(c?.payroll_flag || {}), acknowledged: true, acknowledged_by: actor, acknowledged_at: todayISO() } });
    await refresh();
  }, [demo, cases, pushAudit, refresh]);

  // ADA interactive process milestone (Tier 2)
  const recordAdaStep = useCallback(async (caseId, step, detail, actor) => {
    const today = todayISO();
    const label = { tracked: "ADA tracker opened", requested: "Accommodation requested", initiated: "Interactive process initiated", offered: "Accommodation offered", decision: "Accommodation decision recorded", resolved: "ADA process resolution documented" }[step] || step;
    if (demo) {
      setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, ada: { ...(c.ada || {}), tracked: true, [step]: step === "tracked" ? true : today, ...(detail ? { [`${step}_detail`]: detail } : {}) }, audit: [...(c.audit || []), { date: today, action: `${label}${detail ? `: ${detail}` : ""}`, user: actor, source: "web" }] } : c));
      const c = cases.find((x) => x.id === caseId);
      pushAudit({ case_id: caseId, case_ref: c?.ref, employee_id: c?.employee_id, action: label, changed_by: actor, new_values: detail ? { step, detail } : { step } });
      return;
    }
    await api.recordAdaStep(caseId, step, detail);
    await refresh();
  }, [demo, cases, pushAudit, refresh]);

  // Recertification chain (Tier 2): request adds an open chain entry; receive closes it
  const requestRecert = useCallback(async (caseId, dueDate, actor) => {
    const today = todayISO();
    if (demo) {
      setCerts((prev) => [...prev, { id: Date.now(), case_id: caseId, kind: "recert", requested_at: today, due_date: dueDate, received_at: null }]);
      const c = cases.find((x) => x.id === caseId);
      setCases((prev) => prev.map((x) => x.id === caseId ? { ...x, audit: [...(x.audit || []), { date: today, action: `Recertification requested — due ${dueDate}`, user: actor, source: "web" }] } : x));
      pushAudit({ case_id: caseId, case_ref: c?.ref, employee_id: c?.employee_id, action: `Recertification requested — due ${dueDate}`, changed_by: actor });
      return;
    }
    await api.recordCertification({ case_id: caseId, kind: "recert", requested_at: today, due_date: dueDate });
    await refresh();
  }, [demo, cases, pushAudit, refresh]);

  const receiveCert = useCallback(async (certId, actor) => {
    const today = todayISO();
    if (demo) {
      let caseId = null;
      setCerts((prev) => prev.map((c) => { if (c.id === certId) { caseId = c.case_id; return { ...c, received_at: today }; } return c; }));
      const cert = certifications.find((c) => c.id === certId);
      const c = cases.find((x) => x.id === cert?.case_id);
      if (cert?.kind !== "fitness_for_duty") setCases((prev) => prev.map((x) => x.id === cert?.case_id ? { ...x, cert_received: true, audit: [...(x.audit || []), { date: today, action: `${cert.kind === "recert" ? "Recertification" : "Medical certification"} received`, user: actor, source: "web" }] } : x));
      pushAudit({ case_id: cert?.case_id, case_ref: c?.ref, employee_id: c?.employee_id, action: `${cert?.kind === "recert" ? "Recertification" : "Certification"} received`, changed_by: actor });
      return;
    }
    await api.receiveCertification(certId);
    await refresh();
  }, [demo, certifications, cases, pushAudit, refresh]);

  // Fitness-for-duty checklist (Tier 2)
  const updateFfd = useCallback(async (caseId, patch, actor) => {
    const today = todayISO();
    const label = patch.required === false ? "FFD certification waived" : patch.required === true ? "FFD certification marked required" : patch.requested_at ? "FFD certification requested" : patch.received_at ? "FFD certification received" : patch.cleared_at ? "Cleared to return — FFD complete" : "FFD updated";
    if (demo) {
      setCases((prev) => prev.map((c) => c.id === caseId ? { ...c, ffd: { ...(c.ffd || {}), ...patch }, audit: [...(c.audit || []), { date: today, action: label, user: actor, source: "web" }] } : c));
      const c = cases.find((x) => x.id === caseId);
      pushAudit({ case_id: caseId, case_ref: c?.ref, employee_id: c?.employee_id, action: label, changed_by: actor, new_values: patch });
      return;
    }
    const c = cases.find((x) => x.id === caseId);
    await api.updateCase(caseId, { ffd: { ...(c?.ffd || {}), ...patch } });
    await refresh();
  }, [demo, cases, pushAudit, refresh]);

  /* ── v1.3 actions ─────────────────────────────────────────────────────── */

  // Document repository (Priority 1). Content goes through the storage
  // adapter (demo: localStorage base64 with budget; prod: case-documents
  // bucket). Metadata + review state live in app state / Postgres.
  const uploadDocument = useCallback(async (caseId, file, { category, uploaded_role, actor, replaces_id = null }) => {
    const c = cases.find((x) => x.id === caseId);
    const path = docPath(caseId, file.name);
    const storage = getStorage(demo, api.client);
    const stored = await storage.put(path, file);
    const today = new Date().toISOString();
    const prior = replaces_id ? documents.find((d) => d.id === replaces_id) : null;
    const meta = {
      case_id: caseId, employee_id: c?.employee_id, category,
      filename: file.name, mime: stored.mime, size: stored.size,
      storage_path: stored.stored ? path : null, storage_note: stored.note || null,
      status: "pending_review", review_notes: "", reviewed_by: null, reviewed_at: null,
      uploaded_by: actor, uploaded_role, version: prior ? (prior.version || 1) + 1 : 1,
      replaces_id, uploaded_at: today,
    };
    if (demo) {
      const id = Math.max(0, ...documents.map((d) => d.id)) + 1;
      setDocs((prev) => [...prev, { ...meta, id }]);
    } else {
      await api.insertDocument(meta);
      await refresh();
    }
    pushAudit({ case_id: caseId, case_ref: c?.ref, employee_id: c?.employee_id, action: `Document uploaded: ${file.name} (${category})${prior ? ` — replaces v${prior.version || 1}` : ""}`, changed_by: actor, source: uploaded_role === "employee" ? "intake" : "web", new_values: { filename: file.name, category, version: meta.version } });
    return meta;
  }, [demo, cases, documents, pushAudit, refresh]);

  const reviewDocument = useCallback(async (docId, { status, review_notes }, actor) => {
    const d = documents.find((x) => x.id === docId);
    const c = d ? cases.find((x) => x.id === d.case_id) : null;
    const patch = { status, review_notes: review_notes ?? d?.review_notes ?? "", reviewed_by: actor, reviewed_at: new Date().toISOString() };
    if (demo) setDocs((prev) => prev.map((x) => x.id === docId ? { ...x, ...patch } : x));
    else { await api.updateDocument(docId, patch); await refresh(); }
    pushAudit({ case_id: d?.case_id, case_ref: c?.ref, employee_id: d?.employee_id, action: `Document review: ${d?.filename} → ${status.replace(/_/g, " ")}${review_notes ? ` — ${review_notes}` : ""}`, changed_by: actor, new_values: patch });
  }, [demo, documents, cases, pushAudit, refresh]);

  // Template library (Priority 2) — admin-managed, versioned, archivable.
  const saveTemplate = useCallback(async (tpl, actor) => {
    const now = new Date().toISOString();
    if (tpl.id) {
      const existing = templates.find((t) => t.id === tpl.id);
      const { version, entry } = nextTemplateVersion(existing, tpl.body, actor);
      const next = { ...existing, ...tpl, version, updated_by: actor, updated_at: now, history: [...(existing.history || []), entry] };
      if (demo) setTemplates((prev) => prev.map((t) => t.id === tpl.id ? next : t));
      else { await api.saveTemplate(next); await refresh(); }
      pushAudit({ action: `Template updated: ${next.name} → v${version}`, changed_by: actor, new_values: { template_id: tpl.id, version } });
      return next;
    }
    const id = Math.max(0, ...templates.map((t) => t.id)) + 1;
    const next = { ...tpl, id, version: 1, status: "active", updated_by: actor, updated_at: now, created_at: now, history: [{ version: 1, body: tpl.body, updated_by: actor, updated_at: now }] };
    if (demo) setTemplates((prev) => [...prev, next]);
    else { await api.saveTemplate(next); await refresh(); }
    pushAudit({ action: `Template created: ${next.name} (${next.category})`, changed_by: actor });
    return next;
  }, [demo, templates, pushAudit, refresh]);

  const archiveTemplate = useCallback(async (id, archived, actor) => {
    const t = templates.find((x) => x.id === id);
    const patch = { status: archived ? "archived" : "active", updated_by: actor, updated_at: new Date().toISOString() };
    if (demo) setTemplates((prev) => prev.map((x) => x.id === id ? { ...x, ...patch } : x));
    else { await api.saveTemplate({ ...t, ...patch }); await refresh(); }
    pushAudit({ action: `Template ${archived ? "archived" : "restored"}: ${t?.name}`, changed_by: actor });
  }, [demo, templates, pushAudit, refresh]);

  // Packet definitions (Priority 3) — pure configuration.
  const savePacket = useCallback(async (pkt, actor) => {
    const now = new Date().toISOString();
    if (pkt.id) {
      if (demo) setPackets((prev) => prev.map((p) => p.id === pkt.id ? { ...p, ...pkt, updated_at: now } : p));
      else { await api.savePacket({ ...pkt, updated_at: now }); await refresh(); }
      pushAudit({ action: `Packet definition updated: ${pkt.name}`, changed_by: actor });
      return pkt;
    }
    const id = Math.max(0, ...packets.map((p) => p.id)) + 1;
    const next = { ...pkt, id, active: true, updated_at: now };
    if (demo) setPackets((prev) => [...prev, next]);
    else { await api.savePacket(next); await refresh(); }
    pushAudit({ action: `Packet definition created: ${next.name}`, changed_by: actor });
    return next;
  }, [demo, packets, pushAudit, refresh]);

  // Secure messaging (Priority 4). Bodies are case-scoped; the audit trail
  // records the event metadata, not the message content.
  const sendMessage = useCallback(async (caseId, body, { sender_role, sender_name }) => {
    const c = cases.find((x) => x.id === caseId);
    const msg = { case_id: caseId, sender_role, sender_name, body: String(body).slice(0, 4000), created_at: new Date().toISOString(), read_at: null };
    if (demo) { const id = Math.max(0, ...messages.map((m) => m.id)) + 1; setMessages((prev) => [...prev, { ...msg, id }]); }
    else { await api.sendMessage(msg); await refresh(); }
    pushAudit({ case_id: caseId, case_ref: c?.ref, employee_id: c?.employee_id, action: `Secure message sent by ${sender_name} (${sender_role})`, changed_by: sender_name, source: sender_role === "employee" ? "intake" : "web" });
  }, [demo, cases, messages, pushAudit, refresh]);

  const markMessagesRead = useCallback(async (caseId, readerRole) => {
    const now = new Date().toISOString();
    if (demo) setMessages((prev) => prev.map((m) => m.case_id === caseId && m.sender_role !== readerRole && !m.read_at ? { ...m, read_at: now } : m));
    else await api.markMessagesRead(caseId, readerRole);
  }, [demo]);

  // Designation transitions (Priority 5) — pure builder + audited apply.
  const transitionDesignation = useCallback(async (caseId, { to, effective_date, reason, transitionReason }, actor) => {
    const c = cases.find((x) => x.id === caseId);
    if (!c) throw new Error("Case not found");
    const emp = employees.find((e) => e.id === c.employee_id) || {};
    const { patch, historyEntry } = buildTransition(c, { to, effective_date, reason, actor, transitionReason }, emp);
    if (emp?.scheduleHistory?.length && patch.concurrent_clocks?.length) {
      patch.total_hours = Math.max(...patch.concurrent_clocks.map((cl) => entitlementHoursScheduled(cl, emp, effective_date, { militaryCaregiver: !!c.military_caregiver })));
    }
    if (!c.designated_at && patch.designations?.length) patch.designated_at = todayISO();
    patch.payroll_flag = primaryPayrollFlag({ ...c, ...patch }, emp);
    const action = `Designation transition: ${(historyEntry.from.join(" + ") || "Unassigned")} → ${historyEntry.to.join(" + ")} effective ${effective_date}${transitionReason ? ` — ${transitionReason}` : ""}`;
    if (demo) {
      setCases((prev) => prev.map((x) => x.id === caseId ? { ...x, ...patch, updated_at: todayISO(), updated_by: actor, audit: [...(x.audit || []), { date: todayISO(), action, user: actor, source: "web" }] } : x));
    } else {
      await api.updateCase(caseId, patch);
      await refresh();
    }
    pushAudit({ case_id: caseId, case_ref: c.ref, employee_id: c.employee_id, action, changed_by: actor, old_values: { designations: historyEntry.from }, new_values: { designations: historyEntry.to, effective_date, at_transition: historyEntry.at_transition } });
    return patch;
  }, [demo, cases, employees, pushAudit, refresh]);

  /* ── v2.0 actions ─────────────────────────────────────────────────────── */

  // Variable schedules (Feature 3): add a period, recompute open clock banks
  // retroactively from the schedule history. Every recompute audits.
  const addSchedulePeriod = useCallback(async (employeeId, entryIn, actor) => {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) throw new Error("Employee not found");
    if (!entryIn?.effectiveDate || !entryIn?.type) throw new Error("Effective date and schedule type are required.");
    const entry = { ...entryIn, hoursPerWeek: Number(entryIn.hoursPerWeek) || (entryIn.type === "per_diem" ? 0 : entryIn.type === "3x12" ? 36 : 40) };
    const history = [...(emp.scheduleHistory || []), entry].sort((a, b) => new Date(a.effectiveDate) - new Date(b.effectiveDate));
    const nextEmp = { ...emp, scheduleHistory: history };
    if (demo) setEmployees((prev) => prev.map((e) => e.id === employeeId ? nextEmp : e));
    else await api.updateEmployee(employeeId, { scheduleHistory: history });
    pushAudit({ employee_id: employeeId, action: `Schedule period added: ${entry.type}${entry.hoursPerWeek ? ` ${entry.hoursPerWeek}h/wk` : ""} effective ${entry.effectiveDate}`, changed_by: actor, new_values: entry });
    // retroactive recompute of every open clocked case for this employee
    const open = cases.filter((c) => c.employee_id === employeeId && !["Closed", "Denied"].includes(c.status) && (c.concurrent_clocks || []).length);
    for (const c of open) {
      const newTotal = Math.max(...c.concurrent_clocks.map((cl) => entitlementHoursScheduled(cl, nextEmp, c.start_date, { militaryCaregiver: !!c.military_caregiver })));
      if (newTotal !== c.total_hours) {
        const action = `Entitlement recomputed after schedule change: ${c.total_hours} → ${newTotal} hours (schedule integrated from ${c.start_date})`;
        if (demo) setCases((prev) => prev.map((x) => x.id === c.id ? { ...x, total_hours: newTotal, updated_at: todayISO(), updated_by: actor, audit: [...(x.audit || []), { date: todayISO(), action, user: actor, source: "system" }] } : x));
        else await api.updateCase(c.id, { total_hours: newTotal });
        pushAudit({ case_id: c.id, case_ref: c.ref, employee_id: employeeId, action, changed_by: actor, source: "system", old_values: { total_hours: c.total_hours }, new_values: { total_hours: newTotal } });
      }
    }
    if (!demo) await refresh();
  }, [demo, employees, cases, pushAudit, refresh]);

  // Entity configuration (Feature 4a)
  const saveEntity = useCallback(async (entity, actor) => {
    if (demo) setEntities((prev) => prev.map((e) => e.id === entity.id ? { ...e, ...entity } : e));
    else { await api.saveEntity(entity); await refresh(); }
    pushAudit({ action: `Entity configuration updated: ${entity.legal_name || entity.code}`, changed_by: actor, new_values: { id: entity.id, hr_contact_name: entity.hr_contact_name } });
  }, [demo, pushAudit, refresh]);

  // Cross-entity transfer determination (Feature 4b)
  const confirmTransfer = useCallback(async (caseId, actor) => {
    const c = cases.find((x) => x.id === caseId);
    if (!c?.transfer_review) return;
    const patch = { transfer_review: { ...c.transfer_review, resolved: true, determination: "Prior leave counts toward the new entity's rolling window — integrated employer (same PE family) for FMLA purposes.", resolved_by: actor, resolved_at: todayISO() } };
    const action = `Cross-entity transfer determination (${c.transfer_review.from} → ${c.transfer_review.to}): prior leave COUNTS toward the new entity's rolling window (integrated employer doctrine)`;
    if (demo) setCases((prev) => prev.map((x) => x.id === caseId ? { ...x, ...patch, audit: [...(x.audit || []), { date: todayISO(), action, user: actor, source: "web" }] } : x));
    else await api.updateCase(caseId, patch);
    pushAudit({ case_id: caseId, case_ref: c.ref, employee_id: c.employee_id, action, changed_by: actor, new_values: patch.transfer_review });
    if (!demo) await refresh();
  }, [demo, cases, pushAudit, refresh]);

  // Federal/CA notice generation → repository → e-sign workflow (Feature 2)
  const generateFormDocument = useCallback(async (caseId, formId, actor) => {
    const c = cases.find((x) => x.id === caseId);
    if (!c) throw new Error("Case not found");
    const emp = employees.find((e) => e.id === c.employee_id);
    const ent = entities.find((e) => e.id === c.entity_id || e.code === c.entity_code);
    const { doc, filename, title } = buildFormPDF({ formId, caseData: c, employee: emp, entity: ent });
    const blob = doc.output("blob");
    const path = docPath(caseId, filename);
    const storage = getStorage(demo, api.client);
    const stored = await storage.put(path, new File([blob], filename, { type: "application/pdf" }));
    const meta = {
      case_id: caseId, employee_id: c.employee_id, category: "notice",
      filename, mime: "application/pdf", size: stored.size,
      storage_path: stored.stored ? path : null, storage_note: stored.note || null,
      status: "complete", review_notes: "", reviewed_by: null, reviewed_at: null,
      uploaded_by: actor, uploaded_role: "hr", version: 1, replaces_id: null,
      uploaded_at: new Date().toISOString(),
      esign_status: "generated", form_type: formId, signed_by: null, signed_at: null,
    };
    let id;
    if (demo) { id = Math.max(0, ...documents.map((d) => d.id)) + 1; setDocs((prev) => [...prev, { ...meta, id }]); }
    else { const saved = await api.insertDocument(meta); id = saved?.[0]?.id; await refresh(); }
    doc.save(filename);
    pushAudit({ case_id: caseId, case_ref: c.ref, employee_id: c.employee_id, action: `Notice generated: ${title} (${formId}) — ${filename} · e-sign status: generated`, changed_by: actor, new_values: { form_type: formId } });
    return { ...meta, id };
  }, [demo, cases, employees, entities, documents, pushAudit, refresh]);

  // E-sign ladder: generated → pending_hr_signature → signed → delivered.
  // The signed step routes through the provider seam; payload is audited.
  const esignAdvance = useCallback(async (docId, actor, signerUserId) => {
    const d = documents.find((x) => x.id === docId);
    if (!d) throw new Error("Document not found");
    const c = cases.find((x) => x.id === d.case_id);
    const next = nextEsignStatus(d.esign_status || "generated");
    if (next === d.esign_status) return d;
    let patch = { esign_status: next };
    let auditExtra = {};
    if (next === "signed") {
      const payload = await getESign(demo ? "demo" : "demo").sign(docId, signerUserId ?? actor);
      patch = { ...patch, signed_by: actor, signed_at: payload.signed_at };
      auditExtra = payload;
    }
    if (next === "delivered") auditExtra = await getESign("demo").deliver(docId);
    const label = { pending_hr_signature: "routed for HR signature", signed: `signed by ${actor}`, delivered: "delivered to employee" }[next];
    if (demo) setDocs((prev) => prev.map((x) => x.id === docId ? { ...x, ...patch } : x));
    else { await api.updateDocument(docId, patch); await refresh(); }
    pushAudit({ case_id: d.case_id, case_ref: c?.ref, employee_id: d.employee_id, action: `Notice ${label}: ${d.filename}`, changed_by: actor, new_values: { esign_status: next, ...auditExtra } });
    return { ...d, ...patch };
  }, [demo, documents, cases, pushAudit, refresh]);

  // Intake triage (Feature 1c): confirm/dismiss are one click, both audited.
  const resolveTriage = useCallback(async (caseId, suggestionId, resolution, actor) => {
    const c = cases.find((x) => x.id === caseId);
    if (!c?.triage) return;
    const sugg = c.triage.suggestions.find((s) => s.id === suggestionId);
    const triage = { ...c.triage, suggestions: c.triage.suggestions.map((s) => s.id === suggestionId ? { ...s, status: resolution, resolved_by: actor, resolved_at: todayISO() } : s) };
    const action = `Intake triage suggestion ${resolution}: "${(sugg?.text || "").slice(0, 90)}"`;
    if (demo) setCases((prev) => prev.map((x) => x.id === caseId ? { ...x, triage, audit: [...(x.audit || []), { date: todayISO(), action, user: actor, source: "web" }] } : x));
    else await api.updateCase(caseId, { triage });
    pushAudit({ case_id: caseId, case_ref: c.ref, employee_id: c.employee_id, action, changed_by: actor });
  }, [demo, cases, pushAudit]);

  const runAiTriage = useCallback(async (caseId, actor) => {
    const c = cases.find((x) => x.id === caseId);
    if (!c) return;
    const emp = employees.find((e) => e.id === c.employee_id);
    const ent = entities.find((e) => e.id === c.entity_id || e.code === c.entity_code);
    const result = await triageIntake({
      reasonText: c.notes || c.reason || "",
      caseCtx: caseContextBlock({ caseData: c, employee: emp, entity: ent }),
      localSuggestions: c.triage?.suggestions?.filter((s) => s.status === "open") || [],
    });
    const triage = { generated_at: new Date().toISOString(), source: result.source, suggestions: result.suggestions };
    if (demo) setCases((prev) => prev.map((x) => x.id === caseId ? { ...x, triage } : x));
    else await api.updateCase(caseId, { triage });
    pushAudit({ case_id: caseId, case_ref: c.ref, employee_id: c.employee_id, action: `Intake triage analysis run (${result.source === "ai" ? "AI-assisted" : "rules-based"}) — ${result.suggestions.length} suggestion(s)`, changed_by: actor });
    return triage;
  }, [demo, cases, employees, entities, pushAudit]);

  const resetDemo = useCallback(() => {
    if (!demo) return;
    setEmployees(SEED.employees); setCases(SEED.cases); setLog(SEED.intermittentLog); setAudit(SEED.auditEvents); setCerts(SEED.certifications); setCA(SEED.correctiveActions); setDocs(SEED.documents); setTemplates(SEED.templates); setPackets(SEED.packets); setMessages(SEED.messages);
  }, [demo]);

  const value = useMemo(() => ({
    demo, loading, error, entities, hrUsers, employees, cases, intermittentLog, auditEvents, certifications, correctiveActions,
    documents, templates, packets, messages,
    actions: { createCase, updateCase, logIntermittent, markCertReceived, attachDocument, importCommit, pushAudit, refresh, resetDemo, submitIntake, ackPayrollFlag, recordAdaStep, requestRecert, receiveCert, updateFfd, uploadDocument, reviewDocument, saveTemplate, archiveTemplate, savePacket, sendMessage, markMessagesRead, transitionDesignation, addSchedulePeriod, saveEntity, confirmTransfer, generateFormDocument, esignAdvance, resolveTriage, runAiTriage },
  }), [demo, loading, error, entities, hrUsers, employees, cases, intermittentLog, auditEvents, certifications, correctiveActions, documents, templates, packets, messages, createCase, updateCase, logIntermittent, markCertReceived, attachDocument, importCommit, pushAudit, refresh, resetDemo, submitIntake, ackPayrollFlag, recordAdaStep, requestRecert, receiveCert, updateFfd, uploadDocument, reviewDocument, saveTemplate, archiveTemplate, savePacket, sendMessage, markMessagesRead, transitionDesignation, addSchedulePeriod, saveEntity, confirmTransfer, generateFormDocument, esignAdvance, resolveTriage, runAiTriage]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

function addDaysISO(d, n) { const x = new Date(`${String(d).slice(0, 10)}T00:00:00`); if (isNaN(x)) return ""; x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }
function stripDemoFields(row) { const { audit, documents, entity_code, dept, ...rest } = row; return rest; }
