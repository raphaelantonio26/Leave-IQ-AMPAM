/* Shared AMPAM letterhead for every generated PDF (v2.1).
 * Brand rules honored: complete logo only, original colors, white field,
 * Arial-equivalent (Helvetica in jsPDF), navy #004B87 + red #EF3340 accents,
 * tagline "Building on a Foundation of Trust" in the footer. */
import { AMPAM_LOGO, AMPAM_LOGO_RATIO, AMPAM_TAGLINE } from "../assets/ampamLogo.js";

export const PAGE_W = 215.9;
export const NAVY = [0, 75, 135];
export const RED = [239, 51, 64];
const LOGO_W = 50; // mm
const LOGO_H = LOGO_W / AMPAM_LOGO_RATIO;

/** Draw the letterhead on the CURRENT page. Returns the content start Y. */
export function drawLetterhead(doc, { entityName = "", ein = "", address = "", hrContact = "" } = {}, margin = 20) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE_W, 30, "F");
  try { doc.addImage(AMPAM_LOGO, "PNG", margin, 7, LOGO_W, LOGO_H); } catch { /* logo asset unavailable — text letterhead below still renders */ }
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
  if (entityName) doc.text(entityName, PAGE_W - margin, 11, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(61, 85, 112);
  const sub = [ein, address].filter(Boolean).join(" · ");
  if (sub) doc.text(sub, PAGE_W - margin, 16.5, { align: "right" });
  if (hrContact) doc.text(`HR: ${hrContact}`, PAGE_W - margin, 21.5, { align: "right" });
  // brand rule: navy line with a red leading segment
  doc.setDrawColor(...RED); doc.setLineWidth(1.1); doc.line(margin, 27.5, margin + 26, 27.5);
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.5); doc.line(margin + 26, 27.5, PAGE_W - margin, 27.5);
  doc.setTextColor(25, 35, 48);
  return 36;
}

/** Page-footer with the tagline; call once per page. */
export function drawFooter(doc, line, pageLabel) {
  doc.setFontSize(7.4); doc.setTextColor(105, 129, 156);
  if (line) doc.text(line, PAGE_W / 2, 268.5, { align: "center" });
  doc.setFont("helvetica", "italic");
  doc.text(`AMPAM · ${AMPAM_TAGLINE}`, PAGE_W / 2, 273.5, { align: "center" });
  doc.setFont("helvetica", "normal");
  if (pageLabel) doc.text(pageLabel, PAGE_W - 20, 273.5, { align: "right" });
}
