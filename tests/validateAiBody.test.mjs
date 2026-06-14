// ai-proxy request-body validation tests (v2.2.0).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAiBody } from "../supabase/functions/ai-proxy/validate.js";

const good = { system: "sys", messages: [{ role: "user", content: "hi" }] };

test("accepts a well-formed body and whitelists to exactly the 4 fields", () => {
  const r = validateAiBody({ ...good, model: "claude-sonnet-4-6", max_tokens: 800, extra: "drop me" }, "default-model");
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.payload).sort(), ["max_tokens", "messages", "model", "system"]);
  assert.equal(r.payload.model, "claude-sonnet-4-6");
  assert.equal(r.payload.max_tokens, 800);
  assert.equal(r.payload.extra, undefined);
});

test("defaults the model and clamps max_tokens to the cap", () => {
  const r = validateAiBody({ ...good, max_tokens: 999999 }, "default-model");
  assert.equal(r.ok, true);
  assert.equal(r.payload.model, "default-model");
  assert.equal(r.payload.max_tokens, 2000);
});

test("rejects a non-string system", () => {
  assert.equal(validateAiBody({ system: 123, messages: good.messages }, "m").ok, false);
});

test("rejects missing, empty, or oversized messages", () => {
  assert.equal(validateAiBody({ system: "s" }, "m").ok, false);
  assert.equal(validateAiBody({ system: "s", messages: [] }, "m").ok, false);
  const many = Array.from({ length: 1000 }, () => ({ role: "user", content: "x" }));
  assert.equal(validateAiBody({ system: "s", messages: many }, "m").ok, false);
});

test("rejects non-object bodies", () => {
  assert.equal(validateAiBody(null, "m").ok, false);
  assert.equal(validateAiBody("nope", "m").ok, false);
  assert.equal(validateAiBody([1, 2], "m").ok, false);
});
