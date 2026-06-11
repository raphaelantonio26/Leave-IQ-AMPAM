/* Legal-ready case export (v1.3 · Priority 9).
 * Builds a litigation/audit-ready defense binder for one case:
 *   Exhibit A — Case summary (employee, leave history, designation timeline)
 *   Exhibit B — Compliance calculations (eligibility, entitlement, exhaustion)
 *   Exhibit C — Document repository inventory (with review states + notes)
 *   Exhibit D — Communications log (secure messages, metadata + bodies)
 *   Exhibit E — Generated notices & packets
 *   Exhibit F — Complete audit trail (date · time · user · action · source)
 * Output: single PDF binder, or ZIP (binder + stored document files + audit CSV).
 * Suitable for DOL / CRD / EEOC / litigation / internal review. */
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { computeEligibility, exhaustionProjection } from "../compliance/engine.js";
import { DOC_CATEGORIES, DOC_STATUSES } from "../docs/templates.js";
import { drawLetterhead, drawFooter, NAVY, RED } from "../../pdf/letterhead.js";

const PAGE_W = 215.9, M = 20, LH = 5.2;
const fmt = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));

function header(doc, title, sub, entity) {
  let y = drawLetterhead(doc, { entityName: entity?.legal_name || "", ein: entity?.ein_masked || "", address: entity?.mailing_address || "", hrContact: entity?.hr_contact_name ? `${entity.hr_contact_name}${entity.hr_contact_title ? `, ${entity.hr_contact_title}` : ""}` : "" }, M);
  doc.setTextColor(...RED); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  doc.text("CASE DEFENSE BINDER", M, y);
  doc.setTextColor(...NAVY); doc.setFontSize(14);
  doc.text(title, M, y + 7);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.6); doc.setTextColor(105, 129, 156);
  doc.text(sub, M, y + 13);
  doc.setTextColor(25, 25, 25);
  return y + 21;
}
function kv(doc, y, label, value, indent = 0) {
  if (y > 265) { doc.addPage(); y = 22; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.text(`${label}:`, M + indent, y);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(fmt(value), PAGE_W - M * 2 - 52 - indent);
  doc.text(lines, M + indent + 52, y);
  return y + Math.max(1, lines.length) * LH + 1.2;
}
function para(doc, y, text, size = 9.5) {
  doc.setFont("helvetica", "normal"); doc.setFontSize(size);
  for (const line of doc.splitTextToSize(text, PAGE_W - M * 2)) {
    if (y > 268) { doc.addPage(); y = 22; }
    doc.text(line, M, y); y += LH;
  }
  return y;
}
function rule(doc, y) { doc.setDrawColor(210, 210, 220); doc.line(M, y, PAGE_W - M, y); return y + 5; }

export function buildDefenseBinder({ caseData, employee, entity, certifications = [], intermittentLog = [], auditEvents = [], documents = [], messages = [] }) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const ref = caseData.ref || `#${caseData.id}`;
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const caseAudit = auditEvents.filter((a) => a.case_id === caseData.id || a.case_ref === caseData.ref);
  const caseLog = intermittentLog.filter((l) => l.case_id === caseData.id).sort((a, b) => new Date(a.usage_date) - new Date(b.usage_date));
  const caseCerts = certifications.filter((c) => c.case_id === caseData.id);
  const caseDocs = documents.filter((d) => d.case_id === caseData.id);
  const caseMsgs = messages.filter((m) => m.case_id === caseData.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const generated = (caseData.documents || []);

  /* cover — branded letterhead, navy/red typography on white */
  let cy = drawLetterhead(doc, { entityName: entity?.legal_name || "", ein: entity?.ein_masked || "", address: entity?.mailing_address || "", hrContact: entity?.hr_contact_name || "" }, M);
  doc.setTextColor(...RED); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("CONFIDENTIAL — PREPARED FOR LEGAL REVIEW", M, cy + 4);
  doc.setTextColor(...NAVY); doc.setFontSize(25);
  doc.text("CASE DEFENSE BINDER", M, cy + 16);
  doc.setFontSize(13); doc.setTextColor(20, 103, 168);
  doc.text(`${ref} — ${employee?.name || ""}`, M, cy + 25);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(61, 85, 112);
  cy += 40;
  for (const [l, v] of [["Entity", entity?.legal_name || ""], ["Designation", caseData.leave_designation || caseData.type || "Pending"], ["Leave period", `${fmt(caseData.start_date)} → ${fmt(caseData.end_date)}`], ["Status", caseData.status], ["Generated", stamp], ["Generated for", "DOL / CRD / EEOC / litigation / internal legal review"]]) {
    doc.setFont("helvetica", "bold"); doc.setTextColor(...NAVY); doc.text(`${l}:`, M, cy);
    doc.setFont("helvetica", "normal"); doc.setTextColor(61, 85, 112); doc.text(String(v), M + 42, cy); cy += 8;
  }
  cy += 8; doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY); doc.text("Exhibits", M, cy); cy += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(61, 85, 112);
  for (const e of ["A — Case Summary & Designation Timeline", "B — Compliance Calculations", "C — Document Repository Inventory", "D — Communications Log", "E — Generated Notices & Packets", "F — Complete Audit Trail"]) { doc.text(`Exhibit ${e}`, M + 2, cy); cy += 7; }
  doc.setFontSize(8); doc.setTextColor(105, 129, 156);
  doc.text("Records produced from the LeaveIQ system of record. Audit entries are stored append-only at the database;", M, 252);
  doc.text("modification of historical entries is revoked for all roles including administrators.", M, 257);

  /* Exhibit A */
  doc.addPage();
  let y = header(doc, "Exhibit A — Case Summary", `${ref} · ${employee?.name || ""} · generated ${stamp}`, entity);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Employee", M, y); y += 6;
  y = kv(doc, y, "Name", employee?.name); y = kv(doc, y, "File number", employee?.file_number);
  y = kv(doc, y, "Entity", entity?.legal_name); y = kv(doc, y, "Department / Position", `${fmt(employee?.dept || employee?.department)} / ${fmt(employee?.position)}`);
  y = kv(doc, y, "Hire date", employee?.hire_date); y = kv(doc, y, "Schedule", `${employee?.hours_per_week || 40} hrs/week${employee?.hours_per_week ? "" : " (full-time assumed)"}`);
  y = rule(doc, y + 2);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Leave case", M, y); y += 6;
  y = kv(doc, y, "Reference", ref); y = kv(doc, y, "Status", caseData.status);
  y = kv(doc, y, "Designation(s)", caseData.leave_designation || caseData.type || "Pending — clocks idle");
  y = kv(doc, y, "Concurrent clocks", (caseData.concurrent_clocks || []).join(" + ") || "None");
  y = kv(doc, y, "Reason", (caseData.reason || "").replace(/_/g, " "));
  y = kv(doc, y, "Dates", `${fmt(caseData.start_date)} → ${fmt(caseData.end_date)}`);
  y = kv(doc, y, "Schedule type", caseData.intermittent ? "Intermittent" : "Continuous");
  y = kv(doc, y, "Source", caseData.source || "web"); y = kv(doc, y, "HR owner", caseData.owner);
  y = rule(doc, y + 2);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Designation timeline", M, y); y += 6;
  const hist = caseData.designation_history || [];
  if (!hist.length) y = para(doc, y, "No designation transitions — original designation in effect for the life of the case.");
  for (const [i, h] of hist.entries()) {
    y = kv(doc, y, `Transition ${i + 1}`, `${(h.from || []).join(" + ") || "Unassigned"} → ${(h.to || []).join(" + ")} effective ${h.effective_date}`);
    y = kv(doc, y, "Recorded by", `${h.actor} · ${String(h.created_at).slice(0, 19).replace("T", " ")}`, 6);
    if (h.reason) y = kv(doc, y, "Reason", h.reason, 6);
    y = kv(doc, y, "State at transition", `${h.at_transition?.used_hours ?? "—"} / ${h.at_transition?.total_hours ?? "—"} hours used${h.at_transition?.exhausted ? " — EXHAUSTED" : ""}`, 6);
    y += 2;
  }

  /* Exhibit B */
  doc.addPage();
  y = header(doc, "Exhibit B — Compliance Calculations", `${ref} · methodology shown with inputs`, entity);
  const elig = employee ? computeEligibility(employee) : null;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Eligibility determination", M, y); y += 6;
  if (elig) {
    y = kv(doc, y, "FMLA eligible", elig.fmlaEligible ? "YES" : "NO");
    y = kv(doc, y, "Tenure", `${elig.tenureMonths} months (requirement: ≥ 12 months)`);
    y = kv(doc, y, "Hours worked (12 mo)", `${elig.hoursWorked.toLocaleString()}${elig.approximate ? " (YTD approximation — payroll trailing-12 not on file)" : ""} (requirement: ≥ 1,250)`);
    y = kv(doc, y, "Applicable programs", (elig.applicableLaws || []).join(", ") || "—");
  }
  y = rule(doc, y + 2);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Entitlement & usage", M, y); y += 6;
  y = kv(doc, y, "Entitlement basis", `${caseData.leave_designation || caseData.type || "—"} at ${employee?.hours_per_week || 40} hrs/week schedule`);
  y = kv(doc, y, "Total entitlement", `${fmt(caseData.total_hours)} hours`);
  y = kv(doc, y, "Used to date", `${fmt(caseData.used_hours)} hours`);
  y = kv(doc, y, "Remaining", `${Math.max(0, (caseData.total_hours || 0) - (caseData.used_hours || 0))} hours`);
  for (const clock of caseData.concurrent_clocks || []) y = kv(doc, y, `${clock} clock`, `charged concurrently — ${fmt(caseData.used_hours)} of ${fmt(caseData.total_hours)} hours`, 4);
  y = para(doc, y + 2, "Method: FMLA usage measured against a rolling 12-month window calculated backward from each usage date (29 CFR 825.200(b)(4)); hours age out of the window individually. PDL entitlement is 17 1/3 workweeks expressed in scheduled hours. CFRA baby-bonding is a separate additional bank and is never charged concurrently with PDL.", 8.8);
  if (caseData.intermittent && caseLog.length) {
    y = rule(doc, y + 1);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Intermittent usage detail", M, y); y += 6;
    for (const l of caseLog) { y = kv(doc, y, l.usage_date, `${l.hours_used} hours${l.approved_by ? ` · approved by ${l.approved_by}` : ""}`); }
    const remaining = Math.max(0, (caseData.total_hours || 0) - (caseData.used_hours || 0));
    const proj = exhaustionProjection({ remaining, entries: caseLog });
    if (proj) y = kv(doc, y + 1, "Exhaustion projection", `${proj.projectedDate} at trailing 4-week burn of ${proj.burnPerWeek} hrs/week`);
  }
  y = rule(doc, y + 1);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Certification chain", M, y); y += 6;
  if (!caseCerts.length) y = para(doc, y, "No certifications recorded.");
  for (const c of caseCerts) y = kv(doc, y, c.kind === "recert" ? "Recertification" : c.kind === "fitness_for_duty" ? "Fitness-for-duty" : "Initial certification", `requested ${fmt(c.requested_at)} · due ${fmt(c.due_date)} · ${c.received_at ? `received ${c.received_at}` : "NOT received"}`);

  /* Exhibit C */
  doc.addPage();
  y = header(doc, "Exhibit C — Document Repository", `${ref} · ${caseDocs.length} document(s, entity) on file`);
  if (!caseDocs.length) y = para(doc, y, "No documents uploaded to this case.");
  for (const [i, d] of caseDocs.entries()) {
    const cat = DOC_CATEGORIES.find((c) => c.id === d.category)?.label || d.category;
    const st = DOC_STATUSES.find((s) => s.id === d.status)?.label || d.status;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    if (y > 258) { doc.addPage(); y = 22; }
    doc.text(`C-${i + 1} · ${d.filename}`, M, y); y += 5.5;
    y = kv(doc, y, "Category / Status", `${cat} · ${st}`, 4);
    y = kv(doc, y, "Uploaded", `${String(d.uploaded_at).slice(0, 19).replace("T", " ")} by ${d.uploaded_by} (${d.uploaded_role})${d.version > 1 ? ` · version ${d.version}` : ""}`, 4);
    if (d.reviewed_by) y = kv(doc, y, "Reviewed", `${d.reviewed_by} · ${String(d.reviewed_at || "").slice(0, 10)}`, 4);
    if (d.review_notes) y = kv(doc, y, "Review notes", d.review_notes, 4);
    y += 1.5;
  }

  /* Exhibit D */
  doc.addPage();
  y = header(doc, "Exhibit D — Communications Log", `${ref} · ${caseMsgs.length} secure message(s, entity)`);
  if (!caseMsgs.length) y = para(doc, y, "No secure messages on this case.");
  for (const m of caseMsgs) {
    if (y > 252) { doc.addPage(); y = 22; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
    doc.text(`${String(m.created_at).slice(0, 16).replace("T", " ")} — ${m.sender_name} (${m.sender_role})`, M, y); y += 5;
    y = para(doc, y, m.body, 9.5); y += 2.5;
  }

  /* Exhibit E */
  doc.addPage();
  y = header(doc, "Exhibit E — Generated Notices & Packets", `${ref} · ${generated.length} generated document(s, entity)`);
  if (!generated.length) y = para(doc, y, "No system-generated documents on this case.");
  for (const g of generated) y = kv(doc, y, g.filename || g.title, `${g.title || ""}${g.language ? ` · ${g.language}` : ""}${g.date ? ` · ${g.date}` : ""}`);

  /* Exhibit F */
  doc.addPage();
  y = header(doc, "Exhibit F — Complete Audit Trail", `${ref} · ${caseAudit.length} append-only entries · chronological`, entity);
  const sorted = [...caseAudit].sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at));
  for (const a of sorted) {
    if (y > 262) { doc.addPage(); y = 22; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.8);
    doc.text(String(a.changed_at).slice(0, 19).replace("T", " "), M, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(`${a.changed_by} [${a.source}] — ${a.action}`, PAGE_W - M * 2 - 42);
    doc.text(lines, M + 42, y);
    y += Math.max(1, lines.length) * 4.6 + 1.6;
  }

  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) { doc.setPage(p); drawFooter(doc, `${ref} Defense Binder · ${stamp}`, `Page ${p} of ${n}`); }
  return { doc, filename: `${ref.replace(/\s+/g, "_")}_Defense_Binder.pdf` };
}

export const auditCSV = (rows) =>
  ["changed_at,changed_by,source,action", ...rows.map((a) => [a.changed_at, a.changed_by, a.source, `"${String(a.action).replace(/"/g, '""')}"`].join(","))].join("\n");

/** ZIP archive: binder PDF + stored document files + audit CSV. */
export async function buildDefenseZip(args, storage) {
  const { doc, filename } = buildDefenseBinder(args);
  const zip = new JSZip();
  zip.file(filename, doc.output("arraybuffer"));
  const ref = args.caseData.ref || `case_${args.caseData.id}`;
  const caseAudit = args.auditEvents.filter((a) => a.case_id === args.caseData.id || a.case_ref === args.caseData.ref);
  zip.file(`${ref}_audit_trail.csv`, auditCSV([...caseAudit].sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at))));
  const docsDir = zip.folder("documents");
  const manifest = [];
  for (const d of args.documents.filter((x) => x.case_id === args.caseData.id)) {
    manifest.push(`${d.filename} | ${d.category} | ${d.status} | uploaded ${d.uploaded_at} by ${d.uploaded_by}`);
    if (storage && d.storage_path) {
      const dataUrl = await storage.getDataUrl(d.storage_path);
      if (dataUrl) docsDir.file(d.filename, dataUrl.split(",")[1], { base64: true });
    }
  }
  docsDir.file("_manifest.txt", manifest.join("\n") || "No documents on file.");
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, filename: `${ref.replace(/\s+/g, "_")}_Defense_Packet.zip` };
}
