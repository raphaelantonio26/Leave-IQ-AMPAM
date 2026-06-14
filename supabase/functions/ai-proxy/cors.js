// Pure CORS origin-allowlist resolver shared by the ai-proxy edge function and
// its tests. Returns the request origin only if it is in the allowlist, else
// null (the caller maps null → "null", which browsers treat as a denied origin).
export function pickAllowedOrigin(origin, allowed) {
  return origin && Array.isArray(allowed) && allowed.includes(origin) ? origin : null;
}
