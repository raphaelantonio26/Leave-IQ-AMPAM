/* Risk Signals (Tier 3) — cross-case pattern surfacing for HR Admin + Legal.
 * The platform FLAGS overlapping patterns and shows its work (rationale per
 * signal); it never acts on them. Patterns: multiple intermittent cases in 12
 * months, leave opened within 30 days of a corrective action, active leave
 * concurrent with a recent PIP. */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ShieldAlert, Download, Scale, Info } from "lucide-react";
import { S, RADIUS, Card, Btn, Badge, Avatar, PageHeader, EmptyState, exportCSV, Select } from "../ui.jsx";
import { useData } from "../data/DataContext.jsx";
import { crossCaseSignals } from "../lib/compliance/signals.js";

const KIND_LABEL = {
  multiple_intermittent: "Pattern · intermittent frequency",
  leave_after_corrective: "Timing · leave after corrective action",
  active_leave_with_pip: "Overlap · active leave + PIP",
  active_leave_recent_corrective: "Overlap · leave + recent corrective",
  monday_friday_pattern: "Pattern · weekend-adjacent usage",
  pdl_no_bonding: "Gap · CFRA bonding not initiated after PDL",
  ada_gap: "Gap · interactive process not initiated",
  recert_overdue_active: "Overdue · recertification on active leave",
  rtw_clearance_gap: "Gap · RTW passed without clearance",
  cross_entity_stack: "Overlap · cross-entity leave stacking",
};

export default function RiskSignals({ entityFilter = "All", onToast }) {
  const { employees, cases, correctiveActions, intermittentLog, certifications } = useData();
  const [sevF, setSevF] = useState("All");
  const signals = useMemo(() => {
    const all = crossCaseSignals({ employees, cases, correctiveActions, intermittentLog, certifications });
    return all.filter((s) => (entityFilter === "All" || s.entity_code === entityFilter) && (sevF === "All" || s.severity === sevF));
  }, [employees, cases, correctiveActions, intermittentLog, certifications, entityFilter, sevF]);
  const high = signals.filter((s) => s.severity === "high").length;

  const doExport = () => {
    exportCSV("leaveiq_risk_signals.csv", [
      { label: "Severity", value: "severity" }, { label: "Kind", value: "kind" },
      { label: "Employee", value: "employee" }, { label: "Entity", value: "entity_code" },
      { label: "Signal", value: "title" }, { label: "Rationale", value: "rationale" },
      { label: "Recommended action", value: (s) => s.recommendedAction || "" },
      { label: "Counsel export", value: (s) => s.counselExport ? "YES" : "no" },
      { label: "Cases", value: (s) => s.cases.join("; ") },
    ], signals);
    onToast?.({ type: "success", message: `Exported ${signals.length} signals` });
  };

  const sevColor = { high: S.red, medium: S.amber, low: S.text3 };
  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
    <PageHeader title="Risk Signals" subtitle={`${signals.length} signals · ${high} high severity · ${entityFilter === "All" ? "all entities" : entityFilter}`} breadcrumb={["Governance", "Risk Signals"]}
      actions={<><Select value={sevF} onChange={(e) => setSevF(e.target.value)} style={{ minWidth: 130 }}>{["All", "high", "medium"].map((s) => <option key={s} value={s}>{s === "All" ? "All severities" : s[0].toUpperCase() + s.slice(1)}</option>)}</Select><Btn variant="secondary" small onClick={doExport}><Download size={13} /> Export for counsel</Btn></>} />
    <Card style={{ marginBottom: 16, padding: 14, borderColor: "rgba(0,75,135,.25)", display: "flex", gap: 10, alignItems: "flex-start" }}>
      <Scale size={16} color={S.indigoL} style={{ flexShrink: 0, marginTop: 1 }} />
      <p style={{ margin: 0, color: S.text2, fontSize: 12.5, lineHeight: 1.6 }}>
        These are <strong style={{ color: S.text }}>flags for human review, not findings</strong>. Each signal shows exactly why it fired.
        Protected leave is lawful — proximity to corrective action does not imply misuse, and corrective timelines generally pause during
        protected leave. Route high-severity signals through Legal before any employment action.
      </p>
    </Card>
    {signals.length === 0 ? <Card><EmptyState msg="No cross-case patterns detected in the current scope." icon={ShieldAlert} /></Card> :
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {signals.map((s) => <Card key={s.id} style={{ borderLeft: `3px solid ${sevColor[s.severity]}`, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <Avatar name={s.employee} size={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ color: S.text, fontWeight: 700, fontSize: 13.5 }}>{s.employee}</span>
                <Badge label={s.entity_code} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: sevColor[s.severity], background: `${sevColor[s.severity]}1a`, border: `1px solid ${sevColor[s.severity]}33`, borderRadius: RADIUS.pill, padding: "2px 9px", textTransform: "uppercase", letterSpacing: ".05em" }}>{s.severity}</span>
                <span style={{ color: S.text3, fontSize: 11.5 }}>{KIND_LABEL[s.kind] || s.kind}</span>
              </div>
              <div style={{ color: S.text, fontSize: 13, fontWeight: 600, marginTop: 7 }}>{s.title}</div>
              <div style={{ color: S.text2, fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}><Info size={11} style={{ verticalAlign: -1.5, marginRight: 4 }} color={S.text3} />{s.rationale}</div>
              {s.recommendedAction && <div style={{ color: S.teal, fontSize: 12, marginTop: 6, lineHeight: 1.5, background: "rgba(14,124,134,.06)", border: "1px solid rgba(14,124,134,.2)", borderRadius: 8, padding: "7px 11px" }}><strong>Next:</strong> {s.recommendedAction}{s.counselExport ? <span style={{ color: S.red, fontWeight: 700, marginLeft: 8 }}>· counsel-export</span> : null}</div>}
              <div style={{ marginTop: 8, display: "flex", gap: 6 }}>{s.cases.map((r) => <span key={r} style={{ color: S.indigoL, fontSize: 11.5, fontWeight: 600, background: "rgba(0,75,135,.1)", borderRadius: 6, padding: "2px 8px" }}>{r}</span>)}</div>
            </div>
          </div>
        </Card>)}
      </div>}
  </motion.div>;
}
