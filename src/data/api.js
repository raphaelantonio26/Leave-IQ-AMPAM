/* Supabase client + query layer. The ONLY file that talks to the backend.
 * When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are unset, the app runs in
 * Demo mode and this module is never exercised.
 *
 * RBAC and medical-note masking are enforced server-side by RLS and the
 * cases_secure view (see supabase/migrations/) — these queries deliberately
 * select from the masked view, so a compromised client still cannot read
 * restricted notes.
 */
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env?.VITE_SUPABASE_URL;
const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && key);
export const supabase = supabaseConfigured ? createClient(url, key) : null;

export const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

export const api = {
  signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
  signOut: () => supabase.auth.signOut(),
  getSession: () => supabase.auth.getSession(),

  fetchAll: async () => {
    const [entities, employees, cases, log, audit, hrUsers, certifications, correctiveActions, documents, templates, packets, messages] = await Promise.all([
      supabase.from("entities").select("*").order("id").then(ok),
      supabase.from("employees").select("*").order("file_number").then(ok),
      supabase.from("cases_secure").select("*").order("updated_at", { ascending: false }).then(ok), // masked view — notes nulled unless role allows
      supabase.from("intermittent_log").select("*").order("usage_date").then(ok),
      supabase.from("audit_events").select("*").order("changed_at", { ascending: false }).limit(2000).then(ok),
      supabase.from("hr_users").select("id,name,email,role,entity_id,department,notification_prefs").then(ok),
      supabase.from("certifications").select("*").order("created_at").then(ok),
      supabase.from("corrective_actions").select("*").order("action_date", { ascending: false }).then(ok).catch(() => []),
      supabase.from("case_documents").select("*").order("uploaded_at").then(ok).catch(() => []),
      supabase.from("doc_templates").select("*").order("name").then(ok).catch(() => []),
      supabase.from("packet_defs").select("*").order("name").then(ok).catch(() => []),
      supabase.from("case_messages").select("*").order("created_at").then(ok).catch(() => []),
    ]);
    return { entities, employees, cases, intermittentLog: log, auditEvents: audit, hrUsers, certifications, correctiveActions, documents, templates, packets, messages };
  },

  createCase: (row) => supabase.from("leave_cases").insert(row).select().single().then(ok),
  updateCase: (id, patch) => supabase.from("leave_cases").update(patch).eq("id", id).select().single().then(ok),
  logIntermittent: (row) => supabase.from("intermittent_log").insert(row).select().single().then(ok),
  recordCertification: (row) => supabase.from("certifications").insert(row).select().single().then(ok),

  // Audit rows for data changes are written automatically by DB triggers; this
  // is for application events (logins, exports, document generation, imports).
  logEvent: (row) => supabase.from("audit_events").insert({ source: "web", ...row }).then(ok),

  importCommit: async ({ newEmployees, updatedEmployees, casesToCreate }) =>
    supabase.rpc("adp_import_commit", {
      p_new_employees: newEmployees,
      p_updated_employees: updatedEmployees,
      p_cases: casesToCreate,
    }).then(ok),

  uploadDocument: async (caseId, file, path) => {
    const r = await supabase.storage.from("case-documents").upload(path, file, { upsert: false });
    if (r.error) throw new Error(r.error.message);
    return supabase.from("certifications").update({ file_path: r.data.path }).eq("case_id", caseId).then(ok);
  },

  /* ── v1.3 ─────────────────────────────────────────────────────────────── */
  get client() { return supabase; },

  insertDocument: (meta) => supabase.from("case_documents").insert(meta).then(ok),
  updateDocument: (id, patch) => supabase.from("case_documents").update(patch).eq("id", id).then(ok),
  saveTemplate: (tpl) => supabase.from("doc_templates").upsert({
    id: tpl.id, entity_id: tpl.entity_id ?? null, category: tpl.category, name: tpl.name,
    description: tpl.description ?? "", body: tpl.body, version: tpl.version, status: tpl.status,
    updated_by: tpl.updated_by, updated_at: tpl.updated_at, history: tpl.history,
  }).then(ok),
  savePacket: (pkt) => supabase.from("packet_defs").upsert({
    id: pkt.id, name: pkt.name, description: pkt.description ?? "", designations: pkt.designations ?? [],
    items: pkt.items ?? [], active: pkt.active !== false, updated_at: pkt.updated_at,
  }).then(ok),
  sendMessage: (msg) => supabase.from("case_messages").insert(msg).then(ok),
  markMessagesRead: (caseId, readerRole) =>
    supabase.from("case_messages").update({ read_at: new Date().toISOString() })
      .eq("case_id", caseId).neq("sender_role", readerRole).is("read_at", null).then(ok),

  saveNotificationPrefs: (userId, prefs) =>
    supabase.from("hr_users").update({ notification_prefs: prefs }).eq("id", userId).then(ok),

  /* ── v2.0 ─────────────────────────────────────────────────────────────── */
  updateEmployee: (id, patch) => supabase.from("employees").update(patch).eq("id", id).then(ok),
  saveEntity: (entity) => supabase.from("entities").update({
    legal_name: entity.legal_name, ein_masked: entity.ein_masked,
    hr_contact_name: entity.hr_contact_name, hr_contact_title: entity.hr_contact_title,
    mailing_address: entity.mailing_address, policy_effective_date: entity.policy_effective_date,
    notification_recipients: entity.notification_recipients,
  }).eq("id", entity.id).then(ok),

  /* ── v1.2 ─────────────────────────────────────────────────────────────── */
  // Employee intake: anon-callable security-definer RPC validates the magic
  // token + last name server-side and inserts the Pending case (source='intake').
  submitIntake: (payload) =>
    supabase.rpc("submit_intake", {
      p_token: payload.token ?? null,
      p_file_number: String(payload.file_number).trim(),
      p_last_name: payload.last_name,
      p_reason: payload.reason ?? "",
      p_start_date: payload.start_date,
      p_end_date: payload.end_date || null,
      p_intermittent: !!payload.intermittent,
      p_notes: payload.notes ?? "",
    }).then(ok),

  recordAdaStep: (caseId, step, detail) =>
    supabase.rpc("record_ada_step", { p_case_id: caseId, p_step: step, p_detail: detail ?? null }).then(ok),

  receiveCertification: (certId) =>
    supabase.from("certifications").update({ received_at: new Date().toISOString().slice(0, 10) }).eq("id", certId).then(ok),
};
