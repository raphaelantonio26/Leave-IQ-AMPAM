// LeaveIQ cert-alerts edge function (Deno / Supabase Edge Functions)
//
// Scans open cases and emails the HR team when:
//   - certification due in 7 days  (kind: cert_7d)
//   - certification due in 3 days  (kind: cert_3d)
//   - certification overdue        (kind: cert_overdue)
//   - return-to-work within 14 days (kind: rtw_14d)
//   - payroll coordination due/overdue (kind: payroll_due)        [v1.2]
//   - recertification due within 3 days (kind: recert_due)        [v1.2]
//
// Idempotent: each (case, recipient, kind) is recorded in `notifications`
// with a unique constraint, so re-runs never double-send.
// Respects per-user hr_users.notification_prefs.
//
// Secrets (supabase secrets set ...):
//   RESEND_API_KEY     — email provider key
//   ALERT_FROM_EMAIL   — e.g. "LeaveIQ <leaveiq@ampam.example>"
//
// Schedule (Dashboard → Edge Functions → cron, or supabase functions schedule):
//   0 14 * * 1-5   (06:00 Pacific weekdays)

import { createClient } from "npm:@supabase/supabase-js@2";
import { escapeHtml } from "./escape.js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // service role: bypasses RLS, server-side only
);
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("ALERT_FROM_EMAIL") ?? "LeaveIQ <leaveiq@example.com>";

type Alert = { caseId: number; ref: string; employee: string; kind: string; subject: string; line: string };

function daysFromToday(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_KEY) { console.log(`[dry-run] would email ${to}: ${subject}`); return true; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) console.error(`Resend ${res.status}: ${await res.text()}`);
  return res.ok;
}

Deno.serve(async () => {
  const queryErrors: string[] = [];
  const { data: cases, error: casesErr } = await supabase
    .from("leave_cases")
    .select("id, ref, status, cert_received, cert_due, end_date, owner_id, employee_id, payroll_flag, ffd, employees(name)")
    .in("status", ["Pending", "Active", "Approved"]);
  const { data: openCerts, error: certsErr } = await supabase
    .from("certifications")
    .select("id, case_id, kind, due_date, received_at")
    .is("received_at", null)
    .eq("kind", "recert");
  // `cases` is the spine of the scan — a failure there is fatal; the rest degrade.
  if (casesErr) return new Response(JSON.stringify({ error: casesErr.message }), { status: 500 });
  if (certsErr) queryErrors.push(`certifications query failed: ${certsErr.message}`);

  const alerts: Alert[] = [];
  for (const c of cases ?? []) {
    const emp = (c as any).employees?.name ?? `case ${c.ref}`;
    if (!c.cert_received && c.cert_due) {
      const d = daysFromToday(c.cert_due);
      if (d < 0) alerts.push({ caseId: c.id, ref: c.ref, employee: emp, kind: "cert_overdue", subject: `[LeaveIQ] Certification OVERDUE — ${c.ref}`, line: `Medical certification for ${emp} (${c.ref}) is ${-d} day(s) overdue (was due ${c.cert_due}).` });
      else if (d === 3) alerts.push({ caseId: c.id, ref: c.ref, employee: emp, kind: "cert_3d", subject: `[LeaveIQ] Certification due in 3 days — ${c.ref}`, line: `Medical certification for ${emp} (${c.ref}) is due ${c.cert_due}.` });
      else if (d === 7) alerts.push({ caseId: c.id, ref: c.ref, employee: emp, kind: "cert_7d", subject: `[LeaveIQ] Certification due in 7 days — ${c.ref}`, line: `Medical certification for ${emp} (${c.ref}) is due ${c.cert_due}.` });
    }
    if (c.end_date) {
      const d = daysFromToday(c.end_date);
      if (d === 14) {
        const ffd = (c as any).ffd ?? {};
        const ffdNote = ffd.required === true && !ffd.cleared_at ? " Fitness-for-duty is NOT yet cleared." : "";
        alerts.push({ caseId: c.id, ref: c.ref, employee: emp, kind: "rtw_14d", subject: `[LeaveIQ] Return to work in 14 days — ${c.ref}`, line: `${emp} (${c.ref}) is scheduled to return ${c.end_date}. Confirm fitness-for-duty requirements and the return plan.${ffdNote}` });
      }
    }
    const pf = (c as any).payroll_flag;
    if (pf && !pf.acknowledged && pf.coordinate_by) {
      const d = daysFromToday(pf.coordinate_by);
      if (d <= 1) alerts.push({ caseId: c.id, ref: c.ref, employee: emp, kind: "payroll_due", subject: `[LeaveIQ] Payroll coordination ${d < 0 ? "OVERDUE" : "due"} — ${c.ref}`, line: `${pf.message} (${emp}, ${c.ref}). Coordinate by ${pf.coordinate_by}${d < 0 ? " — past due" : ""}, then acknowledge in the case.` });
    }
  }
  for (const rc of openCerts ?? []) {
    const c = (cases ?? []).find((x) => x.id === rc.case_id);
    if (!c || !rc.due_date) continue;
    const emp = (c as any).employees?.name ?? c.ref;
    const d = daysFromToday(rc.due_date);
    if (d === 3 || d < 0) alerts.push({ caseId: c.id, ref: c.ref, employee: emp, kind: "recert_due", subject: `[LeaveIQ] Recertification ${d < 0 ? "OVERDUE" : "due in 3 days"} — ${c.ref}`, line: `Recertification for ${emp} (${c.ref}) is ${d < 0 ? `${-d} day(s) overdue` : `due ${rc.due_date}`}.` });
  }
  if (!alerts.length) return new Response(JSON.stringify({ scanned: cases?.length ?? 0, alerts: 0, sent: 0, errors: queryErrors }), { headers: { "Content-Type": "application/json" } });

  const { data: recipients, error: recipErr } = await supabase
    .from("hr_users")
    .select("id, email, name, role, notification_prefs")
    .in("role", ["admin", "specialist"])
    .eq("active", true);
  if (recipErr) queryErrors.push(`hr_users query failed: ${recipErr.message}`);

  let sent = 0;
  for (const a of alerts) {
    for (const r of recipients ?? []) {
      const prefs = (r.notification_prefs ?? {}) as Record<string, boolean>;
      if (prefs.email === false || prefs[a.kind] === false) continue;
      // idempotency: unique (case_id, hr_user_id, kind)
      const { error: insErr } = await supabase.from("notifications").insert({ case_id: a.caseId, hr_user_id: r.id, kind: a.kind });
      if (insErr) continue; // already sent
      const ok = await sendEmail(
        r.email,
        a.subject,
        `<div style="font-family:Arial,sans-serif;max-width:560px">
           <div style="background:#004B87;color:#fff;padding:12px 18px;border-radius:8px 8px 0 0;font-weight:700">LeaveIQ — AMPAM Parks Mechanical</div>
           <div style="border:1px solid #e2e8f0;border-top:none;padding:18px;border-radius:0 0 8px 8px">
             <p style="margin:0 0 12px;font-size:14px;color:#1e293b">${escapeHtml(a.line)}</p>
             <p style="margin:0;font-size:12px;color:#64748b">Open LeaveIQ → Cases → ${escapeHtml(a.ref)} to take action. This alert was generated automatically; reply is not monitored.</p>
           </div></div>`,
      );
      if (ok) {
        sent++;
        await supabase.from("audit_events").insert({ case_id: a.caseId, action: `Alert emailed (${a.kind}) to ${r.name}`, changed_by: "system", source: "system" });
      }
    }
  }
  return new Response(JSON.stringify({ scanned: cases?.length ?? 0, alerts: alerts.length, sent, errors: queryErrors }), { headers: { "Content-Type": "application/json" } });
});
