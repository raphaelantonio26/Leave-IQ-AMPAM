// ai-proxy CORS origin-allowlist tests (v2.2.0).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickAllowedOrigin } from "../supabase/functions/ai-proxy/cors.js";

test("returns the origin when it is allowlisted", () => {
  assert.equal(
    pickAllowedOrigin("https://app.ampam.com", ["https://app.ampam.com"]),
    "https://app.ampam.com",
  );
});

test("returns null when the origin is not allowlisted", () => {
  assert.equal(pickAllowedOrigin("https://evil.example", ["https://app.ampam.com"]), null);
});

test("returns null when the allowlist is empty (deny-by-default)", () => {
  assert.equal(pickAllowedOrigin("https://app.ampam.com", []), null);
});

test("returns null for a missing origin", () => {
  assert.equal(pickAllowedOrigin(null, ["https://app.ampam.com"]), null);
  assert.equal(pickAllowedOrigin(undefined, ["x"]), null);
});
