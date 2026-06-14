/* AI drafting assistant (v2.0 · Feature 1).
 *
 * HR-in-the-driver's-seat: the model drafts, HR edits, a human sends. Nothing
 * is ever sent automatically. Three capabilities:
 *   draftCommunication — case messages, notices, review feedback (1a)
 *   morningBriefing    — prioritized "Today's Actions" from a structured digest (1b)
 *   triageIntake       — designation suggestions + exposure flags on intake (1c)
 *
 * Implementation: Anthropic Messages API (claude-sonnet-4-20250514), proxied
 * by a server-side Supabase edge function (ai-proxy) that holds the key. The
 * system prompt is tightly scoped per call: entity, applicable law for the
 * designation set, communication type, and the hard compliance constraint.
 * Every call degrades gracefully to a deterministic local fallback so demo
 * mode works fully offline — the UI labels which path produced the draft.
 *
 * PII note: prompts carry only what the communication itself must contain
 * (name, dates, designation, balances). Medical notes are never included.
 */

import { supabase } from "../../data/api.js";

const MODEL = "claude-sonnet-4-20250514";

export const COMPLIANCE_CONSTRAINT =
  "Hard constraints: Do not include language that waives or could be read to waive employee rights under FEHA, CFRA, or FMLA. " +
  "Do not reference any medical condition, diagnosis, or treatment not already present in the provided case record. " +
  "Do not promise outcomes, approvals, or pay amounts. Use plain, respectful English at an 8th-grade reading level. " +
  "Never state legal conclusions; frame statutory references as informational.";

async function callClaude(system, user, maxTokens = 1000) {
  if (!supabase) throw new Error("AI proxy unavailable"); // demo / unconfigured ⇒ local fallback
  const { data, error } = await supabase.functions.invoke("ai-proxy", {
    body: { model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] },
  });
  if (error) throw new Error(`AI request failed (${error.message})`);
  const text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!text) throw new Error("AI returned an empty draft");
  return text;
}

/** Case context every prompt shares — built once by the caller. */
export function caseContextBlock({ caseData = {}, employee = {}, entity = {}, balances = null }) {
  return [
    `Entity (legal employer): ${entity.legal_name || entity.name || "AMPAM Parks Mechanical"}`,
    `Employee: ${employee.name || "—"} (file ${employee.file_number || caseData.file_number || "—"})`,
    `Supervisor/department: ${employee.dept || employee.department || "—"}`,
    `Case: ${caseData.ref || "—"} · status ${caseData.status || "—"} · source ${caseData.source || "web"}`,
    `Designation set: ${caseData.leave_designation || caseData.type || "pending designation"}`,
    `Applicable law for this set: ${lawLineFor(caseData)}`,
    `Reason category: ${(caseData.reason || "").replace(/_/g, " ") || "—"}`,
    `Dates: ${caseData.start_date || "—"} → ${caseData.end_date || "TBD"} · ${caseData.intermittent ? "intermittent" : "continuous"}`,
    `Clock: ${caseData.used_hours ?? 0} of ${caseData.total_hours ?? 0} hours used${balances ? ` · ${balances}` : ""}`,
    `Certification due: ${caseData.cert_due || "—"} · received: ${caseData.cert_received ? "yes" : "no"}`,
    `HR case owner: ${caseData.owner || "—"}`,
  ].join("\n");
}

function lawLineFor(caseData) {
  const d = String(caseData.leave_designation || caseData.type || "");
  const parts = [];
  if (d.includes("FMLA")) parts.push("FMLA (29 CFR 825)");
  if (d.includes("CFRA")) parts.push("CFRA (Gov. Code 12945.2)");
  if (d.includes("PDL")) parts.push("CA PDL (Gov. Code 12945)");
  if (d.includes("ADA")) parts.push("ADA/FEHA reasonable accommodation");
  if (d.includes("WC")) parts.push("CA workers' compensation coordination");
  return parts.join("; ") || "pending designation — general CA leave law";
}

/* ── 1a · smart notice drafting ─────────────────────────────────────────── */
const COMM_TYPES = {
  message: "a secure portal message from the HR case manager to the employee",
  notice: "the body text of a formal leave notice letter on entity letterhead",
  review_feedback: "document review feedback explaining what is missing or needed, shown to the employee with the document status",
};

export async function draftCommunication({ type = "message", caseCtx, instructions = "" }) {
  const system = [
    `You draft ${COMM_TYPES[type] || COMM_TYPES.message} for a California construction employer's leave-management team.`,
    `The draft is reviewed and edited by HR before anything is sent — write a complete, ready-to-edit draft, no placeholders like [NAME].`,
    COMPLIANCE_CONSTRAINT,
    `Output only the draft text. No preamble, no markdown headers.`,
  ].join("\n");
  const user = `CASE RECORD:\n${caseCtx}\n\nDRAFTING REQUEST: ${instructions || defaultInstruction(type)}`;
  try {
    const text = await callClaude(system, user, 800);
    return { text, source: "ai" };
  } catch (e) {
    return { text: localDraft(type, caseCtx, instructions), source: "local", note: e.message };
  }
}

function defaultInstruction(type) {
  return type === "review_feedback"
    ? "Explain courteously what additional information is needed on the submitted document and how to resubmit."
    : type === "notice"
      ? "Draft the notice body appropriate to the case's current designation and dates."
      : "Draft a brief, warm status update covering where the case stands and the employee's next step.";
}

function localDraft(type, caseCtx, instructions) {
  const get = (label) => (caseCtx.match(new RegExp(`^${label}: (.*)$`, "m")) || [])[1] || "";
  const first = (get("Employee").split(" ")[0] || "there");
  const ref = (get("Case").split(" ·")[0] || "").trim();
  if (type === "review_feedback") return `Thank you for submitting your document for ${ref}. After review, we need a little more information before we can mark it complete${instructions ? ` — specifically: ${instructions}` : ""}. Please ask your provider to address the noted items and re-upload through your portal; the original stays on file. Reach out through the Support tab with any questions.`;
  if (type === "notice") return `Dear ${first},\n\nThis letter concerns your leave case ${ref}. ${instructions || "Please see the details of your leave designation, dates, and certification requirements below."} Your rights under FMLA, CFRA, and FEHA are unaffected by this notice. If anything here does not match your understanding, contact your HR case manager right away.\n\nSincerely,\nHuman Resources`;
  return `Hi ${first} — a quick update on ${ref}. ${instructions || `Everything is on track on our side. Your next step is shown in the Documents tab of your portal; nothing else is needed from you right now.`} Message me here any time with questions.`;
}

/* ── 1b · morning briefing ──────────────────────────────────────────────── */
export async function morningBriefing(digest) {
  const system = [
    "You are the morning briefing for a single HR leave specialist managing three related California construction entities.",
    "From the structured digest, produce a prioritized action list for TODAY. Most urgent first.",
    "Format: one line per action, starting with the case ref in square brackets, then a ≤20-word imperative action. No headers, no commentary, max 10 lines.",
    "Urgency order: overdue items, then ≤3-day deadlines, then ≤7-day, then FYI.",
    COMPLIANCE_CONSTRAINT,
  ].join("\n");
  try {
    const text = await callClaude(system, `DIGEST (JSON):\n${JSON.stringify(digest, null, 1)}`, 700);
    const items = text.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("["));
    if (!items.length) throw new Error("unparseable briefing");
    return { items: items.map(parseBriefLine), source: "ai" };
  } catch {
    return { items: localBriefing(digest), source: "local" };
  }
}
const parseBriefLine = (l) => { const m = l.match(/^\[([^\]]+)\]\s*(.*)$/); return { ref: m?.[1] || "", action: m?.[2] || l }; };

export function localBriefing(digest) {
  const items = [];
  for (const x of digest.rtwWithoutFfd || []) items.push({ ref: x.ref, action: `Return in ${x.days}d without FFD clearance — resolve the checklist today.` });
  for (const x of digest.overdueRecerts || []) items.push({ ref: x.ref, action: `Recert ${x.daysLate}d overdue — issue written follow-up with 7-day cure window.` });
  for (const x of digest.certsDue7 || []) items.push({ ref: x.ref, action: `Certification due ${x.due} — confirm provider has the form.` });
  for (const x of digest.unackedPayroll || []) items.push({ ref: x.ref, action: `Acknowledge payroll coordination (${x.kind}) — due ${x.by}.` });
  for (const x of digest.adaOverdue || []) items.push({ ref: x.ref, action: `ADA next step "${x.nextStep}" pending — schedule the interactive-process touchpoint.` });
  for (const x of digest.newIntakes || []) items.push({ ref: x.ref, action: `New intake from ${x.employee} — review, verify eligibility, designate.` });
  return items.slice(0, 10);
}

/* ── 1c · intake triage ─────────────────────────────────────────────────── */
/** Deterministic heuristics — always computed at intake time; the AI pass is
 *  an optional, on-demand enrichment HR can trigger from the case. */
export function localTriage({ reason = "", notes = "", intermittent = false, correctiveSignal = null }) {
  const suggestions = [];
  const text = `${reason} ${notes}`.toLowerCase();
  const map = {
    own_serious_health: ["FMLA", "CFRA"], family_care: ["FMLA", "CFRA"],
    bonding: ["FMLA", "CFRA"], pregnancy_disability: ["PDL"], military_caregiver: ["FMLA"],
  };
  if (map[reason]) suggestions.push({ id: "desig", kind: "designation", text: `Likely designation: ${map[reason].join(" + ")}${reason === "pregnancy_disability" ? " (CFRA bonding reserved for after PDL)" : ""}`, status: "open" });
  const adaWords = ["accommodat", "light duty", "modified duty", "restriction", "can't lift", "cannot lift", "disab", "chronic", "permanent"];
  if (adaWords.some((w) => text.includes(w))) suggestions.push({ id: "ada", kind: "ada_exposure", text: "Intake language suggests possible ADA/FEHA accommodation territory — consider opening the interactive-process tracker early.", status: "open" });
  if (intermittent) suggestions.push({ id: "tk", kind: "payroll", text: "Intermittent schedule requested — confirm timekeeping coding with payroll at designation.", status: "open" });
  if (correctiveSignal) suggestions.push({ id: "timing", kind: "timing", text: `Leave timing falls within 30 days of a ${correctiveSignal.kind.replace(/_/g, " ")} (${correctiveSignal.action_date}) — document review recommended before any adverse action.`, status: "open" });
  return suggestions;
}

export async function triageIntake({ reasonText, caseCtx, localSuggestions }) {
  const system = [
    "You triage a new employee leave-intake submission for an HR specialist. You see only what the employee wrote and the case record.",
    "Return STRICT JSON only: {\"suggestions\":[{\"kind\":\"designation|ada_exposure|timing|payroll|other\",\"text\":\"≤30 words\"}]} — no prose, no markdown.",
    "Flag: likely applicable designation(s); any language suggesting ADA/FEHA accommodation exposure; anything HR should verify before designating. Never diagnose; never speculate about medical conditions beyond the employee's own words.",
    COMPLIANCE_CONSTRAINT,
  ].join("\n");
  try {
    const text = await callClaude(system, `EMPLOYEE'S INTAKE TEXT:\n${reasonText}\n\nCASE RECORD:\n${caseCtx}`, 500);
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    const ai = (parsed.suggestions || []).slice(0, 5).map((s, i) => ({ id: `ai-${i}`, kind: s.kind || "other", text: String(s.text).slice(0, 240), status: "open" }));
    return { suggestions: dedupe([...(localSuggestions || []), ...ai]), source: "ai" };
  } catch {
    return { suggestions: localSuggestions || [], source: "local" };
  }
}
const dedupe = (arr) => { const seen = new Set(); return arr.filter((s) => { const k = s.kind + s.text.slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; }); };
