/* Entity configuration (v2.0 · Feature 4a). Admin-only.
 * These fields flow into every generated notice, packet, and defense-binder
 * exhibit: legal name, EIN header (masked — full EIN never stored here),
 * HR contact, mailing address, policy date, notification recipients. */
import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, Save, Mail } from "lucide-react";
import { S, Card, Btn, Badge, PageHeader, Input } from "../ui.jsx";
import { useData } from "../data/DataContext.jsx";

export default function Entities({ viewer, onToast }) {
  const { entities, actions } = useData();
  const [drafts, setDrafts] = useState({});
  const d = (e) => drafts[e.id] ?? e;
  const set = (id, k, v) => setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? entities.find((x) => x.id === id)), [k]: v } }));
  const save = async (id) => {
    await actions.saveEntity(drafts[id], viewer.name);
    setDrafts((prev) => { const n = { ...prev }; delete n[id]; return n; });
    onToast?.({ type: "success", message: "Entity configuration saved" });
  };
  const label = { color: S.text3, fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4, marginTop: 10 };

  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
    <PageHeader title="Entity Configuration" subtitle="Three legal employers, one PE family — these fields appear on every generated notice and defense-binder exhibit" breadcrumb={["Management", "Entities"]} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 16, alignItems: "start" }}>
      {entities.map((e) => { const v = d(e); const dirty = !!drafts[e.id]; return <Card key={e.id}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
          <div style={{ background: "rgba(0,75,135,.14)", borderRadius: 9, padding: 7 }}><Building2 size={15} color={S.indigoL} /></div>
          <span style={{ color: S.text, fontWeight: 800, fontSize: 14 }}>{e.code}</span>
          <Badge label={e.type} />
        </div>
        <label style={label}>Legal name (notice headers)</label>
        <Input value={v.legal_name || ""} onChange={(ev) => set(e.id, "legal_name", ev.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
        <label style={label}>EIN — masked (header display only; never store the full EIN here)</label>
        <Input value={v.ein_masked || ""} onChange={(ev) => set(e.id, "ein_masked", ev.target.value)} placeholder="EIN xx-xxx0000" style={{ width: "100%", boxSizing: "border-box" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 8 }}>
          <div><label style={label}>Primary HR contact</label><Input value={v.hr_contact_name || ""} onChange={(ev) => set(e.id, "hr_contact_name", ev.target.value)} style={{ width: "100%", boxSizing: "border-box" }} /></div>
          <div><label style={label}>Title</label><Input value={v.hr_contact_title || ""} onChange={(ev) => set(e.id, "hr_contact_title", ev.target.value)} style={{ width: "100%", boxSizing: "border-box" }} /></div>
        </div>
        <label style={label}>Mailing address</label>
        <Input value={v.mailing_address || ""} onChange={(ev) => set(e.id, "mailing_address", ev.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
        <label style={label}>Leave policy effective date</label>
        <Input type="date" value={v.policy_effective_date || ""} onChange={(ev) => set(e.id, "policy_effective_date", ev.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
        <label style={label}><Mail size={10} style={{ verticalAlign: -1 }} /> Default notification recipients (comma-separated)</label>
        <Input value={(v.notification_recipients || []).join(", ")} onChange={(ev) => set(e.id, "notification_recipients", ev.target.value.split(",").map((s) => s.trim()).filter(Boolean))} style={{ width: "100%", boxSizing: "border-box" }} />
        <Btn variant={dirty ? "primary" : "secondary"} disabled={!dirty} onClick={() => save(e.id)} style={{ width: "100%", justifyContent: "center", marginTop: 14 }}><Save size={13} /> {dirty ? "Save changes" : "Saved"}</Btn>
      </Card>; })}
    </div>
  </motion.div>;
}
