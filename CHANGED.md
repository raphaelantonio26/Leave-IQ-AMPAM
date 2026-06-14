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

### P0 · cert-alerts email HTML injection
- `supabase/functions/cert-alerts/escape.js` (new): pure `escapeHtml` helper,
  importable by both the Deno function and node tests.
- `supabase/functions/cert-alerts/index.ts`: escape every interpolated value in
  the email body (`a.line` — which carries employee name + ref + payroll message —
  and `a.ref`). Source is trusted today; escaped regardless.
- `tests/escapeHtml.test.mjs` (new, +3 → 89): char escaping, name-based tag
  injection blocked, null/undefined coercion.

### P1 · cert-alerts partial-failure reporting
- `supabase/functions/cert-alerts/index.ts`: previously only the `cases` query
  error was checked; `certifications` and `hr_users` errors were swallowed. Now
  every query's error is captured — `cases` failure stays fatal (500), the other
  two degrade into a `queryErrors` list surfaced in the JSON response, which is
  now `{ scanned, alerts, sent, errors }` on every return path.

### P2 · cert-alerts email rebrand (was pre-v2.1)
- `supabase/functions/cert-alerts/index.ts`: the alert email never got the v2.1
  brand sweep — header `background:#6366f1` (old indigo) → AMPAM navy `#004B87`;
  `font-family:Inter,...` → `Arial,sans-serif`. Now matches the in-app system on
  this employee/HR-facing surface. No new colors introduced.

### P0 · ai-proxy request-body validation
- `supabase/functions/ai-proxy/validate.js` (new): pure `validateAiBody` —
  type-checks `system` (string) and `messages` (non-empty, ≤50), keeps the
  max_tokens clamp (≤2000), whitelists to exactly {model, max_tokens, system,
  messages}, and rejects malformed bodies with a clear error.
- `supabase/functions/ai-proxy/index.ts`: step 3 now calls `validateAiBody` and
  returns 400 on failure instead of forwarding loosely-shaped input to Anthropic.
- `tests/validateAiBody.test.mjs` (new, +5 → 94).

### P0 · ai-proxy CORS origin lock
- `supabase/functions/ai-proxy/cors.js` (new): pure `pickAllowedOrigin`.
- `supabase/functions/ai-proxy/index.ts`: replaced `Access-Control-Allow-Origin: *`
  with a per-request value resolved against an `ALLOWED_ORIGIN` env allowlist
  (comma-separated); unset ⇒ deny all cross-origin (secure default). CORS headers
  are computed per request and threaded through every response; the JWT/HR gate
  is unchanged. Header comment documents the new env var.
- `tests/pickAllowedOrigin.test.mjs` (new, +4 → 98).
- **Deploy note (HANDOFF):** set `ALLOWED_ORIGIN` to the app's URL or the AI
  proxy's browser calls are blocked.

### P1 · DataContext mutation-failure visibility (safety net)
- `src/data/DataContext.jsx`: every mutating action is now `guard`-wrapped —
  on any backend/validation error it pops an error toast (reusing the existing
  branded `Toast` from ui.jsx, rendered by the provider, 4 s auto-dismiss) and
  re-throws so existing per-component handling (inline form errors, success vs
  failure branching) is preserved. Single-data-provider architecture unchanged.
- State consistency: production paths already update local state only via
  `refresh()` AFTER a successful api call, so a failed write orphans no
  optimistic state — verified by reading every action. (No behavioral change to
  state on success.)
- No React test harness exists; verified via `npm run build` + manual review.

### P1 · api.js error propagation
- `src/data/api.js`: audited every Supabase call. All query/RPC calls route
  through the `ok` helper (throws on `error`). Fixed the one gap: `uploadDocument`
  returned the trailing `certifications.update(...)` without `.then(ok)`, so its
  error was silently ignored — now checked. Exported `ok` so the propagation
  contract is unit-tested.
- The `.catch(() => [])` on optional v1.2/v1.3 tables in `fetchAll` is kept by
  design (graceful degradation for DBs predating those tables; returns `[]`, not
  a silent null) — documented rather than changed to avoid a regression.
- `tests/apiErrorPropagation.test.mjs` (new, +2 → 100).

### P2 · README doc accuracy
- `README.md`: migration inventory `0001–0004` → `0001–0007` (matches the seven
  files HANDOFF already lists); stale "29 tests / 29 unit tests" → 100; added the
  new `functions/ai-proxy/` line. HANDOFF already lists seven migrations — verified
  consistent.

### P3 · bundle splitting — vendor manualChunks
- `vite.config.js`: added `rollupOptions.output.manualChunks` splitting the heavy
  vendor libs (react, recharts, jspdf+jszip, framer-motion, supabase, lucide,
  xlsx) into separate, individually-cacheable chunks. Main chunk dropped from
  ~2.1 MB to ~399 KB; the >1600 KB chunk-size warning is gone; 11+ chunks emit;
  every route still renders (config-only, no code change). 100/100 tests.

### P3 · route-level lazy loading
- `src/App.jsx`: 10 heavy/rarely-first-paint page modules (ImportADP, Reports,
  AuditLog, RiskSignals, ManagerDashboard, KnowledgeCenter, DocumentLibrary,
  EmployeePortal, Workload, Entities) converted to `React.lazy`, rendered inside
  a single `<Suspense>` with a branded fallback in the page `<main>`. The
  app-level `ErrorBoundary` (main.jsx) catches any chunk-load failure → branded
  recovery. Each page now emits its own chunk; the ~365 KB xlsx chunk is deferred
  to the ADP-import route (its only importer); main app chunk ~399 KB → ~313 KB.
  IntakePortal stays eager (named export + intake landing route). 100/100 tests.
- **Not deferred (documented):** recharts is imported by `src/ui.jsx` (core, used
  app-wide) and jspdf by core (App letters + DataContext forms), so they remain in
  their own eager chunks via manualChunks rather than route-deferred — fully
  deferring them would require refactoring core UI/chart usage (out of scope).

### Final state
- Tests: 82 → **100** (all green); `npm run build` clean, ~20 chunks, no
  chunk-size warning. Engine math (`src/lib/compliance/*`, `src/lawdata.js`,
  `src/lib/adp/diff.js`) verified **zero changes** via `git diff origin/main`.
  Demo mode unchanged (offline, zero config); brand tokens untouched.
- package.json 2.1.0 → 2.2.0; CHANGELOG `## 2.2.0` added; HANDOFF §6 + deploy
  notes (`ALLOWED_ORIGIN`, cdn.sheetjs.com) updated.
- **xlsx decision:** took the mission's *preferred* path — replaced the npm
  package with the maintained SheetJS CDN build (`xlsx@0.20.3`), eliminating both
  advisories outright (vs. only mitigating in code). Deploy dependency: build host
  must reach cdn.sheetjs.com.

### Residual audit risk (documented, not force-fixed)
- `jspdf` (CRITICAL) — fix is jspdf@4 (breaking, rejected by constraint). Runtime
  dep, but inputs are app-generated (notice/letter/binder data), not attacker
  controlled, so practical exposure is low. Accepted.
- `esbuild` via `vite` (HIGH) — dev-server/build-only, not in the production
  bundle; fix is vite@8 (breaking, rejected). Accepted.
- `dompurify` via `jspdf` (moderate), `vite` (moderate) — same breaking-bump
  constraint. Accepted.
