// LeaveIQ ai-proxy edge function (Deno / Supabase Edge Functions)
//
// Server-side proxy for the Anthropic Messages API so the browser never holds
// the API key. The client (src/lib/ai/index.js) calls this via
//   supabase.functions.invoke("ai-proxy", { body })
// and this forwards the body to Anthropic with the secret key + version header,
// returning the response unchanged so the client's parsing of `data.content`
// is untouched.
//
// Auth is the gate (not CORS origin): the caller's JWT is validated and matched
// to an active hr_users row (admin/specialist/legal). Anon-key-only or non-HR
// callers are rejected, so the key/quota can't be spent by outsiders.
//
// Secret (supabase secrets set ...):
//   ANTHROPIC_API_KEY — Anthropic API key (sk-ant-...)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// service role: validates the caller's token and reads their hr_users row
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // 1) authenticate: valid JWT → active HR user
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "missing authorization" }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "invalid session" }, 401);
  const { data: hr } = await admin
    .from("hr_users")
    .select("role, active")
    .eq("auth_user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (!hr || !["admin", "specialist", "legal"].includes(hr.role)) {
    return json({ error: "not authorized" }, 403);
  }

  // 2) require the secret (unset ⇒ client falls back to its offline draft)
  if (!ANTHROPIC_API_KEY) return json({ error: "AI is not configured" }, 503);

  // 3) forward to Anthropic (whitelist the fields the client sends)
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid body" }, 400); }
  const payload = {
    model: typeof body.model === "string" ? body.model : DEFAULT_MODEL,
    max_tokens: Math.min(Number(body.max_tokens) || 1000, 2000),
    system: body.system,
    messages: body.messages,
  };
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return json(data, res.ok ? 200 : res.status);
});
