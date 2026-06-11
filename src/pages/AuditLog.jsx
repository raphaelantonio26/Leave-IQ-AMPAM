/* Audit Log — append-only event trail, visible to HR Admin and Legal.
 * Display-only by design: the audit_events table revokes UPDATE/DELETE at the
 * database level (see 0002_rls.sql), so nothing rendered here can be altered
 * by any role, including admins. Export supports legal hold / DOL inquiry. */
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Download, Lock, Search } from "lucide-react";
import { S, Card, Btn, Input, Select, PageHeader, DataTable, exportCSV, Avatar, relativeTime } from "../ui.jsx";
import { useData } from "../data/DataContext.jsx";

export default function AuditLog({ entityFilter = "All", onToast }) {
  const { auditEvents, cases, employees } = useData();
  const [q, setQ] = useState("");
  const [user, setUser] = useState("All");
  const [action, setAction] = useState("All");
  const [src, setSrc] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const caseById = useMemo(() => Object.fromEntries(cases.map((c) => [c.id, c])), [cases]);
  const empById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const users = useMemo(() => Array.from(new Set(auditEvents.map((a) => a.changed_by))).filter(Boolean).sort(), [auditEvents]);
  const actionKinds = useMemo(() => Array.from(new Set(auditEvents.map((a) => (a.action || "").split(":")[0].split(" — ")[0]))).sort(), [auditEvents]);

  const rows = useMemo(() => auditEvents.filter((a) => {
    const c = caseById[a.case_id];
    if (entityFilter !== "All" && c && c.entity_code !== entityFilter) return false;
    if (user !== "All" && a.changed_by !== user) return false;
    if (src !== "All" && (a.source || "web") !== src) return false;
    if (action !== "All" && !(a.action || "").startsWith(action)) return false;
    const d = String(a.changed_at).slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (q) {
      const s = q.toLowerCase();
      const emp = empById[a.employee_id];
      if (!(`${a.action} ${a.case_ref || ""} ${a.changed_by || ""} ${emp?.name || ""}`.toLowerCase().includes(s))) return false;
    }
    return true;
  }), [auditEvents, caseById, empById, entityFilter, user, src, action, from, to, q]);

  const cols = [
    { key: "changed_at", header: "When", sortable: true, width: 150, sortValue: (a) => new Date(a.changed_at).getTime(), render: (a) => <div><div style={{ color: S.text2, fontSize: 12.5 }}>{String(a.changed_at).slice(0, 10)}</div><div style={{ color: S.text3, fontSize: 11 }}>{relativeTime(a.changed_at)}</div></div> },
    { key: "changed_by", header: "Actor", sortable: true, render: (a) => <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Avatar name={a.changed_by} size={24} /><span style={{ color: S.text, fontSize: 12.5, fontWeight: 600 }}>{a.changed_by}</span></span> },
    { key: "action", header: "Action", render: (a) => <span style={{ color: S.text2, fontSize: 12.5 }}>{a.action}</span> },
    { key: "case_ref", header: "Case", sortable: true, width: 110, render: (a) => a.case_ref ? <span style={{ color: S.indigoL, fontWeight: 600, fontSize: 12 }}>{a.case_ref}</span> : <span style={{ color: S.text3, fontSize: 12 }}>—</span> },
    { key: "employee", header: "Employee", render: (a) => <span style={{ color: S.text2, fontSize: 12.5 }}>{empById[a.employee_id]?.name || "—"}</span> },
    { key: "source", header: "Source", width: 84, render: (a) => <span style={{ fontSize: 11, fontWeight: 700, color: a.source === "import" ? S.amber : a.source === "system" ? S.teal : S.text3, textTransform: "uppercase", letterSpacing: ".04em" }}>{a.source || "web"}</span> },
    { key: "diff", header: "Change", render: (a) => a.new_values ? <span style={{ color: S.text3, fontSize: 11.5, fontFamily: "monospace" }}>{Object.entries(a.new_values).slice(0, 3).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ")}</span> : <span style={{ color: S.text3, fontSize: 12 }}>—</span> },
  ];

  const doExport = () => {
    exportCSV("leaveiq_audit_export.csv", [
      { label: "Timestamp", value: "changed_at" }, { label: "Actor", value: "changed_by" },
      { label: "Action", value: "action" }, { label: "Case", value: "case_ref" },
      { label: "Employee", value: (a) => empById[a.employee_id]?.name || "" },
      { label: "Source", value: (a) => a.source || "web" },
      { label: "Old values", value: (a) => a.old_values ? JSON.stringify(a.old_values) : "" },
      { label: "New values", value: (a) => a.new_values ? JSON.stringify(a.new_values) : "" },
    ], rows);
    onToast?.({ type: "success", message: `Exported ${rows.length} audit events` });
  };

  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
    <PageHeader title="Audit Log" subtitle={`${rows.length} of ${auditEvents.length} events`} breadcrumb={["Governance", "Audit Log"]}
      actions={<Btn variant="secondary" small onClick={doExport}><Download size={13} /> Export for legal hold</Btn>} />
    <Card style={{ marginBottom: 14, padding: 12, display: "flex", alignItems: "center", gap: 9, borderColor: "rgba(0,75,135,.25)" }}>
      <Lock size={14} color={S.indigoL} />
      <span style={{ color: S.text2, fontSize: 12.5 }}>Append-only. Events cannot be edited or deleted by any role — enforced at the database, not just hidden in the interface.</span>
    </Card>
    <div style={{ display: "flex", gap: 9, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ position: "relative", flex: 1, minWidth: 200 }}><Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: S.text3, pointerEvents: "none" }} /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search action, case, actor, employee…" style={{ paddingLeft: 32 }} /></div>
      <Select value={user} onChange={(e) => setUser(e.target.value)} style={{ minWidth: 140 }}><option value="All">All actors</option>{users.map((u) => <option key={u} value={u}>{u}</option>)}</Select>
      <Select value={action} onChange={(e) => setAction(e.target.value)} style={{ minWidth: 150 }}><option value="All">All actions</option>{actionKinds.map((a) => <option key={a} value={a}>{a}</option>)}</Select>
      <Select value={src} onChange={(e) => setSrc(e.target.value)} style={{ minWidth: 110 }}>{["All", "web", "import", "system"].map((s) => <option key={s} value={s}>{s === "All" ? "All sources" : s}</option>)}</Select>
      <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
      <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
    </div>
    <DataTable columns={cols} rows={rows} getRowId={(a) => a.id} initialSort={{ key: "changed_at", dir: "desc" }} pageSize={25} emptyMessage="No audit events match these filters" />
  </motion.div>;
}
