/* Compliance reports: open cases by entity/department/type, certification
 * status, FMLA rolling 12-month usage by employee, intermittent usage detail,
 * and exhaustion projection. Every report exports to CSV and PDF. */
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Download, FileText } from "lucide-react";
import { jsPDF } from "jspdf";
import { S, Card, Btn, Badge, PageHeader, DataTable, exportCSV, daysUntil, pct } from "../ui.jsx";
import { useData } from "../data/DataContext.jsx";
import { rollingWindowUsed, remainingHours, scheduledHoursPerWeek, exhaustionProjection } from "../lib/compliance/engine.js";

const OPEN = ["Active", "Pending", "Approved"];

const REPORTS = [
  ["open", "Open cases"],
  ["certs", "Certification status"],
  ["fmla", "FMLA rolling usage"],
  ["intermittent", "Intermittent detail"],
  ["exhaustion", "Exhaustion projection"],
];

function reportPDF(title, columns, rows, entityLabel) {
  try {
    const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait" });
    const pw = doc.internal.pageSize.getWidth(), m = 14;
    doc.setFillColor(0, 75, 135); doc.rect(0, 0, pw, 16, "F");
    doc.setFillColor(239, 51, 64); doc.rect(0, 16, pw, 1.2, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("AMPAM — LEAVEIQ COMPLIANCE REPORT", m, 10);
    doc.setTextColor(20, 20, 20); doc.setFontSize(13); doc.text(`${title}${entityLabel !== "All" ? ` — ${entityLabel}` : ""}`, m, 26);
    doc.setFontSize(8.5); doc.setTextColor(110, 110, 110); doc.setFont("helvetica", "normal");
    doc.text(`Generated ${new Date().toLocaleString("en-US")} · ${rows.length} rows · Confidential`, m, 32);
    const colW = (pw - m * 2) / columns.length;
    let y = 42;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(60, 60, 60);
    columns.forEach((c, i) => doc.text(String(c.label).slice(0, 22), m + i * colW, y));
    doc.setDrawColor(0, 75, 135); doc.line(m, y + 2, pw - m, y + 2);
    doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30);
    y += 8;
    for (const r of rows) {
      if (y > doc.internal.pageSize.getHeight() - 14) { doc.addPage(); y = 18; }
      columns.forEach((c, i) => { const v = typeof c.value === "function" ? c.value(r) : r[c.value]; doc.text(String(v ?? "").slice(0, Math.floor(colW / 1.7)), m + i * colW, y); });
      y += 6;
    }
    doc.setFontSize(7.2); doc.setTextColor(120, 140, 160); doc.setFont("helvetica", "italic");
    doc.text("AMPAM · Building on a Foundation of Trust", pw / 2, doc.internal.pageSize.getHeight() - 6, { align: "center" });
    doc.save(`${title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.pdf`);
    return true;
  } catch { return false; }
}

export default function Reports({ entityFilter = "All", onToast }) {
  const { cases, employees, intermittentLog } = useData();
  const [tab, setTab] = useState("open");
  const empById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const asOf = new Date();

  const scoped = useMemo(() => entityFilter === "All" ? cases : cases.filter((c) => c.entity_code === entityFilter), [cases, entityFilter]);

  const defs = useMemo(() => {
    const open = scoped.filter((c) => OPEN.includes(c.status));
    const emp = (c) => empById[c.employee_id];

    const openCols = [
      { key: "ref", header: "Case", label: "Case", value: "ref", render: (c) => <span style={{ color: S.indigoL, fontWeight: 700, fontSize: 12.5 }}>{c.ref}</span> },
      { key: "employee", header: "Employee", label: "Employee", value: (c) => emp(c)?.name || "—", render: (c) => <span style={{ color: S.text, fontSize: 13 }}>{emp(c)?.name || "—"}</span> },
      { key: "entity", header: "Entity", label: "Entity", value: "entity_code", render: (c) => <Badge label={c.entity_code} /> },
      { key: "dept", header: "Department", label: "Department", value: (c) => emp(c)?.dept || "—", render: (c) => <span style={{ color: S.text2, fontSize: 12.5 }}>{emp(c)?.dept || "—"}</span> },
      { key: "type", header: "Type", label: "Type", value: (c) => c.type || "Unassigned", render: (c) => <Badge label={c.type || "Unassigned"} /> },
      { key: "status", header: "Status", label: "Status", value: "status", render: (c) => <Badge label={c.status} /> },
      { key: "clocks", header: "Concurrent clocks", label: "Concurrent clocks", value: (c) => (c.concurrent_clocks || []).join("+") || "—", render: (c) => <span style={{ color: S.text2, fontSize: 12 }}>{(c.concurrent_clocks || []).join(" + ") || "—"}</span> },
      { key: "start", header: "Start", label: "Start", value: "start_date", render: (c) => <span style={{ color: S.text3, fontSize: 12 }}>{c.start_date}</span> },
    ];

    const certRows = scoped.filter((c) => c.status !== "Closed" && c.status !== "Denied");
    const certCols = [
      openCols[0], openCols[1], openCols[2],
      { key: "cert", header: "Certification", label: "Certification", value: (c) => c.cert_received ? "Received" : daysUntil(c.cert_due) < 0 ? `Overdue ${-daysUntil(c.cert_due)}d` : `Due in ${daysUntil(c.cert_due)}d`, render: (c) => { if (c.cert_received) return <span style={{ color: S.green, fontSize: 12, fontWeight: 600 }}>✓ Received</span>; const d = daysUntil(c.cert_due); return <span style={{ color: d < 0 ? S.red : d <= 3 ? S.amber : S.text2, fontSize: 12, fontWeight: 600 }}>{d < 0 ? `Overdue ${-d}d` : `Due in ${d}d`}</span>; } },
      { key: "cert_due", header: "Due date", label: "Due date", value: "cert_due", render: (c) => <span style={{ color: S.text3, fontSize: 12 }}>{c.cert_due}</span> },
    ];

    const empIds = new Set(scoped.map((c) => c.employee_id));
    const fmlaRows = employees.filter((e) => empIds.has(e.id)).map((e) => {
      const entries = intermittentLog.filter((l) => l.employee_id === e.id && cases.find((c) => c.id === l.case_id && (c.concurrent_clocks || []).includes("FMLA")));
      const contUsed = cases.filter((c) => c.employee_id === e.id && !c.intermittent && (c.concurrent_clocks || []).includes("FMLA")).reduce((s, c) => s + (c.used_hours || 0), 0);
      const r = remainingHours({ type: "FMLA", hoursPerWeek: scheduledHoursPerWeek(e), entries, asOf });
      const used = Math.min(r.total, r.used + contUsed);
      return { id: e.id, file_number: e.file_number, name: e.name, entity_code: e.entity_code, hpw: scheduledHoursPerWeek(e), total: r.total, used, remaining: Math.max(0, r.total - used) };
    }).sort((a, b) => a.remaining - b.remaining);
    const fmlaCols = [
      { key: "file_number", header: "File #", label: "File #", value: "file_number", render: (r) => <span style={{ color: S.indigoL, fontFamily: "monospace", fontSize: 12 }}>{r.file_number}</span> },
      { key: "name", header: "Employee", label: "Employee", value: "name", render: (r) => <span style={{ color: S.text, fontSize: 13 }}>{r.name}</span> },
      { key: "entity_code", header: "Entity", label: "Entity", value: "entity_code", render: (r) => <Badge label={r.entity_code} /> },
      { key: "hpw", header: "Hrs/wk", label: "Hrs/wk", value: "hpw", align: "right", render: (r) => <span style={{ color: S.text2, fontSize: 12 }}>{r.hpw}</span> },
      { key: "total", header: "Entitlement", label: "Entitlement (h)", value: "total", align: "right", render: (r) => <span style={{ color: S.text2, fontSize: 12 }}>{r.total}</span> },
      { key: "used", header: "Used (rolling 12mo)", label: "Used (h)", value: "used", align: "right", render: (r) => <span style={{ color: S.text2, fontSize: 12 }}>{Math.round(r.used)}</span> },
      { key: "remaining", header: "Remaining", label: "Remaining (h)", value: "remaining", align: "right", sortable: true, render: (r) => <span style={{ color: r.remaining < 80 ? S.red : r.remaining < 200 ? S.amber : S.green, fontWeight: 700, fontSize: 12.5 }}>{Math.round(r.remaining)}</span> },
    ];

    const logScoped = intermittentLog.filter((l) => { const c = cases.find((x) => x.id === l.case_id); return c && (entityFilter === "All" || c.entity_code === entityFilter); });
    const intCols = [
      { key: "file_number", header: "File #", label: "File #", value: "file_number", render: (r) => <span style={{ color: S.indigoL, fontFamily: "monospace", fontSize: 12 }}>{r.file_number}</span> },
      { key: "employee", header: "Employee", label: "Employee", value: (r) => empById[r.employee_id]?.name || "—", render: (r) => <span style={{ color: S.text, fontSize: 13 }}>{empById[r.employee_id]?.name || "—"}</span> },
      { key: "leave_start_date", header: "Leave start (attribution)", label: "Leave start", value: "leave_start_date", render: (r) => <span style={{ color: S.text2, fontSize: 12 }}>{r.leave_start_date}</span> },
      { key: "usage_date", header: "Usage date", label: "Usage date", value: "usage_date", sortable: true, render: (r) => <span style={{ color: S.text2, fontSize: 12 }}>{r.usage_date}</span> },
      { key: "hours_used", header: "Hours", label: "Hours", value: "hours_used", align: "right", render: (r) => <span style={{ color: S.text, fontWeight: 600, fontSize: 12.5 }}>{r.hours_used}</span> },
      { key: "approved_by", header: "Approved by", label: "Approved by", value: "approved_by", render: (r) => <span style={{ color: S.text3, fontSize: 12 }}>{r.approved_by}</span> },
    ];

    const exhRows = open.filter((c) => c.total_hours > 0).map((c) => {
      const remaining = Math.max(0, c.total_hours - c.used_hours);
      const entries = intermittentLog.filter((l) => l.case_id === c.id);
      const proj = c.intermittent ? exhaustionProjection({ remaining, entries, asOf }) : null;
      const usagePct = pct(c.used_hours, c.total_hours);
      return { ...c, remaining, usagePct, proj };
    }).filter((r) => r.usagePct >= 50 || r.proj).sort((a, b) => b.usagePct - a.usagePct);
    const exhCols = [
      openCols[0], openCols[1], openCols[4],
      { key: "usagePct", header: "Used", label: "Used %", value: "usagePct", align: "right", sortable: true, render: (r) => <span style={{ color: r.usagePct > 80 ? S.red : S.amber, fontWeight: 700, fontSize: 12.5 }}>{r.usagePct}%</span> },
      { key: "remaining", header: "Remaining (h)", label: "Remaining (h)", value: "remaining", align: "right", render: (r) => <span style={{ color: S.text2, fontSize: 12 }}>{Math.round(r.remaining)}</span> },
      { key: "proj", header: "Projected exhaustion", label: "Projected exhaustion", value: (r) => r.proj?.projectedDate || "—", render: (r) => r.proj ? <span style={{ color: S.red, fontSize: 12, fontWeight: 600 }}>{r.proj.projectedDate} · {r.proj.burnPerWeek}h/wk</span> : <span style={{ color: S.text3, fontSize: 12 }}>— (no recent intermittent burn)</span> },
    ];

    return {
      open: { title: "Open Cases", rows: open, cols: openCols },
      certs: { title: "Certification Status", rows: certRows, cols: certCols },
      fmla: { title: "FMLA Usage — Rolling 12 Months", rows: fmlaRows, cols: fmlaCols },
      intermittent: { title: "Intermittent Usage Detail", rows: logScoped, cols: intCols },
      exhaustion: { title: "Exhaustion Projection", rows: exhRows, cols: exhCols },
    };
  }, [scoped, employees, cases, intermittentLog, empById, entityFilter]);

  const cur = defs[tab];
  const csvCols = cur.cols.map((c) => ({ label: c.label || c.header, value: c.value }));
  const doCSV = () => { exportCSV(`leaveiq_${tab}_report.csv`, csvCols, cur.rows); onToast?.({ type: "success", message: "CSV exported" }); };
  const doPDF = () => { const ok = reportPDF(cur.title, csvCols, cur.rows, entityFilter); onToast?.(ok ? { type: "success", message: "PDF exported" } : { type: "error", message: "PDF export failed" }); };

  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
    <PageHeader title="Compliance Reports" subtitle={`${cur.rows.length} rows · ${entityFilter === "All" ? "all entities" : entityFilter}`} breadcrumb={["Operations", "Reports"]}
      actions={<><Btn variant="secondary" small onClick={doCSV}><Download size={13} /> CSV</Btn><Btn variant="secondary" small onClick={doPDF}><FileText size={13} /> PDF</Btn></>} />
    <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
      {REPORTS.map(([k, label]) => <button key={k} onClick={() => setTab(k)} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: tab === k ? "1px solid rgba(0,75,135,.5)" : `1px solid ${S.border2}`, background: tab === k ? "rgba(0,75,135,.15)" : "transparent", color: tab === k ? S.indigoL : S.text3 }}>{label}</button>)}
    </div>
    {tab === "fmla" && <Card style={{ marginBottom: 14, padding: 14 }}><p style={{ margin: 0, color: S.text3, fontSize: 12, lineHeight: 1.6 }}>Usage is measured against a <strong style={{ color: S.text2 }}>rolling 12-month window looking backward from today</strong>, keyed to each usage date — intermittent hours age out of the window as time passes. Continuous-leave hours are charged from the case record.</p></Card>}
    <DataTable columns={cur.cols} rows={cur.rows} getRowId={(r) => r.id ?? `${r.file_number}|${r.usage_date ?? ""}`} pageSize={25} emptyMessage="No rows for this report" />
  </motion.div>;
}
