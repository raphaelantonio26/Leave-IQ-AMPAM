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
import { validateAiBody } from "./validate.js";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-6";

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

// Transient Anthropic errors (429 rate-limit, 500, 529 overloaded) are retryable;
// without this a single blip silently degrades the AI engine to offline drafts.
// Bounded: 3 attempts, exponential backoff + jitter (honoring retry-after), 30s/attempt.
const RETRYABLE = new Set([429, 500, 529]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt: number) => Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 250;
async function callAnthropic(payload: unknown): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY!,
          "anthropic-version": ANTHROPIC_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      if (attempt >= 2) throw e; // network error / timeout — exhausted
      await sleep(backoff(attempt));
      continue;
    }
    if (!RETRYABLE.has(res.status) || attempt >= 2) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
  }
}

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

  // 3) validate + whitelist the request body, then forward to Anthropic
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid body" }, 400); }
  const valid = validateAiBody(body, DEFAULT_MODEL);
  if (!valid.ok) return json({ error: valid.error }, 400);
  const payload = valid.payload;
  let res: Response;
  try {
    res = await callAnthropic(payload);
  } catch (_e) {
    return json({ error: "AI upstream unavailable" }, 502); // client falls back to its offline draft
  }
  const data = await res.json().catch(() => ({}));
  return json(data, res.ok ? 200 : res.status);
});
