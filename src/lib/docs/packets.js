/* Dynamic packet builder (v1.3 · Priority 3).
 * A packet definition is pure configuration: { name, designations, items:
 * [template_id, …] }. Generation renders each template against the case's
 * merge context and binds them into one branded PDF with a cover page and a
 * contents list. Admins compose packets in the Document Library — zero code. */
import { jsPDF } from "jspdf";
import { renderTemplate, mergeContext } from "./templates.js";
import { drawLetterhead, drawFooter, NAVY, RED } from "../../pdf/letterhead.js";

/** Resolve a packet definition into its ordered, active templates. */
export function resolvePacket(packetDef, templates) {
  const byId = Object.fromEntries(templates.map((t) => [t.id, t]));
  return (packetDef.items || []).map((id) => byId[id]).filter((t) => t && t.status !== "archived");
}

/** Pure assembly used by both the PDF and tests: rendered sections in order. */
export function assemblePacket(packetDef, templates, ctx) {
  return resolvePacket(packetDef, templates).map((t) => ({
    template_id: t.id, name: t.name, category: t.category,
    body: renderTemplate(t.body, ctx),
  }));
}

const PAGE_W = 215.9, MARGIN = 22, LINE_H = 5.4;

export function buildPacketPDF({ packetDef, templates, caseData, employee, entity }) {
  const ctx = mergeContext({ caseData, employee, entity });
  const sections = assemblePacket(packetDef, templates, ctx);
  if (!sections.length) throw new Error("This packet has no active templates.");
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const W = PAGE_W - MARGIN * 2;

  // cover — branded letterhead, navy title
  let y = drawLetterhead(doc, { entityName: entity?.legal_name || entity?.name || "", ein: entity?.ein_masked || "", address: entity?.mailing_address || "", hrContact: entity?.hr_contact_name || "" }, MARGIN);
  doc.setTextColor(...NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text(packetDef.name, MARGIN, y + 6);
  doc.setTextColor(30, 30, 30); doc.setFontSize(11); doc.setFont("helvetica", "normal");
  y = y + 18;
  for (const [l, v] of [["Employee", `${employee?.name || ""} · File ${employee?.file_number || ""}`], ["Case", caseData?.ref || ""], ["Designation", ctx.designation], ["Leave dates", `${ctx.start_date} → ${ctx.end_date}`], ["Prepared", ctx.today]]) {
    doc.setFont("helvetica", "bold"); doc.text(`${l}:`, MARGIN, y);
    doc.setFont("helvetica", "normal"); doc.text(String(v), MARGIN + 34, y); y += 7;
  }
  y += 6; doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Contents", MARGIN, y); y += 7;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
  sections.forEach((s, i) => { doc.text(`${i + 1}.  ${s.name}`, MARGIN + 2, y); y += 6.4; });

  // sections
  for (const [i, s] of sections.entries()) {
    doc.addPage();
    let yy = drawLetterhead(doc, { entityName: entity?.legal_name || entity?.name || "", ein: entity?.ein_masked || "" }, MARGIN);
    doc.setTextColor(...RED); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    doc.text(`${packetDef.name.toUpperCase()} — SECTION ${i + 1} OF ${sections.length}`, MARGIN, yy);
    doc.setTextColor(...NAVY); doc.setFontSize(14);
    doc.text(s.name, MARGIN, yy + 7);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(35, 35, 35);
    yy = yy + 15;
    for (const line of doc.splitTextToSize(s.body, W)) {
      if (yy > 258) { doc.addPage(); yy = 36; }
      doc.text(line, MARGIN, yy); yy += LINE_H;
    }
  }
  // footer page numbers + tagline
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    drawFooter(doc, `${caseData?.ref || ""} · ${packetDef.name}`, `Page ${p} of ${n}`);
  }
  const filename = `${(caseData?.ref || "case").replace(/\s+/g, "_")}_${packetDef.name.replace(/[^a-z0-9]+/gi, "_")}.pdf`;
  return { doc, filename, sections: sections.length };
}
