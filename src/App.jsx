/* LeaveIQ — AMPAM Parks Mechanical · Multimech · Seal Electric
 * Production shell. All reads/writes flow through DataContext (Supabase when
 * configured, deterministic demo seed otherwise). Statutory math comes from
 * src/lib/compliance/engine.js — never inlined in components. */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Users, FileText, BarChart2, MapPin, Download, Shield, Globe,
  Search, Bell, ChevronDown, Settings, LogOut, AlertTriangle, FileClock,
  CornerDownLeft, Plus, Activity, Eye, Lock, X, CheckCircle, ArrowRight,
  CheckCheck, FolderOpen, CalendarDays, ListChecks, Clock, RefreshCw,
  UploadCloud, ScrollText, ShieldCheck, Building2, Paperclip, CalendarCheck,
  ShieldAlert, Banknote, Link2, Accessibility, ClipboardCheck, TrendingDown,
  Library, BookOpen, MessageSquareText, GitBranch, Gavel, Layers,
  Sparkles, Gauge, ArrowLeftRight, PenLine, Sunrise,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import {
  S, ELEV, RADIUS, PIE_COLORS, NOW, pct, weeksBetween, daysUntil, formatDate,
  relativeTime, exportCSV, loadState, saveState, Toast, Badge, RiskDot, Card,
  EmptyState, Input, Select, Btn, TAB_STYLE, CTooltip, Avatar, AvatarLabel,
  PageHeader, KpiCard, RISK_RANK, DataTable,
} from "./ui.jsx";
import { T } from "./i18n.js";
import { ROLES, permsFor, getViewer, applyScope, scopeSummary, allowedPage } from "./rbac.js";
import { computeRisk, computeEligibility, clocksFor, entitlementHours, scheduledHoursPerWeek, remainingHours, LEAVE_REASONS } from "./lib/compliance/engine.js";
import { LETTER_TYPES, generateLetter, generatePDF } from "./pdf/letters.js";
import { primaryPayrollFlag, ffdStatus, adaStatus, adaExposure, nextRecertDue, exhaustionAlerts, ADA_MILESTONES } from "./lib/compliance/signals.js";
import { DataProvider, useData } from "./data/DataContext.jsx";
import ImportADP from "./pages/ImportADP.jsx";
import Reports from "./pages/Reports.jsx";
import AuditLog from "./pages/AuditLog.jsx";
import RiskSignals from "./pages/RiskSignals.jsx";
import ManagerDashboard from "./pages/ManagerDashboard.jsx";
import IntakePortal, { encodeIntakeToken } from "./pages/IntakePortal.jsx";
import KnowledgeCenter from "./pages/KnowledgeCenter.jsx";
import DocumentLibrary from "./pages/DocumentLibrary.jsx";
import EmployeePortal from "./pages/EmployeePortal.jsx";
import Workload from "./pages/Workload.jsx";
import Entities from "./pages/Entities.jsx";
import { FORM_TYPES, buildFormPDF, buildCustomNoticePDF } from "./pdf/forms.js";
import { ESIGN_STATUSES } from "./lib/esign/index.js";
import { draftCommunication, morningBriefing, caseContextBlock } from "./lib/ai/index.js";
import { briefingDigest } from "./lib/compliance/workload.js";
import { scheduleLabel, isPerDiem, SCHEDULE_TYPES, perDiemAvgWeeklyHours } from "./lib/compliance/schedule.js";
import { AMPAM_LOGO, AMPAM_TAGLINE } from "./assets/ampamLogo.js";
import { DESIGNATION_TOKENS, clocksForSet, entitlementForSet, joinDesignations, TRANSITION_PRESETS } from "./lib/compliance/designations.js";
import { DOC_CATEGORIES, DOC_STATUSES, mergeContext } from "./lib/docs/templates.js";
import { buildPacketPDF } from "./lib/docs/packets.js";
import { buildDefenseBinder, buildDefenseZip } from "./lib/export/defensePacket.js";
import { getStorage } from "./lib/storage/index.js";

const ORG = { product: "LeaveIQ", name: "AMPAM Parks Mechanical" };
const OPEN_ST = ["Active", "Pending", "Approved"];
const pctChange = (c, p) => (p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 100));
const HR_POOL = ["Sarah Toledano", "Megan Krell", "Daniel Reyes"];

/* ─────────────────── DASHBOARD ─────────────────── */
function MorningBriefing({ cases, onFocusCase }) {
  const { certifications } = useData();
  const [state, setState] = useState({ status: "idle", items: [], source: null });
  const run = async () => {
    setState({ status: "loading", items: [], source: null });
    const digest = briefingDigest({ cases, certifications });
    const res = await morningBriefing(digest);
    setState({ status: "done", items: res.items, source: res.source });
  };
  return <div style={{ background: "linear-gradient(135deg,rgba(0,75,135,.09),rgba(0,75,135,.05))", border: "1px solid rgba(0,75,135,.3)", borderRadius: RADIUS.lg, padding: 16, marginBottom: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: state.items.length ? 12 : 0 }}>
      <Sunrise size={16} color={S.indigoL} />
      <span style={{ color: S.text, fontWeight: 800, fontSize: 13.5 }}>Today's Actions</span>
      {state.source && <span style={{ color: S.text3, fontSize: 10.5, background: "rgba(0,75,135,.06)", borderRadius: 99, padding: "2px 9px" }}>{state.source === "ai" ? "AI-prioritized" : "rules-based (AI offline)"}</span>}
      <Btn variant="secondary" small style={{ marginLeft: "auto" }} onClick={run} disabled={state.status === "loading"}><Sparkles size={12} /> {state.status === "loading" ? "Building…" : state.status === "done" ? "Refresh" : "Generate briefing"}</Btn>
    </div>
    {state.status === "done" && state.items.length === 0 && <p style={{ color: S.text2, fontSize: 12.5, margin: "10px 0 0" }}>Clean slate — nothing urgent in the queue today.</p>}
    {state.items.map((it, i) => <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "6px 0", borderTop: i ? "1px solid rgba(0,75,135,.06)" : "none" }}>
      <button onClick={() => it.ref && onFocusCase?.(it.ref)} style={{ background: "rgba(0,75,135,.12)", border: "1px solid rgba(0,75,135,.3)", color: S.indigoL, borderRadius: 7, padding: "2px 9px", fontSize: 11, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>{it.ref || "—"}</button>
      <span style={{ color: S.text2, fontSize: 12.5, lineHeight: 1.5 }}>{it.action}</span>
    </div>)}
    {state.status === "idle" && <p style={{ color: S.text3, fontSize: 12, margin: "8px 0 0" }}>One click builds a prioritized action list from certs due, payroll flags, ADA milestones, RTW clearances, and new intakes — drafted by AI when available, deterministic rules otherwise. Click a ref to jump to the case.</p>}
  </div>;
}

function Dashboard({ cases, employees, lang, onNavigate, entityFilter, viewer, onFocusCase }) {
  const t = T[lang];
  const { intermittentLog } = useData();
  const empById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const exhaustion = useMemo(() => exhaustionAlerts({ cases, intermittentLog, withinDays: 60 }), [cases, intermittentLog]);
  const months = useMemo(() => { const a = []; const now = NOW(); for (let k = 7; k >= 0; k--) { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); a.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString("en-US", { month: "short" }) }); } return a; }, []);
  const trend = useMemo(() => months.map(({ y, m, label }) => {
    const mS = new Date(y, m, 1), mE = new Date(y, m + 1, 0);
    const inS = (c) => { const s = new Date(c.start_date); return s.getFullYear() === y && s.getMonth() === m; };
    return { label, total: cases.filter(inS).length, open: cases.filter((c) => { const s = new Date(c.start_date), e = new Date(c.end_date); return s <= mE && e >= mS && OPEN_ST.includes(c.status); }).length, pend: cases.filter((c) => { const cd = new Date(c.cert_due); return cd.getFullYear() === y && cd.getMonth() === m && !c.cert_received; }).length, high: cases.filter((c) => inS(c) && computeRisk(c) === "High").length };
  }), [cases, months]);
  const byStatus = useMemo(() => { const a = {}; cases.forEach((c) => (a[c.status] = (a[c.status] || 0) + 1)); return Object.entries(a).map(([name, value]) => ({ name, value })); }, [cases]);
  const byEntity = useMemo(() => { const a = {}; cases.forEach((c) => (a[c.entity_code || "—"] = (a[c.entity_code || "—"] || 0) + 1)); return Object.entries(a).map(([name, count]) => ({ name, count })); }, [cases]);
  const byType = useMemo(() => { const a = {}; cases.forEach((c) => (a[c.type || "Unassigned"] = (a[c.type || "Unassigned"] || 0) + 1)); return Object.entries(a).map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count); }, [cases]);
  const attention = useMemo(() => {
    const items = []; const open = cases.filter((c) => c.status !== "Closed" && c.status !== "Denied");
    exhaustion.forEach((x) => { const c = cases.find((k) => k.id === x.case_id); if (c) items.push({ c, sev: 3, msg: `FMLA projected to exhaust ${x.projectedDate} (${x.remaining}h left) — ADA review recommended` }); });
    open.forEach((c) => { if (c.payroll_flag && !c.payroll_flag.acknowledged && daysUntil(c.payroll_flag.coordinate_by) <= 3) items.push({ c, sev: 2, msg: `Payroll coordination ${daysUntil(c.payroll_flag.coordinate_by) < 0 ? "past due" : "due " + c.payroll_flag.coordinate_by}` }); });
    open.forEach((c) => { if (!c.type) items.push({ c, sev: 2, msg: "Awaiting designation — clocks idle" }); });
    open.forEach((c) => { if (!c.cert_received) { const d = daysUntil(c.cert_due); if (d < 0) items.push({ c, sev: 3, msg: `Certification overdue ${-d}d` }); else if (d <= 10) items.push({ c, sev: d <= 3 ? 3 : 2, msg: `Certification due in ${d}d` }); } });
    cases.forEach((c) => { if (c.status === "Active" && computeRisk(c) === "High" && !items.find((x) => x.c.id === c.id)) items.push({ c, sev: 2, msg: "High risk — review caseload" }); });
    return items.sort((a, b) => b.sev - a.sev).slice(0, 6);
  }, [cases, exhaustion]);
  const activity = useMemo(() => { const all = []; cases.forEach((c) => (c.audit || []).forEach((a) => all.push({ ...a, ref: c.ref || `#${c.id}`, emp: empById[c.employee_id]?.name || "—" }))); return all.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8); }, [cases, empById]);
  const sc = (s) => ({ High: S.red, Moderate: S.amber, Low: S.green }[s] || S.teal);
  const cd = { background: S.card, border: `1px solid ${S.border2}`, borderRadius: RADIUS.lg, padding: 20 };
  const cap = { color: S.text2, fontSize: 12, fontWeight: 700, margin: "0 0 16px", letterSpacing: ".05em", textTransform: "uppercase" };
  const newNow = trend[7].total, newPrev = trend[6].total;
  const openNow = cases.filter((c) => OPEN_ST.includes(c.status)).length;
  const pendNow = cases.filter((c) => !c.cert_received).length;
  const highNow = cases.filter((c) => computeRisk(c) === "High").length;
  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
    <PageHeader title={t.dashboard} subtitle={`${cases.length} cases · ${employees.length} employees · ${entityFilter === "All" ? "all entities" : entityFilter}`} breadcrumb={["Overview", t.dashboard]} actions={<Btn variant="secondary" small onClick={() => exportCSV("leaveiq_cases.csv", [{ label: "Reference", value: "ref" }, { label: "Employee", value: (c) => empById[c.employee_id]?.name || "" }, { label: "Entity", value: "entity_code" }, { label: "Type", value: (c) => c.type || "Unassigned" }, { label: "Status", value: "status" }, { label: "Risk", value: (c) => computeRisk(c) }], cases)}><Download size={13} /> Export</Btn>} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
      <KpiCard icon={FolderOpen} label="New cases (mo)" value={newNow} delta={pctChange(newNow, newPrev)} series={trend.map((x) => x.total)} color={S.indigo} hint="vs. prior month" onClick={() => onNavigate?.("cases")} />
      <KpiCard icon={Activity} label="Open caseload" value={openNow} delta={pctChange(trend[7].open, trend[6].open)} series={trend.map((x) => x.open)} color={S.teal} hint="active · pending · approved" onClick={() => onNavigate?.("cases")} />
      <KpiCard icon={FileClock} label={t.pendingCert} value={pendNow} delta={pctChange(trend[7].pend, trend[6].pend)} series={trend.map((x) => x.pend)} color={S.amber} invertDelta hint="awaiting certification" onClick={() => onNavigate?.("cases")} />
      <KpiCard icon={AlertTriangle} label={t.highRisk} value={highNow} delta={pctChange(trend[7].high, trend[6].high)} series={trend.map((x) => x.high)} color={S.red} invertDelta hint="elevated risk score" onClick={() => onNavigate?.("cases")} />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, marginBottom: 16 }}>
      <div style={cd}><p style={cap}>Caseload trend</p><ResponsiveContainer width="100%" height={230}><LineChart data={trend} margin={{ left: -18 }}><CartesianGrid strokeDasharray="3 3" stroke="rgba(0,75,135,.05)" /><XAxis dataKey="label" tick={{ fill: S.text3, fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: S.text3, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip content={<CTooltip />} /><Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: S.text2, fontSize: 11 }}>{v}</span>} /><Line type="monotone" dataKey="total" name="New" stroke={S.indigo} strokeWidth={2.5} dot={{ r: 2.5 }} /><Line type="monotone" dataKey="open" name="Open" stroke={S.teal} strokeWidth={2.5} dot={{ r: 2.5 }} /></LineChart></ResponsiveContainer></div>
      <div style={cd}><p style={cap}>Status mix</p><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2}>{byStatus.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="transparent" />)}</Pie><Tooltip content={<CTooltip />} /><Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: S.text2, fontSize: 11 }}>{v}</span>} /></PieChart></ResponsiveContainer></div>
    </div>
    {viewer?.roleLabel === "HR Administrator" && <MorningBriefing cases={cases} onFocusCase={onFocusCase} />}
    {exhaustion.length > 0 && <div style={{ background: "rgba(239,51,64,.06)", border: "1px solid rgba(239,51,64,.3)", borderRadius: RADIUS.lg, padding: "13px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }} onClick={() => onNavigate?.("reports")}>
      <TrendingDown size={17} color={S.red} />
      <span style={{ color: S.text, fontSize: 13, fontWeight: 600 }}>{new Set(exhaustion.map((x) => x.employee_id)).size} employee{new Set(exhaustion.map((x) => x.employee_id)).size > 1 ? "s" : ""} projected to exhaust FMLA entitlement within 60 days</span>
      <span style={{ color: S.text3, fontSize: 12 }}>— begin the ADA interactive-process conversation before the clock runs out. View projection report →</span>
    </div>}
    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, marginBottom: 16 }}>
      <div style={cd}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}><p style={{ ...cap, margin: 0 }}>Needs attention</p><button onClick={() => onNavigate?.("cases")} style={{ background: "transparent", border: "none", color: S.indigoL, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}>All cases <ArrowRight size={12} /></button></div>
        {attention.length === 0 ? <p style={{ color: S.text3, fontSize: 13 }}>Nothing urgent. 🎉</p> : attention.map(({ c, sev, msg }) => { const emp = empById[c.employee_id]; return <div key={`${c.id}-${msg}`} onClick={() => onNavigate?.("cases")} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderRadius: 10, cursor: "pointer", borderBottom: "1px solid rgba(0,75,135,.035)" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,75,135,.025)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}><span style={{ width: 8, height: 8, borderRadius: "50%", background: sc(sev === 3 ? "High" : "Moderate"), boxShadow: `0 0 8px ${sc(sev === 3 ? "High" : "Moderate")}`, flexShrink: 0 }} /><Avatar name={emp?.name} size={28} /><div style={{ minWidth: 0, flex: 1 }}><div style={{ color: S.text, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{emp?.name || "—"} <span style={{ color: S.text3, fontWeight: 400 }}>· {c.ref}</span></div><div style={{ color: sev >= 3 ? S.red : S.amber, fontSize: 12 }}>{msg}</div></div><Badge label={c.type || "Unassigned"} /></div>; })}
      </div>
      <div style={cd}><p style={cap}>Recent activity</p>{activity.map((a, i) => <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: i < activity.length - 1 ? "1px solid rgba(0,75,135,.035)" : "none" }}><Avatar name={a.user} size={26} /><div style={{ minWidth: 0, flex: 1 }}><div style={{ color: S.text2, fontSize: 12.5, lineHeight: 1.35 }}><strong style={{ color: S.text }}>{a.user}</strong> · {a.action}</div><div style={{ color: S.text3, fontSize: 11 }}>{a.ref} · {a.emp} · {relativeTime(a.date)}</div></div></div>)}</div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div style={cd}><p style={cap}>Cases by entity</p><ResponsiveContainer width="100%" height={220}><BarChart data={byEntity} layout="vertical" margin={{ left: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="rgba(0,75,135,.05)" /><XAxis type="number" tick={{ fill: S.text3, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} /><YAxis type="category" dataKey="name" width={110} tick={{ fill: S.text3, fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip content={<CTooltip />} /><Bar dataKey="count" fill={S.indigo} radius={[0, 5, 5, 0]} barSize={16} /></BarChart></ResponsiveContainer></div>
      <div style={cd}><p style={cap}>By leave type</p><ResponsiveContainer width="100%" height={220}><BarChart data={byType} margin={{ left: -18 }}><CartesianGrid strokeDasharray="3 3" stroke="rgba(0,75,135,.05)" /><XAxis dataKey="name" tick={{ fill: S.text3, fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: S.text3, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip content={<CTooltip />} /><Bar dataKey="count" fill={S.teal} radius={[5, 5, 0, 0]} barSize={24} /></BarChart></ResponsiveContainer></div>
    </div>
  </motion.div>;
}

/* ─────────────────── EMPLOYEES ─────────────────── */
function SchedulePeriodForm({ employee, viewer }) {
  const { actions } = useData();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ effectiveDate: "", type: "4x10", hoursPerWeek: 40, daysPerWeek: 4 });
  const [err, setErr] = useState("");
  if (!open) return <Btn variant="secondary" small style={{ marginTop: 8 }} onClick={() => setOpen(true)}>Add schedule period…</Btn>;
  const t = SCHEDULE_TYPES.find((x) => x.id === form.type);
  return <div style={{ marginTop: 10, background: "rgba(0,75,135,.025)", borderRadius: 9, padding: 10 }}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 7, marginBottom: 7 }}>
      <Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
      <Select value={form.type} onChange={(e) => { const ty = SCHEDULE_TYPES.find((x) => x.id === e.target.value); setForm({ ...form, type: e.target.value, hoursPerWeek: ty?.hoursPerWeek ?? form.hoursPerWeek, daysPerWeek: ty?.daysPerWeek ?? 5 }); }}>{SCHEDULE_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
    </div>
    {form.type === "variable" && <Input type="number" value={form.hoursPerWeek} onChange={(e) => setForm({ ...form, hoursPerWeek: Number(e.target.value) })} placeholder="Hours per week" style={{ width: "100%", boxSizing: "border-box", marginBottom: 7 }} />}
    {err && <div style={{ color: S.red, fontSize: 11.5, marginBottom: 6 }}>{err}</div>}
    <div style={{ display: "flex", gap: 6 }}>
      <Btn variant="primary" small onClick={async () => { setErr(""); try { await actions.addSchedulePeriod(employee.id, form, viewer.name); setOpen(false); } catch (e) { setErr(e.message); } }}>Save — recompute open clocks</Btn>
      <Btn variant="secondary" small onClick={() => setOpen(false)}>Cancel</Btn>
    </div>
    <p style={{ color: S.text3, fontSize: 10.5, margin: "7px 0 0", lineHeight: 1.45 }}>Open clock banks recompute retroactively from the leave start, integrating each schedule period; every recompute writes an audit row on the case.</p>
  </div>;
}

function EmployeeDirectory({ employees, cases, lang, viewer, perms }) {
  const t = T[lang];
  const [search, setSearch] = useState("");
  const [deptF, setDeptF] = useState("All");
  const [statusF, setStatusF] = useState("All");
  const [sel, setSel] = useState(null);
  const depts = useMemo(() => Array.from(new Set(employees.map((e) => e.dept))).sort(), [employees]);
  const EMP_STATUSES = ["Active", "Leave of Absence", "Seasonal", "Terminated", "Retired", "Inactive"];
  const statusCounts = useMemo(() => { const c = { All: employees.length }; for (const s of EMP_STATUSES) c[s] = 0; for (const e of employees) { const s = e.status || "Active"; c[s] = (c[s] || 0) + 1; } return c; }, [employees]);
  const filtered = useMemo(() => { const q = search.toLowerCase(); return employees.filter((e) => (deptF === "All" || e.dept === deptF) && (statusF === "All" || (e.status || "Active") === statusF) && (!q || e.name.toLowerCase().includes(q) || e.file_number.toLowerCase().includes(q) || (e.position || "").toLowerCase().includes(q) || String(e.id) === q || (e.adp_associate_id || "").toLowerCase().includes(q))); }, [employees, search, deptF, statusF]);
  const elig = sel ? computeEligibility(sel) : null;
  const empCases = sel ? cases.filter((c) => c.employee_id === sel.id) : [];
  const EligChip = ({ emp }) => { const e = computeEligibility(emp); return e.fmlaEligible ? <span style={{ color: S.green, fontSize: 12, fontWeight: 600 }}>✓ Eligible</span> : <span style={{ color: S.amber, fontSize: 12, fontWeight: 600 }}>⚠ Review</span>; };
  const cols = [
    { key: "file_number", header: "File #", sortable: true, width: 90, render: (e) => <span style={{ color: S.indigoL, fontWeight: 600, fontFamily: "monospace", fontSize: 12 }}>{e.file_number}</span> },
    { key: "name", header: t.name, sortable: true, render: (e) => <AvatarLabel name={e.name} sub={e.email} /> },
    { key: "entity_code", header: "Entity", sortable: true, render: (e) => <Badge label={e.entity_code} /> },
    { key: "status", header: "Status", sortable: true, sortValue: (e) => EMP_STATUSES.indexOf(e.status || "Active"), render: (e) => <Badge label={e.status || "Active"} /> },
    { key: "dept", header: t.dept, sortable: true, render: (e) => <span style={{ color: S.text2, fontSize: 12.5 }}>{e.dept}</span> },
    { key: "position", header: t.position, sortable: true, render: (e) => <span style={{ color: S.text3, fontSize: 12.5 }}>{e.position}</span> },
    { key: "hire_date", header: "Hired", sortable: true, sortValue: (e) => new Date(e.hire_date).getTime(), render: (e) => <span style={{ color: S.text3, fontSize: 12 }}>{formatDate(e.hire_date)}</span> },
    { key: "elig", header: "FMLA", sortable: true, align: "right", sortValue: (e) => computeEligibility(e).fmlaEligible ? 1 : 0, render: (e) => <EligChip emp={e} /> },
  ];
  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
    <PageHeader title={t.employees} subtitle={`${filtered.length} of ${employees.length} employees`} breadcrumb={["Management", t.employees]} />
    <div style={{ display: "flex", gap: 9, marginBottom: 16, flexWrap: "wrap" }}>
      <div style={{ position: "relative", flex: 1, minWidth: 220 }}><Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: S.text3, pointerEvents: "none" }} /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchEmp} style={{ paddingLeft: 32 }} /></div>
      <Select value={deptF} onChange={(e) => setDeptF(e.target.value)} style={{ minWidth: 170 }}><option value="All">All departments</option>{depts.map((d) => <option key={d} value={d}>{d}</option>)}</Select>
    </div>
    <div style={{ display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap" }}>
      {["All", ...EMP_STATUSES].map((s) => { const active = statusF === s; const n = statusCounts[s] || 0; return <button key={s} onClick={() => setStatusF(s)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: RADIUS.pill, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Arial,Helvetica,sans-serif", border: active ? "1px solid rgba(0,75,135,.45)" : `1px solid ${S.border2}`, background: active ? "rgba(0,75,135,.10)" : "#fff", color: active ? S.indigo : n === 0 ? S.text3 : S.text2, opacity: n === 0 && s !== "All" ? .55 : 1 }}>
        {s}<span style={{ background: active ? "rgba(0,75,135,.16)" : "rgba(0,75,135,.06)", color: active ? S.indigo : S.text3, borderRadius: RADIUS.pill, padding: "1px 8px", fontSize: 10.5, fontWeight: 800 }}>{n}</span>
      </button>; })}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: sel ? "1fr 360px" : "1fr", gap: 16, alignItems: "start" }}>
      <DataTable columns={cols} rows={filtered} getRowId={(e) => e.id} initialSort={{ key: "file_number", dir: "asc" }} pageSize={10} onRowClick={(e) => setSel(e)} emptyMessage="No employees match" />
      {sel && <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 88 }}>
        <Card><div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}><Avatar name={sel.name} size={40} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ color: S.text, fontWeight: 700, fontSize: 15 }}>{sel.name}</div><div style={{ color: S.text3, fontSize: 12 }}>{sel.position}</div></div><button onClick={() => setSel(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: S.text3 }}><X size={16} /></button></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>{[["File #", sel.file_number], ["Entity", sel.entity_code], ["Status", sel.status || "Active"], ["Dept", sel.dept], ["Hired", formatDate(sel.hire_date)], ["Hrs/wk", sel.hours_per_week ?? "— (FT assumed)"], ["Hrs (12mo)", (sel.hours_worked_12mo ?? sel.hours_worked ?? 0).toLocaleString()]].map(([l, v]) => <div key={l} style={{ background: "rgba(0,75,135,.025)", borderRadius: 8, padding: "8px 10px" }}><div style={{ color: S.text3, marginBottom: 2 }}>{l}</div><div style={{ color: S.text, fontWeight: 600 }}>{v}</div></div>)}</div>
        </Card>
        <Card><p style={{ color: S.text2, fontSize: 12, fontWeight: 700, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: ".06em" }}>{t.eligibility}</p>
          {elig && <><div style={{ background: elig.fmlaEligible ? "rgba(30,125,63,.08)" : "rgba(185,117,9,.08)", border: `1px solid ${elig.fmlaEligible ? "rgba(30,125,63,.3)" : "rgba(185,117,9,.3)"}`, borderRadius: 10, padding: "12px 14px", textAlign: "center", marginBottom: 12 }}><div style={{ color: elig.fmlaEligible ? S.green : S.amber, fontSize: 18, fontWeight: 800 }}>{elig.fmlaEligible ? "✓" : "⚠"}</div><div style={{ color: elig.fmlaEligible ? S.green : S.amber, fontSize: 12, fontWeight: 600, marginTop: 2 }}>FMLA {elig.fmlaEligible ? t.eligible : t.notEligible}</div></div>
            {[[t.tenureMonths, `${elig.tenureMonths} mo`], [t.hoursWorked, elig.hoursWorked.toLocaleString() + (elig.approximate ? " (YTD approx.)" : "")], ["FMLA entitlement", `${elig.entitlementHoursFMLA} h`], ["PDL entitlement", elig.entitlementHoursPDL ? `${elig.entitlementHoursPDL} h` : "—"]].map(([l, v]) => <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(0,75,135,.05)", fontSize: 12 }}><span style={{ color: S.text3 }}>{l}</span><span style={{ color: S.text, fontWeight: 600 }}>{v}</span></div>)}
            <div style={{ marginTop: 10, display: "flex", gap: 5, flexWrap: "wrap" }}>{elig.applicableLaws.length ? elig.applicableLaws.map((l) => <Badge key={l} label={l} />) : <span style={{ color: S.text3, fontSize: 11 }}>None</span>}</div></>}
        </Card>
        <Card>
          <p style={{ color: S.text2, fontSize: 12, fontWeight: 700, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: ".06em" }}>Work schedule {scheduleLabel(sel) ? `· ${scheduleLabel(sel)}` : ""}</p>
          {(sel.scheduleHistory || []).slice().reverse().map((s, i) => <div key={i} style={{ display: "flex", gap: 9, fontSize: 12, padding: "4px 0", color: i === 0 ? S.text : S.text3 }}>
            <span style={{ fontFamily: "monospace", minWidth: 78 }}>{s.effectiveDate}</span>
            <span>{SCHEDULE_TYPES.find((x) => x.id === s.type)?.label || s.type}{s.type === "variable" ? ` — ${s.hoursPerWeek}h/wk` : ""}{i === 0 ? "  · current" : ""}</span>
          </div>)}
          {(!sel.scheduleHistory || !sel.scheduleHistory.length) && <p style={{ color: S.text3, fontSize: 12, margin: 0 }}>No schedule history — static {sel.hours_per_week || 40}h/wk assumed.</p>}
          {perms?.editCase ? <SchedulePeriodForm employee={sel} viewer={viewer} /> : null}
        </Card>
        <Card style={{ padding: 14 }}>
          <Btn variant="secondary" small style={{ width: "100%", justifyContent: "center" }} onClick={() => { const url = `${window.location.origin}${window.location.pathname}?intake=${encodeIntakeToken(sel.file_number)}`; navigator.clipboard?.writeText(url); }}><Link2 size={13} /> Copy leave-request link for {sel.name.split(" ")[0]}</Btn>
          <p style={{ color: S.text3, fontSize: 11, lineHeight: 1.5, margin: "8px 0 0" }}>Magic link tied to file {sel.file_number}. The employee verifies with their last name and submits dates — the case arrives as Pending, designation blank, clocks idle.</p>
        </Card>
        {empCases.length > 0 && <Card><p style={{ color: S.text2, fontSize: 12, fontWeight: 700, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: ".06em" }}>Leave Cases ({empCases.length})</p>{empCases.map((c) => <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(0,75,135,.05)", fontSize: 12 }}><span style={{ color: S.indigoL, fontWeight: 600 }}>{c.ref || `#${c.id}`}</span><Badge label={c.type || "Unassigned"} /><Badge label={c.status} /></div>)}</Card>}
      </motion.div>}
    </div>
  </motion.div>;
}

/* ─────────────────── CASES ─────────────────── */
function ErrMsg({ msg }) { return msg ? <span style={{ color: S.red, fontSize: 11, marginTop: 3, display: "block" }}>{msg}</span> : null; }
function FieldWrap({ label, children, error }) { return <div><label style={{ color: S.text3, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>{label}</label>{children}<ErrMsg msg={error} /></div>; }

function CreateCaseModal({ employees, onClose, onSave, lang }) {
  const t = T[lang];
  const [form, setForm] = useState({ employee_id: "", designations: ["FMLA", "CFRA"], reason: "own_serious_health", status: "Pending", start_date: "", end_date: "", priority: "Medium", owner: HR_POOL[0], notes: "", intermittent: false, military_caregiver: false, pdl_preceded: false });
  const [errors, setErrors] = useState({});
  const [empQ, setEmpQ] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleDesig = (d) => setForm((f) => ({ ...f, designations: f.designations.includes(d) ? f.designations.filter((x) => x !== d) : [...f.designations, d] }));
  // Employee search — file number is the PRIMARY key, then name / ID / ADP associate #.
  // Non-active employees excluded from new leave workflows unless explicitly included.
  const empMatches = useMemo(() => {
    const q = empQ.trim().toLowerCase();
    return employees
      .filter((e) => includeInactive || (e.status || "Active") === "Active" || e.id === Number(form.employee_id))
      .filter((e) => !q || e.file_number.includes(q) || e.name.toLowerCase().includes(q) || String(e.id) === q || (e.adp_associate_id || "").toLowerCase().includes(q))
      .sort((a, b) => (a.file_number.startsWith(q) === b.file_number.startsWith(q) ? a.file_number.localeCompare(b.file_number) : a.file_number.startsWith(q) ? -1 : 1));
  }, [employees, empQ, includeInactive, form.employee_id]);
  const emp = employees.find((e) => e.id === Number(form.employee_id));
  const hpw = emp ? scheduledHoursPerWeek(emp) : 40;
  const setResult = clocksForSet(form.designations, form.reason, { state: emp?.state || "CA", pdlPreceded: form.pdl_preceded });
  const clocks = setResult.clocks;
  const total = entitlementForSet(form.designations, { hoursPerWeek: hpw, militaryCaregiver: form.military_caregiver, reason: form.reason, state: emp?.state || "CA", pdlPreceded: form.pdl_preceded });
  const validate = () => { const e = {}; if (!form.employee_id) e.employee_id = "Required"; if (!form.start_date) e.start_date = "Required"; if (!form.end_date) e.end_date = "Required"; if (form.start_date && form.end_date && form.end_date <= form.start_date) e.end_date = "Must be after start"; return e; };
  const handleSave = () => { const e = validate(); if (Object.keys(e).length) { setErrors(e); return; } onSave({ ...form, leave_designation: joinDesignations(form.designations), deferred_clocks: setResult.deferred, tracking_designations: setResult.trackingOnly }); };
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
    <motion.div initial={{ scale: .9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: .9, opacity: 0 }} style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 18, padding: 28, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}><h2 style={{ margin: 0, color: S.text, fontSize: 18, fontWeight: 800 }}>{t.createCase}</h2><button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: S.text3 }}><X size={18} /></button></div>
      <div style={{ display: "grid", gap: 16 }}>
        <FieldWrap label="Employee *" error={errors.employee_id}>
          <Input value={empQ} onChange={(e) => setEmpQ(e.target.value)} placeholder="Search by file # (primary), name, employee ID, or ADP associate #…" style={{ width: "100%", boxSizing: "border-box", marginBottom: 7 }} />
          <Select value={form.employee_id} onChange={(e) => set("employee_id", e.target.value)} style={{ width: "100%" }} size={empQ ? Math.min(5, Math.max(2, empMatches.length)) : undefined}>
            <option value="">{empMatches.length ? `Select from ${empMatches.length} match${empMatches.length === 1 ? "" : "es"}…` : "No matches"}</option>
            {empMatches.slice(0, 40).map((e) => <option key={e.id} value={e.id}>{e.file_number} – {e.name} ({e.entity_code}{e.adp_associate_id ? ` · ${e.adp_associate_id}` : ""}{(e.status || "Active") !== "Active" ? ` · ${e.status}` : ""})</option>)}
          </Select>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, color: S.text3, fontSize: 11.5, cursor: "pointer", marginTop: 6 }}><input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} style={{ accentColor: S.indigo }} /> Include non-active employees (terminated / retired / inactive)</label>
        </FieldWrap>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FieldWrap label="Designations (select all that apply — blank = await designation)">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DESIGNATION_TOKENS.map((d) => <button key={d.id} type="button" onClick={() => toggleDesig(d.id)} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: form.designations.includes(d.id) ? "1px solid rgba(0,75,135,.55)" : `1px solid ${S.border2}`, background: form.designations.includes(d.id) ? "rgba(0,75,135,.16)" : "transparent", color: form.designations.includes(d.id) ? S.indigoL : S.text3 }}>{d.id}{!d.clocked && d.id !== "Personal" ? " ◦" : ""}</button>)}
            </div>
            <span style={{ color: S.text3, fontSize: 10.5, marginTop: 5, display: "block" }}>◦ = tracking designation (no hour clock): WC and ADA carry job-protection/accommodation status alongside statutory clocks.</span>
          </FieldWrap>
          <FieldWrap label={t.reason || "Reason"}><Select value={form.reason} onChange={(e) => set("reason", e.target.value)} style={{ width: "100%" }}>{LEAVE_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></FieldWrap>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FieldWrap label={`${t.startDate} *`} error={errors.start_date}><Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></FieldWrap>
          <FieldWrap label={`${t.endDate} *`} error={errors.end_date}><Input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></FieldWrap>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FieldWrap label={t.priority}><Select value={form.priority} onChange={(e) => set("priority", e.target.value)} style={{ width: "100%" }}>{["High", "Medium", "Low"].map((p) => <option key={p} value={p}>{p}</option>)}</Select></FieldWrap>
          <FieldWrap label={t.owner}><Select value={form.owner} onChange={(e) => set("owner", e.target.value)} style={{ width: "100%" }}>{HR_POOL.map((o) => <option key={o} value={o}>{o}</option>)}</Select></FieldWrap>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[["intermittent", "Intermittent schedule"], ...(form.reason === "military_caregiver" ? [["military_caregiver", "Military caregiver (26 wks)"]] : []), ...(form.reason === "bonding" ? [["pdl_preceded", "PDL preceded this bonding leave"]] : [])].map(([k, label]) =>
            <label key={k} style={{ display: "inline-flex", alignItems: "center", gap: 7, color: S.text2, fontSize: 12.5, cursor: "pointer" }}><input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} style={{ accentColor: S.indigo }} /> {label}</label>)}
        </div>
        <div style={{ background: "rgba(0,75,135,.06)", border: "1px solid rgba(0,75,135,.22)", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ color: S.text3, fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 8 }}>Engine preview</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}><span style={{ color: S.text3 }}>Concurrent clocks</span><span style={{ color: S.text, fontWeight: 600 }}>{clocks.length ? clocks.join(" + ") : "None — clocks idle until designated"}</span></div>
          {setResult.deferred.length > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}><span style={{ color: S.text3 }}>Sequential (reserved)</span><span style={{ color: S.teal, fontWeight: 600 }}>{setResult.deferred.join(" + ")} — runs after PDL ends</span></div>}
          {setResult.trackingOnly.length > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}><span style={{ color: S.text3 }}>Tracking (no clock)</span><span style={{ color: S.text, fontWeight: 600 }}>{setResult.trackingOnly.join(" + ")}</span></div>}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}><span style={{ color: S.text3 }}>Entitlement</span><span style={{ color: S.text, fontWeight: 600 }}>{total ? `${total} h at ${hpw} hrs/wk` : clocks.length ? "—" : "No statutory hour bank"}</span></div>
        </div>
        <FieldWrap label="Notes"><textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Leave reason, context…" style={{ background: "rgba(0,75,135,.05)", border: `1px solid ${S.border}`, borderRadius: 9, padding: "9px 14px", color: S.text, fontSize: 13, outline: "none", width: "100%", resize: "vertical", minHeight: 70, fontFamily: "inherit", boxSizing: "border-box" }} /></FieldWrap>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}><Btn variant="secondary" onClick={onClose}>{t.cancel}</Btn><Btn variant="primary" onClick={handleSave}><CheckCircle size={14} /> {t.save}</Btn></div>
    </motion.div>
  </motion.div>;
}

function CaseDetailPanel({ caseData, onClose, lang, viewer, canViewNotes = true, canEdit = true }) {
  const t = T[lang];
  const { employees, intermittentLog, certifications, documents, messages, packets, templates, entities, auditEvents, actions, demo } = useData();
  const [tab, setTab] = useState("summary");
  const [logForm, setLogForm] = useState({ usage_date: "", hours_used: "" });
  const [desig, setDesig] = useState("FMLA");
  const [adaDetail, setAdaDetail] = useState("");
  const [docCat, setDocCat] = useState("initial_cert");
  const [reviewFor, setReviewFor] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [pktId, setPktId] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [aiDraftNote, setAiDraftNote] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [transOpen, setTransOpen] = useState(false);
  const [transPreset, setTransPreset] = useState(TRANSITION_PRESETS[0].id);
  const [transCustom, setTransCustom] = useState([]);
  const [transDate, setTransDate] = useState(new Date().toISOString().slice(0, 10));
  const [transReason, setTransReason] = useState("");
  const docFileRef = useRef(null);
  const emp = employees.find((e) => e.id === caseData.employee_id);
  const elig = emp ? computeEligibility(emp) : null;
  const risk = computeRisk(caseData);
  const usagePct = pct(caseData.used_hours, caseData.total_hours);
  const durationWks = weeksBetween(caseData.start_date, caseData.end_date);
  const caseLog = useMemo(() => intermittentLog.filter((l) => l.case_id === caseData.id).sort((a, b) => new Date(b.usage_date) - new Date(a.usage_date)), [intermittentLog, caseData.id]);
  const certChain = useMemo(() => certifications.filter((c) => c.case_id === caseData.id).sort((a, b) => new Date(a.due_date || a.requested_at) - new Date(b.due_date || b.requested_at)), [certifications, caseData.id]);
  const recert = useMemo(() => nextRecertDue(caseData, certChain), [caseData, certChain]);
  const payroll = caseData.payroll_flag ?? primaryPayrollFlag(caseData, emp);
  const ffd = ffdStatus(caseData);
  const ada = adaStatus(caseData);
  const showAda = ada.tracked || adaExposure(caseData);
  const caseDocs = useMemo(() => documents.filter((d) => d.case_id === caseData.id).sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at)), [documents, caseData.id]);
  const caseMsgs = useMemo(() => messages.filter((m) => m.case_id === caseData.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)), [messages, caseData.id]);
  const unreadMsgs = caseMsgs.filter((m) => m.sender_role === "employee" && !m.read_at).length;
  const entity = entities.find((x) => x.id === caseData.entity_id || x.code === caseData.entity_code);
  const isLegalViewer = ["HR Administrator", "Legal & Compliance"].includes(viewer.roleLabel);
  const balances = useMemo(() => {
    if (!emp) return null;
    const hpw = scheduledHoursPerWeek(emp);
    const out = {};
    for (const clock of caseData.concurrent_clocks || []) {
      const entries = intermittentLog.filter((l) => l.employee_id === emp.id);
      const r = remainingHours({ type: clock, hoursPerWeek: hpw, entries: entries.length ? entries : [{ usage_date: caseData.start_date, hours_used: caseData.used_hours }] });
      out[clock] = r;
    }
    return out;
  }, [emp, caseData, intermittentLog]);
  const tabs = [["summary", t.summary, FileText], ["eligibility", t.eligibility, Activity], ["entitlement", t.remaining || "Balances", CalendarCheck], ["intermittent", t.intermittentLog || t.intermittent, Clock], ...(showAda ? [["ada", t.adaProcess, Accessibility]] : []), ["rtw", t.rtwChecklist, ClipboardCheck], ["docs", "Documents", Paperclip], ["messages", unreadMsgs ? `Messages (${unreadMsgs})` : "Messages", MessageSquareText], ["risk", t.risk, AlertTriangle], ["audit", t.auditLog, ListChecks]];
  const Row = ({ label, value }) => <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(0,75,135,.05)", fontSize: 13 }}><span style={{ color: S.text3 }}>{label}</span><span style={{ color: S.text, fontWeight: 600 }}>{value}</span></div>;
  const addLog = () => { if (!logForm.usage_date || !Number(logForm.hours_used)) return; actions.logIntermittent({ case_id: caseData.id, usage_date: logForm.usage_date, hours_used: Number(logForm.hours_used) }, viewer.name); setLogForm({ usage_date: "", hours_used: "" }); };
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 900, display: "flex", justifyContent: "flex-end" }}>
    <motion.div initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }} transition={{ type: "spring", damping: 28, stiffness: 260 }} onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: "100%", height: "100%", background: S.card, borderLeft: `1px solid ${S.border}`, padding: 24, overflowY: "auto", boxShadow: "-20px 0 60px rgba(0,0,0,.5)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
        <div><div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span style={{ color: S.indigoL, fontWeight: 700, fontSize: 13 }}>{caseData.ref || `Case #${caseData.id}`}</span><Badge label={caseData.type || "Unassigned"} /><Badge label={caseData.status} /><Badge label={caseData.entity_code} /></div><h2 style={{ margin: "8px 0 0", color: S.text, fontSize: 18, fontWeight: 800 }}>{emp?.name || "Unknown employee"}</h2><p style={{ margin: "2px 0 0", color: S.text3, fontSize: 12 }}>{emp?.position} · {emp?.dept} · File {caseData.file_number}</p></div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: S.text3 }}><X size={18} /></button>
      </div>
      {!caseData.type && canEdit && <div style={{ background: "rgba(185,117,9,.07)", border: "1px solid rgba(185,117,9,.3)", borderRadius: 10, padding: 12, margin: "12px 0 4px" }}>
        <div style={{ color: S.amber, fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>⚠ Awaiting designation — statutory clocks are idle</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Select value={desig} onChange={(e) => setDesig(e.target.value)} style={{ flex: 1 }}>{["FMLA + CFRA", "FMLA", "CFRA", "PDL", "PDL + CFRA", "WC + FMLA + CFRA", "ADA", "Personal"].map((d) => <option key={d} value={d}>{d}</option>)}</Select>
          <Btn variant="primary" small onClick={() => actions.transitionDesignation(caseData.id, { to: desig.split("+").map((s) => s.trim()), effective_date: caseData.start_date || new Date().toISOString().slice(0, 10), transitionReason: "Initial designation after intake review" }, viewer.name)}>Assign</Btn>
        </div>
      </div>}
      {payroll && !payroll.acknowledged && <div style={{ background: "rgba(14,124,134,.06)", border: "1px solid rgba(14,124,134,.3)", borderRadius: 10, padding: 12, margin: "12px 0 4px" }}>
        <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
          <Banknote size={15} color={S.teal} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: S.teal, fontSize: 12.5, fontWeight: 700 }}>Payroll coordination</div>
            <div style={{ color: S.text2, fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>{payroll.message}</div>
            <div style={{ color: S.text3, fontSize: 11.5, marginTop: 4 }}>Coordinate by <strong style={{ color: daysUntil(payroll.coordinate_by) < 0 ? S.red : S.text2 }}>{payroll.coordinate_by}</strong>{daysUntil(payroll.coordinate_by) < 0 ? " — past due" : ""}</div>
          </div>
          {canEdit && <Btn variant="secondary" small onClick={() => actions.ackPayrollFlag(caseData.id, viewer.name)}>Acknowledge</Btn>}
        </div>
      </div>}
      {payroll && payroll.acknowledged && <div style={{ color: S.text3, fontSize: 11.5, margin: "10px 0 0", display: "flex", alignItems: "center", gap: 6 }}><Banknote size={12} color={S.text3} /> Payroll coordinated — acknowledged by {payroll.acknowledged_by} on {payroll.acknowledged_at}</div>}
      {caseData.transfer_review && !caseData.transfer_review.resolved && <div style={{ background: "rgba(185,117,9,.07)", border: "1px solid rgba(185,117,9,.35)", borderRadius: 10, padding: 12, margin: "12px 0 4px" }}>
        <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
          <ArrowLeftRight size={15} color={S.amber} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: S.amber, fontSize: 12.5, fontWeight: 700 }}>Cross-entity transfer detected — {caseData.transfer_review.from} → {caseData.transfer_review.to} ({caseData.transfer_review.detected_at})</div>
            <div style={{ color: S.text2, fontSize: 12.5, marginTop: 3, lineHeight: 1.55 }}>Confirm whether prior leave counts toward the new entity's rolling window. The AMPAM entities are one PE family — the integrated-employer doctrine treats them as a single FMLA employer, so the answer is yes; your confirmation records the determination.</div>
          </div>
          {canEdit && <Btn variant="primary" small onClick={() => actions.confirmTransfer(caseData.id, viewer.name)}>Confirm — counts toward window</Btn>}
        </div>
      </div>}
      {caseData.transfer_review?.resolved && <div style={{ color: S.text3, fontSize: 11.5, margin: "10px 0 0", display: "flex", alignItems: "center", gap: 6 }}><ArrowLeftRight size={12} color={S.text3} /> Transfer {caseData.transfer_review.from}→{caseData.transfer_review.to} resolved by {caseData.transfer_review.resolved_by}: prior leave counts toward the rolling window (integrated employer)</div>}
      {caseData.triage && caseData.triage.suggestions.some((s) => s.status === "open") && <div style={{ background: "rgba(0,75,135,.07)", border: "1px solid rgba(0,75,135,.35)", borderRadius: 10, padding: 12, margin: "12px 0 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Sparkles size={14} color="#1565a8" />
          <span style={{ color: "#1565a8", fontSize: 12.5, fontWeight: 700 }}>Suggested actions — intake triage</span>
          <span style={{ color: S.text3, fontSize: 10.5 }}>{caseData.triage.source === "ai" ? "AI-assisted" : "rules-based"} · non-binding · confirm or dismiss each</span>
          {canEdit && <Btn variant="secondary" small style={{ marginLeft: "auto" }} onClick={() => actions.runAiTriage(caseData.id, viewer.name)}><Sparkles size={11} /> Re-analyze with AI</Btn>}
        </div>
        {caseData.triage.suggestions.filter((s) => s.status === "open").map((s) => <div key={s.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "6px 0", borderTop: "1px solid rgba(0,75,135,.06)" }}>
          <span style={{ color: S.text3, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", minWidth: 78, marginTop: 2 }}>{s.kind.replace(/_/g, " ")}</span>
          <span style={{ flex: 1, color: S.text2, fontSize: 12.5, lineHeight: 1.5 }}>{s.text}</span>
          {canEdit && <span style={{ display: "inline-flex", gap: 5, flexShrink: 0 }}>
            <Btn variant="success" small onClick={() => actions.resolveTriage(caseData.id, s.id, "confirmed", viewer.name)}>Confirm</Btn>
            <Btn variant="secondary" small onClick={() => actions.resolveTriage(caseData.id, s.id, "dismissed", viewer.name)}>Dismiss</Btn>
          </span>}
        </div>)}
      </div>}
      {emp && isPerDiem(emp) && <div style={{ margin: "10px 0 0" }}><span title={`Per-diem calculation: no scheduled hours, so the 1,250-hour eligibility test uses ACTUAL hours from the ADP import, and entitlement uses the trailing 12-month average of ${perDiemAvgWeeklyHours(emp)} hrs/week × the statutory weeks.`} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(14,124,134,.1)", border: "1px solid rgba(14,124,134,.35)", color: S.teal, borderRadius: RADIUS.pill, padding: "3px 11px", fontSize: 11, fontWeight: 800, cursor: "help" }}>PER DIEM · avg {perDiemAvgWeeklyHours(emp)}h/wk basis ⓘ</span></div>}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "18px 0 16px" }}>{tabs.map(([k, label, Icon]) => <button key={k} onClick={() => setTab(k)} style={{ ...TAB_STYLE(tab === k), display: "inline-flex", alignItems: "center", gap: 5 }}><Icon size={12} /> {label}</button>)}</div>
      {tab === "summary" && <div>
        <Row label={t.owner} value={caseData.owner} /><Row label={t.priority} value={caseData.priority} /><Row label={t.startDate} value={caseData.start_date} /><Row label={t.endDate} value={caseData.end_date} /><Row label="Duration" value={`${durationWks} weeks`} /><Row label="Reason" value={LEAVE_REASONS.find((r) => r.id === caseData.reason)?.label || "—"} /><Row label="Concurrent clocks" value={(caseData.concurrent_clocks || []).join(" + ") || "None"} /><Row label="Intermittent" value={caseData.intermittent ? "Yes" : "No"} />
        <div style={{ padding: "10px 0", borderBottom: "1px solid rgba(0,75,135,.05)" }}>
          <div style={{ color: S.text3, fontSize: 12, fontWeight: 600, marginBottom: 7 }}>Certification chain</div>
          {certChain.length === 0 && <div style={{ color: S.text3, fontSize: 12.5 }}>No certifications on file{caseData.type ? "" : " — case awaits designation"}.</div>}
          {certChain.map((cert) => <div key={cert.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12.5 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: cert.received_at ? S.green : daysUntil(cert.due_date) < 0 ? S.red : S.amber, flexShrink: 0 }} />
            <span style={{ color: S.text2, minWidth: 118 }}>{cert.kind === "recert" ? "Recertification" : cert.kind === "fitness_for_duty" ? "Fitness-for-duty" : "Initial certification"}</span>
            {cert.received_at ? <span style={{ color: S.green, fontWeight: 600 }}>✓ Received {cert.received_at}</span>
              : <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><span style={{ color: daysUntil(cert.due_date) < 0 ? S.red : S.amber, fontWeight: 600 }}>{daysUntil(cert.due_date) < 0 ? `Overdue ${-daysUntil(cert.due_date)}d` : `Due ${cert.due_date}`}</span>{canEdit && <Btn variant="success" small onClick={() => actions.receiveCert(cert.id, viewer.name)}>Received</Btn>}</span>}
          </div>)}
          {recert && !recert.requested && canEdit && <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, fontSize: 12.5 }}>
            <span style={{ color: daysUntil(recert.due_date) <= 7 ? S.amber : S.text3 }}>Next recertification due {recert.due_date} ({caseData.intermittent ? "30-day intermittent" : "6-month"} interval)</span>
            <Btn variant="secondary" small onClick={() => actions.requestRecert(caseData.id, recert.due_date, viewer.name)}>Request now</Btn>
          </div>}
        </div>
        {(caseData.type || (caseData.designation_history || []).length > 0) && <div style={{ padding: "10px 0", borderBottom: "1px solid rgba(0,75,135,.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
            <GitBranch size={13} color={S.indigoL} />
            <span style={{ color: S.text3, fontSize: 12, fontWeight: 600 }}>Designation lifecycle</span>
            {canEdit && caseData.type && <Btn variant="secondary" small style={{ marginLeft: "auto" }} onClick={() => setTransOpen(!transOpen)}>{transOpen ? "Cancel" : "Transition…"}</Btn>}
          </div>
          {(caseData.designation_history || []).length === 0 && <div style={{ color: S.text3, fontSize: 12 }}>Original designation in effect — no transitions recorded.</div>}
          {(caseData.designation_history || []).map((h, i) => <div key={i} style={{ display: "flex", gap: 9, padding: "5px 0", fontSize: 12 }}>
            <span style={{ color: S.indigoL, fontWeight: 700, minWidth: 78, fontFamily: "monospace" }}>{h.effective_date}</span>
            <div style={{ flex: 1 }}>
              <span style={{ color: S.text2, fontWeight: 600 }}>{(h.from || []).join(" + ") || "Unassigned"} → {(h.to || []).join(" + ")}</span>
              <span style={{ color: S.text3 }}> · {h.actor}{h.at_transition ? ` · ${h.at_transition.used_hours}/${h.at_transition.total_hours}h at transition${h.at_transition.exhausted ? " (exhausted)" : ""}` : ""}</span>
              {h.reason && <div style={{ color: S.text3, fontSize: 11.5 }}>{h.reason}</div>}
            </div>
          </div>)}
          {transOpen && canEdit && <div style={{ marginTop: 9, background: "rgba(0,75,135,.05)", border: "1px solid rgba(0,75,135,.22)", borderRadius: 10, padding: 12 }}>
            <Select value={transPreset} onChange={(e) => setTransPreset(e.target.value)} style={{ width: "100%", marginBottom: 8 }}>{TRANSITION_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>
            {transPreset === "custom" && <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
              {DESIGNATION_TOKENS.map((d) => <button key={d.id} type="button" onClick={() => setTransCustom(transCustom.includes(d.id) ? transCustom.filter((x) => x !== d.id) : [...transCustom, d.id])} style={{ padding: "5px 11px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", border: transCustom.includes(d.id) ? "1px solid rgba(0,75,135,.55)" : `1px solid ${S.border2}`, background: transCustom.includes(d.id) ? "rgba(0,75,135,.16)" : "transparent", color: transCustom.includes(d.id) ? S.indigoL : S.text3 }}>{d.id}</button>)}
            </div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 8, marginBottom: 8 }}>
              <Input type="date" value={transDate} onChange={(e) => setTransDate(e.target.value)} />
              <Input value={transReason} onChange={(e) => setTransReason(e.target.value)} placeholder="Reason for transition (recorded in history + audit)" />
            </div>
            <Btn variant="primary" small style={{ width: "100%", justifyContent: "center" }} onClick={async () => {
              const preset = TRANSITION_PRESETS.find((p) => p.id === transPreset);
              const to = preset?.to || transCustom;
              try {
                await actions.transitionDesignation(caseData.id, { to, effective_date: transDate, transitionReason: transReason || preset?.label }, viewer.name);
                setTransOpen(false); setTransReason(""); setTransCustom([]);
              } catch (err) { /* surfaced via console in demo */ console.error(err); }
            }}><GitBranch size={12} /> Apply transition</Btn>
            <p style={{ color: S.text3, fontSize: 10.5, margin: "7px 0 0", lineHeight: 1.5 }}>The engine recomputes clocks/entitlement for the new set (statutory rules enforced — e.g. bonding after PDL charges CFRA only), captures the hour-bank state at transition, and writes the immutable audit entry.</p>
          </div>}
        </div>}
        <div style={{ marginTop: 14 }}><p style={{ color: S.text3, fontSize: 12, margin: "0 0 6px", fontWeight: 600 }}>Hours used</p><div style={{ background: "rgba(0,75,135,.06)", borderRadius: 8, height: 10, overflow: "hidden" }}><div style={{ width: `${usagePct}%`, height: "100%", background: usagePct > 80 ? S.red : usagePct > 50 ? S.amber : S.green, transition: "width .4s" }} /></div><p style={{ color: S.text2, fontSize: 12, margin: "6px 0 0" }}>{caseData.used_hours} / {caseData.total_hours} hrs ({usagePct}%)</p></div>
        {caseData.notes && (canViewNotes ? <div style={{ marginTop: 14, background: "rgba(0,75,135,.025)", borderRadius: 10, padding: 12 }}><p style={{ color: S.text3, fontSize: 11, margin: "0 0 4px", fontWeight: 600 }}>NOTES</p><p style={{ color: S.text2, fontSize: 13, margin: 0, lineHeight: 1.5 }}>{caseData.notes}</p></div> : <div style={{ marginTop: 14, background: "rgba(239,51,64,.06)", border: "1px solid rgba(239,51,64,.25)", borderRadius: 10, padding: 12, display: "flex", alignItems: "center", gap: 9 }}><Lock size={14} color={S.red} /><p style={{ color: S.text3, fontSize: 12.5, margin: 0 }}>Medical and personal notes are restricted for your role.</p></div>)}
        {(caseData.documents || []).length > 0 && <div style={{ marginTop: 14 }}><p style={{ color: S.text3, fontSize: 11, margin: "0 0 6px", fontWeight: 600 }}>GENERATED DOCUMENTS</p>{caseData.documents.map((d, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(0,75,135,.05)", fontSize: 12 }}><Paperclip size={12} color={S.indigoL} /><span style={{ color: S.text2 }}>{d.title} ({d.language})</span><span style={{ color: S.text3, marginLeft: "auto", fontSize: 11 }}>{relativeTime(d.generated_at)}</span></div>)}</div>}
      </div>}
      {tab === "eligibility" && elig && <div>
        <div style={{ background: elig.fmlaEligible ? "rgba(30,125,63,.08)" : "rgba(185,117,9,.08)", border: `1px solid ${elig.fmlaEligible ? "rgba(30,125,63,.3)" : "rgba(185,117,9,.3)"}`, borderRadius: 12, padding: 16, marginBottom: 14, textAlign: "center" }}><div style={{ fontSize: 26, fontWeight: 800, color: elig.fmlaEligible ? S.green : S.amber }}>{elig.fmlaEligible ? "✓" : "⚠"}</div><div style={{ color: elig.fmlaEligible ? S.green : S.amber, fontWeight: 700, fontSize: 14, marginTop: 4 }}>FMLA {elig.fmlaEligible ? t.eligible : t.notEligible}</div></div>
        <Row label={t.tenureMonths} value={`${elig.tenureMonths} mo (12 required)`} /><Row label={t.hoursWorked} value={`${elig.hoursWorked.toLocaleString()} (1,250 required)`} /><Row label="Schedule" value={`${elig.hoursPerWeek} hrs/wk${emp?.hours_per_week ? "" : " (FT assumed)"}`} />
        <div style={{ marginTop: 12 }}><p style={{ color: S.text3, fontSize: 12, margin: "0 0 6px" }}>{t.applicableLaws}</p><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{elig.applicableLaws.length ? elig.applicableLaws.map((l) => <Badge key={l} label={l} />) : <span style={{ color: S.text3, fontSize: 12 }}>None</span>}</div></div>
        <p style={{ marginTop: 14, fontSize: 11, color: S.text3, lineHeight: 1.5, background: "rgba(185,117,9,.06)", border: "1px solid rgba(185,117,9,.2)", borderRadius: 8, padding: 10 }}>⚠ Informational only. Verify with HR/counsel before relying on this.</p>
      </div>}
      {tab === "entitlement" && <div>
        <p style={{ color: S.text2, fontSize: 12.5, margin: "0 0 12px", lineHeight: 1.5 }}>Remaining balance per statutory clock — rolling 12-month window measured backward from today, keyed to usage dates.</p>
        {!balances || !Object.keys(balances).length ? <EmptyState msg="No statutory clocks charged — case awaits designation or is non-statutory." icon={CalendarCheck} /> :
          Object.entries(balances).map(([clock, b]) => { const p = pct(b.used, b.total); return <div key={clock} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><Badge label={clock} /><span style={{ color: S.text, fontSize: 13, fontWeight: 700 }}>{Math.round(b.remaining)} h left</span></div>
            <div style={{ background: "rgba(0,75,135,.06)", borderRadius: 8, height: 8, overflow: "hidden" }}><div style={{ width: `${p}%`, height: "100%", background: p > 80 ? S.red : p > 50 ? S.amber : S.green }} /></div>
            <div style={{ color: S.text3, fontSize: 11.5, marginTop: 4 }}>{Math.round(b.used)} used of {b.total} h entitlement ({p}%)</div>
          </div>; })}
      </div>}
      {tab === "intermittent" && <div>
        {canEdit && caseData.type && <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <Input type="date" value={logForm.usage_date} onChange={(e) => setLogForm((f) => ({ ...f, usage_date: e.target.value }))} style={{ flex: 1 }} />
          <Input type="number" min="0.5" step="0.5" placeholder="Hours" value={logForm.hours_used} onChange={(e) => setLogForm((f) => ({ ...f, hours_used: e.target.value }))} style={{ width: 90 }} />
          <Btn variant="primary" small onClick={addLog}><Plus size={13} /> Log</Btn>
        </div>}
        {caseLog.length === 0 ? <EmptyState msg="No intermittent usage logged for this case." icon={Clock} /> :
          caseLog.map((l) => <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid rgba(0,75,135,.05)", fontSize: 12.5 }}><span style={{ color: S.text2 }}>{l.usage_date}</span><span style={{ color: S.text, fontWeight: 700 }}>{l.hours_used} h</span><span style={{ color: S.text3, fontSize: 11.5 }}>{l.approved_by}</span></div>)}
        <p style={{ marginTop: 12, fontSize: 11, color: S.text3, lineHeight: 1.5 }}>Entries attribute to this case via file number + leave start date ({caseData.file_number} · {caseData.start_date}) — never aggregated at the employee level, so simultaneous intermittent leaves can't double-count.</p>
      </div>}
      {tab === "ada" && <div>
        <div style={{ background: "rgba(21,101,168,.07)", border: "1px solid rgba(21,101,168,.3)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ color: "#1565a8", fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Interactive process tracker</div>
          <p style={{ color: S.text2, fontSize: 12, margin: 0, lineHeight: 1.55 }}>{adaExposure(caseData) && !ada.tracked ? "This case shows ADA exposure (medical leave nearing exhaustion). Document the interactive process — each milestone writes to the audit trail." : "Each recorded milestone is timestamped in the immutable audit log."}</p>
        </div>
        {ada.steps.map((s, i) => { const isNext = ada.nextStep === s.id; return <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderBottom: "1px solid rgba(0,75,135,.05)" }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, background: s.done ? "rgba(30,125,63,.15)" : isNext ? "rgba(21,101,168,.15)" : "rgba(0,75,135,.05)", color: s.done ? S.green : isNext ? "#1565a8" : S.text3, border: s.done ? "1px solid rgba(30,125,63,.4)" : isNext ? "1px solid rgba(21,101,168,.4)" : "1px solid transparent" }}>{s.done ? "✓" : i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: s.done ? S.text : isNext ? S.text : S.text3, fontSize: 13, fontWeight: s.done || isNext ? 600 : 400 }}>{s.label}</div>
            {s.date && <div style={{ color: S.text3, fontSize: 11.5 }}>{s.date}{caseData.ada?.[`${s.id}_detail`] ? ` — ${caseData.ada[`${s.id}_detail`]}` : ""}</div>}
          </div>
          {isNext && canEdit && <Btn variant="primary" small onClick={() => { actions.recordAdaStep(caseData.id, s.id, ["offered", "decision", "resolved"].includes(s.id) ? adaDetail : "", viewer.name); setAdaDetail(""); }}>Record</Btn>}
        </div>; })}
        {["offered", "decision", "resolved"].includes(ada.nextStep) && canEdit && <div style={{ marginTop: 10 }}><Input value={adaDetail} onChange={(e) => setAdaDetail(e.target.value)} placeholder={ada.nextStep === "offered" ? "Accommodation offered (e.g. modified duty, schedule change)…" : ada.nextStep === "decision" ? "Accepted / declined — by whom, on what terms…" : "Resolution summary…"} /></div>}
        {!ada.tracked && canEdit && <div style={{ marginTop: 12 }}><Btn variant="secondary" small onClick={() => actions.recordAdaStep(caseData.id, "tracked", "", viewer.name)}><Accessibility size={13} /> Open ADA tracker for this case</Btn></div>}
        {ada.complete && <div style={{ marginTop: 12, color: S.green, fontSize: 12.5, fontWeight: 600 }}>✓ Interactive process documented through resolution.</div>}
        <p style={{ marginTop: 14, fontSize: 11, color: S.text3, lineHeight: 1.5, background: "rgba(185,117,9,.06)", border: "1px solid rgba(185,117,9,.2)", borderRadius: 8, padding: 10 }}>⚠ Documentation aid only — the interactive process itself is a conversation. Involve counsel on accommodation denials.</p>
      </div>}
      {tab === "rtw" && <div>
        <p style={{ color: S.text2, fontSize: 12.5, margin: "0 0 12px", lineHeight: 1.5 }}>Pre-return checklist. {caseData.end_date ? `Scheduled return: ${formatDate(caseData.end_date)} (${daysUntil(caseData.end_date)}d).` : "No return date on file."}</p>
        {ffd.blocked && <div style={{ background: "rgba(239,51,64,.07)", border: "1px solid rgba(239,51,64,.3)", borderRadius: 10, padding: 12, marginBottom: 12, color: S.red, fontSize: 12.5, fontWeight: 600 }}>⚠ Return is within 14 days and fitness-for-duty is not cleared — resolve before the return date.</div>}
        {ffd.waived ? <div style={{ color: S.text2, fontSize: 13, padding: "8px 0" }}>FFD certification waived for this case.{canEdit && <Btn variant="secondary" small style={{ marginLeft: 10 }} onClick={() => actions.updateFfd(caseData.id, { required: true }, viewer.name)}>Require instead</Btn>}</div> : <>
          {caseData.ffd?.required == null && canEdit && <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <Btn variant="primary" small onClick={() => actions.updateFfd(caseData.id, { required: true }, viewer.name)}>FFD required</Btn>
            <Btn variant="secondary" small onClick={() => actions.updateFfd(caseData.id, { required: false }, viewer.name)}>Waive (not required)</Btn>
          </div>}
          {ffd.steps.map((s, i) => { const isNext = ffd.nextStep === s.id; const act = { requested: () => actions.updateFfd(caseData.id, { requested_at: new Date().toISOString().slice(0, 10) }, viewer.name), received: () => actions.updateFfd(caseData.id, { received_at: new Date().toISOString().slice(0, 10) }, viewer.name), cleared: () => actions.updateFfd(caseData.id, { cleared_at: new Date().toISOString().slice(0, 10) }, viewer.name) }[s.id]; return <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderBottom: "1px solid rgba(0,75,135,.05)" }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, background: s.done ? "rgba(30,125,63,.15)" : isNext ? "rgba(14,124,134,.15)" : "rgba(0,75,135,.05)", color: s.done ? S.green : isNext ? S.teal : S.text3 }}>{s.done ? "✓" : i + 1}</span>
            <div style={{ flex: 1 }}><div style={{ color: s.done || isNext ? S.text : S.text3, fontSize: 13, fontWeight: s.done || isNext ? 600 : 400 }}>{s.label}</div>{s.date && <div style={{ color: S.text3, fontSize: 11.5 }}>{s.date}</div>}</div>
            {isNext && s.id !== "required" && canEdit && act && <Btn variant="primary" small onClick={act}>Mark done</Btn>}
          </div>; })}
          {ffd.complete && ffd.steps.length > 0 && <div style={{ marginTop: 12, color: S.green, fontSize: 12.5, fontWeight: 600 }}>✓ Cleared to return — checklist complete and audited.</div>}
        </>}
      </div>}
      {tab === "docs" && <div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <Select value={docCat} onChange={(e) => setDocCat(e.target.value)} style={{ minWidth: 200 }}>{DOC_CATEGORIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</Select>
          {canEdit && <Btn variant="primary" small onClick={() => docFileRef.current?.click()}><UploadCloud size={13} /> Upload</Btn>}
          <input ref={docFileRef} type="file" style={{ display: "none" }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) { await actions.uploadDocument(caseData.id, f, { category: docCat, uploaded_role: "hr", actor: viewer.name }); } e.target.value = ""; }} />
          {packets.filter((p) => p.active !== false).length > 0 && canEdit && <span style={{ display: "inline-flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
            <Select value={pktId} onChange={(e) => setPktId(e.target.value)} style={{ minWidth: 170 }}><option value="">Generate packet…</option>{packets.filter((p) => p.active !== false).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Btn variant="secondary" small disabled={!pktId} onClick={async () => {
              const def = packets.find((p) => String(p.id) === String(pktId)); if (!def) return;
              try {
                const { doc, filename, sections } = buildPacketPDF({ packetDef: def, templates, caseData, employee: emp, entity });
                doc.save(filename);
                actions.attachDocument(caseData.id, { title: def.name, letterType: "packet", filename }, viewer.name);
                actions.pushAudit({ case_id: caseData.id, case_ref: caseData.ref, employee_id: caseData.employee_id, action: `Packet generated: ${def.name} (${sections} sections) — ${filename}`, changed_by: viewer.name });
              } catch (err) { actions.pushAudit({ case_id: caseData.id, case_ref: caseData.ref, action: `Packet generation failed: ${err.message}`, changed_by: viewer.name }); }
            }}><Layers size={12} /> Build</Btn>
          </span>}
        </div>
        {caseDocs.length === 0 && <p style={{ color: S.text3, fontSize: 12.5 }}>No documents in this case's repository yet. Employee uploads (portal) and HR uploads both land here.</p>}
        {caseDocs.map((d) => {
          const st = DOC_STATUSES.find((s) => s.id === d.status) || { label: d.status, color: S.text3 };
          const catLabel = DOC_CATEGORIES.find((x) => x.id === d.category)?.label || d.category;
          const prior = d.replaces_id ? caseDocs.find((x) => x.id === d.replaces_id) : null;
          return <div key={d.id} style={{ border: `1px solid ${S.border}`, borderRadius: 10, padding: "11px 13px", marginBottom: 9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <Paperclip size={13} color={S.text3} />
              <span style={{ color: S.text, fontSize: 13, fontWeight: 700 }}>{d.filename}</span>
              {d.version > 1 && <span style={{ color: S.text3, fontSize: 11 }}>v{d.version}{prior ? ` (replaces ${prior.filename})` : ""}</span>}
              <Badge label={catLabel} />
              <span style={{ color: st.color, background: `${st.color}1a`, border: `1px solid ${st.color}40`, borderRadius: RADIUS.pill, padding: "2px 9px", fontSize: 10.5, fontWeight: 800 }}>{st.label}</span>
              <span style={{ color: S.text3, fontSize: 11, marginLeft: "auto" }}>{String(d.uploaded_at).slice(0, 10)} · {d.uploaded_by} ({d.uploaded_role})</span>
            </div>
            {d.review_notes && <div style={{ color: S.text2, fontSize: 12, marginTop: 6 }}>Review: {d.review_notes}{d.reviewed_by ? <span style={{ color: S.text3 }}> — {d.reviewed_by}, {String(d.reviewed_at || "").slice(0, 10)}</span> : null}</div>}
            {d.storage_note && <div style={{ color: S.amber, fontSize: 11, marginTop: 4 }}>{d.storage_note}</div>}
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              {d.esign_status && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 800, borderRadius: RADIUS.pill, padding: "3px 10px", color: d.esign_status === "delivered" ? S.green : d.esign_status === "signed" ? S.teal : d.esign_status === "pending_hr_signature" ? S.amber : S.text3, background: "rgba(0,75,135,.05)", border: `1px solid ${S.border2}` }}><PenLine size={10} /> {d.esign_status.replace(/_/g, " ").toUpperCase()}{d.signed_by ? ` · ${d.signed_by}` : ""}</span>}
              {d.storage_path && <Btn variant="secondary" small onClick={async () => { const url = await getStorage(demo, null).getDataUrl(d.storage_path); if (url) { const a = document.createElement("a"); a.href = url; a.download = d.filename; a.click(); } }}><Download size={11} /> Download</Btn>}
              {canEdit && d.esign_status === "generated" && <Btn variant="secondary" small onClick={() => actions.esignAdvance(d.id, viewer.name)}>Route for signature</Btn>}
              {canEdit && d.esign_status === "pending_hr_signature" && <Btn variant="primary" small onClick={async () => { await actions.esignAdvance(d.id, viewer.name); await actions.esignAdvance(d.id, viewer.name); }}><PenLine size={11} /> Sign & Send</Btn>}
              {canEdit && !d.esign_status && reviewFor !== d.id && <Btn variant="secondary" small onClick={() => { setReviewFor(d.id); setReviewNotes(d.review_notes || ""); }}>Review</Btn>}
            </div>
            {reviewFor === d.id && canEdit && <div style={{ marginTop: 9, background: "rgba(0,75,135,.025)", borderRadius: 8, padding: 10 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <Input value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Review notes (visible to the employee for incomplete / needs-info)" style={{ flex: 1, boxSizing: "border-box" }} />
                <Btn variant="secondary" small disabled={aiBusy} onClick={async () => { setAiBusy(true); const r = await draftCommunication({ type: "review_feedback", caseCtx: caseContextBlock({ caseData, employee: emp, entity }), instructions: reviewNotes.trim() }); setReviewNotes(r.text); setAiBusy(false); }}><Sparkles size={11} /> AI Draft</Btn>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {DOC_STATUSES.map((s) => <Btn key={s.id} variant="secondary" small onClick={async () => { await actions.reviewDocument(d.id, { status: s.id, review_notes: reviewNotes }, viewer.name); setReviewFor(null); }} style={{ borderColor: `${s.color}55`, color: s.color }}>{s.label}</Btn>)}
                <button onClick={() => setReviewFor(null)} style={{ background: "none", border: "none", color: S.text3, fontSize: 12, cursor: "pointer" }}>cancel</button>
              </div>
            </div>}
          </div>;
        })}
        {isLegalViewer && <div style={{ marginTop: 14, borderTop: `1px solid ${S.border}`, paddingTop: 12 }}>
          <p style={{ color: S.text2, fontSize: 11.5, fontWeight: 700, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: ".05em" }}><Gavel size={12} style={{ verticalAlign: -2 }} /> Legal-ready export</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn variant="secondary" small onClick={() => { const { doc, filename } = buildDefenseBinder({ caseData, employee: emp, entity, certifications, intermittentLog, auditEvents, documents, messages }); doc.save(filename); actions.pushAudit({ case_id: caseData.id, case_ref: caseData.ref, employee_id: caseData.employee_id, action: `Defense binder exported (PDF) — ${filename}`, changed_by: viewer.name }); }}><Download size={12} /> Defense binder (PDF)</Btn>
            <Btn variant="secondary" small onClick={async () => { const { blob, filename } = await buildDefenseZip({ caseData, employee: emp, entity, certifications, intermittentLog, auditEvents, documents, messages }, getStorage(demo, null)); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href); actions.pushAudit({ case_id: caseData.id, case_ref: caseData.ref, employee_id: caseData.employee_id, action: `Defense packet exported (ZIP: binder + documents + audit CSV) — ${filename}`, changed_by: viewer.name }); }}><Download size={12} /> Full packet (ZIP)</Btn>
          </div>
          <p style={{ color: S.text3, fontSize: 10.5, margin: "8px 0 0", lineHeight: 1.5 }}>Lettered exhibits A–F: summary & designation timeline, compliance calculations with methodology, document inventory, communications, generated notices, chronological audit trail. Export itself writes to the audit log.</p>
        </div>}
      </div>}
      {tab === "messages" && <div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
          {caseMsgs.length === 0 && <p style={{ color: S.text3, fontSize: 12.5, margin: 0 }}>No messages on this case. The thread is shared with the employee's portal.</p>}
          {caseMsgs.map((m) => <div key={m.id} style={{ alignSelf: m.sender_role === "hr" ? "flex-end" : "flex-start", maxWidth: "80%" }}>
            <div style={{ background: m.sender_role === "hr" ? "rgba(0,75,135,.18)" : "rgba(0,75,135,.06)", border: `1px solid ${m.sender_role === "hr" ? "rgba(0,75,135,.35)" : S.border}`, borderRadius: 12, padding: "9px 13px", color: S.text, fontSize: 13, lineHeight: 1.5 }}>{m.body}</div>
            <div style={{ color: S.text3, fontSize: 10.5, marginTop: 3, textAlign: m.sender_role === "hr" ? "right" : "left" }}>{m.sender_name} · {String(m.created_at).slice(0, 16).replace("T", " ")}{m.read_at ? " · read" : ""}</div>
          </div>)}
        </div>
        {canEdit && <div style={{ marginTop: 12 }}>
          {aiDraftNote && <div style={{ color: "#1565a8", fontSize: 11, marginBottom: 6 }}><Sparkles size={11} style={{ verticalAlign: -2 }} /> {aiDraftNote} — edit freely below; nothing sends until you click Send.</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <textarea value={msgBody} onChange={(e) => setMsgBody(e.target.value)} placeholder={`Message ${emp?.name?.split(" ")[0] || "the employee"}… (appears in their portal)`} rows={aiDraftNote ? 4 : 2} style={{ flex: 1, background: "rgba(0,75,135,.05)", border: `1px solid ${S.border}`, borderRadius: 10, padding: "9px 13px", color: S.text, fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignSelf: "flex-end" }}>
              <Btn variant="secondary" small disabled={aiBusy} onClick={async () => { setAiBusy(true); const r = await draftCommunication({ type: "message", caseCtx: caseContextBlock({ caseData, employee: emp, entity }), instructions: msgBody.trim() }); setMsgBody(r.text); setAiDraftNote(r.source === "ai" ? "AI draft" : "Offline draft (AI unavailable)"); setAiBusy(false); }}><Sparkles size={12} /> {aiBusy ? "Drafting…" : "AI Draft"}</Btn>
              <Btn variant="primary" small onClick={async () => { if (!msgBody.trim()) return; await actions.sendMessage(caseData.id, msgBody.trim(), { sender_role: "hr", sender_name: viewer.name }); actions.markMessagesRead(caseData.id, "hr"); setMsgBody(""); setAiDraftNote(""); }}>Send</Btn>
            </div>
          </div>
        </div>}
        <p style={{ color: S.text3, fontSize: 10.5, margin: "8px 0 0" }}>Message bodies stay case-scoped; the audit trail records send events (sender, time) without content.</p>
      </div>}
      {tab === "risk" && <div><div style={{ textAlign: "center", padding: "18px 0" }}><RiskDot risk={risk} /><span style={{ fontSize: 22, fontWeight: 800, color: { High: S.red, Moderate: S.amber, Low: S.green }[risk] }}>{risk} Risk</span></div><Row label="Priority weighting" value={caseData.priority} /><Row label="Hours usage" value={`${usagePct}%`} /><Row label="Leave duration" value={`${durationWks} weeks`} /><Row label="Intermittent" value={caseData.intermittent ? "Yes (+complexity)" : "No"} /></div>}
      {tab === "audit" && <div>{(caseData.audit || []).map((a, i) => <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(0,75,135,.05)" }}><div style={{ color: S.indigoL, fontSize: 12, fontWeight: 600, minWidth: 86 }}>{a.date}</div><div><div style={{ color: S.text, fontSize: 13 }}>{a.action}</div><div style={{ color: S.text3, fontSize: 11 }}>by {a.user}{a.source === "import" ? " · import" : ""}</div></div></div>)}</div>}
    </motion.div>
  </motion.div>;
}

function CaseManagement({ cases, employees, lang, viewer, onToast, perms, focusRef }) {
  const t = T[lang];
  const { actions } = useData();
  const [search, setSearch] = useState(""); const [statusF, setStatusF] = useState("All"); const [typeF, setTypeF] = useState("All"); const [prioF, setPrioF] = useState("All");
  useEffect(() => { if (focusRef?.ref) { setSearch(focusRef.ref); setStatusF("All"); setTypeF("All"); setPrioF("All"); } }, [focusRef?.ts]);
  const [showCreate, setShowCreate] = useState(false); const [selCaseId, setSelCaseId] = useState(null);
  const empById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const empName = (c) => empById[c.employee_id]?.name || "—";
  const selCase = useMemo(() => cases.find((c) => c.id === selCaseId) || null, [cases, selCaseId]);
  const filtered = useMemo(() => { const q = search.toLowerCase(); return cases.filter((c) => { const e = empById[c.employee_id]; const ty = c.type || "Unassigned"; return (!q || e?.name.toLowerCase().includes(q) || (c.ref || "").toLowerCase().includes(q) || ty.toLowerCase().includes(q) || (c.owner || "").toLowerCase().includes(q) || (c.file_number || "").includes(q) || String(c.employee_id) === q || (e?.adp_associate_id || "").toLowerCase().includes(q)) && (statusF === "All" || c.status === statusF) && (typeF === "All" || ty === typeF) && (prioF === "All" || c.priority === prioF); }); }, [cases, empById, search, statusF, typeF, prioF]);
  const typeOpts = useMemo(() => Array.from(new Set(cases.map((c) => c.type || "Unassigned"))).sort(), [cases]);
  const filtersOn = search || statusF !== "All" || typeF !== "All" || prioF !== "All";
  const clearF = () => { setSearch(""); setStatusF("All"); setTypeF("All"); setPrioF("All"); };
  const handleSave = async (form) => { try { const nc = await actions.createCase(form, viewer.name); setShowCreate(false); onToast?.({ type: "success", message: `Case ${nc?.ref || ""} created` }); } catch (e) { onToast?.({ type: "error", message: e.message }); } };
  const expRows = (rows) => exportCSV("leaveiq_cases.csv", [{ label: "Reference", value: "ref" }, { label: "File #", value: "file_number" }, { label: "Employee", value: (c) => empName(c) }, { label: "Entity", value: "entity_code" }, { label: "Type", value: (c) => c.type || "Unassigned" }, { label: "Concurrent clocks", value: (c) => (c.concurrent_clocks || []).join("+") }, { label: "Status", value: "status" }, { label: "Priority", value: "priority" }, { label: "Risk", value: (c) => computeRisk(c) }, { label: "Used hours", value: "used_hours" }, { label: "Total hours", value: "total_hours" }, { label: "Start", value: "start_date" }, { label: "End", value: "end_date" }, { label: "Assignee", value: "owner" }], rows);
  const fctl = { minWidth: 130 };
  function CertChip({ c }) { if (c.cert_received) return <span style={{ color: S.green, fontSize: 12, fontWeight: 600 }}>✓ Received</span>; const d = daysUntil(c.cert_due); const col = d < 0 ? S.red : d <= 3 ? S.amber : S.text2; return <span style={{ color: col, fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: col }} />{d < 0 ? `Overdue ${-d}d` : d === 0 ? "Due today" : `Due in ${d}d`}</span>; }
  function UsageCell({ c }) { if (!c.total_hours) return <span style={{ color: S.text3, fontSize: 11.5 }}>{c.type ? "—" : "Clocks idle"}</span>; const p = pct(c.used_hours, c.total_hours); const col = p > 80 ? S.red : p > 50 ? S.amber : S.green; return <div style={{ minWidth: 92 }}><div style={{ background: "rgba(0,75,135,.07)", borderRadius: 6, height: 6, overflow: "hidden" }}><div style={{ width: `${p}%`, height: "100%", background: col }} /></div><div style={{ color: S.text3, fontSize: 11, marginTop: 4 }}>{c.used_hours}/{c.total_hours}h · {p}%</div></div>; }
  const cols = [
    { key: "ref", header: "Case", sortable: true, width: 132, render: (c) => <div><div style={{ color: S.indigoL, fontWeight: 700, fontSize: 12.5, display: "flex", alignItems: "center", gap: 5 }}>{c.ref || `#${c.id}`}{c.payroll_flag && !c.payroll_flag.acknowledged && <Banknote size={12} color={S.teal} title="Payroll coordination pending" />}</div><div style={{ marginTop: 4, display: "flex", gap: 4 }}><Badge label={c.type || "Unassigned"} /></div></div> },
    { key: "employee", header: "Employee", sortable: true, sortValue: (c) => empName(c), render: (c) => <AvatarLabel name={empName(c)} sub={`${c.entity_code} · ${empById[c.employee_id]?.dept || ""}`} /> },
    { key: "status", header: "Status", sortable: true, render: (c) => <Badge label={c.status} /> },
    { key: "clocks", header: "Clocks", render: (c) => <span style={{ color: S.text2, fontSize: 11.5, whiteSpace: "nowrap" }}>{(c.concurrent_clocks || []).join(" + ") || "—"}</span> },
    { key: "risk", header: "Risk", sortable: true, sortValue: (c) => RISK_RANK[computeRisk(c)], render: (c) => { const r = computeRisk(c); return <span style={{ whiteSpace: "nowrap" }}><RiskDot risk={r} /><Badge label={r} /></span>; } },
    { key: "usage", header: "Hours", sortable: true, sortValue: (c) => pct(c.used_hours, c.total_hours), render: (c) => <UsageCell c={c} /> },
    { key: "cert", header: "Certification", sortable: true, sortValue: (c) => c.cert_received ? 9999 : daysUntil(c.cert_due), render: (c) => <CertChip c={c} /> },
    { key: "owner", header: "Assignee", sortable: true, render: (c) => <span style={{ display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}><Avatar name={c.owner} size={24} /><span style={{ color: S.text2, fontSize: 12.5 }}>{c.owner}</span></span> },
    { key: "updated_at", header: "Updated", sortable: true, align: "right", sortValue: (c) => new Date(c.updated_at || c.start_date).getTime(), render: (c) => <span style={{ color: S.text3, fontSize: 12 }}>{relativeTime(c.updated_at || c.start_date)}</span> },
    { key: "act", header: "", align: "right", render: (c) => <Btn variant="secondary" small onClick={() => setSelCaseId(c.id)}>{t.viewDetails}</Btn> },
  ];
  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
    <PageHeader title={t.cases} subtitle={`${filtered.length} of ${cases.length} cases`} breadcrumb={["Management", t.cases]} actions={<>{perms.exportData ? <Btn variant="secondary" small onClick={() => expRows(filtered)}><Download size={13} /> Export</Btn> : null}{perms.createCase ? <Btn variant="primary" small onClick={() => setShowCreate(true)}><Plus size={14} /> {t.createCase}</Btn> : null}</>} />
    <div style={{ display: "flex", gap: 9, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ position: "relative", flex: 1, minWidth: 220 }}><Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: S.text3, pointerEvents: "none" }} /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, file #, reference, type, assignee…" style={{ paddingLeft: 32 }} /></div>
      <Select value={statusF} onChange={(e) => setStatusF(e.target.value)} style={fctl}>{["All", "Active", "Pending", "Approved", "Denied", "Closed"].map((s) => <option key={s} value={s}>{s === "All" ? "All statuses" : s}</option>)}</Select>
      <Select value={typeF} onChange={(e) => setTypeF(e.target.value)} style={fctl}><option value="All">All types</option>{typeOpts.map((tp) => <option key={tp} value={tp}>{tp}</option>)}</Select>
      <Select value={prioF} onChange={(e) => setPrioF(e.target.value)} style={fctl}>{["All", "High", "Medium", "Low"].map((p) => <option key={p} value={p}>{p === "All" ? "All priorities" : p}</option>)}</Select>
      {filtersOn && <button onClick={clearF} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: `1px solid ${S.border2}`, color: S.text3, borderRadius: RADIUS.sm, padding: "9px 12px", fontSize: 12, cursor: "pointer" }}><X size={12} /> Clear</button>}
    </div>
    <DataTable columns={cols} rows={filtered} getRowId={(c) => c.id} initialSort={{ key: "updated_at", dir: "desc" }} pageSize={10} selectable={!!perms.bulkActions} onRowClick={(c) => setSelCaseId(c.id)} emptyMessage={filtersOn ? "No cases match these filters" : "No cases yet"} renderBulkActions={(rows, clear) => <>{perms.exportData && <Btn variant="secondary" small onClick={() => expRows(rows)}><Download size={12} /> Export {rows.length}</Btn>}<Btn variant="success" small onClick={() => { onToast?.({ type: "success", message: `${rows.length} case(s) marked reviewed` }); clear(); }}><CheckCheck size={12} /> Mark reviewed</Btn></>} />
    <AnimatePresence>{showCreate && <CreateCaseModal employees={employees} onClose={() => setShowCreate(false)} onSave={handleSave} lang={lang} />}</AnimatePresence>
    <AnimatePresence>{selCase && <CaseDetailPanel caseData={selCase} onClose={() => setSelCaseId(null)} lang={lang} viewer={viewer} canViewNotes={!!perms.viewMedicalNotes} canEdit={!!perms.editCase} />}</AnimatePresence>
  </motion.div>;
}

/* ─────────────────── ANALYTICS ─────────────────── */
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function AnalyticsPage({ cases, employees, lang }) {
  const t = T[lang];
  const empById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const byType = useMemo(() => { const a = {}; cases.forEach((c) => (a[c.type || "Unassigned"] = (a[c.type || "Unassigned"] || 0) + 1)); return Object.entries(a).map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count); }, [cases]);
  const byStatus = useMemo(() => { const a = {}; cases.forEach((c) => (a[c.status] = (a[c.status] || 0) + 1)); return Object.entries(a).map(([name, value]) => ({ name, value })); }, [cases]);
  const byDept = useMemo(() => { const a = {}; cases.forEach((c) => { const e = empById[c.employee_id]; if (e) a[e.dept] = (a[e.dept] || 0) + 1; }); return Object.entries(a).map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count); }, [cases, empById]);
  const riskDist = useMemo(() => { const a = { High: 0, Moderate: 0, Low: 0 }; cases.forEach((c) => (a[computeRisk(c)] += 1)); return Object.entries(a).map(([name, value]) => ({ name, value })); }, [cases]);
  const monthly = useMemo(() => { const now = NOW(); return Array.from({ length: 6 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1); const mo = d.getMonth(), yr = d.getFullYear(); const inM = cases.filter((c) => { const s = new Date(c.start_date); return s.getMonth() === mo && s.getFullYear() === yr; }); return { name: MONTHS_SHORT[mo], total: inM.length, open: inM.filter((c) => OPEN_ST.includes(c.status)).length }; }); }, [cases]);
  const cd = { background: S.card, border: `1px solid ${S.border2}`, borderRadius: RADIUS.lg, padding: 20 };
  const cap = { color: S.text2, fontSize: 12, fontWeight: 700, margin: "0 0 16px", letterSpacing: ".05em", textTransform: "uppercase" };
  if (cases.length === 0) return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}><PageHeader title={t.analytics} breadcrumb={["Insights", t.analytics]} /><Card><EmptyState msg={t.noData} /></Card></motion.div>;
  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
    <PageHeader title={t.analytics} subtitle={`Leave trends across ${cases.length} cases`} breadcrumb={["Insights", t.analytics]} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
      <div style={cd}><p style={cap}>{t.byType}</p><ResponsiveContainer width="100%" height={220}><BarChart data={byType} margin={{ left: -18 }}><CartesianGrid strokeDasharray="3 3" stroke="rgba(0,75,135,.05)" /><XAxis dataKey="name" tick={{ fill: S.text3, fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: S.text3, fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip content={<CTooltip />} /><Bar dataKey="count" fill={S.indigo} radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>
      <div style={cd}><p style={cap}>{t.status}</p><ResponsiveContainer width="100%" height={220}><PieChart><Pie data={byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>{byStatus.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="transparent" />)}</Pie><Tooltip content={<CTooltip />} /><Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: S.text2, fontSize: 11 }}>{v}</span>} /></PieChart></ResponsiveContainer></div>
      <div style={cd}><p style={cap}>{t.byDept}</p><ResponsiveContainer width="100%" height={220}><BarChart data={byDept} layout="vertical" margin={{ left: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="rgba(0,75,135,.05)" /><XAxis type="number" tick={{ fill: S.text3, fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={110} tick={{ fill: S.text3, fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip content={<CTooltip />} /><Bar dataKey="count" fill={S.teal} radius={[0, 5, 5, 0]} barSize={16} /></BarChart></ResponsiveContainer></div>
      <div style={cd}><p style={cap}>Risk distribution</p><ResponsiveContainer width="100%" height={220}><PieChart><Pie data={riskDist} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80}>{riskDist.map((e, i) => <Cell key={i} fill={{ High: S.red, Moderate: S.amber, Low: S.green }[e.name]} stroke="transparent" />)}</Pie><Tooltip content={<CTooltip />} /><Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: S.text2, fontSize: 11 }}>{v}</span>} /></PieChart></ResponsiveContainer></div>
    </div>
    <div style={cd}><p style={cap}>{t.leaveTrends} (last 6 months)</p><ResponsiveContainer width="100%" height={240}><LineChart data={monthly}><CartesianGrid strokeDasharray="3 3" stroke="rgba(0,75,135,.05)" /><XAxis dataKey="name" tick={{ fill: S.text3, fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: S.text3, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip content={<CTooltip />} /><Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: S.text2, fontSize: 11 }}>{v}</span>} /><Line type="monotone" dataKey="total" name="New cases" stroke={S.indigo} strokeWidth={2.5} dot={{ r: 3 }} /><Line type="monotone" dataKey="open" name="Active/Pending" stroke={S.teal} strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div>
  </motion.div>;
}

/* ─────────────────── LAW MAP ─────────────────── */
/* ─────────────────── DOCUMENTS ─────────────────── */
function DocumentGenerator({ cases, employees, lang, viewer, onToast }) {
  const t = T[lang];
  const { entities, packets, templates, actions } = useData();
  const [caseId, setCaseId] = useState(cases[0]?.id ? String(cases[0].id) : "");
  const [letterType, setLetterType] = useState("company_notice");
  const [genPktId, setGenPktId] = useState("");
  const [formId, setFormId] = useState("WH-381");
  const [aiNotice, setAiNotice] = useState({ instructions: "", body: "", busy: false, source: null });
  const [lLang, setLLang] = useState(lang);
  const caseData = useMemo(() => cases.find((c) => String(c.id) === String(caseId)) || null, [cases, caseId]);
  const employee = caseData ? employees.find((e) => e.id === caseData.employee_id) : null;
  const entity = caseData ? entities.find((x) => x.id === caseData.entity_id || x.code === caseData.entity_code) : null;
  const letter = useMemo(() => caseData ? generateLetter({ letterType, language: lLang, caseData, employee, entity }) : null, [caseData, employee, entity, letterType, lLang]);
  const handleDL = () => { if (!letter) return; const ok = generatePDF(letter); if (ok && caseData) actions.attachDocument(caseData.id, { title: letter.title, language: lLang, letterType, filename: letter.filename }, viewer.name); onToast?.(ok ? { type: "success", message: `Saved ${letter.filename} — attached to ${caseData.ref}` } : { type: "error", message: "PDF generation failed" }); };
  if (cases.length === 0) return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}><PageHeader title={t.documents} breadcrumb={["Management", t.documents]} /><Card><EmptyState msg="Create a case first to generate documents" /></Card></motion.div>;
  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
    <PageHeader title={t.documents} subtitle="Entity-branded leave letters and compliance notices · EN + ES" breadcrumb={["Management", t.documents]} />
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
      <Card>
        <p style={{ color: S.text2, fontSize: 12, fontWeight: 700, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: ".06em" }}>Options</p>
        <label style={{ color: S.text3, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>Case</label>
        <Select value={caseId} onChange={(e) => setCaseId(e.target.value)} style={{ width: "100%", marginBottom: 14 }}>{cases.map((c) => { const emp = employees.find((e) => e.id === c.employee_id); return <option key={c.id} value={c.id}>{c.ref} — {emp?.name || "—"} ({c.type || "Unassigned"})</option>; })}</Select>
        <label style={{ color: S.text3, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>Letter type</label>
        <Select value={letterType} onChange={(e) => setLetterType(e.target.value)} style={{ width: "100%", marginBottom: 14 }}>{LETTER_TYPES.map((lt) => <option key={lt.id} value={lt.id}>{lLang === "ES" ? lt.labelES : lt.label}</option>)}</Select>
        <label style={{ color: S.text3, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}>{t.language}</label>
        <Select value={lLang} onChange={(e) => setLLang(e.target.value)} style={{ width: "100%", marginBottom: 18 }}><option value="EN">English</option><option value="ES">Español</option></Select>
        <Btn variant="primary" onClick={handleDL} style={{ width: "100%", justifyContent: "center" }}><Download size={15} /> {t.generatePDF}</Btn>
        <p style={{ color: S.text3, fontSize: 11, lineHeight: 1.5, marginTop: 12, marginBottom: 0 }}>Generated letters attach to the case record and log to the audit trail.</p>
        <div style={{ borderTop: `1px solid ${S.border}`, marginTop: 16, paddingTop: 14 }}>
          <label style={{ color: S.text3, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}><ShieldCheck size={11} style={{ verticalAlign: -1.5 }} /> Federal & California notices (e-sign workflow)</label>
          <Select value={formId} onChange={(e) => setFormId(e.target.value)} style={{ width: "100%", marginBottom: 10 }}>
            {["Federal FMLA", "California", "Accommodation & RTW"].map((g) => <optgroup key={g} label={g}>{FORM_TYPES.filter((f) => f.group === g).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</optgroup>)}
          </Select>
          <Btn variant="primary" disabled={!caseData} onClick={async () => {
            try {
              const meta = await actions.generateFormDocument(Number(caseId), formId, viewer.name);
              onToast?.({ type: "success", message: `${formId} generated → attached to ${caseData.ref} (e-sign: generated)` });
            } catch (err) { onToast?.({ type: "error", message: err.message }); }
          }} style={{ width: "100%", justifyContent: "center" }}><Download size={14} /> Generate & attach</Btn>
          <p style={{ color: S.text3, fontSize: 10.5, lineHeight: 1.5, margin: "8px 0 0" }}>Pre-populated from the case, branded with the employing entity's letterhead and EIN header, auto-attached to the repository. Status starts at <em>generated</em> — route, sign, and deliver from the case's Documents tab; every transition audits.</p>
        </div>
        <div style={{ borderTop: `1px solid ${S.border}`, marginTop: 16, paddingTop: 14 }}>
          <label style={{ color: S.text3, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}><Sparkles size={11} style={{ verticalAlign: -1.5 }} /> Custom notice — AI draft, HR approves</label>
          <Input value={aiNotice.instructions} onChange={(e) => setAiNotice({ ...aiNotice, instructions: e.target.value })} placeholder="What should this notice say? (e.g. confirm extension through July 15)" style={{ width: "100%", boxSizing: "border-box", marginBottom: 8 }} />
          <Btn variant="secondary" disabled={aiNotice.busy || !caseData} onClick={async () => {
            setAiNotice((s) => ({ ...s, busy: true }));
            const emp2 = employees.find((e) => e.id === caseData.employee_id);
            const ent2 = entities.find((e) => e.id === caseData.entity_id || e.code === caseData.entity_code);
            const r = await draftCommunication({ type: "notice", caseCtx: caseContextBlock({ caseData, employee: emp2, entity: ent2 }), instructions: aiNotice.instructions });
            setAiNotice({ instructions: aiNotice.instructions, body: r.text, busy: false, source: r.source });
          }} style={{ width: "100%", justifyContent: "center", marginBottom: 8 }}><Sparkles size={13} /> {aiNotice.busy ? "Drafting…" : "AI Draft"}</Btn>
          {aiNotice.body !== "" && <>
            <div style={{ color: "#1565a8", fontSize: 10.5, marginBottom: 5 }}>{aiNotice.source === "ai" ? "AI draft" : "Offline draft"} — edit before generating; nothing sends automatically.</div>
            <textarea value={aiNotice.body} onChange={(e) => setAiNotice({ ...aiNotice, body: e.target.value })} rows={7} style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,75,135,.05)", border: `1px solid ${S.border}`, borderRadius: 9, padding: "9px 12px", color: S.text, fontSize: 12, fontFamily: "inherit", resize: "vertical", marginBottom: 8 }} />
            <Btn variant="primary" onClick={() => {
              const emp2 = employees.find((e) => e.id === caseData.employee_id);
              const ent2 = entities.find((e) => e.id === caseData.entity_id || e.code === caseData.entity_code);
              const { doc, filename } = buildCustomNoticePDF({ title: "Leave Notice", bodyText: aiNotice.body, caseData, employee: emp2, entity: ent2 });
              doc.save(filename);
              actions.attachDocument(caseData.id, { title: "Custom Leave Notice (HR-approved)", letterType: "custom_notice", filename }, viewer.name);
              actions.pushAudit({ case_id: caseData.id, case_ref: caseData.ref, employee_id: caseData.employee_id, action: `Custom notice generated (${aiNotice.source === "ai" ? "AI-drafted" : "offline-drafted"}, HR-approved): ${filename}`, changed_by: viewer.name });
              onToast?.({ type: "success", message: "Custom notice generated and attached" });
            }} style={{ width: "100%", justifyContent: "center" }}><Download size={13} /> Approve & generate PDF</Btn>
          </>}
        </div>
        <div style={{ borderTop: `1px solid ${S.border}`, marginTop: 16, paddingTop: 14 }}>
          <label style={{ color: S.text3, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 }}><Layers size={11} style={{ verticalAlign: -1.5 }} /> Packet (from Document Library)</label>
          <Select value={genPktId} onChange={(e) => setGenPktId(e.target.value)} style={{ width: "100%", marginBottom: 10 }}><option value="">Select packet…</option>{packets.filter((p) => p.active !== false).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <Btn variant="secondary" disabled={!genPktId || !caseData} onClick={() => {
            const def = packets.find((p) => String(p.id) === String(genPktId)); if (!def || !caseData) return;
            try {
              const { doc, filename, sections } = buildPacketPDF({ packetDef: def, templates, caseData, employee, entity });
              doc.save(filename);
              actions.attachDocument(caseData.id, { title: def.name, letterType: "packet", filename }, viewer.name);
              actions.pushAudit({ case_id: caseData.id, case_ref: caseData.ref, employee_id: caseData.employee_id, action: `Packet generated: ${def.name} (${sections} sections) — ${filename}`, changed_by: viewer.name });
              onToast?.({ type: "success", message: `${def.name} generated — ${sections} sections, attached to ${caseData.ref}` });
            } catch (err) { onToast?.({ type: "error", message: err.message }); }
          }} style={{ width: "100%", justifyContent: "center" }}><Layers size={14} /> Generate packet</Btn>
        </div>
      </Card>
      <Card>
        <p style={{ color: S.text2, fontSize: 12, fontWeight: 700, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: ".06em" }}>{t.preview}</p>
        {letter ? <div style={{ background: "#fff", borderRadius: 10, padding: "28px 32px", color: "#1a1a1a", minHeight: 380 }}><div style={{ borderBottom: "2px solid #004B87", paddingBottom: 12, marginBottom: 18 }}><div style={{ fontSize: 11, fontWeight: 700, color: "#004B87", letterSpacing: ".08em" }}>{(letter.entityName || "").toUpperCase()}</div><h3 style={{ margin: "8px 0 2px", fontSize: 18, color: "#111" }}>{letter.title}</h3><div style={{ fontSize: 12, color: "#666" }}>{letter.date}{letter.caseRef ? ` · ${letter.caseRef}` : ""}</div></div><pre style={{ whiteSpace: "pre-wrap", fontFamily: "Georgia,serif", fontSize: 13, lineHeight: 1.6, color: "#222", margin: 0 }}>{letter.body}</pre></div> : <EmptyState msg="Select a case to preview" icon={FileText} />}
      </Card>
    </div>
  </motion.div>;
}

/* ─────────────────── APP SHELL ─────────────────── */
function Shell() {
  const { demo, loading, error, entities, employees, cases, intermittentLog, certifications, actions } = useData();
  const [page, setPage] = useState("dashboard");
  const [lang, setLang] = useState("EN");
  const [role, setRole] = useState(() => loadState("liq_role", "admin"));
  const [entityFilter, setEntityFilter] = useState("All");
  const [caseFocus, setCaseFocus] = useState(null); // {ref, ts} — deep link from briefing/signals
  const [toast, setToast] = useState(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [cmdIndex, setCmdIndex] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const toastTimer = useRef(null);
  useEffect(() => saveState("liq_role", role), [role]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const showToast = useCallback((tn) => { setToast(tn); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 3200); }, []);
  const navigate = useCallback((p) => { setPage(p); setNotifOpen(false); setUserOpen(false); }, []);
  const t = T[lang];
  const perms = useMemo(() => permsFor(role), [role]);
  const viewer = useMemo(() => getViewer(role, employees, cases), [role, employees, cases]);
  const scoped = useMemo(() => applyScope(role, { cases, employees }, viewer, entityFilter), [role, cases, employees, viewer, entityFilter]);
  const vCases = scoped.cases, vEmployees = scoped.employees;
  useEffect(() => { if (!allowedPage(perms, page)) setPage("dashboard"); }, [role]); // eslint-disable-line
  const switchRole = useCallback((id) => { setRole(id); setRoleOpen(false); const r = ROLES.find((x) => x.id === id); showToast({ type: "info", message: `Now viewing as ${r?.label || id}` }); }, [showToast]);
  const navGroups = [
    { section: "Overview", items: [["dashboard", t.dashboard, Home]] },
    { section: "Management", items: [["employees", t.employees, Users], ["cases", t.cases, FileText], ["documents", t.documents, Download], ["library", t.library || "Doc Library", Library]] },
    { section: "Operations", items: [["import", t.importADP, UploadCloud], ["reports", t.reports, ScrollText]] },
    { section: "Insights", items: [["analytics", t.analytics, BarChart2], ["lawmap", t.lawMap, MapPin]] },
    { section: "Governance", items: [["risk", t.riskSignals, ShieldAlert], ["workload", t.workload || "Workload", Gauge], ["entities", t.entities || "Entities", Building2], ["audit", t.audit, ShieldCheck]] },
  ].map((g) => ({ ...g, items: g.items.filter(([k]) => allowedPage(perms, k)) })).filter((g) => g.items.length);
  const navGroupsFinal = role === "employee" ? [{ section: "My Leave", items: [["dashboard", "My Leave Portal", Home]] }] : navGroups;
  const flatNav = navGroupsFinal.flatMap((g) => g.items);
  const activeCaseCount = vCases.filter((c) => c.status === "Active").length;
  const pendingCertCount = vCases.filter((c) => !c.cert_received && c.status !== "Closed" && c.status !== "Denied").length;
  const alerts = useMemo(() => {
    const open = vCases.filter((c) => c.status !== "Closed" && c.status !== "Denied");
    const ov = open.filter((c) => !c.cert_received && daysUntil(c.cert_due) < 0).length;
    const ds = open.filter((c) => !c.cert_received && daysUntil(c.cert_due) >= 0 && daysUntil(c.cert_due) <= 7).length;
    const hi = vCases.filter((c) => c.status === "Active" && computeRisk(c) === "High").length;
    const un = open.filter((c) => !c.type).length;
    const rtw = open.filter((c) => { const d = daysUntil(c.end_date); return d >= 0 && d <= 14; }).length;
    const list = [];
    if (ov) list.push({ icon: FileClock, color: S.red, text: `${ov} certification${ov > 1 ? "s" : ""} overdue` });
    if (ds) list.push({ icon: FileClock, color: S.amber, text: `${ds} certification${ds > 1 ? "s" : ""} due this week` });
    if (un) list.push({ icon: AlertTriangle, color: S.amber, text: `${un} imported case${un > 1 ? "s" : ""} awaiting designation` });
    if (rtw) list.push({ icon: CalendarCheck, color: S.teal, text: `${rtw} return${rtw > 1 ? "s" : ""} to work within 14 days` });
    if (hi) list.push({ icon: AlertTriangle, color: S.red, text: `${hi} high-risk active case${hi > 1 ? "s" : ""}` });
    const pay = open.filter((c) => c.payroll_flag && !c.payroll_flag.acknowledged).length;
    if (pay) list.push({ icon: Banknote, color: S.amber, text: `${pay} payroll coordination flag${pay > 1 ? "s" : ""} unacknowledged` });
    const exh = exhaustionAlerts({ cases: vCases, intermittentLog, withinDays: 60 });
    if (exh.length) {
      const nEmp = new Set(exh.map((x) => x.employee_id)).size;
      list.push({ icon: TrendingDown, color: S.red, text: `${nEmp} employee${nEmp > 1 ? "s" : ""} projected to exhaust FMLA within 60 days — ADA review recommended` });
    }
    const recertDue = open.filter((c) => { const r = nextRecertDue(c, certifications.filter((x) => x.case_id === c.id)); return r && !r.requested && daysUntil(r.due_date) <= 7; }).length;
    if (recertDue) list.push({ icon: FileClock, color: S.amber, text: `${recertDue} recertification${recertDue > 1 ? "s" : ""} due within 7 days` });
    const ffdBlocked = open.filter((c) => ffdStatus(c).blocked).length;
    if (ffdBlocked) list.push({ icon: ClipboardCheck, color: S.red, text: `${ffdBlocked} return${ffdBlocked > 1 ? "s" : ""} within 14 days missing fitness-for-duty clearance` });
    if (pendingCertCount) list.push({ icon: Activity, color: S.indigoL, text: `${pendingCertCount} case${pendingCertCount > 1 ? "s" : ""} awaiting certification` });
    return list;
  }, [vCases, pendingCertCount, intermittentLog, certifications]);
  const commandItems = useMemo(() => [
    ...flatNav.map(([key, label, Icon]) => ({ id: "go-" + key, label: `Go to ${label}`, icon: Icon, action: () => navigate(key) })),
    ...(perms.createCase ? [{ id: "new-case", label: "Create new case", icon: Plus, action: () => navigate("cases") }] : []),
    { id: "lang", label: `Switch language to ${lang === "EN" ? "Español" : "English"}`, icon: Globe, action: () => setLang((l) => l === "EN" ? "ES" : "EN") },
    ...ROLES.map((r) => ({ id: "role-" + r.id, label: `View as ${r.label}`, icon: Eye, action: () => switchRole(r.id) })),
    ...(demo ? [{ id: "reset", label: "Reset demo data", icon: RefreshCw, action: () => { actions.resetDemo(); showToast({ type: "info", message: "Demo data reset to seed" }); } }] : []),
  ], [flatNav, lang, perms, navigate, switchRole, demo, actions, showToast]);
  const cmdList = useMemo(() => { const q = cmdQuery.toLowerCase(); return q ? commandItems.filter((c) => c.label.toLowerCase().includes(q)) : commandItems; }, [commandItems, cmdQuery]);
  const closeCmd = useCallback(() => { setCmdOpen(false); setCmdQuery(""); setCmdIndex(0); }, []);
  const runCmd = useCallback((item) => { if (item) { item.action(); closeCmd(); } }, [closeCmd]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdOpen((o) => !o); setCmdQuery(""); setCmdIndex(0); }
      else if (e.key === "Escape") { closeCmd(); setNotifOpen(false); setUserOpen(false); setRoleOpen(false); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [closeCmd]);
  const renderPage = () => {
    switch (page) {
      case "dashboard": return role === "employee" ? <EmployeePortal viewer={viewer} /> : role === "manager" ? <ManagerDashboard cases={vCases} employees={vEmployees} viewer={viewer} /> : <Dashboard cases={vCases} employees={vEmployees} lang={lang} onNavigate={navigate} entityFilter={entityFilter} viewer={viewer} onFocusCase={(ref) => { setCaseFocus({ ref, ts: Date.now() }); navigate("cases"); }} />;
      case "employees": return <EmployeeDirectory employees={vEmployees} cases={vCases} lang={lang} viewer={viewer} perms={perms} />;
      case "cases": return <CaseManagement focusRef={caseFocus} cases={vCases} employees={vEmployees} lang={lang} viewer={viewer} onToast={showToast} perms={perms} />;
      case "analytics": return <AnalyticsPage cases={vCases} employees={vEmployees} lang={lang} />;
      case "lawmap": return <KnowledgeCenter />;
      case "library": return <DocumentLibrary viewer={viewer} onToast={showToast} />;
      case "documents": return <DocumentGenerator cases={vCases} employees={vEmployees} lang={lang} viewer={viewer} onToast={showToast} />;
      case "import": return <ImportADP viewer={viewer} onToast={showToast} />;
      case "reports": return <Reports entityFilter={entityFilter} onToast={showToast} />;
      case "audit": return <AuditLog entityFilter={entityFilter} onToast={showToast} />;
      case "risk": return <RiskSignals entityFilter={entityFilter} onToast={showToast} />;
      case "workload": return <Workload entityFilter={entityFilter} />;
      case "entities": return <Entities viewer={viewer} onToast={showToast} />;
      default: return null;
    }
  };
  const Chip = ({ label, color, icon: I }) => <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color, background: `${color}1a`, border: `1px solid ${color}33`, borderRadius: RADIUS.pill, padding: "2px 8px" }}>{I && <I size={11} />} {label}</span>;
  const ibtn = { position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 9, border: `1px solid ${S.border2}`, background: "rgba(0,75,135,.035)", color: S.text2, cursor: "pointer" };
  if (loading) return <div style={{ minHeight: "100vh", background: S.bg, display: "flex", alignItems: "center", justifyContent: "center", color: S.text2, fontSize: 14, fontFamily: "Arial,Helvetica,sans-serif" }}>Loading LeaveIQ…</div>;
  return <div style={{ display: "flex", minHeight: "100vh", background: S.bg, color: S.text }}>
    <aside style={{ width: 246, background: S.card, borderRight: `1px solid ${S.border2}`, padding: "20px 14px", position: "sticky", top: 0, height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "2px 6px 16px" }}>
        <img src={AMPAM_LOGO} alt="AMPAM — Mechanical | Electrical | Plumbing" style={{ width: 178, height: "auto", display: "block" }} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 9 }}>
          <span style={{ fontWeight: 800, fontSize: 14.5, color: S.indigo, fontFamily: "Arial,Helvetica,sans-serif", letterSpacing: "-0.01em" }}>{ORG.product}</span>
          <span style={{ fontSize: 10, color: S.text3, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" }}>Leave Operations</span>
        </div>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, overflowY: "auto" }}>
        {navGroups.map((group) => <div key={group.section}>
          <div style={{ fontSize: 10, color: S.text3, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", padding: "0 10px 7px" }}>{group.section}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {group.items.map(([key, label, Icon]) => { const active = page === key; return <button key={key} onClick={() => navigate(key)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 11px", borderRadius: 10, border: "none", cursor: "pointer", background: active ? "rgba(0,75,135,.14)" : "transparent", color: active ? S.indigoL : S.text2, fontSize: 13.5, fontWeight: active ? 700 : 500, transition: "all .15s", position: "relative", textAlign: "left" }} onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(0,75,135,.035)"; }} onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}>{active && <span style={{ position: "absolute", left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, background: S.indigo }} />}<Icon size={17} />{label}{key === "cases" && activeCaseCount > 0 && <span style={{ marginLeft: "auto", background: "rgba(0,75,135,.2)", color: S.indigoL, fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "1px 8px" }}>{activeCaseCount}</span>}</button>; })}
          </div>
        </div>)}
      </nav>
      <div style={{ padding: "0 6px 10px", color: S.text3, fontSize: 10, fontStyle: "italic", letterSpacing: ".01em" }}>{AMPAM_TAGLINE}</div>
      <div style={{ borderTop: `1px solid ${S.border2}`, paddingTop: 12, display: "flex", alignItems: "center", gap: 10 }}><Avatar name={viewer.name} size={34} /><div style={{ minWidth: 0, flex: 1 }}><div style={{ color: S.text, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{viewer.name}</div><div style={{ color: S.text3, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{viewer.roleLabel}</div></div></div>
    </aside>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <header style={{ height: 60, borderBottom: `1px solid ${S.border2}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", background: "rgba(255,255,255,.85)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 60 }}>
        <button onClick={() => { setCmdOpen(true); setCmdQuery(""); setCmdIndex(0); }} style={{ display: "flex", alignItems: "center", gap: 9, background: "rgba(0,75,135,.035)", border: `1px solid ${S.border2}`, borderRadius: 10, padding: "8px 12px", color: S.text3, fontSize: 13, cursor: "pointer", minWidth: 260 }}><Search size={14} /><span style={{ flex: 1, textAlign: "left" }}>Search or jump to…</span><kbd style={{ fontSize: 11, fontFamily: "inherit", color: S.text3, border: `1px solid ${S.border2}`, borderRadius: 5, padding: "1px 6px", background: "rgba(0,75,135,.035)" }}>⌘K</kbd></button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {perms.switchEntity && <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Building2 size={14} color={S.text3} /><Select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} style={{ padding: "7px 10px", fontSize: 12 }}><option value="All">All entities</option>{entities.map((en) => <option key={en.code} value={en.code}>{en.name}</option>)}</Select></div>}
          <span style={{ fontSize: 11, fontWeight: 700, color: demo ? S.amber : S.green, background: demo ? "rgba(185,117,9,.12)" : "rgba(30,125,63,.12)", border: `1px solid ${demo ? "rgba(185,117,9,.3)" : "rgba(30,125,63,.3)"}`, borderRadius: RADIUS.pill, padding: "4px 11px", letterSpacing: ".04em" }}>{demo ? "DEMO" : "PRODUCTION"}</span>
          <div style={{ position: "relative" }}>
            <button onClick={() => { setNotifOpen((o) => !o); setUserOpen(false); setRoleOpen(false); }} style={ibtn}><Bell size={16} />{alerts.length > 0 && <span style={{ position: "absolute", top: 7, right: 8, width: 8, height: 8, borderRadius: "50%", background: S.red, boxShadow: `0 0 0 2px ${S.card}` }} />}</button>
            <AnimatePresence>{notifOpen && <><div onClick={() => setNotifOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 70 }} /><motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} style={{ position: "absolute", right: 0, top: 44, width: 310, background: S.card2, border: `1px solid ${S.border}`, borderRadius: RADIUS.md, boxShadow: ELEV.lg, zIndex: 80, overflow: "hidden" }}><div style={{ padding: "12px 14px", borderBottom: `1px solid ${S.border2}`, fontSize: 13, fontWeight: 700, color: S.text }}>{t.notifications}</div>{alerts.length === 0 ? <div style={{ padding: 18, color: S.text3, fontSize: 13 }}>You're all caught up.</div> : alerts.map((a, i) => <button key={i} onClick={() => navigate("cases")} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 14px", background: "transparent", border: "none", borderBottom: i < alerts.length - 1 ? `1px solid ${S.border2}` : "none", cursor: "pointer", textAlign: "left" }}><a.icon size={15} color={a.color} /><span style={{ color: S.text2, fontSize: 12.5 }}>{a.text}</span></button>)}</motion.div></>}</AnimatePresence>
          </div>
          <button onClick={() => setLang((l) => l === "EN" ? "ES" : "EN")} style={{ ...ibtn, width: "auto", gap: 6, padding: "0 12px" }}><Globe size={14} /><span style={{ fontSize: 12, fontWeight: 600 }}>{lang}</span></button>
          <div style={{ position: "relative" }}>
            <button onClick={() => { setUserOpen((o) => !o); setNotifOpen(false); setRoleOpen(false); }} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "inline-flex" }}><Avatar name={viewer.name} size={36} /></button>
            <AnimatePresence>{userOpen && <><div onClick={() => setUserOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 70 }} /><motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} style={{ position: "absolute", right: 0, top: 46, width: 234, background: S.card2, border: `1px solid ${S.border}`, borderRadius: RADIUS.md, boxShadow: ELEV.lg, zIndex: 80, overflow: "hidden" }}><div style={{ padding: "13px 14px", borderBottom: `1px solid ${S.border2}` }}><div style={{ color: S.text, fontSize: 13.5, fontWeight: 700 }}>{viewer.name}</div><div style={{ color: S.text3, fontSize: 11.5 }}>{viewer.email}</div><div style={{ marginTop: 7 }}><span style={{ fontSize: 10.5, color: S.indigoL, background: "rgba(0,75,135,.14)", borderRadius: RADIUS.pill, padding: "2px 8px", fontWeight: 600 }}>{viewer.roleLabel}</span></div></div>{demo && <button onClick={() => { actions.resetDemo(); setUserOpen(false); showToast({ type: "info", message: "Demo data reset to seed" }); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 14px", background: "transparent", border: "none", color: S.text2, fontSize: 13, cursor: "pointer", textAlign: "left" }}><RefreshCw size={15} /> Reset demo data</button>}{[["Settings", Settings], ["Sign out", LogOut]].map(([label, Icon]) => <button key={label} onClick={() => { setUserOpen(false); showToast({ type: "info", message: demo ? `${label} requires the Supabase backend` : `${label}` }); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 14px", background: "transparent", border: "none", color: S.text2, fontSize: 13, cursor: "pointer", textAlign: "left" }}><Icon size={15} /> {label}</button>)}</motion.div></>}</AnimatePresence>
          </div>
        </div>
      </header>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "9px 24px", background: "rgba(0,75,135,.06)", borderBottom: `1px solid ${S.border2}`, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: S.text2, flexWrap: "wrap" }}><Eye size={14} color={S.indigoL} /><span>Viewing as <strong style={{ color: S.text }}>{viewer.roleLabel}</strong></span><span style={{ color: S.text3 }}>·</span><span style={{ color: S.text3 }}>{scopeSummary(role, viewer, entityFilter)}</span>{!perms.editCase && <Chip label="Read-only" color={S.amber} />}{!perms.viewMedicalNotes && <Chip label="Medical notes hidden" color={S.red} icon={Lock} />}{error && <Chip label={`Backend error: ${error}`} color={S.red} />}</div>
        <div style={{ position: "relative" }}>
          <button onClick={() => { setRoleOpen((o) => !o); setNotifOpen(false); setUserOpen(false); }} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(0,75,135,.05)", border: `1px solid ${S.border2}`, borderRadius: 9, padding: "6px 12px", color: S.text2, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Eye size={13} /> View as <ChevronDown size={13} /></button>
          <AnimatePresence>{roleOpen && <><div onClick={() => setRoleOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 70 }} /><motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} style={{ position: "absolute", right: 0, top: 40, width: 268, background: S.card2, border: `1px solid ${S.border}`, borderRadius: RADIUS.md, boxShadow: ELEV.lg, zIndex: 80, overflow: "hidden" }}><div style={{ padding: "10px 14px", borderBottom: `1px solid ${S.border2}`, fontSize: 11, fontWeight: 700, color: S.text3, textTransform: "uppercase", letterSpacing: ".06em" }}>Switch role{demo ? " (demo)" : ""}</div>{ROLES.map((r) => { const active = r.id === role; return <button key={r.id} onClick={() => switchRole(r.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", background: active ? "rgba(0,75,135,.12)" : "transparent", border: "none", borderBottom: `1px solid ${S.border2}`, cursor: "pointer", textAlign: "left" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: active ? S.indigo : "transparent", border: active ? "none" : `1.5px solid ${S.text3}`, flexShrink: 0 }} /><span style={{ minWidth: 0 }}><span style={{ display: "block", color: active ? S.indigoL : S.text, fontSize: 13, fontWeight: 600 }}>{r.label}</span><span style={{ display: "block", color: S.text3, fontSize: 11 }}>{r.short}</span></span></button>; })}</motion.div></>}</AnimatePresence>
        </div>
      </div>
      <main style={{ padding: 28, flex: 1, maxWidth: 1320, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <AnimatePresence mode="wait"><div key={page + role + entityFilter}>{renderPage()}</div></AnimatePresence>
      </main>
    </div>
    <AnimatePresence>{cmdOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeCmd} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", backdropFilter: "blur(2px)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh" }}>
      <motion.div initial={{ scale: .97, y: -8, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: .97, opacity: 0 }} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: S.card2, border: `1px solid ${S.border}`, borderRadius: RADIUS.lg, boxShadow: ELEV.xl, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: `1px solid ${S.border2}` }}><Search size={16} color={S.text3} /><input autoFocus value={cmdQuery} onChange={(e) => { setCmdQuery(e.target.value); setCmdIndex(0); }} onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setCmdIndex((i) => Math.min(i + 1, cmdList.length - 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setCmdIndex((i) => Math.max(i - 1, 0)); } else if (e.key === "Enter") { e.preventDefault(); runCmd(cmdList[cmdIndex]); } }} placeholder="Type a command or search…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: S.text, fontSize: 15 }} /><kbd style={{ fontSize: 11, color: S.text3, border: `1px solid ${S.border2}`, borderRadius: 5, padding: "1px 6px" }}>esc</kbd></div>
        <div style={{ maxHeight: 340, overflowY: "auto", padding: 6 }}>{cmdList.length === 0 ? <div style={{ padding: 22, textAlign: "center", color: S.text3, fontSize: 13 }}>No matches for "{cmdQuery}"</div> : cmdList.map((item, i) => { const active = i === cmdIndex; const Icon = item.icon; return <button key={item.id} onMouseEnter={() => setCmdIndex(i)} onClick={() => runCmd(item)} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "10px 12px", borderRadius: 9, border: "none", cursor: "pointer", background: active ? "rgba(0,75,135,.16)" : "transparent", color: active ? S.text : S.text2, fontSize: 13.5, textAlign: "left" }}><Icon size={16} color={active ? S.indigoL : S.text3} /><span style={{ flex: 1 }}>{item.label}</span>{active && <CornerDownLeft size={13} color={S.text3} />}</button>; })}</div>
      </motion.div>
    </motion.div>}</AnimatePresence>
    <AnimatePresence>{toast && <Toast toast={toast} />}</AnimatePresence>
  </div>;
}

export default function App() {
  const intakeToken = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("intake") : null;
  return <DataProvider>{intakeToken ? <IntakePortal token={intakeToken} /> : <Shell />}</DataProvider>;
}
