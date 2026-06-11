/* Deterministic demo seed for LeaveIQ — AMPAM Parks Mechanical, Multimech,
 * Seal Electric. All names and identifiers are SYNTHETIC; no real employee
 * data ever ships in this file. Active only when Supabase is not configured.
 */
import { clocksFor, entitlementHours, scheduledHoursPerWeek } from "../lib/compliance/engine.js";

export const ENTITIES = [
  { id: 1, code: "AMPAM", name: "AMPAM Parks Mechanical", legal_name: "AMPAM Parks Mechanical, Inc.", type: "mechanical", state: "CA", active: true,
    ein_masked: "EIN xx-xxx7310", hr_contact_name: "Jordan Avery", hr_contact_title: "HR Administrator",
    mailing_address: "825 E Carson St, Carson, CA 90745", policy_effective_date: "2025-01-01",
    notification_recipients: ["jordan.avery@ampam.example", "sarah.toledano@ampam.example"] },
  { id: 2, code: "MULTIMECH", name: "Multimech", legal_name: "Multimech, Inc.", type: "mechanical", state: "CA", active: true,
    ein_masked: "EIN xx-xxx5594", hr_contact_name: "Jordan Avery", hr_contact_title: "HR Administrator",
    mailing_address: "825 E Carson St, Suite 200, Carson, CA 90745", policy_effective_date: "2025-01-01",
    notification_recipients: ["jordan.avery@ampam.example", "megan.krell@ampam.example"] },
  { id: 3, code: "SEAL", name: "Seal Electric", legal_name: "Seal Electric, Inc.", type: "electrical",
    ein_masked: "EIN xx-xxx4821", hr_contact_name: "Jordan Avery", hr_contact_title: "HR Administrator",
    mailing_address: "825 E Carson St, Suite 300, Carson, CA 90745", policy_effective_date: "2025-01-01",
    notification_recipients: ["jordan.avery@ampam.example", "daniel.reyes@ampam.example"], state: "CA", active: true },
];

export const HR_USERS = [
  { id: 1, name: "Jordan Avery", email: "jordan.avery@ampam.example", role: "admin", entity_id: null, department: null },
  { id: 2, name: "Sarah Toledano", email: "sarah.toledano@ampam.example", role: "specialist", entity_id: null, department: null },
  { id: 3, name: "Megan Krell", email: "megan.krell@ampam.example", role: "specialist", entity_id: null, department: null },
  { id: 4, name: "Daniel Reyes", email: "daniel.reyes@ampam.example", role: "specialist", entity_id: 2, department: null },
  { id: 5, name: "Morgan Diaz", email: "morgan.diaz@ampam.example", role: "manager", entity_id: 1, department: "Field Operations" },
  { id: 6, name: "Robin Sayer", email: "robin.sayer@ampam.example", role: "legal", entity_id: null, department: null },
];

const ANCHOR = "2026-06-01"; // seed dates generated relative to this anchor

export function buildSeedData() {
  function mul32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rng = mul32(20260601);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const pickW = (pairs) => { const tot = pairs.reduce((s, [, w]) => s + w, 0); let r = rng() * tot; for (const [v, w] of pairs) if ((r -= w) <= 0) return v; return pairs[0][0]; };
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const anchor = new Date(`${ANCHOR}T00:00:00`);

  const FIRST = ["Maria", "James", "Sarah", "Miguel", "Emily", "Robert", "Linda", "David", "Jessica", "Cristobal", "Amanda", "Daniel", "Stephanie", "Kevin", "Rachel", "Brian", "Nicole", "Jason", "Megan", "Antonio", "Priya", "Wei", "Aisha", "Diego", "Hana", "Omar", "Sofia", "Liam", "Noah", "Olivia", "Ava", "Ethan", "Mia", "Lucas", "Isabella", "Mateo", "Layla", "Jin", "Fatima", "Carlos", "Ramon", "Guadalupe", "Hector", "Marisol"];
  const LAST = ["Garcia", "Chen", "Thompson", "Brown", "Davis", "Wilson", "Martinez", "Anderson", "Taylor", "Lee", "White", "Harris", "Clark", "Lewis", "Robinson", "Walker", "Hall", "Young", "King", "Scott", "Patel", "Nguyen", "Khan", "Rossi", "Kim", "Hassan", "Silva", "Okafor", "Reyes", "Mendoza", "Adams", "Bennett", "Foster", "Hughes", "Diaz", "Ortiz", "Reed", "Cole", "Ward", "Price", "Vasquez", "Castillo", "Romero", "Fuentes"];
  const MECH_DEPTS = [
    ["Plumbing", ["Journeyman Plumber", "Apprentice Plumber", "Plumbing Foreman", "Service Plumber"]],
    ["HVAC / Mechanical", ["HVAC Installer", "Sheet Metal Mechanic", "Pipefitter", "Mechanical Foreman", "Service Technician"]],
    ["Sheet Metal", ["Sheet Metal Worker", "Shop Fabricator", "Detailer"]],
    ["Fire Protection", ["Sprinkler Fitter", "Fire Protection Foreman"]],
    ["Field Operations", ["General Foreman", "Superintendent", "Field Engineer", "Laborer"]],
    ["Fabrication Shop", ["Welder", "CNC Operator", "Shop Foreman"]],
    ["Project Management", ["Project Manager", "Project Engineer", "Assistant PM"]],
    ["Estimating", ["Estimator", "Senior Estimator"]],
    ["Warehouse & Logistics", ["Warehouse Lead", "Driver", "Tool Room Attendant"]],
    ["Office & Administration", ["Payroll Coordinator", "Office Administrator", "AP Specialist"]],
    ["Safety", ["Safety Coordinator", "Safety Manager"]],
  ];
  const ELEC_DEPTS = [
    ["Electrical", ["Journeyman Electrician", "Apprentice Electrician", "Electrical Foreman", "Low-Voltage Technician"]],
    ["Field Operations", ["Superintendent", "Field Engineer"]],
    ["Project Management", ["Project Manager", "Project Engineer"]],
    ["Estimating", ["Estimator"]],
    ["Office & Administration", ["Office Administrator"]],
  ];
  const STATES = [["CA", 78], ["NV", 8], ["AZ", 7], ["TX", 4], ["WA", 3]];
  const HR_POOL = ["Sarah Toledano", "Megan Krell", "Daniel Reyes"];
  const REASON_BY_TYPE = {
    FMLA: [["own_serious_health", 50], ["family_care", 30], ["military_caregiver", 5], ["bonding", 15]],
    CFRA: [["bonding", 60], ["family_care", 40]],
    PDL: [["pregnancy_disability", 100]],
    Personal: [["personal", 100]],
  };
  const NOTES = {
    own_serious_health: ["Serious health condition — post-surgical recovery", "Intermittent leave — chronic condition flare-ups", "Inpatient treatment and follow-up care"],
    family_care: ["Care for ill parent", "Care for spouse undergoing treatment", "Care for child with serious condition"],
    bonding: ["Bonding leave — new child", "Parental leave — adoption placement"],
    pregnancy_disability: ["Pregnancy disability — physician certified", "Prenatal complications — modified then full leave"],
    military_caregiver: ["Military caregiver leave — covered servicemember"],
    personal: ["Personal leave — non-statutory, policy-based"],
  };
  const ACTIONS = ["Certification requested", "Medical certification received", "Eligibility determination recorded", "Intermittent schedule set", "Status updated", "Designation assigned", "Return-to-work plan drafted", "Note added by HR partner"];

  const usedNames = new Set();
  const employees = [];
  let fileCounter = 1408;
  for (let i = 1; i <= 60; i++) {
    let name; do { name = `${pick(FIRST)} ${pick(LAST)}`; } while (usedNames.has(name)); usedNames.add(name);
    const entity = pickW([[ENTITIES[0], 58], [ENTITIES[1], 26], [ENTITIES[2], 16]]);
    const depts = entity.code === "SEAL" ? ELEC_DEPTS : MECH_DEPTS;
    const [dept, titles] = pick(depts);
    const state = pickW(STATES);
    const hire = addDays(new Date("2014-01-01"), int(0, 365 * 11));
    const employment_type = pickW([["full-time", 90], ["part-time", 10]]);
    const hours_per_week = employment_type === "part-time" ? pick([20, 24, 30, 32]) : pickW([[40, 92], [null, 8]]); // some blanks: full-time assumed
    const tenYrs = (anchor - hire) / (365.25 * 86400000);
    const baseHours = (hours_per_week || 40) * 50;
    const hours_worked_12mo = Math.round(Math.min(baseHours * 1.15, baseHours * Math.min(1, tenYrs * 2)) + int(-80, 80));
    fileCounter += int(3, 41);
    const empStatus = i % 17 === 0 ? "Terminated" : i % 13 === 0 ? "Leave of Absence" : i % 19 === 0 ? "Seasonal" : "Active";
    const schedType = i % 6 === 0 ? "4x10" : i % 7 === 0 ? "3x12" : i % 11 === 0 ? "variable" : i % 9 === 0 ? "per_diem" : "standard_40";
    const schedHpw = schedType === "3x12" ? 36 : schedType === "variable" ? 24 + (i % 3) * 8 : schedType === "per_diem" ? 0 : 40;
    const scheduleHistory = [{ effectiveDate: iso(hire), type: schedType, hoursPerWeek: schedHpw, daysPerWeek: schedType === "4x10" ? 4 : schedType === "3x12" ? 3 : schedType === "per_diem" ? 0 : 5 }];
    // a few schedule CHANGES mid-stream so retroactive recompute is demoable
    if (i % 13 === 0) scheduleHistory.push({ effectiveDate: "2026-03-01", type: "variable", hoursPerWeek: 32, daysPerWeek: 4 });
    employees.push({
      adp_associate_id: "A" + String(700100 + i * 7),
      status: empStatus,
      jurisdiction: "CA",
      scheduleHistory,
      id: i,
      entity_id: entity.id,
      entity_code: entity.code,
      file_number: String(fileCounter).padStart(6, "0"),
      name,
      email: `${name.split(" ")[0].toLowerCase()}.${name.split(" ")[1].toLowerCase()}@${entity.code.toLowerCase()}.example`,
      dept, department: dept,
      position: pick(titles),
      state,
      hire_date: iso(hire),
      hours_per_week: schedType === "per_diem" ? 0 : (schedType === "standard_40" || schedType === "4x10" ? hours_per_week : schedHpw),
      hours_worked_12mo: Math.max(0, hours_worked_12mo),
      hours_worked: Math.max(0, hours_worked_12mo),
      employment_type,
    });
  }

  const cases = [];
  const intermittentLog = [];
  const auditEvents = [];
  let auditId = 1, logId = 1;
  const caseTypes = [["FMLA", 44], ["CFRA", 22], ["PDL", 16], ["", 10], ["Personal", 8]]; // "" = awaiting designation from ADP import
  const statuses = [["Active", 42], ["Pending", 20], ["Approved", 16], ["Closed", 16], ["Denied", 6]];

  for (let i = 1; i <= 32; i++) {
    const emp = employees[int(0, employees.length - 1)];
    let type = pickW(caseTypes);
    let status = pickW(statuses);
    if (type === "") status = "Pending"; // await-designation cases are always Pending
    const reason = type === "" ? "" : pickW(REASON_BY_TYPE[type] || [["own_serious_health", 1]]);
    const militaryCaregiver = reason === "military_caregiver";
    const intermittent = type !== "" && type !== "PDL" && type !== "Personal" && rng() < 0.3;
    const durWeeks = intermittent ? int(10, 20) : type === "PDL" ? int(8, 17) : int(4, 12);
    const start = addDays(anchor, -int(10, 300));
    const end = addDays(start, durWeeks * 7);
    const hpw = scheduledHoursPerWeek(emp);
    const pdlPreceded = type === "CFRA" && reason === "bonding" && rng() < 0.5;
    const clocks = clocksFor(type, reason, { state: emp.state, pdlPreceded });
    const total = type === "" ? 0 : entitlementHours(type, { hoursPerWeek: hpw, militaryCaregiver });
    let frac = status === "Pending" || status === "Denied" ? 0 : status === "Closed" || status === "Approved" ? 0.6 + rng() * 0.4 : Math.max(0.05, Math.min(0.92, (anchor - start) / (end - start) * (0.5 + rng() * 0.5)));
    const used_hours = Math.round(total * frac);
    const owner = pick(HR_POOL);
    const cert_due = addDays(start, 15);
    const cert_received = status === "Pending" ? rng() < 0.3 : rng() < 0.88;
    const created = addDays(start, -int(3, 14));
    const ref = `LV-2026-${String(1000 + i)}`;

    const caseAudit = [{ date: iso(created), action: type === "" ? "Case auto-created from ADP import — awaiting designation" : "Case opened", user: type === "" ? "System (import)" : owner, source: type === "" ? "import" : "web" }];
    let cur = created;
    for (let e = 0; e < int(1, 3); e++) {
      cur = addDays(cur, int(3, 25));
      if (cur > anchor) break;
      caseAudit.push({ date: iso(cur), action: pick(ACTIONS), user: rng() < 0.25 ? "System" : pick(HR_POOL), source: "web" });
    }

    const c = {
      id: i, ref,
      entity_id: emp.entity_id, entity_code: emp.entity_code,
      employee_id: emp.id, file_number: emp.file_number,
      type, leave_designation: type,
      reason, status,
      priority: pickW([["High", 24], ["Medium", 50], ["Low", 26]]),
      start_date: iso(start), end_date: iso(end),
      total_hours: total, used_hours,
      intermittent, military_caregiver: militaryCaregiver, pdl_preceded: pdlPreceded,
      concurrent_clocks: clocks,
      cert_received, cert_due: iso(cert_due),
      owner, owner_id: HR_USERS.find((u) => u.name === owner)?.id || 2,
      notes: type === "" ? "Imported from ADP roster — HR to assign designation before clocks start." : pick(NOTES[reason] || ["Leave under review"]),
      documents: [],
      created_at: iso(created), updated_at: caseAudit[caseAudit.length - 1].date,
      updated_by: caseAudit[caseAudit.length - 1].user,
      audit: caseAudit,
    };
    cases.push(c);

    // Intermittent usage rows attribute hours to the case via file_number +
    // leave_start_date — never aggregated at employee level.
    if (intermittent && used_hours > 0) {
      let left = used_hours, d = new Date(start);
      while (left > 0 && d <= anchor) {
        const h = Math.min(left, pick([4, 4, 8, 8, 8, 10]));
        intermittentLog.push({ id: logId++, case_id: i, employee_id: emp.id, file_number: emp.file_number, leave_start_date: iso(start), usage_date: iso(d), hours_used: h, approved_by: owner, notes: "" });
        left -= h;
        d = addDays(d, int(2, 9));
      }
    }

    for (const a of caseAudit) {
      auditEvents.push({ id: auditId++, case_id: i, case_ref: ref, employee_id: emp.id, action: a.action, changed_by: a.user, changed_at: `${a.date}T0${int(8, 9)}:${String(int(10, 59))}:00`, source: a.source || "web", old_values: null, new_values: null });
    }
  }
  // ── v1.2: certification chains, FFD, ADA seeds, corrective actions ──────
  const certifications = [];
  let certId = 1;
  for (const c of cases) {
    if (!c.type || c.type === "Personal") continue;
    certifications.push({ id: certId++, case_id: c.id, kind: "medical", requested_at: c.created_at, due_date: c.cert_due, received_at: c.cert_received ? iso(addDays(new Date(c.cert_due + "T00:00:00"), -int(1, 6))) : null });
    // long-running intermittent medical cases carry a recert in the chain
    if (c.intermittent && c.cert_received && ["own_serious_health", "family_care"].includes(c.reason) && rng() < 0.6) {
      const last = certifications[certifications.length - 1];
      const due = iso(addDays(new Date(last.received_at + "T00:00:00"), 30));
      const received = rng() < 0.5 && due <= ANCHOR ? iso(addDays(new Date(due + "T00:00:00"), -2)) : null;
      certifications.push({ id: certId++, case_id: c.id, kind: "recert", requested_at: last.received_at, due_date: due, received_at: received });
    }
  }
  // FFD seeds: medical cases returning soon need the checklist; vary progress
  for (const c of cases) {
    if (["own_serious_health", "pregnancy_disability"].includes(c.reason) && !["Closed", "Denied"].includes(c.status)) {
      const stage = rng();
      c.ffd = stage < 0.25 ? { required: true }
        : stage < 0.55 ? { required: true, requested_at: iso(addDays(new Date(c.end_date + "T00:00:00"), -21)) }
        : stage < 0.75 ? { required: true, requested_at: iso(addDays(new Date(c.end_date + "T00:00:00"), -21)), received_at: iso(addDays(new Date(c.end_date + "T00:00:00"), -7)) }
        : { required: false };
    }
  }
  // ADA seeds: a couple of tracked interactive processes in flight
  const adaCandidates = cases.filter((c) => c.reason === "own_serious_health" && c.total_hours > 0 && c.used_hours / c.total_hours >= 0.6);
  adaCandidates.slice(0, 3).forEach((c, i) => {
    const base = addDays(new Date(c.start_date + "T00:00:00"), 30);
    c.ada = i === 0 ? { tracked: true, requested: iso(base) }
      : i === 1 ? { tracked: true, requested: iso(base), initiated: iso(addDays(base, 5)), offered: iso(addDays(base, 18)) }
      : { tracked: true, requested: iso(base), initiated: iso(addDays(base, 4)), offered: iso(addDays(base, 15)), decision: iso(addDays(base, 20)), resolved: iso(addDays(base, 22)) };
  });
  // Corrective actions: a handful, some deliberately overlapping leave timing
  const correctiveActions = [];
  let caId = 1;
  const caKinds = ["verbal", "written_warning", "PIP", "final_warning"];
  const caTargets = cases.slice(0, 10).map((c) => c);
  for (const c of caTargets) {
    if (rng() < 0.45) {
      const before = rng() < 0.6; // some precede the leave (proximity signal), some are older
      const offset = before ? -int(5, 28) : -int(60, 200);
      correctiveActions.push({ id: caId++, employee_id: c.employee_id, kind: pick(caKinds), action_date: iso(addDays(new Date(c.start_date + "T00:00:00"), offset)), notes: "" });
    }
  }
  // ── v1.3: designation sets on cases ──────────────────────────────────────
  for (const c of cases) {
    c.designations = c.type ? c.type.split("+").map((s) => s.trim()).filter(Boolean) : [];
    c.designation_history = [];
  }
  // one seeded transition so the timeline renders out of the box
  const transCase = cases.find((c) => c.type === "FMLA" && c.total_hours > 0 && c.used_hours / c.total_hours >= 0.9);
  if (transCase) {
    transCase.designation_history = [{ from: ["FMLA"], to: ["FMLA"], effective_date: transCase.start_date, reason: "Original designation at intake", actor: "Sarah Toledano", at_transition: { total_hours: transCase.total_hours, used_hours: 0, exhausted: false }, created_at: transCase.created_at + "T09:00:00Z" }];
  }

  // ── v1.3: starter template library (admin-editable; merge fields live) ───
  const T_AT = "2026-04-01T10:00:00Z";
  const mk = (id, category, name, description, body) => ({ id, entity_id: null, category, name, description, body, version: 1, status: "active", updated_by: "Jordan Avery", updated_at: T_AT, created_at: T_AT, history: [{ version: 1, body, updated_by: "Jordan Avery", updated_at: T_AT }] });
  const templates = [
    mk(1, "FMLA", "FMLA Eligibility Notice", "WH-381 equivalent eligibility determination",
"{{entity_name}}\n\nDate: {{today}}\nTo: {{employee_name}} (File {{file_number}})\nRe: Notice of Eligibility — Case {{case_ref}}\n\nOn {{start_date}} you notified us of your need for leave. Based on our records you ARE eligible for leave under the Family and Medical Leave Act: you have at least 12 months of service and worked at least 1,250 hours in the 12 months preceding the leave.\n\nYour leave has been provisionally designated: {{designation}}.\nEstimated leave period: {{start_date}} through {{end_date}}.\nEntitlement at your schedule of {{hours_per_week}} hours/week: {{total_hours}} hours.\n\nQuestions: contact {{hr_owner}}, Human Resources."),
    mk(2, "FMLA", "Rights & Responsibilities Notice", "Required rights statement accompanying eligibility",
"{{entity_name}}\nRIGHTS AND RESPONSIBILITIES — Case {{case_ref}}\n\nWhile on approved family/medical leave:\n1. Your group health coverage continues on the same terms as if you were working; employee premium shares remain due.\n2. You must provide sufficient medical certification by {{cert_due}}. Failure to return a complete certification may delay or deny leave.\n3. Leave is unpaid unless you elect or we require use of accrued paid leave; wage-replacement programs (CA SDI / PFL) may apply.\n4. Upon return from leave you will be restored to the same or an equivalent position.\n5. Report periodically on your status and intent to return to work.\n\nContact {{hr_owner}} with any questions about these rights."),
    mk(3, "FMLA", "Medical Certification Instructions", "Cover instructions for the WH-380 form",
"Certification of Health Care Provider — Instructions\n\nEmployee: {{employee_name}} · Case {{case_ref}}\n\nPlease have your health care provider complete the attached certification form. Return the completed form to Human Resources no later than {{cert_due}} (15 calendar days from this request). Incomplete or vague certifications will be returned with written notice of the deficiency and seven calendar days to cure.\n\nDo not include genetic information (GINA). Submit via the employee portal upload or to {{hr_owner}}."),
    mk(4, "CFRA", "CFRA Designation Notice", "California Family Rights Act designation",
"{{entity_name}}\n\nCFRA DESIGNATION NOTICE — Case {{case_ref}}\n\nDear {{employee_first}},\n\nYour leave beginning {{start_date}} is designated under the California Family Rights Act{{designation}} and will be counted against your CFRA entitlement. CFRA leave runs concurrently with FMLA where both apply; baby-bonding entitlement under CFRA is separate from Pregnancy Disability Leave.\n\nRemaining entitlement as of this notice: {{remaining_hours}} hours."),
    mk(5, "PDL", "Pregnancy Disability Leave Notice", "CA PDL rights notice",
"{{entity_name}}\n\nPREGNANCY DISABILITY LEAVE NOTICE — Case {{case_ref}}\n\nDear {{employee_first}},\n\nYou are entitled to up to four months (17 1/3 workweeks, measured at your regular schedule of {{hours_per_week}} hours/week = {{total_hours}} hours) of Pregnancy Disability Leave while disabled by pregnancy, childbirth, or a related condition. PDL is in addition to CFRA baby-bonding leave. State Disability Insurance wage replacement may apply — coordinate with payroll.\n\nCertification from your health care provider is due {{cert_due}}."),
    mk(6, "PDL", "CA State Resources — Pregnancy & Bonding", "EDD / CRD resource sheet",
"CALIFORNIA RESOURCES — Pregnancy Disability & Bonding\n\n• State Disability Insurance (SDI): wage replacement while disabled — edd.ca.gov/disability\n• Paid Family Leave (PFL): up to 8 weeks wage replacement for bonding — edd.ca.gov/paidfamilyleave\n• Civil Rights Department (PDL/CFRA rights): calcivilrights.ca.gov\n• Questions about your case: {{hr_owner}}, Human Resources"),
    mk(7, "ADA", "Accommodation Request Form", "Employee-initiated accommodation request",
"REASONABLE ACCOMMODATION REQUEST — {{entity_name}}\n\nEmployee: {{employee_name}} (File {{file_number}}) · Case {{case_ref}} · Date: {{today}}\n\n1. Describe the limitation affecting your ability to perform your job:\n______________________________________________\n\n2. Describe the accommodation(s) you are requesting:\n______________________________________________\n\n3. Anticipated duration: ______________________\n\nReturn to {{hr_owner}}. We will schedule an interactive-process meeting promptly upon receipt. Medical inquiry, if needed, will be limited to the condition's functional limitations."),
    mk(8, "ADA", "Interactive Process Meeting Record", "Documents each interactive-process discussion",
"INTERACTIVE PROCESS MEETING RECORD — Case {{case_ref}}\n\nEmployee: {{employee_name}} · Date: {{today}} · Facilitator: {{hr_owner}}\n\nLimitations discussed: ______________________\nAccommodations considered: ______________________\nAccommodation offered / outcome: ______________________\nFollow-up date: ______________________\n\nThis record is maintained in the case file and the append-only audit trail."),
    mk(9, "ADA", "Medical Inquiry Letter (Job-Related)", "Narrowly tailored provider inquiry",
"{{entity_name}} — MEDICAL INQUIRY\n\nRe: {{employee_name}}, Case {{case_ref}}\n\nTo the treating provider: {{employee_first}} has requested a workplace accommodation. Limited to job-related functions, please describe: (1) functional limitations relevant to the attached job description; (2) expected duration; (3) accommodations that would enable performance of essential functions. Do not provide diagnosis, genetic information, or unrelated history."),
    mk(10, "WC", "Workers' Comp Leave Coordination Notice", "WC + FMLA/CFRA concurrency notice",
"{{entity_name}}\n\nWORKERS' COMPENSATION LEAVE COORDINATION — Case {{case_ref}}\n\nDear {{employee_first}},\n\nTime off work due to your industrial injury will run concurrently with FMLA/CFRA job-protected leave where you are eligible ({{designation}}). Your workers' compensation claim, temporary disability benefits, and medical treatment continue under the claims administrator. Return-to-work releases should be submitted through the employee portal."),
    mk(11, "policy", "Company Leave Policy Summary", "AMPAM leave policy one-pager",
"{{entity_name}} — LEAVE OF ABSENCE POLICY SUMMARY\n\nRequesting leave: submit through the employee portal or to your HR partner ({{hr_owner}}). Provide 30 days' notice where foreseeable.\nWhile on leave: keep HR informed of status changes; benefits continue per plan terms.\nReturning: fitness-for-duty certification may be required before reinstatement.\nJob protection: provided under applicable federal/state law and company policy."),
    mk(12, "internal", "Return-to-Work Checklist (Internal)", "HR internal pre-RTW form",
"INTERNAL — RETURN-TO-WORK CHECKLIST — Case {{case_ref}}\n\nEmployee: {{employee_name}} · Scheduled return: {{end_date}}\n\n[ ] FFD certification required? If yes — requested / received / cleared\n[ ] Payroll notified of return date\n[ ] Equipment / access restored\n[ ] Supervisor briefed (no medical details)\n[ ] Accommodation in place if applicable\n\nCompleted by: ____________ Date: ____________"),
  ];

  // ── v1.3: packet definitions (pure configuration) ────────────────────────
  const packets = [
    { id: 1, name: "FMLA + CFRA Packet", description: "Eligibility, rights, certification instructions, company policy", designations: ["FMLA", "CFRA"], items: [1, 2, 3, 11], active: true, updated_at: T_AT },
    { id: 2, name: "PDL Packet", description: "PDL notice, certification instructions, state resources", designations: ["PDL"], items: [5, 3, 6], active: true, updated_at: T_AT },
    { id: 3, name: "ADA Packet", description: "Accommodation request, interactive process, medical inquiry", designations: ["ADA"], items: [7, 8, 9], active: true, updated_at: T_AT },
  ];

  // ── v1.3: case document repository (metadata; demo content not stored) ───
  const documents = [];
  let docId = 1;
  for (const c of cases.slice(0, 14)) {
    const emp = employees.find((e) => e.id === c.employee_id);
    if (!emp || !c.type) continue;
    const up = (category, filename, status, daysAfterStart, role, extra = {}) => {
      const d = addDays(new Date(c.start_date + "T00:00:00"), daysAfterStart);
      documents.push({ id: docId++, case_id: c.id, employee_id: c.employee_id, category, filename, mime: "application/pdf", size: int(80, 900) * 1024, storage_path: null, status, review_notes: extra.notes || "", reviewed_by: status === "pending_review" ? null : "Sarah Toledano", reviewed_at: status === "pending_review" ? null : iso(addDays(d, 2)), uploaded_by: role === "employee" ? emp.name : "Sarah Toledano", uploaded_role: role, version: extra.version || 1, replaces_id: extra.replaces || null, uploaded_at: iso(d) + "T10:30:00Z" });
    };
    if (c.cert_received) up("initial_cert", `certification_${emp.file_number}.pdf`, "complete", 8, "employee");
    else if (rng() < 0.5) up("initial_cert", `certification_${emp.file_number}.pdf`, "pending_review", 6, "employee");
    if (c.intermittent && rng() < 0.4) up("recert", `recert_${emp.file_number}.pdf`, "pending_review", 40, "employee");
    if (c.ada && rng() < 0.8) up("ada", `accommodation_request_${emp.file_number}.pdf`, "needs_info", 30, "employee", { notes: "Provider did not address essential job functions — supplemental inquiry sent." });
    if (rng() < 0.25) { up("initial_cert", `certification_${emp.file_number}_v1.pdf`, "incomplete", 5, "employee", { notes: "Pages 3-4 missing; cure notice issued (7 days)." }); const prev = documents[documents.length - 1]; up("initial_cert", `certification_${emp.file_number}_v2.pdf`, "complete", 11, "employee", { version: 2, replaces: prev.id }); }
  }

  // ── v1.3: secure messages (employee ⇄ case manager) ─────────────────────
  const messages = [];
  let msgId = 1;
  const msgCases = cases.filter((c) => ["Active", "Approved", "Pending"].includes(c.status)).slice(0, 4);
  for (const c of msgCases) {
    const emp = employees.find((e) => e.id === c.employee_id);
    if (!emp) continue;
    const d0 = addDays(new Date(c.start_date + "T00:00:00"), 3);
    messages.push({ id: msgId++, case_id: c.id, sender_role: "employee", sender_name: emp.name, body: "Hi — checking whether my paperwork went through and if there is anything else you need from me.", created_at: iso(d0) + "T14:05:00Z", read_at: iso(addDays(d0, 0)) + "T16:00:00Z" });
    messages.push({ id: msgId++, case_id: c.id, sender_role: "hr", sender_name: c.owner || "Sarah Toledano", body: `Hi ${emp.name.split(" ")[0]} — received, thank you. ${c.cert_received ? "Your certification is complete; nothing else needed right now." : `We still need your provider's certification by ${c.cert_due}. You can upload it right from this portal.`} I'll update you as soon as anything changes.`, created_at: iso(addDays(d0, 1)) + "T09:20:00Z", read_at: null });
  }

  // ── v2.0: jurisdiction + designated_at on every case ─────────────────────
  for (const c of cases) {
    c.jurisdiction = "CA";
    c.designated_at = c.type ? c.created_at : null;
    c.transfer_review = null;
    c.triage = null;
  }

  // ── v2.0: three crafted risk-signal cases (Feature 7) ────────────────────
  let nextCaseId = Math.max(...cases.map((c) => c.id)) + 1;
  const mkRef = (id) => `LV-2026-${String(1000 + id)}`;

  // (a) Mon/Fri pattern — intermittent FMLA, 8 of 10 usage dates on Mon/Fri
  const patEmp = employees.find((e) => e.status === "Active" && e.scheduleHistory[0].type === "standard_40");
  const patCase = {
    id: nextCaseId, ref: mkRef(nextCaseId), entity_id: patEmp.entity_id, entity_code: patEmp.entity_code,
    employee_id: patEmp.id, file_number: patEmp.file_number,
    type: "FMLA + CFRA", leave_designation: "FMLA + CFRA", designations: ["FMLA", "CFRA"], designation_history: [],
    reason: "own_serious_health", status: "Active", priority: "Medium",
    start_date: "2026-02-02", end_date: "2026-09-30", total_hours: 480, used_hours: 80,
    intermittent: true, concurrent_clocks: ["FMLA", "CFRA"], cert_received: true, cert_due: "2026-02-17",
    owner: "Sarah Toledano", notes: "Seeded: weekend-adjacent usage pattern for signal demo.", documents: [],
    source: "web", created_at: "2026-01-28", updated_at: "2026-05-25", updated_by: "Sarah Toledano",
    jurisdiction: "CA", designated_at: "2026-01-28", transfer_review: null, triage: null,
    audit: [{ date: "2026-01-28", action: "Case created", user: "Sarah Toledano", source: "web" }],
  };
  cases.push(patCase);
  certifications.push({ id: 9001, case_id: patCase.id, kind: "medical", requested_at: "2026-01-28", due_date: "2026-02-17", received_at: "2026-02-10" });
  // Mondays & Fridays of consecutive weeks + two midweek dates
  const patDates = ["2026-04-06", "2026-04-10", "2026-04-13", "2026-04-17", "2026-04-20", "2026-04-24", "2026-05-04", "2026-05-08", "2026-04-29", "2026-05-13"];
  patDates.forEach((d, i) => intermittentLog.push({ id: 9100 + i, case_id: patCase.id, file_number: patEmp.file_number, usage_date: d, hours_used: 8, approved_by: "Sarah Toledano", created_at: d }));
  patCase.used_hours = 80;
  nextCaseId++;

  // (b) ADA exposure gap — medical leave ~120 days in, no ADA milestones, low usage ratio
  const gapEmp = employees.find((e) => e.id !== patEmp.id && e.status === "Active" && e.entity_code === "MULTIMECH");
  const gapStart = iso(addDays(new Date(ANCHOR + "T00:00:00"), -120));
  const gapCase = {
    id: nextCaseId, ref: mkRef(nextCaseId), entity_id: gapEmp.entity_id, entity_code: gapEmp.entity_code,
    employee_id: gapEmp.id, file_number: gapEmp.file_number,
    type: "FMLA + CFRA", leave_designation: "FMLA + CFRA", designations: ["FMLA", "CFRA"], designation_history: [],
    reason: "own_serious_health", status: "Active", priority: "High",
    start_date: gapStart, end_date: iso(addDays(new Date(ANCHOR + "T00:00:00"), 45)), total_hours: 480, used_hours: 260,
    intermittent: false, concurrent_clocks: ["FMLA", "CFRA"], cert_received: true, cert_due: iso(addDays(new Date(gapStart + "T00:00:00"), 15)),
    owner: "Megan Krell", notes: "Seeded: extended continuous medical leave, interactive process never opened.", documents: [],
    source: "web", created_at: gapStart, updated_at: ANCHOR, updated_by: "Megan Krell",
    jurisdiction: "CA", designated_at: gapStart, transfer_review: null, triage: null, ada: null,
    audit: [{ date: gapStart, action: "Case created", user: "Megan Krell", source: "web" }],
  };
  cases.push(gapCase);
  certifications.push({ id: 9002, case_id: gapCase.id, kind: "medical", requested_at: gapStart, due_date: gapCase.cert_due, received_at: iso(addDays(new Date(gapStart + "T00:00:00"), 10)) });
  nextCaseId++;

  // (c) Cross-entity stack — employee transferred AMPAM→SEAL mid-leave, overlapping cases under both entities
  const stackEmp = employees.find((e) => e.id !== patEmp.id && e.id !== gapEmp.id && e.status === "Active" && e.entity_code === "SEAL");
  const sealEntity = ENTITIES.find((x) => x.code === "SEAL"), ampamEntity = ENTITIES.find((x) => x.code === "AMPAM");
  const stackA = {
    id: nextCaseId, ref: mkRef(nextCaseId), entity_id: ampamEntity.id, entity_code: "AMPAM",
    employee_id: stackEmp.id, file_number: stackEmp.file_number,
    type: "FMLA + CFRA", leave_designation: "FMLA + CFRA", designations: ["FMLA", "CFRA"], designation_history: [],
    reason: "family_care", status: "Active", priority: "Medium",
    start_date: "2026-04-01", end_date: "2026-07-15", total_hours: 480, used_hours: 180,
    intermittent: false, concurrent_clocks: ["FMLA", "CFRA"], cert_received: true, cert_due: "2026-04-16",
    owner: "Daniel Reyes", notes: "Seeded: opened under AMPAM before transfer.", documents: [],
    source: "web", created_at: "2026-04-01", updated_at: "2026-05-15", updated_by: "Daniel Reyes",
    jurisdiction: "CA", designated_at: "2026-04-01", triage: null,
    transfer_review: { from: "AMPAM", to: "SEAL", detected_at: "2026-05-10", resolved: false },
    audit: [
      { date: "2026-04-01", action: "Case created", user: "Daniel Reyes", source: "web" },
      { date: "2026-05-10", action: "Cross-entity transfer detected on ADP import: AMPAM → SEAL", user: "ADP Import", source: "import" },
    ],
  };
  nextCaseId++;
  const stackB = {
    id: nextCaseId, ref: mkRef(nextCaseId), entity_id: sealEntity.id, entity_code: "SEAL",
    employee_id: stackEmp.id, file_number: stackEmp.file_number,
    type: "FMLA + CFRA", leave_designation: "FMLA + CFRA", designations: ["FMLA", "CFRA"], designation_history: [],
    reason: "family_care", status: "Active", priority: "Medium",
    start_date: "2026-05-12", end_date: "2026-08-01", total_hours: 480, used_hours: 40,
    intermittent: false, concurrent_clocks: ["FMLA", "CFRA"], cert_received: false, cert_due: "2026-05-27",
    owner: "Daniel Reyes", notes: "Seeded: re-opened under SEAL after transfer — duplicate clock exposure.", documents: [],
    source: "import", created_at: "2026-05-12", updated_at: "2026-05-20", updated_by: "ADP Import",
    jurisdiction: "CA", designated_at: "2026-05-12", transfer_review: null, triage: null,
    audit: [{ date: "2026-05-12", action: "Case created via import", user: "ADP Import", source: "import" }],
  };
  cases.push(stackA, stackB);
  certifications.push({ id: 9003, case_id: stackA.id, kind: "medical", requested_at: "2026-04-01", due_date: "2026-04-16", received_at: "2026-04-12" });
  nextCaseId++;

  // pending intake case WITH seeded triage (Feature 1c demo)
  const triEmp = employees.find((e) => e.status === "Active" && e.entity_code === "AMPAM" && e.id !== patEmp.id && e.id !== stackEmp.id);
  correctiveActions.push({ id: 901, employee_id: triEmp.id, kind: "written_warning", action_date: iso(addDays(new Date(ANCHOR + "T00:00:00"), -18)), notes: "" });
  const triCase = {
    id: nextCaseId, ref: mkRef(nextCaseId), entity_id: triEmp.entity_id, entity_code: triEmp.entity_code,
    employee_id: triEmp.id, file_number: triEmp.file_number,
    type: "", leave_designation: "", designations: [], designation_history: [],
    reason: "own_serious_health", status: "Pending", priority: "Medium",
    start_date: iso(addDays(new Date(ANCHOR + "T00:00:00"), 6)), end_date: "", total_hours: 0, used_hours: 0,
    intermittent: true, concurrent_clocks: [], cert_received: false, cert_due: iso(addDays(new Date(ANCHOR + "T00:00:00"), 21)),
    owner: "Sarah Toledano", notes: "Employee intake: Back trouble is flaring up again, doctor says I may need modified duty or lighter lifting for a while.",
    documents: [], source: "intake", created_at: ANCHOR, updated_at: ANCHOR, updated_by: "Employee intake",
    jurisdiction: "CA", designated_at: null, transfer_review: null,
    triage: { generated_at: ANCHOR + "T08:00:00Z", source: "local", suggestions: [
      { id: "desig", kind: "designation", text: "Likely designation: FMLA + CFRA", status: "open" },
      { id: "ada", kind: "ada_exposure", text: "Intake language suggests possible ADA/FEHA accommodation territory — consider opening the interactive-process tracker early.", status: "open" },
      { id: "tk", kind: "payroll", text: "Intermittent schedule requested — confirm timekeeping coding with payroll at designation.", status: "open" },
      { id: "timing", kind: "timing", text: "Leave timing falls within 30 days of a written warning — document review recommended before any adverse action.", status: "open" },
    ] },
    audit: [{ date: ANCHOR, action: "Case created via employee intake — awaiting HR review and designation", user: triEmp.name, source: "intake" }],
  };
  cases.push(triCase);

  // ── v2.0: e-sign status variety on documents (Feature 2) ────────────────
  for (const d of documents) d.esign_status = null; // uploads don't e-sign
  const esignDocs = [
    { status: "generated" }, { status: "generated" }, { status: "pending_hr_signature" },
    { status: "signed", signed: true }, { status: "delivered", signed: true },
  ];
  const eForms = ["WH-381", "WH-382", "CFRA_DESIG", "PDL_NOTICE", "RTW_REQUEST"];
  esignDocs.forEach((e, i) => {
    const c = cases[i * 2];
    documents.push({
      id: 9200 + i, case_id: c.id, employee_id: c.employee_id, category: "notice",
      filename: `${c.ref}_${eForms[i]}.pdf`, mime: "application/pdf", size: 64 * 1024,
      storage_path: null, status: "complete", review_notes: "", reviewed_by: null, reviewed_at: null,
      uploaded_by: "Jordan Avery", uploaded_role: "hr", version: 1, replaces_id: null,
      uploaded_at: iso(addDays(new Date(ANCHOR + "T00:00:00"), -(i + 2))) + "T09:00:00Z",
      esign_status: e.status, form_type: eForms[i],
      signed_by: e.signed ? "Jordan Avery" : null,
      signed_at: e.signed ? iso(addDays(new Date(ANCHOR + "T00:00:00"), -(i + 1))) + "T10:00:00Z" : null,
    });
  });

  auditEvents.sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));
  return { entities: ENTITIES, employees, cases, intermittentLog, auditEvents, hrUsers: HR_USERS, certifications, correctiveActions, templates, packets, documents, messages };
}

export const SEED = buildSeedData();
