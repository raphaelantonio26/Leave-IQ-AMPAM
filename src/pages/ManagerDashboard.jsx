/* Manager self-service dashboard (Tier 1).
 * Replaces the full HR dashboard for the manager role. Shows exactly what a
 * people manager needs — who's out, when they return, whether paperwork is
 * pending — and nothing they shouldn't see: no medical notes, no entitlement
 * hours, no reason detail. Kills the "where does Maria's leave stand?" email. */
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Users, CalendarCheck, FileClock, Lock } from "lucide-react";
import { S, RADIUS, Card, Badge, Avatar, AvatarLabel, PageHeader, KpiCard, EmptyState, DataTable, daysUntil, formatDate } from "../ui.jsx";

const OPEN = ["Active", "Pending", "Approved"];

export default function ManagerDashboard({ cases, employees, viewer }) {
  const empById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const open = useMemo(() => cases.filter((c) => OPEN.includes(c.status)), [cases]);
  const onLeaveNow = useMemo(() => open.filter((c) => { const s = new Date(c.start_date), e = new Date(c.end_date || "2099-01-01"), n = new Date(); return s <= n && e >= n && c.status !== "Pending"; }), [open]);
  const upcomingRTW = useMemo(() => open.filter((c) => c.end_date && daysUntil(c.end_date) >= 0 && daysUntil(c.end_date) <= 30).sort((a, b) => daysUntil(a.end_date) - daysUntil(b.end_date)), [open]);
  const certsPending = open.filter((c) => !c.cert_received).length;

  function StatusPhrase({ c }) {
    if (c.status === "Pending") return <span style={{ color: S.amber, fontSize: 12.5 }}>Request under HR review</span>;
    const d = c.end_date ? daysUntil(c.end_date) : null;
    if (d != null && d >= 0 && d <= 30) return <span style={{ color: S.teal, fontSize: 12.5 }}>Expected back {formatDate(c.end_date)} ({d}d)</span>;
    return <span style={{ color: S.text2, fontSize: 12.5 }}>On approved leave</span>;
  }
  const cols = [
    { key: "employee", header: "Team member", sortable: true, sortValue: (c) => empById[c.employee_id]?.name || "", render: (c) => <AvatarLabel name={empById[c.employee_id]?.name || "—"} sub={empById[c.employee_id]?.position} /> },
    { key: "status", header: "Status", render: (c) => <Badge label={c.status} /> },
    { key: "phrase", header: "Where it stands", render: (c) => <StatusPhrase c={c} /> },
    { key: "dates", header: "Dates", render: (c) => <span style={{ color: S.text3, fontSize: 12 }}>{formatDate(c.start_date)} → {c.end_date ? formatDate(c.end_date) : "TBD"}</span> },
    { key: "intermittent", header: "Schedule", render: (c) => <span style={{ color: S.text2, fontSize: 12 }}>{c.intermittent ? "Intermittent" : "Continuous"}</span> },
    { key: "cert", header: "Paperwork", sortable: true, sortValue: (c) => c.cert_received ? 1 : 0, render: (c) => c.cert_received ? <span style={{ color: S.green, fontSize: 12, fontWeight: 600 }}>✓ Complete</span> : <span style={{ color: S.amber, fontSize: 12, fontWeight: 600 }}>With HR</span> },
  ];

  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
    <PageHeader title={`My Team — ${viewer.dept}`} subtitle={`${open.length} open leave case${open.length === 1 ? "" : "s"} on your team`} breadcrumb={["Overview", "My Team"]} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 16 }}>
      <KpiCard icon={Users} label="Out right now" value={onLeaveNow.length} color={S.indigo} hint="approved leave in progress" />
      <KpiCard icon={CalendarCheck} label="Returning ≤ 30 days" value={upcomingRTW.length} color={S.teal} hint="plan coverage hand-back" />
      <KpiCard icon={FileClock} label="Paperwork with HR" value={certsPending} color={S.amber} hint="no action needed from you" />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, alignItems: "start" }}>
      <div>
        <p style={{ color: S.text2, fontSize: 12, fontWeight: 700, margin: "0 0 12px", letterSpacing: ".05em", textTransform: "uppercase" }}>Open cases on your team</p>
        {open.length === 0 ? <Card><EmptyState msg="No open leave cases on your team. 🎉" icon={Users} /></Card> :
          <DataTable columns={cols} rows={open} getRowId={(c) => c.id} pageSize={10} emptyMessage="No open cases" />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Card>
          <p style={{ color: S.text2, fontSize: 12, fontWeight: 700, margin: "0 0 12px", letterSpacing: ".05em", textTransform: "uppercase" }}>Upcoming returns</p>
          {upcomingRTW.length === 0 ? <p style={{ color: S.text3, fontSize: 12.5, margin: 0 }}>No returns scheduled in the next 30 days.</p> :
            upcomingRTW.map((c) => { const emp = empById[c.employee_id]; const d = daysUntil(c.end_date); return <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid rgba(0,75,135,.05)" }}>
              <Avatar name={emp?.name} size={28} />
              <div style={{ minWidth: 0, flex: 1 }}><div style={{ color: S.text, fontSize: 13, fontWeight: 600 }}>{emp?.name}</div><div style={{ color: S.text3, fontSize: 11.5 }}>{formatDate(c.end_date)}</div></div>
              <span style={{ fontSize: 11, fontWeight: 700, color: d <= 7 ? S.teal : S.text3, background: d <= 7 ? "rgba(14,124,134,.12)" : "rgba(0,75,135,.05)", borderRadius: RADIUS.pill, padding: "3px 9px" }}>{d === 0 ? "Today" : `${d}d`}</span>
            </div>; })}
        </Card>
        <Card style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 14 }}>
          <Lock size={14} color={S.text3} style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, color: S.text3, fontSize: 12, lineHeight: 1.6 }}>Leave reasons and medical details are confidential and visible only to HR. If a team member shares details with you, do not record them — refer them to HR. Questions about a case? Contact the assigned HR partner instead of asking the employee.</p>
        </Card>
      </div>
    </div>
  </motion.div>;
}
