// Pure validation + field-whitelisting for the ai-proxy request body.
// Shared by the Deno edge function and node tests. Beyond picking fields, it
// type-checks `system` (string) and `messages` (non-empty, bounded array) and
// clamps max_tokens, rejecting malformed bodies so they never reach Anthropic.
const MAX_MESSAGES = 50;
const MAX_TOKENS_CAP = 2000;

export function validateAiBody(body, defaultModel) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  if (typeof body.system !== "string") {
    return { ok: false, error: "system must be a string" };
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { ok: false, error: "messages must be a non-empty array" };
  }
  if (body.messages.length > MAX_MESSAGES) {
    return { ok: false, error: `messages exceeds the ${MAX_MESSAGES}-item limit` };
  }
  const model = typeof body.model === "string" ? body.model : defaultModel;
  const max_tokens = Math.min(Number(body.max_tokens) || 1000, MAX_TOKENS_CAP);
  return { ok: true, payload: { model, max_tokens, system: body.system, messages: body.messages } };
}
