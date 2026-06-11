/* Document template engine (v1.3 · Priorities 1–3).
 * Templates are plain text with {{merge_fields}}, managed entirely by HR
 * admins — no developer involvement. The same renderer powers single letters
 * and multi-document packets. */

export const TEMPLATE_CATEGORIES = [
  { id: "FMLA", label: "FMLA" },
  { id: "CFRA", label: "CFRA" },
  { id: "ADA", label: "ADA" },
  { id: "PDL", label: "PDL" },
  { id: "WC", label: "Workers' Compensation" },
  { id: "state", label: "State-specific programs" },
  { id: "policy", label: "Company policies" },
  { id: "internal", label: "Internal forms" },
];

/** Document repository categories on a case (Priority 1). */
export const DOC_CATEGORIES = [
  { id: "initial_cert", label: "Initial certification" },
  { id: "recert", label: "Recertification" },
  { id: "rtw_release", label: "Return-to-work release" },
  { id: "ffd", label: "Fitness-for-duty" },
  { id: "ada", label: "ADA accommodation" },
  { id: "wc", label: "Workers' Comp" },
  { id: "notice", label: "Generated notice / packet" },
  { id: "correspondence", label: "Correspondence" },
  { id: "other", label: "Other supporting" },
];

export const DOC_STATUSES = [
  { id: "pending_review", label: "Pending Review", color: "#b97509" },
  { id: "complete", label: "Complete", color: "#1e7d3f" },
  { id: "incomplete", label: "Incomplete", color: "#EF3340" },
  { id: "needs_info", label: "Additional Info Required", color: "#1565a8" },
];

/** Merge fields available to every template, with example output. */
export const MERGE_FIELDS = [
  ["employee_name", "Jordan Sample"], ["employee_first", "Jordan"],
  ["file_number", "001482"], ["case_ref", "LV-2026-1042"],
  ["entity_name", "AMPAM Parks Mechanical, Inc."],
  ["designation", "FMLA + CFRA"], ["reason", "Own serious health condition"],
  ["start_date", "2026-06-15"], ["end_date", "2026-08-10"],
  ["cert_due", "2026-06-30"], ["total_hours", "480"], ["used_hours", "120"],
  ["remaining_hours", "360"], ["hours_per_week", "40"],
  ["hr_owner", "Sarah Toledano"], ["today", "2026-06-10"],
];

/** Render a template body against a context. Unknown fields render as
 *  ⟦field⟧ so a half-merged document is impossible to miss. */
export function renderTemplate(body, ctx = {}) {
  return String(body || "").replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key) =>
    ctx[key] !== undefined && ctx[key] !== null && ctx[key] !== "" ? String(ctx[key]) : `⟦${key}⟧`);
}

/** Which merge fields does a template body actually use? */
export function usedMergeFields(body) {
  const out = new Set(); let m;
  const re = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
  while ((m = re.exec(String(body || "")))) out.add(m[1].toLowerCase());
  return [...out];
}

/** Build the merge context for a case. */
export function mergeContext({ caseData = {}, employee = {}, entity = {} }) {
  const remaining = Math.max(0, (Number(caseData.total_hours) || 0) - (Number(caseData.used_hours) || 0));
  return {
    employee_name: employee.name || "", employee_first: (employee.name || "").split(" ")[0],
    file_number: employee.file_number || caseData.file_number || "",
    case_ref: caseData.ref || "", entity_name: entity.legal_name || entity.name || "",
    designation: caseData.leave_designation || caseData.type || "Pending designation",
    reason: caseData.reason ? caseData.reason.replace(/_/g, " ") : "",
    start_date: caseData.start_date || "", end_date: caseData.end_date || "TBD",
    cert_due: caseData.cert_due || "", total_hours: caseData.total_hours ?? "",
    used_hours: caseData.used_hours ?? "", remaining_hours: remaining,
    hours_per_week: employee.hours_per_week || 40,
    hr_owner: caseData.owner || "", today: new Date().toISOString().slice(0, 10),
  };
}

/** New version entry for a template's history chain. */
export function nextTemplateVersion(template, newBody, actor) {
  const version = (Number(template?.version) || 0) + 1;
  return {
    version,
    entry: { version, body: newBody, updated_by: actor, updated_at: new Date().toISOString() },
  };
}
