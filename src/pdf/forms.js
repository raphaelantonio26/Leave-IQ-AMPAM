/* Federal & California notice/form generation (v2.0 · Feature 2).
 *
 * Eleven documents, pre-populated from case data, branded with the employing
 * entity's letterhead (legal name, EIN header, HR contact, mailing address),
 * auto-attached to the case repository, and routed through the e-signature
 * workflow (generated → pending_hr_signature → signed → delivered).
 *
 * The WH-* documents reproduce the FIELD STRUCTURE of the DOL forms so a
 * provider/employee fills the same information — they are working equivalents
 * for the case file, not facsimiles of the official PDFs. The DOL versions
 * remain available at dol.gov/agencies/whd/fmla/forms. Pure module: PDFs
 * out; attachment + audit happen in the data layer.
 */
import { jsPDF } from "jspdf";
import { computeEligibility, scheduledHoursPerWeek } from "../lib/compliance/engine.js";
import { drawLetterhead, drawFooter } from "./letterhead.js";

export const FORM_TYPES = [
  { id: "WH-381", label: "WH-381 — Notice of Eligibility & Rights (FMLA)", group: "Federal FMLA" },
  { id: "WH-382", label: "WH-382 — FMLA Designation Notice", group: "Federal FMLA" },
  { id: "WH-380-E", label: "WH-380-E — Certification, Employee's Own Condition", group: "Federal FMLA" },
  { id: "WH-380-F", label: "WH-380-F — Certification, Family Member", group: "Federal FMLA" },
  { id: "WH-384", label: "WH-384 — Certification, Military Caregiver", group: "Federal FMLA" },
  { id: "CFRA_DESIG", label: "CFRA Designation Notice (CRD-compliant)", group: "California" },
  { id: "PDL_NOTICE", label: "Pregnancy Disability Leave Notice (CA)", group: "California" },
  { id: "CFRA_BONDING", label: "CFRA Bonding Notice (post-PDL sequential)", group: "California" },
  { id: "ADA_IP_INIT", label: "ADA Interactive Process Initiation Letter", group: "Accommodation & RTW" },
  { id: "RTW_REQUEST", label: "Return-to-Work Clearance Request", group: "Accommodation & RTW" },
  { id: "RTW_CONFIRM", label: "Return-to-Work Confirmation Letter", group: "Accommodation & RTW" },
];

const fmt = (d) => { const x = new Date(`${String(d || "").slice(0, 10)}T00:00:00`); return isNaN(x) ? "____________" : x.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); };
const line = (n = 38) => "_".repeat(n);

/** Build the merge bundle every form draws from. */
export function formContext({ caseData = {}, employee = {}, entity = {} }) {
  const elig = employee?.hire_date ? computeEligibility(employee) : null;
  const hpw = scheduledHoursPerWeek(employee);
  return {
    entityName: entity.legal_name || entity.name || "AMPAM Parks Mechanical, Inc.",
    ein: entity.ein_masked || "EIN xx-xxxxxxx",
    hrContact: entity.hr_contact_name ? `${entity.hr_contact_name}${entity.hr_contact_title ? `, ${entity.hr_contact_title}` : ""}` : (caseData.owner || "Human Resources"),
    address: entity.mailing_address || "Carson, CA",
    employee: employee.name || "____________",
    fileNumber: employee.file_number || caseData.file_number || "______",
    ref: caseData.ref || "",
    designation: caseData.leave_designation || caseData.type || "____________",
    reason: (caseData.reason || "").replace(/_/g, " "),
    start: fmt(caseData.start_date), end: fmt(caseData.end_date),
    certDue: fmt(caseData.cert_due),
    totalHours: caseData.total_hours ?? "______", usedHours: caseData.used_hours ?? 0,
    hpw,
    eligible: elig ? elig.fmlaEligible : null,
    tenureMonths: elig?.tenureMonths, hoursWorked: elig?.hoursWorked,
    today: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    isoToday: new Date().toISOString().slice(0, 10),
  };
}

/** Body text per form — exported separately so tests can assert merges. */
export function formBody(formId, ctx) {
  const C = ctx;
  switch (formId) {
    case "WH-381": return [
      `NOTICE OF ELIGIBILITY AND RIGHTS & RESPONSIBILITIES (FMLA)`,
      `(Working equivalent of DOL Form WH-381; 29 CFR 825.300(b)-(c))`,
      ``,
      `To: ${C.employee} (File ${C.fileNumber})`,
      `From: ${C.hrContact}, ${C.entityName}`,
      `Date: ${C.today}          Case: ${C.ref}`,
      ``,
      `On ${C.start}, you notified us of your need for leave beginning ${C.start} for: ${C.reason || line(30)}.`,
      ``,
      `PART A — ELIGIBILITY`,
      C.eligible === true
        ? `[X] You ARE eligible for FMLA leave. Our records show ${C.tenureMonths} months of service and ${Number(C.hoursWorked || 0).toLocaleString()} hours worked in the 12 months preceding the leave (requirements: 12 months; 1,250 hours).`
        : C.eligible === false
          ? `[X] You are NOT eligible for FMLA leave because you do not meet the 12-month service and/or 1,250-hour requirement. Our records show ${C.tenureMonths ?? "__"} months and ${Number(C.hoursWorked || 0).toLocaleString()} hours. Other leave protections (e.g., CA PDL) may still apply — contact ${C.hrContact}.`
          : `[ ] Eligibility determination pending — service/hours verification in progress.`,
      ``,
      `PART B — RIGHTS AND RESPONSIBILITIES`,
      `1. Certification: You must return a sufficient medical certification by ${C.certDue} (15 calendar days). Incomplete certifications will be returned in writing with 7 calendar days to cure.`,
      `2. Benefits: Group health coverage continues on the same terms as if you were working; your premium share remains due during leave.`,
      `3. Substitution/pay: Leave is unpaid unless accrued paid leave applies; California SDI/PFL wage replacement may apply — coordinate with payroll.`,
      `4. Restoration: On return you will be restored to the same or an equivalent position.`,
      `5. Status: Report periodically on your status and intent to return to work.`,
      ``,
      `Questions: ${C.hrContact}, ${C.entityName}, ${C.address}.`,
    ].join("\n");

    case "WH-382": return [
      `FMLA DESIGNATION NOTICE`,
      `(Working equivalent of DOL Form WH-382; 29 CFR 825.300(d))`,
      ``,
      `To: ${C.employee} (File ${C.fileNumber})        Date: ${C.today}        Case: ${C.ref}`,
      ``,
      `We reviewed your request for leave beginning ${C.start} and the information available to us.`,
      ``,
      `[X] Your leave request IS APPROVED and IS DESIGNATED as FMLA leave (designation set: ${C.designation}).`,
      `    All leave taken for this reason will be counted against your FMLA entitlement.`,
      ``,
      `Entitlement charged at your schedule of ${C.hpw} hours/week: ${C.totalHours} hours for the 12-workweek period.`,
      `Leave period: ${C.start} through ${C.end}.`,
      `[${"X"}] Fitness-for-duty certification ${"WILL"} be required before reinstatement (see the Return-to-Work Clearance Request).`,
      ``,
      `If the information changes (schedule, duration, or reason), this designation will be reviewed and you will receive an updated notice.`,
      ``,
      `${C.hrContact}, ${C.entityName}`,
    ].join("\n");

    case "WH-380-E": return [
      `CERTIFICATION OF HEALTH CARE PROVIDER — EMPLOYEE'S SERIOUS HEALTH CONDITION`,
      `(Working equivalent of DOL Form WH-380-E; 29 CFR 825.306)`,
      ``,
      `SECTION I — EMPLOYER`,
      `Employer: ${C.entityName} (${C.ein}) · ${C.address}`,
      `Employee: ${C.employee} (File ${C.fileNumber}) · Case ${C.ref}`,
      `Leave requested beginning: ${C.start} · Return this form by: ${C.certDue}`,
      `Essential job functions: see attached job description.`,
      ``,
      `SECTION II — HEALTH CARE PROVIDER  (Provider completes. Do NOT provide genetic information (GINA). Limit responses to the condition for which leave is requested.)`,
      `1. Provider name / practice / specialty: ${line(46)}`,
      `2. Approximate date condition commenced: ${line(20)}   Probable duration: ${line(20)}`,
      `3. Will the employee be incapacitated for a single continuous period? [ ] Yes [ ] No   Dates: ${line(26)}`,
      `4. Will the condition cause episodic flare-ups preventing performance of job functions? [ ] Yes [ ] No`,
      `   Estimated frequency: ____ times per ____ week(s)/month(s); duration ____ hour(s)/day(s) per episode.`,
      `5. Is treatment or a reduced schedule medically necessary? [ ] Yes [ ] No   Describe: ${line(40)}`,
      `6. Is the employee unable to perform any one or more essential job functions? [ ] Yes [ ] No   Which: ${line(32)}`,
      ``,
      `Provider signature: ${line(30)}   Date: ${line(14)}`,
      ``,
      `Return to: ${C.hrContact}, ${C.entityName}, ${C.address}.`,
    ].join("\n");

    case "WH-380-F": return [
      `CERTIFICATION OF HEALTH CARE PROVIDER — FAMILY MEMBER'S SERIOUS HEALTH CONDITION`,
      `(Working equivalent of DOL Form WH-380-F; 29 CFR 825.306)`,
      ``,
      `SECTION I — EMPLOYER`,
      `Employer: ${C.entityName} (${C.ein}) · ${C.address}`,
      `Employee: ${C.employee} (File ${C.fileNumber}) · Case ${C.ref}`,
      `Leave requested beginning: ${C.start} · Return this form by: ${C.certDue}`,
      ``,
      `SECTION II — EMPLOYEE`,
      `Family member's name: ${line(34)}   Relationship: [ ] spouse [ ] child [ ] parent [ ] designated person (CFRA)`,
      `Care to be provided: ${line(50)}`,
      ``,
      `SECTION III — HEALTH CARE PROVIDER  (Limit responses to the family member's condition; do not provide genetic information.)`,
      `1. Provider name / practice / specialty: ${line(46)}`,
      `2. Approximate date condition commenced: ${line(20)}   Probable duration: ${line(20)}`,
      `3. Does the patient require care by the employee? [ ] Yes [ ] No   Describe: ${line(38)}`,
      `4. Will the employee's care be intermittent? [ ] Yes [ ] No   Estimated schedule: ${line(30)}`,
      ``,
      `Provider signature: ${line(30)}   Date: ${line(14)}`,
      `Return to: ${C.hrContact}, ${C.entityName}, ${C.address}.`,
    ].join("\n");

    case "WH-384": return [
      `CERTIFICATION FOR SERIOUS INJURY OR ILLNESS OF A COVERED SERVICEMEMBER — MILITARY CAREGIVER LEAVE`,
      `(Working equivalent of DOL Form WH-384; 29 CFR 825.310)`,
      ``,
      `Employer: ${C.entityName} (${C.ein}) · Case ${C.ref}`,
      `Employee (caregiver): ${C.employee} (File ${C.fileNumber}) · Leave beginning: ${C.start}`,
      `Entitlement: up to 26 workweeks in a single 12-month period (${C.totalHours} hours at ${C.hpw} hrs/week).`,
      ``,
      `SECTION I — SERVICEMEMBER`,
      `Name: ${line(34)}   Relationship to employee: ${line(20)}`,
      `Status: [ ] Current member, Armed Forces/Guard/Reserve  [ ] Veteran (date of separation: ${line(12)})`,
      ``,
      `SECTION II — AUTHORIZED PROVIDER (DOD/VA/TRICARE or authorized private provider)`,
      `Serious injury or illness incurred/aggravated in line of duty: [ ] Yes [ ] No`,
      `Treatment/recuperation description: ${line(50)}`,
      `Period of care required: ${line(30)}`,
      ``,
      `Provider signature: ${line(30)}   Date: ${line(14)}`,
      `Return by ${C.certDue} to: ${C.hrContact}, ${C.entityName}.`,
    ].join("\n");

    case "CFRA_DESIG": return [
      `CFRA DESIGNATION NOTICE — CALIFORNIA FAMILY RIGHTS ACT`,
      `(Gov. Code § 12945.2; 2 CCR 11091. Issued in addition to, and distinct from, any federal WH-382.)`,
      ``,
      `To: ${C.employee} (File ${C.fileNumber})        Date: ${C.today}        Case: ${C.ref}`,
      ``,
      `Your leave beginning ${C.start} is designated under the California Family Rights Act (designation set: ${C.designation}) and will be counted against your 12-workweek CFRA entitlement.`,
      ``,
      `California-specific terms of this designation:`,
      `• CFRA runs concurrently with FMLA where both apply. Pregnancy disability is NOT a CFRA-qualifying serious health condition — PDL is separate, and your CFRA baby-bonding entitlement remains fully available after PDL.`,
      `• CFRA covers care for a broader family circle than FMLA, including a designated person.`,
      `• Group health benefits continue on the same terms during CFRA leave; you will be reinstated to the same or a comparable position.`,
      `• Medical inquiries are limited under California law; we will not request genetic information.`,
      ``,
      `Entitlement at your ${C.hpw} hrs/week schedule: ${C.totalHours} hours. Leave period: ${C.start} through ${C.end}.`,
      ``,
      `Nothing in this notice waives any right you hold under FEHA, CFRA, or FMLA.`,
      `${C.hrContact}, ${C.entityName} · ${C.address}`,
    ].join("\n");

    case "PDL_NOTICE": return [
      `NOTICE OF PREGNANCY DISABILITY LEAVE RIGHTS (CALIFORNIA)`,
      `(Gov. Code § 12945; 2 CCR 11049-11051 — CRD-recommended employee notice)`,
      ``,
      `To: ${C.employee} (File ${C.fileNumber})        Date: ${C.today}        Case: ${C.ref}`,
      ``,
      `You are entitled to up to FOUR MONTHS (17 1/3 workweeks) of Pregnancy Disability Leave per pregnancy while you are actually disabled by pregnancy, childbirth, or a related medical condition — measured at your regular schedule of ${C.hpw} hours/week, this is ${C.totalHours} hours. There is no length-of-service requirement.`,
      ``,
      `• PDL may be taken intermittently or continuously as your provider certifies.`,
      `• You may also be entitled to reasonable accommodation or transfer to a less strenuous position while pregnant.`,
      `• PDL runs concurrently with FMLA (if eligible) but NEVER with CFRA — your CFRA bonding leave is separate and additional.`,
      `• State Disability Insurance (SDI) wage replacement may apply; our payroll team will coordinate benefit integration.`,
      `• Group health benefits continue during PDL; you will be reinstated to the same position on return.`,
      ``,
      `Certification from your health care provider is due ${C.certDue}. Leave period on file: ${C.start} through ${C.end}.`,
      ``,
      `${C.hrContact}, ${C.entityName} · ${C.address}`,
    ].join("\n");

    case "CFRA_BONDING": return [
      `CFRA BABY-BONDING NOTICE — SEQUENTIAL TO PREGNANCY DISABILITY LEAVE`,
      `(Gov. Code § 12945.2 — bonding entitlement following PDL)`,
      ``,
      `To: ${C.employee} (File ${C.fileNumber})        Date: ${C.today}        Case: ${C.ref}`,
      ``,
      `Now that your Pregnancy Disability Leave has ended (or is ending), you remain entitled to up to 12 workweeks of CFRA leave to bond with your new child. This bonding entitlement is SEPARATE FROM and IN ADDITION TO your PDL — it was not reduced by any PDL you used.`,
      ``,
      `• At your ${C.hpw} hrs/week schedule, the bonding entitlement is ${C.totalHours} hours.`,
      `• Because PDL preceded this leave, bonding time charges your CFRA bank only (your federal FMLA bank was charged during PDL).`,
      `• Bonding leave must be completed within one year of the child's birth, adoption, or foster placement, and may be taken in blocks.`,
      `• California Paid Family Leave (PFL) wage replacement of up to 8 weeks may apply — file with the EDD; payroll will coordinate.`,
      ``,
      `Please confirm your intended bonding schedule with ${C.hrContact} so we can designate the leave in writing.`,
      `${C.entityName} · ${C.address}`,
    ].join("\n");

    case "ADA_IP_INIT": return [
      `INTERACTIVE PROCESS INITIATION — REASONABLE ACCOMMODATION (ADA / FEHA)`,
      ``,
      `To: ${C.employee} (File ${C.fileNumber})        Date: ${C.today}        Case: ${C.ref}`,
      ``,
      `We are writing to begin the interactive process regarding workplace accommodation. We understand you may have a medical condition affecting your ability to perform some functions of your position, or your protected leave is approaching exhaustion (used ${C.usedHours} of ${C.totalHours} hours).`,
      ``,
      `We would like to meet with you to discuss, in good faith:`,
      `• The essential functions of your position and any limitations affecting them;`,
      `• Accommodations that could enable you to perform those functions — including schedule modification, equipment, transfer to an open position, or a finite period of additional leave;`,
      `• Information we may need from your health care provider, limited strictly to job-related functional limitations. We will not request your diagnosis or genetic information.`,
      ``,
      `Proposed meeting: within five (5) business days of this letter — please contact ${C.hrContact} to schedule or propose an alternative. Participation in this process does not require you to disclose more than you choose; you may have a support person present.`,
      ``,
      `This letter and each step of the process are documented in your confidential case file.`,
      `${C.entityName} · ${C.address}`,
    ].join("\n");

    case "RTW_REQUEST": return [
      `RETURN-TO-WORK CLEARANCE REQUEST — FITNESS FOR DUTY`,
      ``,
      `To: ${C.employee} (File ${C.fileNumber})        Date: ${C.today}        Case: ${C.ref}`,
      ``,
      `Your leave is scheduled to end on ${C.end}. As stated in your designation notice, a fitness-for-duty certification is required before reinstatement.`,
      ``,
      `Please have your health care provider complete a release stating:`,
      `1. That you are able to resume work as of a stated date;`,
      `2. Any work restrictions and their expected duration (the release should address the essential functions on the attached job description);`,
      `3. Provider signature and date.`,
      ``,
      `Return the certification to ${C.hrContact} or upload it through your LeaveIQ employee portal no later than your scheduled return date. If restrictions are identified, we will promptly begin the interactive process to evaluate accommodation. If you need more time, contact us BEFORE ${C.end} so your leave status remains documented.`,
      ``,
      `${C.entityName} · ${C.address}`,
    ].join("\n");

    case "RTW_CONFIRM": return [
      `RETURN-TO-WORK CONFIRMATION`,
      ``,
      `To: ${C.employee} (File ${C.fileNumber})        Date: ${C.today}        Case: ${C.ref}`,
      ``,
      `This letter confirms your return to work effective ${C.end} following your leave that began ${C.start} (designation: ${C.designation}).`,
      ``,
      `• Position: you are reinstated to the same or an equivalent position with equivalent pay, benefits, and terms of employment.`,
      `• Fitness-for-duty: your clearance has been received and is on file.`,
      `• Benefits: any benefit elections suspended during unpaid leave resume this pay period; contact payroll with questions about premium catch-up.`,
      `• Leave balances: this leave charged ${C.usedHours} of ${C.totalHours} protected hours; remaining balances are visible in your employee portal.`,
      ``,
      `Welcome back. If any medical restriction arises after your return, contact ${C.hrContact} — the accommodation process remains available at any time.`,
      ``,
      `${C.entityName} · ${C.address}`,
    ].join("\n");

    default: throw new Error(`Unknown form type: ${formId}`);
  }
}

/** Render a form to a branded PDF. Returns { doc, filename, title }. */
export function buildFormPDF({ formId, caseData, employee, entity }) {
  const ctx = formContext({ caseData, employee, entity });
  const meta = FORM_TYPES.find((f) => f.id === formId);
  if (!meta) throw new Error(`Unknown form type: ${formId}`);
  const body = formBody(formId, ctx);
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const PW = 215.9, M = 20;
  let y = drawLetterhead(doc, { entityName: ctx.entityName, ein: ctx.ein, address: ctx.address, hrContact: ctx.hrContact }, M);
  doc.setFontSize(9.6);
  for (const raw of body.split("\n")) {
    const isHead = raw === raw.toUpperCase() && raw.trim().length > 6 && !raw.startsWith("[") && !raw.startsWith("•") && !raw.includes("___");
    doc.setFont("helvetica", isHead ? "bold" : "normal");
    const lines = doc.splitTextToSize(raw || " ", PW - M * 2);
    for (const ln of lines) {
      if (y > 258) { doc.addPage(); y = 36; doc.setFontSize(9.6); }
      doc.text(ln, M, y); y += 4.9;
    }
  }
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    if (p > 1) drawLetterhead(doc, { entityName: ctx.entityName, ein: ctx.ein }, M);
    drawFooter(doc, `${ctx.ref} · ${meta.id} · Generated ${ctx.isoToday} · Informational template — not legal advice`, `Page ${p}/${n}`);
  }
  const filename = `${(ctx.ref || "case").replace(/\s+/g, "_")}_${meta.id.replace(/[^A-Za-z0-9-]+/g, "_")}.pdf`;
  return { doc, filename, title: meta.label, body };
}

/** Custom notice: AI-drafted body, HR-approved, same letterhead. */
export function buildCustomNoticePDF({ title = "Leave Notice", bodyText, caseData, employee, entity }) {
  const ctx = formContext({ caseData, employee, entity });
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const PW = 215.9, M = 20;
  let y = drawLetterhead(doc, { entityName: ctx.entityName, ein: ctx.ein, address: ctx.address, hrContact: ctx.hrContact }, M);
  doc.setTextColor(0, 75, 135); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text(title, M, y + 3);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(105, 129, 156);
  doc.text(`${ctx.employee} (File ${ctx.fileNumber}) · ${ctx.ref} · ${ctx.today}`, M, y + 9.5);
  doc.setTextColor(25, 35, 48); doc.setFontSize(10.2);
  y = y + 19;
  for (const para of String(bodyText || "").split("\n")) {
    for (const ln of doc.splitTextToSize(para || " ", PW - M * 2)) {
      if (y > 258) { doc.addPage(); y = 36; }
      doc.text(ln, M, y); y += 5.1;
    }
  }
  drawFooter(doc, `${ctx.ref} · Custom notice · Generated ${ctx.isoToday} · Informational template — not legal advice`);
  return { doc, filename: `${(ctx.ref || "case").replace(/\s+/g, "_")}_Custom_Notice.pdf` };
}
