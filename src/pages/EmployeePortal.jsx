/* Employee Portal (v1.3 · Priority 4).
 * Replaces the administrative shell for the employee role. Five focused
 * tabs: Home (case status), Entitlements (per-clock balances), Eligibility
 * (plain-English explainers), Documents (certification center with upload),
 * Support (secure messaging with the assigned case manager). The employee
 * sees only their own cases; medical notes authored by HR stay HR-side. */
import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Home, Gauge, BadgeCheck, FileUp, MessageSquareText, Upload, CheckCircle2, Clock4, Send, Paperclip } from "lucide-react";
import { S, RADIUS, ELEV, Card, Btn, Badge, Select, formatDate, daysUntil } from "../ui.jsx";
import { useData } from "../data/DataContext.jsx";
import { AMPAM_LOGO } from "../assets/ampamLogo.js";
import { computeEligibility } from "../lib/compliance/engine.js";
import { DOC_CATEGORIES, DOC_STATUSES } from "../lib/docs/templates.js";
import { nextRecertDue } from "../lib/compliance/signals.js";

const TABS = [
  ["home", "My Leave", Home],
  ["entitlements", "Balances", Gauge],
  ["eligibility", "Eligibility", BadgeCheck],
  ["docs", "Documents", FileUp],
  ["support", "Support", MessageSquareText],
];
const EMPLOYEE_DOC_CATS = ["initial_cert", "recert", "rtw_release", "ffd", "ada", "wc", "other"];

export default function EmployeePortal({ viewer }) {
  const { employees, cases, certifications, documents, messages, actions } = useData();
  const [tab, setTab] = useState("home");
  const me = useMemo(() => employees.find((e) => e.id === viewer.empId) || employees[0], [employees, viewer]);
  const myCases = useMemo(() => cases.filter((c) => c.employee_id === me?.id).sort((a, b) => new Date(b.start_date) - new Date(a.start_date)), [cases, me]);
  const [caseId, setCaseId] = useState(null);
  const active = myCases.find((c) => c.id === caseId) || myCases.find((c) => ["Active", "Approved", "Pending"].includes(c.status)) || myCases[0];

  if (!me) return null;
  const statusColor = { Active: S.green, Approved: S.teal, Pending: S.amber, Closed: S.text3, Denied: S.red };

  return <div style={{ maxWidth: 880, margin: "0 auto" }}>
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{ marginBottom: 18 }}>
        <img src={AMPAM_LOGO} alt="AMPAM" style={{ width: 168, height: "auto", display: "block", marginBottom: 12 }} />
        <h1 style={{ margin: 0, color: S.text, fontSize: 21, fontWeight: 800 }}>Hi, {me.name.split(" ")[0]}</h1>
        <p style={{ margin: "4px 0 0", color: S.text3, fontSize: 12.5 }}>Your leave, your documents, and a direct line to your case manager — all in one place.</p>
      </div>
      {myCases.length > 1 && <Select value={String(active?.id || "")} onChange={(e) => setCaseId(Number(e.target.value))} style={{ marginBottom: 14 }}>{myCases.map((c) => <option key={c.id} value={c.id}>{c.ref} · {c.type || "Pending designation"} · {c.status}</option>)}</Select>}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 18 }}>
        {TABS.map(([k, label, Icon]) => {
          const unread = k === "support" && active ? messages.filter((m) => m.case_id === active.id && m.sender_role === "hr" && !m.read_at).length : 0;
          return <button key={k} onClick={() => { setTab(k); if (k === "support" && active) actions.markMessagesRead(active.id, "employee"); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: tab === k ? "1px solid rgba(0,75,135,.5)" : `1px solid ${S.border2}`, background: tab === k ? "rgba(0,75,135,.15)" : "transparent", color: tab === k ? S.indigoL : S.text3, position: "relative" }}>
            <Icon size={13} /> {label}
            {unread > 0 && <span style={{ background: S.red, color: "#fff", borderRadius: 99, fontSize: 9.5, fontWeight: 800, padding: "1px 6px" }}>{unread}</span>}
          </button>;
        })}
      </div>

      {!active && <Card><p style={{ color: S.text2, fontSize: 13.5, margin: 0 }}>You have no leave cases on file. If you need to request a leave of absence, use the leave-request link from HR or contact your HR partner.</p></Card>}

      {active && tab === "home" && <HomeTab c={active} me={me} />}
      {active && tab === "entitlements" && <EntitlementsTab c={active} myCases={myCases} />}
      {active && tab === "eligibility" && <EligibilityTab me={me} c={active} />}
      {active && tab === "docs" && <DocsTab c={active} me={me} documents={documents} certifications={certifications} actions={actions} />}
      {active && tab === "support" && <SupportTab c={active} me={me} messages={messages} actions={actions} />}
    </motion.div>
  </div>;

  /* ── Home ── */
  function HomeTab({ c, me }) {
    const col = statusColor[c.status] || S.text2;
    const pctUsed = c.total_hours ? Math.min(100, Math.round((c.used_hours / c.total_hours) * 100)) : 0;
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: col, background: `${col}1a`, border: `1px solid ${col}44`, borderRadius: RADIUS.pill, padding: "4px 14px", fontSize: 12.5, fontWeight: 800 }}>{c.status === "Pending" ? "Under HR review" : c.status}</span>
          <span style={{ color: S.text3, fontSize: 12.5 }}>Case <strong style={{ color: S.indigoL }}>{c.ref}</strong></span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 16 }}>
          {[["Leave starts", formatDate(c.start_date)], ["Expected return", c.end_date ? formatDate(c.end_date) : "To be determined"], ["Designation", c.type || "Being determined by HR"], ["Schedule", c.intermittent ? "Intermittent (blocks of time)" : "Continuous"], ["Your case manager", c.owner || "HR"]].map(([l, v]) =>
            <div key={l} style={{ background: "rgba(0,75,135,.025)", borderRadius: 10, padding: "11px 13px" }}><div style={{ color: S.text3, fontSize: 11, marginBottom: 3 }}>{l}</div><div style={{ color: S.text, fontWeight: 700, fontSize: 13 }}>{v}</div></div>)}
        </div>
        {(c.designations || []).length > 1 && <div style={{ marginTop: 12, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span style={{ color: S.text3, fontSize: 11.5 }}>Programs applied to this leave:</span>{c.designations.map((d) => <Badge key={d} label={d} />)}</div>}
      </Card>
      {c.total_hours > 0 && <Card>
        <p style={{ color: S.text2, fontSize: 12, fontWeight: 700, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: ".05em" }}>Leave used</p>
        <div style={{ background: "rgba(0,75,135,.07)", borderRadius: 8, height: 10, overflow: "hidden" }}><div style={{ width: `${pctUsed}%`, height: "100%", background: pctUsed > 80 ? S.red : pctUsed > 50 ? S.amber : S.green, transition: "width .4s" }} /></div>
        <p style={{ color: S.text3, fontSize: 12, margin: "8px 0 0" }}>{c.used_hours} of {c.total_hours} protected hours used ({pctUsed}%). Hours are measured at your regular schedule — your case manager can walk you through the math any time.</p>
      </Card>}
      {(c.designation_history || []).length > 0 && <Card>
        <p style={{ color: S.text2, fontSize: 12, fontWeight: 700, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: ".05em" }}>How your leave has changed</p>
        {c.designation_history.map((h, i) => <div key={i} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(0,75,135,.05)", fontSize: 12.5 }}>
          <span style={{ color: S.indigoL, fontWeight: 700, minWidth: 86 }}>{formatDate(h.effective_date)}</span>
          <span style={{ color: S.text2 }}>{(h.from || []).join(" + ") || "Initial"} → {(h.to || []).join(" + ")}{h.reason ? ` — ${h.reason}` : ""}</span>
        </div>)}
      </Card>}
    </div>;
  }

  /* ── Entitlements ── */
  function EntitlementsTab({ c, myCases }) {
    const clockTotals = useMemo(() => {
      const banks = {};
      for (const k of cases.filter((x) => x.employee_id === me.id)) {
        for (const clock of k.concurrent_clocks || []) {
          banks[clock] = banks[clock] || { total: 0, used: 0 };
          banks[clock].total = Math.max(banks[clock].total, Number(k.total_hours) || 0);
          banks[clock].used += Number(k.used_hours) || 0;
        }
      }
      return banks;
    }, [myCases]);
    const EXPLAIN = {
      FMLA: "Federal job-protected leave — up to 12 workweeks in a rolling 12-month period.",
      CFRA: "California family leave — generally runs together with FMLA. Baby-bonding time is separate from pregnancy disability.",
      PDL: "Pregnancy Disability Leave — up to 4 months while you are disabled by pregnancy or childbirth, in addition to bonding leave.",
    };
    const deferred = c.deferred_clocks || [];
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {Object.keys(clockTotals).length === 0 && <Card><p style={{ color: S.text2, fontSize: 13, margin: 0 }}>Your leave hasn't been designated under a specific program yet — HR is reviewing it. Balances appear here the moment a designation is made.</p></Card>}
      {Object.entries(clockTotals).map(([clock, b]) => {
        const remaining = Math.max(0, b.total - Math.min(b.used, b.total));
        const p = b.total ? Math.min(100, Math.round((b.used / b.total) * 100)) : 0;
        return <Card key={clock}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
            <span style={{ color: S.text, fontWeight: 800, fontSize: 15 }}>{clock}</span>
            <span style={{ color: S.green, fontWeight: 800, fontSize: 17 }}>{remaining}h <span style={{ color: S.text3, fontWeight: 500, fontSize: 12 }}>remaining</span></span>
          </div>
          <div style={{ background: "rgba(0,75,135,.07)", borderRadius: 8, height: 9, overflow: "hidden", margin: "10px 0 8px" }}><div style={{ width: `${p}%`, height: "100%", background: p > 80 ? S.red : p > 50 ? S.amber : S.indigo }} /></div>
          <p style={{ color: S.text3, fontSize: 12, margin: 0, lineHeight: 1.55 }}>{EXPLAIN[clock] || ""} You've used {Math.min(b.used, b.total)} of {b.total} hours.</p>
        </Card>;
      })}
      {deferred.length > 0 && <Card style={{ borderColor: "rgba(14,124,134,.3)" }}>
        <p style={{ color: S.teal, fontSize: 12.5, fontWeight: 700, margin: "0 0 5px" }}>Reserved for later: {deferred.join(", ")}</p>
        <p style={{ color: S.text2, fontSize: 12.5, margin: 0, lineHeight: 1.55 }}>California keeps your {deferred.join("/")} bonding entitlement fully intact while you're on Pregnancy Disability Leave — it starts after PDL ends, it doesn't run at the same time.</p>
      </Card>}
      <Card>
        <p style={{ color: S.text2, fontSize: 12, fontWeight: 700, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: ".05em" }}>Pay during leave (California)</p>
        <p style={{ color: S.text2, fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>Job-protected leave is generally unpaid, but California wage-replacement programs often apply: <strong style={{ color: S.text }}>SDI</strong> while you're medically unable to work, and <strong style={{ color: S.text }}>Paid Family Leave</strong> for bonding or caring for family. Your case manager and the EDD handle the details — ask in the Support tab if you're unsure what applies to you.</p>
      </Card>
    </div>;
  }

  /* ── Eligibility ── */
  function EligibilityTab({ me, c }) {
    const e = computeEligibility(me);
    const Row = ({ ok, title, detail }) => <div style={{ display: "flex", gap: 11, padding: "11px 0", borderBottom: "1px solid rgba(0,75,135,.05)" }}>
      <span style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, background: ok ? "rgba(30,125,63,.15)" : "rgba(185,117,9,.15)", color: ok ? S.green : S.amber }}>{ok ? "✓" : "!"}</span>
      <div><div style={{ color: S.text, fontSize: 13, fontWeight: 700 }}>{title}</div><div style={{ color: S.text2, fontSize: 12.5, marginTop: 3, lineHeight: 1.55 }}>{detail}</div></div>
    </div>;
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <p style={{ color: S.text2, fontSize: 12, fontWeight: 700, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: ".05em" }}>Where you stand</p>
        <Row ok={e.tenureMonths >= 12} title="Time with the company" detail={`You've been here about ${e.tenureMonths} months. Federal FMLA and California CFRA both ask for 12 months of service — ${e.tenureMonths >= 12 ? "you meet this." : `you'll reach it in about ${Math.max(0, 12 - e.tenureMonths)} more month(s).`}`} />
        <Row ok={e.hoursWorked >= 1250} title="Hours worked in the last year" detail={`Our records show about ${e.hoursWorked.toLocaleString()} hours in the last 12 months${e.approximate ? " (estimated from year-to-date)" : ""}. The requirement is 1,250 hours — ${e.hoursWorked >= 1250 ? "you meet this." : "you're below it right now; some programs (like PDL) don't require it at all."}`} />
        <Row ok={true} title="Pregnancy Disability Leave — no waiting period" detail="If you're ever disabled by pregnancy or childbirth, California PDL protects you from your first day of work — no tenure or hours requirement." />
      </Card>
      <Card>
        <p style={{ color: S.text2, fontSize: 12, fontWeight: 700, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: ".05em" }}>Programs that can apply to you</p>
        {[
          ["FMLA", e.fmlaEligible, "Federal job-protected leave — your own serious health condition, caring for family, bonding with a new child."],
          ["CFRA", e.fmlaEligible, "California's version — covers a broader family circle and applies to smaller employers."],
          ["PDL", true, "Up to 4 months while disabled by pregnancy/childbirth. Always available — and bonding leave comes after, separately."],
          ["SDI / PFL", true, "State pay programs (not job protection) — partial wages while you can't work or while bonding/caring for family."],
        ].map(([name, ok, d]) => <div key={name} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid rgba(0,75,135,.05)" }}>
          <Badge label={name} /><span style={{ color: ok ? S.text2 : S.text3, fontSize: 12.5, lineHeight: 1.5 }}>{d}{!ok && " (Service/hours requirement not yet met.)"}</span>
        </div>)}
        <p style={{ color: S.text3, fontSize: 11.5, margin: "12px 0 0", lineHeight: 1.5 }}>Final eligibility is confirmed by HR when leave is requested — this view is here so there are no surprises. Question anything? Use the Support tab.</p>
      </Card>
    </div>;
  }

  /* ── Documents / Certification Center ── */
  function DocsTab({ c, me, documents, certifications, actions }) {
    const fileRef = useRef(null);
    const [cat, setCat] = useState("initial_cert");
    const [replaceId, setReplaceId] = useState(null);
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState("");
    const myDocs = documents.filter((d) => d.case_id === c.id).sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
    const chain = certifications.filter((x) => x.case_id === c.id);
    const recert = nextRecertDue(c, chain);
    const outstanding = [
      ...chain.filter((x) => !x.received_at).map((x) => ({ label: x.kind === "recert" ? "Recertification from your provider" : "Medical certification from your provider", due: x.due_date })),
      ...(recert && !recert.requested ? [{ label: "Recertification coming up", due: recert.due_date }] : []),
      ...myDocs.filter((d) => d.status === "needs_info").map((d) => ({ label: `More information needed: ${d.filename}`, note: d.review_notes })),
      ...myDocs.filter((d) => d.status === "incomplete").map((d) => ({ label: `Replacement needed: ${d.filename}`, note: d.review_notes })),
    ];
    const onPick = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setBusy(true);
      try {
        await actions.uploadDocument(c.id, file, { category: cat, uploaded_role: "employee", actor: me.name, replaces_id: replaceId });
        setConfirm(`${file.name} submitted — your case manager has been notified and will review it.`);
        setReplaceId(null);
      } catch (err) { setConfirm(`Upload failed: ${err.message}`); }
      setBusy(false);
      e.target.value = "";
    };
    const stMeta = (id) => DOC_STATUSES.find((s) => s.id === id) || { label: id, color: S.text3 };
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {outstanding.length > 0 && <Card style={{ borderColor: "rgba(185,117,9,.35)" }}>
        <p style={{ color: S.amber, fontSize: 12.5, fontWeight: 800, margin: "0 0 8px" }}><Clock4 size={13} style={{ verticalAlign: -2 }} /> Waiting on you</p>
        {outstanding.map((o, i) => <div key={i} style={{ color: S.text2, fontSize: 12.5, padding: "5px 0", lineHeight: 1.5 }}>• {o.label}{o.due ? ` — due ${formatDate(o.due)}` : ""}{o.note ? <span style={{ color: S.text3 }}> ({o.note})</span> : ""}</div>)}
      </Card>}
      <Card>
        <p style={{ color: S.text2, fontSize: 12, fontWeight: 700, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: ".05em" }}>Submit a document</p>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
          <Select value={cat} onChange={(e) => setCat(e.target.value)} style={{ minWidth: 220 }}>{DOC_CATEGORIES.filter((d) => EMPLOYEE_DOC_CATS.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</Select>
          <Btn variant="primary" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={14} /> {busy ? "Uploading…" : replaceId ? "Choose replacement file" : "Choose file"}</Btn>
          {replaceId && <button onClick={() => setReplaceId(null)} style={{ background: "none", border: "none", color: S.text3, fontSize: 12, cursor: "pointer" }}>cancel replacement</button>}
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx" style={{ display: "none" }} onChange={onPick} />
        </div>
        {confirm && <p style={{ color: S.green, fontSize: 12.5, margin: "10px 0 0" }}><CheckCircle2 size={13} style={{ verticalAlign: -2 }} /> {confirm}</p>}
        <p style={{ color: S.text3, fontSize: 11.5, margin: "10px 0 0", lineHeight: 1.5 }}>PDF or photo is fine. Please send only what was requested — don't include genetic or family medical history.</p>
      </Card>
      <Card>
        <p style={{ color: S.text2, fontSize: 12, fontWeight: 700, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: ".05em" }}>Your submitted documents</p>
        {myDocs.length === 0 && <p style={{ color: S.text3, fontSize: 12.5, margin: 0 }}>Nothing submitted yet.</p>}
        {myDocs.map((d) => { const st = stMeta(d.status); return <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid rgba(0,75,135,.05)" }}>
          <Paperclip size={13} color={S.text3} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: S.text, fontSize: 12.5, fontWeight: 600 }}>{d.filename}{d.version > 1 ? <span style={{ color: S.text3, fontWeight: 400 }}> · v{d.version}</span> : null}</div>
            <div style={{ color: S.text3, fontSize: 11 }}>{DOC_CATEGORIES.find((x) => x.id === d.category)?.label} · uploaded {String(d.uploaded_at).slice(0, 10)}{d.review_notes && (d.status === "needs_info" || d.status === "incomplete") ? ` — ${d.review_notes}` : ""}</div>
          </div>
          <span style={{ color: st.color, background: `${st.color}1a`, border: `1px solid ${st.color}40`, borderRadius: RADIUS.pill, padding: "3px 10px", fontSize: 10.5, fontWeight: 800 }}>{st.label}</span>
          {(d.status === "incomplete" || d.status === "needs_info") && <Btn variant="secondary" small onClick={() => { setReplaceId(d.id); setCat(d.category); fileRef.current?.click(); }}>Replace</Btn>}
        </div>; })}
      </Card>
    </div>;
  }

  /* ── Support / secure messaging ── */
  function SupportTab({ c, me, messages, actions }) {
    const [body, setBody] = useState("");
    const thread = messages.filter((m) => m.case_id === c.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const send = async () => { if (!body.trim()) return; await actions.sendMessage(c.id, body.trim(), { sender_role: "employee", sender_name: me.name }); setBody(""); };
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ padding: 14 }}>
        <p style={{ margin: 0, color: S.text2, fontSize: 12.5, lineHeight: 1.55 }}>Secure thread with <strong style={{ color: S.text }}>{c.owner || "your HR case manager"}</strong> about case {c.ref}. Messages stay inside LeaveIQ — nothing goes to your supervisor.</p>
      </Card>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
          {thread.length === 0 && <p style={{ color: S.text3, fontSize: 12.5, margin: 0 }}>No messages yet — ask anything about your leave, paperwork, or pay coordination.</p>}
          {thread.map((m) => <div key={m.id} style={{ alignSelf: m.sender_role === "employee" ? "flex-end" : "flex-start", maxWidth: "78%" }}>
            <div style={{ background: m.sender_role === "employee" ? "rgba(0,75,135,.18)" : "rgba(0,75,135,.06)", border: `1px solid ${m.sender_role === "employee" ? "rgba(0,75,135,.35)" : S.border}`, borderRadius: 12, padding: "9px 13px", color: S.text, fontSize: 13, lineHeight: 1.5 }}>{m.body}</div>
            <div style={{ color: S.text3, fontSize: 10.5, marginTop: 3, textAlign: m.sender_role === "employee" ? "right" : "left" }}>{m.sender_name} · {String(m.created_at).slice(0, 16).replace("T", " ")}</div>
          </div>)}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message… (please don't include medical details beyond what HR asked for)" rows={2} style={{ flex: 1, background: "rgba(0,75,135,.05)", border: `1px solid ${S.border}`, borderRadius: 10, padding: "9px 13px", color: S.text, fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
          <Btn variant="primary" onClick={send} style={{ alignSelf: "flex-end" }}><Send size={14} /> Send</Btn>
        </div>
      </Card>
    </div>;
  }
}
