import { test } from "node:test";
import assert from "node:assert/strict";
import { AMPAM_LOGO, AMPAM_LOGO_RATIO, AMPAM_TAGLINE } from "../src/assets/ampamLogo.js";
import { readFileSync } from "node:fs";
const UI = readFileSync(new URL("../src/ui.jsx", import.meta.url), "utf8");

test("brand: official logo asset is a valid PNG data URL with the locked aspect ratio", () => {
  assert.ok(AMPAM_LOGO.startsWith("data:image/png;base64,"));
  const b64 = AMPAM_LOGO.split(",")[1];
  assert.ok(b64.length > 5000, "logo payload suspiciously small");
  assert.doesNotThrow(() => Buffer.from(b64, "base64"));
  // PNG magic bytes survive the round trip
  const bytes = Buffer.from(b64, "base64");
  assert.deepEqual([...bytes.slice(1, 4)].map((c) => String.fromCharCode(c)).join(""), "PNG");
  assert.ok(AMPAM_LOGO_RATIO > 3 && AMPAM_LOGO_RATIO < 3.5, "full logo (symbol+wordmark+strip) ratio");
  assert.equal(AMPAM_TAGLINE, "Building on a Foundation of Trust");
});

test("brand: design tokens are AMPAM Pantone 301 navy / Red 032 on light surfaces, Arial", () => {
  // ui.jsx is JSX (not node-importable) — lock the token source text itself
  assert.ok(UI.includes('navy:"#004B87"'), "BRAND.navy");
  assert.ok(UI.includes('red:"#EF3340"'), "BRAND.red");
  assert.ok(UI.includes('indigo:"#004B87"'), "S.indigo = brand navy");
  assert.ok(UI.includes('card:"#ffffff"'), "light card surfaces");
  assert.ok(UI.includes('font:"Arial, Helvetica, sans-serif"'), "Arial brand font");
  assert.ok(UI.includes('PIE_COLORS = ["#004B87"'), "charts lead with navy");
  assert.ok(UI.includes('tagline:"Building on a Foundation of Trust"'));
  // dark theme is gone: no remaining Inter/Bricolage font literals
  assert.ok(!UI.includes("Bricolage"), "legacy display font removed");
});

test("brand: employee workforce statuses all have badge styles", () => {
  for (const s of ["Leave of Absence", "Seasonal", "Terminated", "Retired", "Inactive"]) {
    assert.ok(UI.includes(`"${s}"`) || UI.includes(`${s}:`), `missing badge for ${s}`);
  }
});
