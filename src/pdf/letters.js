/* Letter generation: company leave notice, eligibility determination,
 * designation notice, return-to-work — EN + ES, entity-branded header/footer.
 * Letters render as PDF, attach to the case, and log to the audit trail
 * (attachment + audit handled by the data layer; this module is pure).
 * Letter text is template language, not legal advice.
 */
import { jsPDF } from "jspdf";
import { drawLetterhead, drawFooter } from "./letterhead.js";
import { computeEligibility, entitlementHours, scheduledHoursPerWeek } from "../lib/compliance/engine.js";

export const LETTER_TYPES = [
  { id: "company_notice", label: "Company Leave Notice", labelES: "Aviso de Licencia" },
  { id: "eligibility", label: "Eligibility Determination", labelES: "Determinación de Elegibilidad" },
  { id: "designation", label: "Designation Notice (FMLA/CFRA/PDL)", labelES: "Aviso de Designación" },
  { id: "return_to_work", label: "Return-to-Work Letter", labelES: "Carta de Regreso al Trabajo" },
];

const fmt = (d, es) => { const x = new Date(`${String(d).slice(0, 10)}T00:00:00`); return isNaN(x) ? (es ? "Por determinar" : "TBD") : x.toLocaleDateString(es ? "es-ES" : "en-US", { year: "numeric", month: "long", day: "numeric" }); };

export function generateLetter({ letterType = "company_notice", language = "EN", caseData, employee, entity }) {
  const es = language === "ES";
  const name = employee?.name || (es ? "Empleado/a" : "Employee");
  const entName = entity?.legal_name || entity?.name || "AMPAM Parks Mechanical";
  const type = caseData?.leave_designation || caseData?.type || (es ? "Licencia" : "Leave");
  const clocks = (caseData?.concurrent_clocks || []).join(" + ") || type;
  const elig = employee ? computeEligibility(employee) : null;
  const hpw = employee ? scheduledHoursPerWeek(employee) : 40;
  const now = new Date().toLocaleDateString(es ? "es-ES" : "en-US", { year: "numeric", month: "long", day: "numeric" });
  const start = fmt(caseData?.start_date, es), end = fmt(caseData?.end_date, es);
  const safe = (employee?.name || "employee").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const filename = `${letterType}_${safe}_${caseData?.ref || "case"}.pdf`;
  const close = es ? `Atentamente,\nRecursos Humanos\n${entName}` : `Sincerely,\nHuman Resources\n${entName}`;
  const disclaimer = es ? "\n\n[Este aviso no constituye asesoramiento legal.]" : "\n\n[This notice does not constitute legal advice.]";

  let title, body;
  switch (letterType) {
    case "eligibility": {
      title = es ? "Determinación de Elegibilidad" : "Eligibility Determination";
      const verdict = elig?.fmlaEligible
        ? (es ? `Según nuestros registros, usted cumple los criterios de elegibilidad de FMLA/CFRA: ${elig.tenureMonths} meses de antigüedad y ${elig.hoursWorked.toLocaleString()} horas trabajadas en los últimos 12 meses.`
              : `Based on our records, you meet FMLA/CFRA eligibility criteria: ${elig.tenureMonths} months of service and ${elig.hoursWorked.toLocaleString()} hours worked in the preceding 12 months.`)
        : (es ? `Según nuestros registros, actualmente no cumple los criterios de elegibilidad de FMLA/CFRA (se requieren 12 meses de antigüedad y 1,250 horas en los últimos 12 meses). Pueden aplicar otras protecciones, incluida la PDL de California.`
              : `Based on our records, you do not currently meet FMLA/CFRA eligibility criteria (12 months of service and 1,250 hours in the preceding 12 months are required). Other protections may still apply, including California PDL.`);
      body = (es ? `Estimado/a ${name},\n\nHemos revisado su solicitud de licencia recibida en relación con el caso ${caseData?.ref || ""}.\n\n${verdict}\n\nFecha de inicio solicitada: ${start}\nFecha de regreso estimada: ${end}\n\nSi su información de horas o antigüedad es incorrecta, contacte a Recursos Humanos dentro de 5 días hábiles.`
                 : `Dear ${name},\n\nWe have reviewed your leave request associated with case ${caseData?.ref || ""}.\n\n${verdict}\n\nRequested start date: ${start}\nEstimated return date: ${end}\n\nIf you believe the hours or service information on file is incorrect, contact Human Resources within 5 business days.`) + `\n\n${close}${disclaimer}`;
      break;
    }
    case "designation": {
      title = es ? "Aviso de Designación" : "Designation Notice";
      const ent = caseData?.total_hours || entitlementHours(type, { hoursPerWeek: hpw });
      body = (es ? `Estimado/a ${name},\n\nSu licencia con inicio el ${start} ha sido designada como: ${type}.\n\nRelojes legales que corren simultáneamente: ${clocks}\nDerecho aplicable: ${ent.toLocaleString()} horas (según su horario de ${hpw} hrs/semana)\nRegreso estimado: ${end}\n\nLas horas utilizadas se contabilizan bajo un período móvil de 12 meses medido hacia atrás desde cada fecha de uso.`
                 : `Dear ${name},\n\nYour leave beginning ${start} has been designated as: ${type}.\n\nStatutory clocks running concurrently: ${clocks}\nApplicable entitlement: ${ent.toLocaleString()} hours (based on your ${hpw} hrs/week schedule)\nEstimated return: ${end}\n\nHours used are measured against a rolling 12-month period looking backward from each date leave is used.`) + `\n\n${close}${disclaimer}`;
      break;
    }
    case "return_to_work": {
      title = es ? "Carta de Regreso al Trabajo" : "Return-to-Work Letter";
      body = (es ? `Estimado/a ${name},\n\nNuestros registros indican que su regreso al trabajo está programado para el ${end}.\n\nAntes de reincorporarse, debe presentar una certificación de aptitud para el trabajo (fitness-for-duty) emitida por su proveedor de salud, si fue requerida en su aviso de designación.\n\nPreséntese con su supervisor al inicio de su turno. Si su fecha de regreso cambia, notifique a Recursos Humanos lo antes posible.`
                 : `Dear ${name},\n\nOur records show your return to work is scheduled for ${end}.\n\nBefore resuming work, you must provide a fitness-for-duty certification from your health care provider if one was required in your designation notice.\n\nPlease report to your supervisor at the start of your shift. If your return date changes, notify Human Resources as soon as possible.`) + `\n\n${close}${disclaimer}`;
      break;
    }
    default: {
      title = es ? "Aviso Oficial de Licencia" : "Official Leave Notice";
      body = (es ? `Estimado/a ${name},\n\nSu solicitud de licencia bajo ${type} ha sido recibida y está en revisión.\n\nFecha de inicio: ${start}\nFecha de regreso: ${end}\n\nRecibirá una determinación de elegibilidad y un aviso de designación dentro de los plazos exigidos por la ley.`
                 : `Dear ${name},\n\nYour leave request under ${type} has been received and is under review.\n\nLeave start: ${start}\nReturn date: ${end}\n\nYou will receive an eligibility determination and designation notice within the timeframes required by law.`) + `\n\n${close}${disclaimer}`;
    }
  }
  return { title, date: now, filename, body, letterType, language, entityName: entName, caseRef: caseData?.ref || null };
}

export function generatePDF(letter) {
  try {
    const doc = new jsPDF(), pw = doc.internal.pageSize.getWidth(), m = 20;
    let y = drawLetterhead(doc, { entityName: letter.entityName || "AMPAM Parks Mechanical, Inc." }, m);
    doc.setTextColor(0, 75, 135); doc.setFontSize(15); doc.setFont("helvetica", "bold");
    doc.text(letter.title, m, y + 3);
    doc.setFontSize(9.5); doc.setFont("helvetica", "normal"); doc.setTextColor(105, 129, 156);
    doc.text(`${letter.date}${letter.caseRef ? `   ·   ${letter.caseRef}` : ""}`, m, y + 9.5);
    doc.setTextColor(25, 35, 48); doc.setFontSize(11);
    y = y + 19; const lines = doc.splitTextToSize(letter.body, pw - m * 2);
    lines.forEach((l) => { if (y > 258) { doc.addPage(); y = 36; } doc.text(l, m, y); y += 6.5; });
    drawFooter(doc, `${letter.entityName || "AMPAM"} · Generated by LeaveIQ · Confidential — for internal use only`);
    doc.save(letter.filename || `leave_letter_${Date.now()}.pdf`);
    return true;
  } catch { return false; }
}
