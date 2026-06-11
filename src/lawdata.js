/* LeaveIQ jurisdiction registry (v2.0 · multi-state architecture).
 *
 * ALL statutory rule data lives here under a jurisdiction key. The compliance
 * engine dispatches on it; the Knowledge Center derives its content from it;
 * notice/form selection reads it. Adding a state = adding one entry here
 * (plus engine-recognized program semantics) — zero changes elsewhere.
 *
 * Shape per jurisdiction:
 *   key, name
 *   programs:            statutory programs w/ weeks, eligibility, knowledge text
 *   employerThresholds:  employee-count applicability
 *   noticeForms:         which generated forms satisfy which notice duty
 *   payrollCoordination: which wage-replacement flags fire
 *   concurrency:         how state clocks stack against FMLA
 *
 * NOT legal advice. The linked sources control.
 */

const CA_PROGRAMS = {
  FMLA: {
    weeks: 12, militaryCaregiverWeeks: 26,
    eligibility: { tenureMonths: 12, hours12mo: 1250 },
    knowledge: {
      id: "fmla", name: "FMLA — Family and Medical Leave Act", jurisdiction: "Federal", tags: ["job-protected", "unpaid"],
      summary: "Federal job-protected, unpaid leave for an employee's own serious health condition, care of a family member, bonding, and certain military family needs.",
      covers: "Private employers with 50+ employees (within 75 miles), public agencies, schools. Employees with 12+ months service and 1,250+ hours in the preceding 12 months.",
      eligibility: ["12 months of service (need not be consecutive)", "1,250 hours worked in the 12 months before leave", "Worksite with 50+ employees within 75 miles"],
      duration: "Up to 12 workweeks in a 12-month period (26 weeks for military caregiver leave). AMPAM measures the 12-month period rolling backward from each date of leave use.",
      jobProtection: "Restoration to the same or an equivalent position; group health benefits continue on the same terms during leave.",
      certification: "Medical certification may be required (15 calendar days to return); recertification generally every 30 days for intermittent leave or on changed circumstances (29 CFR 825.308). Fitness-for-duty certification may be required before reinstatement.",
      employerObligations: "Eligibility notice within 5 business days of leave request, rights & responsibilities notice, written designation notice, maintain benefits, restore position, no retaliation.",
      sources: [
        { label: "DOL — FMLA overview & guidance", url: "https://www.dol.gov/agencies/whd/fmla" },
        { label: "29 CFR Part 825 (eCFR)", url: "https://www.ecfr.gov/current/title-29/subtitle-B/chapter-V/subchapter-C/part-825" },
        { label: "DOL FMLA employer guide", url: "https://www.dol.gov/agencies/whd/fmla/employer-guide" },
      ],
    },
  },
  CFRA: {
    weeks: 12,
    eligibility: { tenureMonths: 12, hours12mo: 1250 },
    knowledge: {
      id: "cfra", name: "CFRA — California Family Rights Act", jurisdiction: "California", tags: ["job-protected", "unpaid"],
      summary: "California's family and medical leave law — broader than FMLA: applies to employers with just 5 employees and covers a wider family circle (including designated persons).",
      covers: "Employers with 5+ employees. Same employee thresholds as FMLA (12 months / 1,250 hours), but no 75-mile worksite rule.",
      eligibility: ["Employer with 5+ employees", "12 months of service", "1,250 hours in the preceding 12 months"],
      duration: "Up to 12 workweeks in a 12-month period. Runs concurrently with FMLA when both apply — EXCEPT pregnancy disability (CFRA does not cover it) — so CFRA baby-bonding is a separate, additional bank after PDL.",
      jobProtection: "Reinstatement to the same or comparable position; benefits continuation mirrors FMLA.",
      certification: "Medical certification permitted; employers may not request genetic information and inquiries are narrower than FMLA in places.",
      employerObligations: "Provide notice of CFRA rights, designate leave in writing, maintain benefits, reinstate, no interference or retaliation.",
      sources: [
        { label: "CA Civil Rights Department — CFRA", url: "https://calcivilrights.ca.gov/family-medical-pregnancy-leave/" },
        { label: "Gov. Code § 12945.2 (CFRA text)", url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=GOV&sectionNum=12945.2" },
      ],
    },
  },
  PDL: {
    weeks: 52 / 3, // 4 months = 17 1/3 workweeks (2 CCR 11042(a))
    eligibility: { tenureMonths: 0, hours12mo: 0 },
    knowledge: {
      id: "pdl", name: "PDL — Pregnancy Disability Leave", jurisdiction: "California", tags: ["job-protected", "unpaid", "no tenure requirement"],
      summary: "Leave while actually disabled by pregnancy, childbirth, or a related medical condition. No length-of-service requirement — protection starts on day one.",
      covers: "Employers with 5+ employees; every employee disabled by pregnancy regardless of tenure or hours.",
      eligibility: ["No minimum service or hours", "Employer with 5+ employees", "Disabled by pregnancy/childbirth/related condition as certified by a provider"],
      duration: "Up to 4 months (17 1/3 workweeks) per pregnancy, measured at the employee's regular schedule — 693.3 hours at 40 hrs/week, prorated for part-time. Runs concurrently with FMLA, never with CFRA.",
      jobProtection: "Reinstatement to the same position; reasonable accommodation and transfer rights while pregnant.",
      certification: "Medical certification of disability; duration follows the provider's certification up to the cap.",
      employerObligations: "Notice of PDL rights, reasonable accommodation, benefits continuation, reinstatement. CFRA bonding remains available afterward.",
      sources: [
        { label: "CRD — Pregnancy leave & accommodation", url: "https://calcivilrights.ca.gov/family-medical-pregnancy-leave/" },
        { label: "Gov. Code § 12945 (PDL text)", url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=GOV&sectionNum=12945" },
      ],
    },
  },
  PFL: {
    weeks: 8, wageReplacement: true,
    knowledge: {
      id: "pfl", name: "CA Paid Family Leave (PFL)", jurisdiction: "California", tags: ["wage replacement", "no job protection itself"],
      summary: "Wage replacement (not leave) — up to 8 weeks of partial pay for bonding or caring for a seriously ill family member, funded through SDI payroll deductions.",
      covers: "Nearly all California employees who contribute to SDI. Job protection comes from CFRA/FMLA running alongside, not from PFL itself.",
      eligibility: ["Earned at least $300 with SDI deductions during the base period", "Taking time to bond or care for a covered family member"],
      duration: "Up to 8 weeks of benefits within 12 months; roughly 70–90% wage replacement depending on income (2025+ formula).",
      jobProtection: "None directly — pair with CFRA/FMLA designation for protection.",
      certification: "Claim filed with EDD; care claims need medical certification of the family member.",
      employerObligations: "Provide the PFL brochure (DE 2511) at hire and when leave begins; coordinate with any employer-paid benefits.",
      sources: [
        { label: "EDD — Paid Family Leave", url: "https://edd.ca.gov/en/disability/paid-family-leave/" },
        { label: "EDD — PFL claim filing", url: "https://edd.ca.gov/en/disability/how_to_file_a_pfl_claim_in_sdi_online/" },
      ],
    },
  },
  SDI: {
    wageReplacement: true,
    knowledge: {
      id: "sdi", name: "CA State Disability Insurance (SDI)", jurisdiction: "California", tags: ["wage replacement"],
      summary: "Partial wage replacement while an employee is unable to work due to a non-work-related illness, injury, or pregnancy — the pay side of PDL and continuous medical leave.",
      covers: "Employees with SDI payroll contributions; pregnancy disability is the most common coordination point for AMPAM cases.",
      eligibility: ["$300+ in base-period wages with SDI deductions", "Unable to do regular work for 8+ consecutive days", "Under provider care"],
      duration: "Up to 52 weeks of benefits; pregnancy claims typically run 4 weeks before through 6–8 weeks after delivery.",
      jobProtection: "None — protection comes from PDL/FMLA/CFRA running concurrently.",
      certification: "Provider certifies the claim with EDD; the employer completes its portion.",
      employerObligations: "Provide DE 2515 brochure; coordinate any wage integration with payroll (see the case payroll flag).",
      sources: [{ label: "EDD — Disability Insurance", url: "https://edd.ca.gov/en/disability/" }],
    },
  },
  ADA_FEHA: {
    knowledge: {
      id: "ada", name: "ADA / FEHA — Disability Accommodation", jurisdiction: "Federal + California", tags: ["accommodation", "interactive process"],
      summary: "Reasonable accommodation for qualified employees with disabilities — including finite additional leave AFTER statutory leave exhausts. FEHA applies the same duty to CA employers with 5+ employees.",
      covers: "ADA: employers with 15+ employees. FEHA: 5+. Any employee or applicant with a covered disability who can perform essential functions with or without accommodation.",
      eligibility: ["Physical or mental impairment limiting a major life activity", "Qualified — able to perform essential job functions with/without accommodation"],
      duration: "No fixed cap — accommodation leave must be reasonable and may not impose undue hardship; indefinite leave is generally not required.",
      jobProtection: "Continued employment via accommodation; engaging in the interactive process in good faith is itself a FEHA obligation.",
      certification: "Medical inquiry limited to job-related functional limitations; no genetic information (GINA).",
      employerObligations: "Engage in a timely, good-faith interactive process; document every step (LeaveIQ ADA tab); accommodate absent undue hardship; never retaliate. Begin BEFORE FMLA/CFRA exhausts — see the exhaustion alerts.",
      sources: [
        { label: "EEOC — ADA & reasonable accommodation", url: "https://www.eeoc.gov/laws/guidance/enforcement-guidance-reasonable-accommodation-and-undue-hardship-under-ada" },
        { label: "EEOC — employer-provided leave and the ADA", url: "https://www.eeoc.gov/laws/guidance/employer-provided-leave-and-americans-disabilities-act" },
        { label: "CRD — employment discrimination (FEHA)", url: "https://calcivilrights.ca.gov/employment/" },
      ],
    },
  },
  WC: {
    knowledge: {
      id: "wc", name: "Workers' Compensation (CA)", jurisdiction: "California", tags: ["industrial injury", "wage replacement", "medical"],
      summary: "No-fault benefits for work-related injury or illness: medical treatment, temporary/permanent disability pay, and return-to-work supports. Time off work runs concurrently with FMLA/CFRA when the employee is eligible.",
      covers: "All California employees from the first day of work; administered through the employer's claims administrator.",
      eligibility: ["Injury or illness arising out of and in the course of employment", "Claim form (DWC-1) provided within one working day of notice"],
      duration: "Temporary disability generally capped at 104 weeks within 5 years of injury; leave protection tracks FMLA/CFRA designations made concurrent.",
      jobProtection: "Labor Code § 132a prohibits discrimination for filing a claim; job protection otherwise flows from concurrent FMLA/CFRA or ADA/FEHA accommodation.",
      certification: "Treating physician reports (PR-2) and work-status notes govern restrictions; fitness-for-duty handled through the claims process plus the case RTW checklist.",
      employerObligations: "Provide DWC-1 within one working day, report to the claims administrator, offer modified/alternative work when released with restrictions, coordinate leave designations.",
      sources: [
        { label: "DIR — Workers' compensation (DWC)", url: "https://www.dir.ca.gov/dwc/" },
        { label: "DWC — injured worker guidebook", url: "https://www.dir.ca.gov/InjuredWorkerGuidebook/InjuredWorkerGuidebook.html" },
      ],
    },
  },
  PSL: {
    knowledge: {
      id: "psl", name: "CA Paid Sick Leave (Healthy Workplaces)", jurisdiction: "California", tags: ["paid", "accrued"],
      summary: "Statewide paid sick leave — at least 40 hours / 5 days per year — usable for the employee's or a family member's care, often the first hours charged at the start of a leave.",
      covers: "Nearly all employees who work 30+ days in California within a year of hire, including part-time and seasonal.",
      eligibility: ["30 days worked in CA", "90-day employment waiting period before first use"],
      duration: "Minimum 40 hours or 5 days per year (greater of the two); accrual 1 hour per 30 worked or frontloading.",
      jobProtection: "Anti-retaliation protections for use of accrued sick leave.",
      certification: "Employers generally may not require documentation for statutory PSL use.",
      employerObligations: "Written notice of available balance each pay period, poster, no retaliation. Local ordinances (LA, SF, San Diego, Berkeley…) may require more.",
      sources: [
        { label: "DIR — Paid sick leave FAQ", url: "https://www.dir.ca.gov/dlse/paid_sick_leave.htm" },
        { label: "Labor Comm. — local ordinance links", url: "https://www.dir.ca.gov/dlse/" },
      ],
    },
  },
};

export const JURISDICTIONS = {
  CA: {
    key: "CA",
    name: "California",
    programs: CA_PROGRAMS,
    employerThresholds: { FMLA: 50, CFRA: 5, PDL: 1, ADA_FEHA: 5, PSL: 1 },
    noticeForms: {
      eligibility: "WH-381",
      designation: ["WH-382", "CFRA_DESIG"],
      certification_employee: "WH-380-E",
      certification_family: "WH-380-F",
      certification_military: "WH-384",
      pregnancy: "PDL_NOTICE",
      bonding_after_pdl: "CFRA_BONDING",
      ada_initiation: "ADA_IP_INIT",
      rtw_request: "RTW_REQUEST",
      rtw_confirmation: "RTW_CONFIRM",
    },
    payrollCoordination: { SDI_offset: true, PFL_bonding: true, SDI_continuous: true, intermittent_timekeeping: true },
    // How state clocks stack against FMLA — read by the engine's dispatcher.
    concurrency: {
      stateFamilyClock: "CFRA",       // runs concurrent with FMLA for family/medical
      pregnancyClock: "PDL",          // runs concurrent with FMLA, never with the family clock
      bondingAfterPregnancyChargesStateOnly: true, // PDL→bonding charges CFRA alone
    },
  },
};

/** Register a jurisdiction at runtime (tests; future state rollouts). */
export function registerJurisdiction(j) {
  if (!j?.key) throw new Error("jurisdiction needs a key");
  JURISDICTIONS[j.key] = j;
  return j;
}

export function getJurisdiction(key) {
  return JURISDICTIONS[key] || null;
}

/* ── Knowledge Center derives from the registry — no duplicated legal text ── */
export const KNOWLEDGE = Object.values(JURISDICTIONS.CA.programs)
  .map((p) => p.knowledge)
  .filter(Boolean);

/* Back-compat exports retained for older imports. */
export const LAW_RULES = { federal: { FMLA: { minTenureMonths: 12, minHoursWorked: 1250, maxLeaveWeeks: 12, desc: "Family and Medical Leave Act" } }, states: { CA: { CFRA: { maxLeaveWeeks: 12, desc: "California Family Rights Act" }, PDL: { maxLeaveWeeks: 4, desc: "Pregnancy Disability Leave" } } } };
export const LAW_REG = { CA: { laws: ["FMLA", "CFRA", "PDL"], lastUpdated: "2026-01-10", localOrdinances: ["SF Paid Parental Leave", "LA Supplemental PSL"], history: [] } };
export const STATE_GRID = [];
