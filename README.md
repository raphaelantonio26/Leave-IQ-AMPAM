# LeaveIQ — AMPAM Parks Mechanical · Multimech · Seal Electric

Production leave-management platform for the three AMPAM entities: case
tracking, California-specific compliance math, ADP roster import, role-based
access with database-enforced medical-note masking, compliance reports, and an
immutable audit trail.

## Two run modes

| Mode | Trigger | Backing store |
|---|---|---|
| **Demo** | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` unset | Deterministic synthetic seed (60 employees, 32 cases — zero real PII) persisted to localStorage |
| **Production** | Both env vars set | Supabase: Postgres + RLS, Auth, Storage, edge-function alerts |

The UI is identical in both modes; the env chip in the header shows which is
live. All component code talks only to `DataContext` — the backend is swapped
in one file (`src/data/api.js`).

```bash
npm install
npm run dev      # demo mode out of the box
npm test         # 100 unit tests: compliance, ADP pipeline, edge-function guards
npm run build    # production bundle
```

## Compliance rules encoded (src/lib/compliance/engine.js)

- **FMLA rolling 12-month window, measured backward** from each usage date
  (29 CFR 825.200(b)(4)). Usage is keyed to **usage dates**, not case start
  dates, so hours age out of the window correctly on long intermittent leaves.
- **Eligibility**: 12+ months tenure AND 1,250+ hours in the preceding 12
  months; both boundaries tested at exactly 12 mo / exactly 1,250 h.
- **CFRA** runs concurrently with FMLA except **baby bonding**, which is a
  separate additional block; bonding after PDL charges **CFRA alone**.
- **PDL**: 4 months = 17⅓ workweeks, computed in **hours from the employee's
  schedule**; concurrent with FMLA, **never** with CFRA; no tenure threshold.
- **Part-time proration** is inherent: entitlement = weeks × scheduled
  hours/week. Blank schedule ⇒ full-time (40) assumed.
- **Await-designation**: blank designation ⇒ `concurrent_clocks = []`,
  `total_hours = 0`. Clocks start only when HR assigns the designation.
- **Concurrent clocks** are stored on every case (`{PDL, FMLA}` etc.) — the
  audit-defense answer to "which entitlements did this leave charge?"

## ADP import (src/lib/adp/)

`Leave Roster*.xlsx`, worksheet `"1"`, file numbers preserved as text with
leading zeros (numeric cells are re-padded to 6 digits with a warning).
Pipeline: **upload → validate → preview diff → confirm → commit**. Commit is a
single transaction (`adp_import_commit` RPC in production); every change lands
in the audit log with `source = 'import'`. ADP blanks never erase known data.
The parser is the swappable edge — a future ADP API connector replaces
`parseRoster` and nothing downstream changes.

## Roles

admin (all entities, full control) · specialist (assigned caseload) · manager
(team, read-only, **no medical notes**) · employee (own leave) · legal (all
entities, read-only, export). In production these are enforced by RLS
(`0002_rls.sql`); the `cases_secure` view masks notes **inside the database**,
and `audit_events` revokes UPDATE/DELETE from every role.

## Layout

```
src/
  lib/compliance/engine.js   statutory math (pure, tested)
  lib/adp/parseRoster.js     xlsx → normalized rows
  lib/adp/diff.js            rows → preview diff
  data/DataContext.jsx       single data provider (demo ⇄ supabase)
  data/api.js                the only file that touches Supabase
  data/demoSeed.js           deterministic synthetic seed
  pages/                     ImportADP · Reports · AuditLog
  pdf/letters.js             4 letter types · EN/ES · entity letterhead
  App.jsx                    shell + Dashboard/Employees/Cases/Analytics/LawMap/Documents
  ui.jsx · rbac.js · i18n.js · lawdata.js
supabase/
  migrations/0001–0007       schema · RLS · triggers/RPC · seed · v1.2/v1.3/v2.0
  functions/cert-alerts/     email alerts (7d/3d/overdue cert, RTW 14d)
  functions/ai-proxy/        server-side Anthropic proxy (HR-JWT gated)
tests/                       100 tests (node --test)
```

## v1.2 additions

**Tier 1 — operational gaps.** Employee intake portal (`?intake=<token>` magic
link tied to file number — last-name verified, creates a Pending case with
clocks idle, `source='intake'`; copy per-employee links from the Employees
panel). Payroll coordination flags (SDI offset on PDL, PFL on bonding/family
care, intermittent timekeeping — one flag per case with a coordinate-by date,
acknowledge-to-clear, alert when unacknowledged). Manager self-service
dashboard (team open cases, upcoming RTWs, paperwork status — no medical
notes, no hours, no reason detail).

**Tier 2 — compliance engine.** ADA interactive-process tracker (five audited
milestones on exposure-flagged cases; exposure = medical leave ≥75% used or
projected to exhaust). Recertification chain on `certifications` (30-day
intermittent / 6-month continuous intervals per 29 CFR 825.308, request →
receive → next interval anchors on the latest received cert). Fitness-for-duty
checklist (required/waived → requested → received → cleared; blocks flagged
when RTW ≤14 days without clearance).

**Tier 3 — platform intelligence.** Cross-case Risk Signals page (admin +
legal): multiple intermittent cases in 12 months, leave within 30 days of a
corrective action, active leave + recent PIP — each with severity and
rationale, flag-don't-act framing, counsel export. Exhaustion projection
pushed proactively to the dashboard and notifications ("N employees projected
to exhaust FMLA within 60 days — ADA review recommended"). HRIS live-sync
seam documented at `src/lib/adp/connector.js` + `docs/HRIS_CONNECTOR.md`.

## v1.3 additions

**Documents.** Per-case document repository: employee uploads from the portal,
HR uploads from the case panel, four review states (pending review / complete /
incomplete / additional info required) with reviewer notes that flow back to
the employee, version chains on replacement, and a pluggable storage adapter
(`src/lib/storage`) — demo localStorage today, Supabase `case-documents`
bucket in production, S3/Azure later without touching callers.

**Template library & packets.** Admin-managed templates by category (FMLA /
CFRA / ADA / PDL / WC / state / policy / internal) with `{{merge_fields}}`,
live preview, full version history with restore — zero developer involvement.
Packet definitions are pure configuration (ordered template lists); generation
renders the current versions against the case into one branded PDF and audits.
Twelve starter templates and three packets (FMLA+CFRA, PDL, ADA) ship seeded.

**Employee portal.** The employee role now lands in a focused portal — Home
(status, dates, designations, lifecycle), Balances (per-clock remaining with
plain-English explainers, PDL/CFRA sequencing called out), Eligibility
(friendly walk-through of tenure/hours requirements), Documents (certification
center with outstanding-items list and replace flows), Support (secure
messaging with the assigned case manager; HR answers from the case panel).

**Designation lifecycle.** Cases carry designation SETS (FMLA + CFRA, FMLA +
CFRA + WC, PDL + CFRA, ADA + WC…) — WC/ADA are tracking designations with no
hour bank; PDL+CFRA selection defers CFRA as the sequential block. Audited
transitions (FMLA→ADA, WC→FMLA+CFRA, PDL→CFRA bonding, custom) capture the
hour-bank state at the moment of change in an immutable timeline.

**Import & search.** ADP import shows workforce counts by status (Active /
LOA / Seasonal / Terminated / Retired / Inactive) with checkbox control over
which statuses may open cases; employee records import regardless so the
directory stays truthful. Case creation and directories search by file number
(primary), name, employee ID, and ADP associate number, excluding non-active
employees by default.

**Knowledge Center.** Replaces the law map: eight programs (FMLA, CFRA, PDL,
PFL, SDI, ADA/FEHA, WC, CA PSL) with summaries, durations, job-protection and
certification rules, employer obligations, and authoritative source links
(DOL, CRD, EEOC, EDD, DIR) opening in new tabs.

**Legal export.** One-click defense binder per case (admin + legal): lettered
exhibits A–F — summary & designation timeline, compliance calculations with
methodology, document inventory with review states, communications log,
generated notices, chronological audit trail — as a single PDF or a ZIP that
adds stored files and the audit CSV. Suitable for DOL/CRD/EEOC/litigation.

## v2.1 — the AMPAM brand system

The interface and every generated document now follow the official AMPAM
Brand Guidelines: Pantone 301 C navy (#004B87) primary, Pantone Red 032 C
(#EF3340) accent, Arial, light surfaces, and the complete official logo
(symbol + wordmark + trade strip — never recolored, never the symbol alone)
on the sidebar, both portals, and the letterhead of every PDF the system
produces — notices, letters, packets, reports, and the defense binder. The
tagline "Building on a Foundation of Trust" anchors the sidebar and every
document footer. Brand-invariant tests lock the palette, the typography,
and the logo asset so a future change can't silently drift off-brand. The
employee directory adds workforce-status filter chips with live counts and
a status column; a production error boundary turns any render fault into a
branded recovery screen instead of a blank page.

## v2.0 — replacing the vendor

**AI drafting layer (HR in the driver's seat).** "AI Draft" on case messages,
custom notices, and document-review feedback: the model receives the scoped
case context plus a hard compliance constraint (no FEHA/CFRA/FMLA-waiving
language, no medical references beyond the case record), HR edits inline, a
human sends — always. "Today's Actions" morning briefing on the admin
dashboard prioritizes certs due, payroll flags, ADA milestones, RTW
clearances, and new intakes, with one-click deep links into each case. Intake
triage runs rules-based the moment a submission arrives (likely designation,
ADA-language flag, corrective-action timing) with on-demand AI enrichment;
every confirm/dismiss is audited. All AI paths degrade to deterministic
offline drafts — demo mode never needs a network.

**Eleven federal/CA notices with an e-sign workflow.** WH-380-E/F, WH-381,
WH-382, WH-384, CFRA designation (distinct from WH-382), PDL notice, CFRA
bonding (post-PDL), ADA interactive-process initiation, RTW clearance request
and confirmation — pre-populated, entity-letterheaded with masked-EIN
headers, auto-attached to the repository, and walked through
`generated → pending_hr_signature → signed → delivered` with the signer and
provider evidence audited at each step. Provider seam stubbed at
`src/lib/esign/index.js` (docs/ESIGN_CONNECTOR.md).

**Variable schedule engine.** Employees carry a `scheduleHistory` (5×8, 4×10,
3×12, variable, per diem). Entitlements integrate the schedule over the
actual statutory window — PDL's 17⅓ weeks sums scheduled hours from the leave
start across schedule changes; adding a schedule period recomputes open clock
banks retroactively with an audit row per case; intermittent usage validates
against the schedule in effect on the usage date. Per-diem employees test
eligibility on ACTUAL hours and draw entitlement from the trailing-12-month
average, with an explanatory badge on their cases.

**Multi-entity routing.** Admin-editable entity configuration (legal name,
masked EIN, HR contact, address, policy date, recipients) flows into every
notice and defense-binder exhibit header. ADP imports detect cross-entity
transfers, flag open cases for the integrated-employer determination, and
audit HR's confirmation. All reports honor combined vs single-entity scope.

**Jurisdiction architecture.** Every statutory rule now lives in
`src/lawdata.js` under a jurisdiction key (programs, thresholds, notice
forms, payroll coordination, concurrency rules); the engine's `clocksFor`,
`entitlementHours`, eligibility, and payroll flags dispatch on it; every case
carries `jurisdiction` (CA backfilled). Adding a state is one registry entry
— proven by a TEST jurisdiction in the suite. The Knowledge Center derives
entirely from the registry.

**Workload & capacity dashboard.** Cases per specialist (open / pending /
overdue), average case age by designation, intake→designation cycle time
against a ≤3-business-day target, certification-chain health, and an 8-week
RTW pipeline with FFD status — read-only, and it feeds the morning briefing.

**Nine risk signals.** The original three plus: Mon/Fri usage patterns,
CFRA bonding not initiated after PDL, ADA exposure without an interactive
process at 90 days, recert overdue on active leave, RTW passed without
clearance, and cross-entity leave stacking — each with severity, rationale,
a recommended next action, and a counsel-export flag. Flag, don't act.

> Eligibility and entitlement outputs are informational. Verify
> determinations with HR leadership/counsel before relying on them.
