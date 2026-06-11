/* Workload & Capacity (v2.0 · Feature 6). Read-only, admin-only. */
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Gauge, Users, Timer, FileCheck2, CalendarClock } from "lucide-react";
import { S, RADIUS, Card, Badge, PageHeader, Avatar } from "../ui.jsx";
import { useData } from "../data/DataContext.jsx";
import { workloadMetrics } from "../lib/compliance/workload.js";

export default function Workload({ entityFilter = "All" }) {
  const { cases, certifications, hrUsers } = useData();
  const scoped = useMemo(() => entityFilter === "All" ? cases : cases.filter((c) => c.entity_code === entityFilter), [cases, entityFilter]);
  const m = useMemo(() => workloadMetrics({ cases: scoped, certifications, hrUsers }), [scoped, certifications, hrUsers]);
  const cap = { color: S.text2, fontSize: 11.5, fontWeight: 700, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: ".06em" };
  const pct = (v, warn = 0, danger = 0) => <span style={{ color: danger && v >= danger ? S.red : warn && v >= warn ? S.amber : S.green, fontWeight: 800 }}>{v}%</span>;

  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
    <PageHeader title="Workload & Capacity" subtitle={`Read-only operational view · ${entityFilter === "All" ? "combined (all entities)" : entityFilter} · feeds the morning briefing`} breadcrumb={["Insights", "Workload"]} />
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card>
          <p style={cap}><Users size={12} style={{ verticalAlign: -2 }} /> Cases per specialist</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr style={{ color: S.text3, fontSize: 11, textAlign: "left" }}><th style={{ paddingBottom: 8 }}>Specialist</th><th>Open</th><th>Pending action</th><th>Overdue action</th></tr></thead>
            <tbody>{m.perSpecialist.map((s) => <tr key={s.name} style={{ borderTop: "1px solid rgba(0,75,135,.05)" }}>
              <td style={{ padding: "8px 0", color: S.text, fontWeight: 600 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Avatar name={s.name} size={22} />{s.name}</span></td>
              <td style={{ color: S.text2 }}>{s.open}</td>
              <td style={{ color: s.pendingAction ? S.amber : S.text3, fontWeight: 700 }}>{s.pendingAction}</td>
              <td style={{ color: s.overdueAction ? S.red : S.text3, fontWeight: 700 }}>{s.overdueAction}</td>
            </tr>)}</tbody>
          </table>
        </Card>
        <Card>
          <p style={cap}><CalendarClock size={12} style={{ verticalAlign: -2 }} /> RTW pipeline — next 8 weeks</p>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 7, height: 110, marginBottom: 8 }}>
            {m.rtwPipeline.map((w) => { const max = Math.max(1, ...m.rtwPipeline.map((x) => x.count)); return <div key={w.week} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span style={{ color: S.text2, fontSize: 11, fontWeight: 700 }}>{w.count || ""}</span>
              <div style={{ width: "100%", borderRadius: "6px 6px 0 0", height: `${(w.count / max) * 78}px`, minHeight: w.count ? 6 : 2, background: w.blocked ? "linear-gradient(180deg,#EF3340,#b3242f)" : "linear-gradient(180deg,#004B87,#4338ca)", opacity: w.count ? 1 : .25 }} title={`${w.refs.join(", ")}${w.blocked ? ` · ${w.blocked} blocked on FFD` : ""}`} />
              <span style={{ color: S.text3, fontSize: 9.5 }}>W{w.week}</span>
            </div>; })}
          </div>
          <p style={{ color: S.text3, fontSize: 11.5, margin: 0 }}>Red bars contain returns inside 14 days without FFD clearance. Hover a bar for case refs. {m.rtwPipeline.reduce((s, w) => s + w.cleared, 0)} of {m.rtwPipeline.reduce((s, w) => s + w.count, 0)} upcoming returns already cleared.</p>
        </Card>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card>
          <p style={cap}><Timer size={12} style={{ verticalAlign: -2 }} /> Intake → designation cycle time</p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: m.cycleStats.avgBusinessDays > 3 ? S.amber : S.green }}>{m.cycleStats.avgBusinessDays}</span>
            <span style={{ color: S.text3, fontSize: 12 }}>avg business days · target ≤ 3 · {m.cycleStats.n} intake case(s)</span>
          </div>
          {m.cycleStats.exceeding.length > 0 && <div style={{ marginTop: 10 }}>
            <p style={{ color: S.red, fontSize: 11.5, fontWeight: 700, margin: "0 0 6px" }}>Exceeding target:</p>
            {m.cycleStats.exceeding.map((x) => <div key={x.ref} style={{ color: S.text2, fontSize: 12, padding: "3px 0" }}>{x.ref} — {x.days} business days{x.designated ? "" : " (still undesignated)"}</div>)}
          </div>}
        </Card>
        <Card>
          <p style={cap}><FileCheck2 size={12} style={{ verticalAlign: -2 }} /> Certification chain health</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 12.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: S.text2 }}>Current certification on file</span>{pct(m.certHealth.pctCurrent)}</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: S.text2 }}>Recert overdue</span>{pct(m.certHealth.pctOverdueRecert, 1, 15)}</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: S.text2 }}>Awaiting initial certification</span>{pct(m.certHealth.pctAwaitingInitial, 20, 40)}</div>
          </div>
          <p style={{ color: S.text3, fontSize: 11, margin: "10px 0 0" }}>{m.certHealth.n} open clocked case(s) in scope.</p>
        </Card>
        <Card>
          <p style={cap}><Gauge size={12} style={{ verticalAlign: -2 }} /> Average case age by designation</p>
          {m.avgAgeByType.map((t) => <div key={t.type} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12.5 }}>
            <Badge label={t.type} /><span style={{ color: S.text2, marginLeft: "auto" }}>{t.avgDays} days avg · {t.n} case(s)</span>
          </div>)}
        </Card>
      </div>
    </div>
  </motion.div>;
}
