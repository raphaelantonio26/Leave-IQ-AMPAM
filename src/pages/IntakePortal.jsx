/* Employee intake portal (Tier 1).
 * Standalone page — no shell, no HR login. Reached via a magic link HR shares
 * (?intake=<token>, token = base64url file number in demo; a signed
 * intake_tokens row in production). The employee verifies with last name,
 * submits estimated dates and reason, and a Pending case is created with a
 * BLANK designation — clocks stay idle until HR reviews and designates.
 * Submissions audit with source = 'intake'. */
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Send, CalendarDays } from "lucide-react";
import { S, RADIUS, ELEV, Card, Btn, Input, Select } from "../ui.jsx";
import { AMPAM_LOGO } from "../assets/ampamLogo.js";
import { LEAVE_REASONS } from "../lib/compliance/engine.js";
import { useData } from "../data/DataContext.jsx";

export function decodeIntakeToken(token) {
  if (!token || token === "new") return "";
  try { return atob(token.replace(/-/g, "+").replace(/_/g, "/")); } catch { return ""; }
}
export function encodeIntakeToken(fileNumber) {
  return btoa(String(fileNumber)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const REASONS = LEAVE_REASONS.filter((r) => r.id !== "military_exigency");

export default function IntakePortal({ token }) {
  const { actions, demo } = useData();
  const prefill = useMemo(() => decodeIntakeToken(token), [token]);
  const [form, setForm] = useState({ file_number: prefill, last_name: "", reason: "own_serious_health", start_date: "", end_date: "", intermittent: false, notes: "", token });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    setErr(""); setBusy(true);
    try { setDone(await actions.submitIntake(form)); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const label = { color: S.text3, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5, marginTop: 14 };
  return <div style={{ minHeight: "100vh", background: S.bg, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 16px", fontFamily: "Arial,Helvetica,sans-serif" }}>
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ width: "100%", maxWidth: 480 }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <img src={AMPAM_LOGO} alt="AMPAM — Mechanical | Electrical | Plumbing" style={{ width: 230, height: "auto" }} />
        <div style={{ fontSize: 10.5, color: S.text3, marginTop: 6 }}>LeaveIQ · AMPAM Parks Mechanical · Multimech · Seal Electric</div>
      </div>
      {done ? <Card>
        <div style={{ textAlign: "center", padding: "22px 6px" }}>
          <CheckCircle size={42} color={S.green} style={{ margin: "0 auto 12px", display: "block" }} />
          <div style={{ color: S.text, fontSize: 17, fontWeight: 800 }}>Request received</div>
          <div style={{ color: S.text2, fontSize: 13.5, marginTop: 10, lineHeight: 1.6 }}>Your reference is <strong style={{ color: S.indigoL }}>{done.ref}</strong>.<br />{done.owner} from HR will review your request and contact you about next steps, including any paperwork your provider needs to complete.</div>
          <div style={{ color: S.text3, fontSize: 12, marginTop: 14, lineHeight: 1.5 }}>You can close this page. Submitting this form does not start or guarantee leave — HR will confirm your eligibility and the type of leave that applies.</div>
        </div>
      </Card> : <Card>
        <h1 style={{ margin: "0 0 4px", color: S.text, fontSize: 19, fontWeight: 800 }}>Request a leave of absence</h1>
        <p style={{ margin: 0, color: S.text3, fontSize: 12.5, lineHeight: 1.55 }}>Takes about two minutes. HR reviews every request — nothing is final until they contact you.</p>
        <label style={label}>Employee file number</label>
        <Input value={form.file_number} onChange={(e) => set("file_number", e.target.value)} placeholder="e.g. 001482 — on your pay stub" inputMode="numeric" disabled={!!prefill} style={prefill ? { opacity: .7 } : {}} />
        <label style={label}>Last name (to verify it's you)</label>
        <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} placeholder="Last name" autoComplete="family-name" />
        <label style={label}>What is the leave for?</label>
        <Select value={form.reason} onChange={(e) => set("reason", e.target.value)} style={{ width: "100%" }}>{REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={label}>Estimated start</label><Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></div>
          <div><label style={label}>Estimated return</label><Input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></div>
        </div>
        <label style={{ ...label, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 16 }}>
          <input type="checkbox" checked={form.intermittent} onChange={(e) => set("intermittent", e.target.checked)} style={{ accentColor: S.indigo }} />
          <span style={{ color: S.text2, fontSize: 13, fontWeight: 500 }}>I expect to need time off in blocks (intermittent), not all at once</span>
        </label>
        <label style={label}>Anything HR should know? <span style={{ fontWeight: 400 }}>(optional — please don't include medical details)</span></label>
        <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Best phone number, preferred contact time, etc." style={{ background: "rgba(0,75,135,.05)", border: `1px solid ${S.border}`, borderRadius: 9, padding: "9px 14px", color: S.text, fontSize: 13, outline: "none", width: "100%", resize: "vertical", minHeight: 64, fontFamily: "inherit", boxSizing: "border-box" }} />
        {err && <div style={{ color: S.red, fontSize: 12.5, marginTop: 12, background: "rgba(239,51,64,.07)", border: "1px solid rgba(239,51,64,.25)", borderRadius: 8, padding: "9px 12px" }}>{err}</div>}
        <Btn variant="primary" disabled={busy} onClick={submit} style={{ width: "100%", justifyContent: "center", marginTop: 18 }}><Send size={14} /> {busy ? "Submitting…" : "Submit request"}</Btn>
        <p style={{ color: S.text3, fontSize: 11, lineHeight: 1.55, marginTop: 14, marginBottom: 0 }}><CalendarDays size={11} style={{ verticalAlign: -1.5 }} /> Dates can be estimates — HR will confirm them with you. {demo ? "Demo environment: submissions go to the synthetic dataset." : ""}</p>
      </Card>}
    </motion.div>
  </div>;
}
