// cert-alerts email HTML-escaping tests (v2.2.0). The alert email interpolates
// employee names / refs / messages; this proves they can't inject markup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../supabase/functions/cert-alerts/escape.js";

test("escapeHtml neutralizes all five HTML-significant characters", () => {
  assert.equal(escapeHtml(`<a>&"'`), "&lt;a&gt;&amp;&quot;&#39;");
});

test("escapeHtml prevents tag injection via an employee name", () => {
  const name = 'Pat <img src=x onerror="steal()">';
  const out = escapeHtml(`Medical certification for ${name} (LV-2026-1001) is overdue.`);
  assert.ok(!out.includes("<img"), "raw tag must not survive");
  assert.ok(out.includes("&lt;img"), "tag must be escaped");
});

test("escapeHtml coerces null/undefined to empty string", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});
