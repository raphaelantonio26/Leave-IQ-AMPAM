/* Compliance Knowledge Center (v1.3 · Priority 8).
 * Replaces the static law map. Each program: plain-English summary, the
 * operational details HR actually needs (duration, job protection,
 * certification, employer obligations), and links to the AUTHORITATIVE
 * source — DOL, CRD, EEOC, EDD, DIR — opening in a new tab. */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, ExternalLink, Scale, Landmark, Clock, ShieldCheck, FileCheck, Briefcase } from "lucide-react";
import { S, RADIUS, Card, Badge, PageHeader, Input } from "./../ui.jsx";
import { KNOWLEDGE } from "./../lawdata.js";

const JURIS = ["All", "Federal", "California", "Federal + California"];

export default function KnowledgeCenter() {
  const [sel, setSel] = useState(KNOWLEDGE[0].id);
  const [q, setQ] = useState("");
  const [jur, setJur] = useState("All");
  const list = useMemo(() => KNOWLEDGE.filter((k) =>
    (jur === "All" || k.jurisdiction === jur) &&
    (!q || (k.name + " " + k.summary + " " + k.tags.join(" ")).toLowerCase().includes(q.toLowerCase()))), [q, jur]);
  const law = KNOWLEDGE.find((k) => k.id === sel) || list[0];

  const Section = ({ icon: Icon, title, children }) => <div style={{ marginBottom: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}><Icon size={13} color={S.indigoL} /><span style={{ color: S.text2, fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>{title}</span></div>
    <div style={{ color: S.text2, fontSize: 13, lineHeight: 1.6 }}>{children}</div>
  </div>;

  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
    <PageHeader title="Compliance Knowledge Center" subtitle="Leave & accommodation programs — summaries, key rules, and links to the authoritative sources" breadcrumb={["Insights", "Knowledge Center"]} />
    <div style={{ display: "flex", gap: 9, marginBottom: 16, flexWrap: "wrap" }}>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search programs… (e.g. bonding, accommodation, wage replacement)" style={{ flex: 1, minWidth: 240 }} />
      <div style={{ display: "flex", gap: 6 }}>{JURIS.map((j) => <button key={j} onClick={() => setJur(j)} style={{ padding: "7px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: jur === j ? "1px solid rgba(0,75,135,.5)" : `1px solid ${S.border2}`, background: jur === j ? "rgba(0,75,135,.15)" : "transparent", color: jur === j ? S.indigoL : S.text3 }}>{j}</button>)}</div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "sticky", top: 88 }}>
        {list.map((k) => <button key={k.id} onClick={() => setSel(k.id)} style={{ textAlign: "left", cursor: "pointer", background: sel === k.id ? "rgba(0,75,135,.1)" : S.card, border: sel === k.id ? "1px solid rgba(0,75,135,.45)" : `1px solid ${S.border2}`, borderRadius: RADIUS.lg, padding: "12px 14px" }}>
          <div style={{ color: sel === k.id ? S.indigoL : S.text, fontSize: 13, fontWeight: 700 }}>{k.name}</div>
          <div style={{ color: S.text3, fontSize: 11, marginTop: 3 }}>{k.jurisdiction}</div>
        </button>)}
      </div>
      {law && <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
            <div style={{ background: "rgba(0,75,135,.15)", borderRadius: 11, padding: 10, flexShrink: 0 }}><BookOpen size={19} color={S.indigoL} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, color: S.text, fontSize: 18, fontWeight: 800 }}>{law.name}</h2>
              <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}><Badge label={law.jurisdiction} />{law.tags.map((t) => <span key={t} style={{ color: S.text3, fontSize: 11, background: "rgba(0,75,135,.05)", borderRadius: RADIUS.pill, padding: "3px 10px" }}>{t}</span>)}</div>
            </div>
          </div>
          <p style={{ margin: 0, color: S.text2, fontSize: 13.5, lineHeight: 1.65 }}>{law.summary}</p>
        </Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Card>
            <Section icon={Landmark} title="Who it covers">{law.covers}</Section>
            <Section icon={Scale} title="Key eligibility">{<ul style={{ margin: 0, paddingLeft: 18 }}>{law.eligibility.map((e, i) => <li key={i} style={{ marginBottom: 4 }}>{e}</li>)}</ul>}</Section>
          </Card>
          <Card>
            <Section icon={Clock} title="Duration">{law.duration}</Section>
            <Section icon={ShieldCheck} title="Job protection">{law.jobProtection}</Section>
          </Card>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Card><Section icon={FileCheck} title="Certification">{law.certification}</Section></Card>
          <Card><Section icon={Briefcase} title="Employer obligations">{law.employerObligations}</Section></Card>
        </div>
        <Card>
          <p style={{ color: S.text2, fontSize: 11.5, fontWeight: 700, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: ".06em" }}>Authoritative sources</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {law.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 9, color: S.indigoL, fontSize: 13, fontWeight: 600, textDecoration: "none", background: "rgba(0,75,135,.06)", border: "1px solid rgba(0,75,135,.2)", borderRadius: 9, padding: "10px 13px" }}><ExternalLink size={13} /> {s.label}<span style={{ color: S.text3, fontSize: 11, fontWeight: 400, marginLeft: "auto" }}>{new URL(s.url).hostname}</span></a>)}
          </div>
          <p style={{ color: S.text3, fontSize: 11, lineHeight: 1.5, margin: "12px 0 0" }}>Informational summaries maintained by HR — not legal advice. The linked source controls; consult counsel on close questions.</p>
        </Card>
      </div>}
    </div>
  </motion.div>;
}
