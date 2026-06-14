# CHANGED.md — hardening/v2.2.0

Running log of every file touched during the v2.2.0 security + resilience
hardening pass, and why. Engine math (`src/lib/compliance/*`, `src/lawdata.js`,
`src/lib/adp/diff.js`) is intentionally **untouched** — verified by diff.

Baseline at branch point: 82 tests passing, clean build (single ~2.1 MB chunk).

## Changes

### P0 · xlsx/SheetJS — dependency swap (eliminates HIGH+CRITICAL)
- `package.json`, `package-lock.json`: replaced the unmaintained npm `xlsx@0.18.5`
  (prototype-pollution GHSA-4r6h-8v6p-xvw6 + ReDoS GHSA-5pgg-2g8v-p4x9, no npm fix)
  with the maintained SheetJS CDN build pinned to `xlsx@0.20.3`
  (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`). Both advisories are
  patched in 0.20.x. Import path `import * as XLSX from "xlsx"` unchanged; 82/82
  tests green, build clean. `npm audit` no longer reports any xlsx advisory.
  **Decision:** CDN swap chosen (the mission's preferred path) over code-only
  mitigation because it eliminates the vulnerability rather than working around it.
  **Deploy note:** the static host's build must be able to reach cdn.sheetjs.com
  at `npm install` time (added to HANDOFF).

### P0 · ADP parse-boundary hardening (defense-in-depth) + tests
- `src/lib/adp/parseRoster.js`: added safety caps around the xlsx reader —
  reject input over `MAX_BYTES` (15 MB) *before* reading; cap processed rows
  (`MAX_ROWS` 50000) and scanned columns (`MAX_COLS` 256); widened the try to
  cover `sheet_to_json` so a malformed sheet returns `{errors}` instead of
  throwing past the boundary. Row-building/normalization logic is **unchanged**
  (downstream diff.js sees the identical row shape).
- `tests/parseRoster.test.mjs` (new, +4 tests → 86): valid parse, oversized
  rejection (no throw), malformed bytes (no throw), and a `__proto__`-header
  workbook that neither pollutes `Object.prototype` nor reaches the row.

### Residual audit risk (documented, not force-fixed)
- `jspdf` (CRITICAL) — fix is jspdf@4 (breaking, rejected by constraint). Runtime
  dep, but inputs are app-generated (notice/letter/binder data), not attacker
  controlled, so practical exposure is low. Accepted.
- `esbuild` via `vite` (HIGH) — dev-server/build-only, not in the production
  bundle; fix is vite@8 (breaking, rejected). Accepted.
- `dompurify` via `jspdf` (moderate), `vite` (moderate) — same breaking-bump
  constraint. Accepted.
