# Changelog

## 2.1.0 — AMPAM brand system, branded document letterhead, workforce status filters, stability hardening

### Brand system (per the official AMPAM Brand Guidelines)
- Root cause: the UI shipped on a generic dark indigo demo theme with display
  fonts the brand doesn't own. The entire design-token layer (`src/ui.jsx`)
  is rebuilt on the brand palette — Pantone 301 C navy (#004B87) as the
  primary, Pantone Red 032 C (#EF3340) as the accent/alert color, Arial
  throughout, light surfaces — and a global sweep replaced every hardcoded
  dark-theme literal across 13 source files (zero `rgba(255,255,255,…)`
  overlays remain outside the intentional avatar ring). Badges, charts,
  toasts, tables, tabs, and buttons all draw from the brand tokens; page
  headers carry the guide's red accent rule.
- The official full logo (symbol + wordmark + trade strip — never the symbol
  alone, never recolored, per the guide) was extracted from the Brand
  Guidelines PDF as an 18 KB transparent PNG asset
  (`src/assets/ampamLogo.js`) and placed on every surface: admin sidebar,
  employee intake portal, employee self-service portal, and the error
  recovery screen. The tagline "Building on a Foundation of Trust" appears
  in the sidebar foot and every PDF footer.

### Branded document letterhead — every template doc carries the logo
- New shared `src/pdf/letterhead.js`: official logo top-left, entity legal
  name + masked EIN + address + HR contact right-aligned in navy, the
  red-into-navy brand rule, and a tagline footer. Applied to ALL generated
  paper: the eleven federal/CA notice forms and continuation pages, the
  AI-drafted custom notice, the four legacy letters, packet covers and
  section pages, the Reports CSV/PDF exports, and the defense binder — whose
  cover moved from a dark page to a white branded cover ("CONFIDENTIAL —
  PREPARED FOR LEGAL REVIEW" in brand red) because the brand prohibits
  placing the logo on dark fields. Verified by rendering a live WH-381
  through the real pipeline and inspecting the output.

### Employee directory — workforce status
- Status filter chips with live counts (All / Active / Leave of Absence /
  Seasonal / Terminated / Retired / Inactive; zero-count states dimmed), a
  sortable Status column with brand-colored badges, and Status in the
  detail panel. Filtering composes with the existing search and department
  filters.

### Stability hardening
- Production `ErrorBoundary` around the app: a render fault now degrades to
  a branded recovery card (Reload / Reset demo data / Copy error) instead
  of a blank page, with an explicit note that stored records and the audit
  trail are unaffected by display faults.
- Three brand-invariant tests lock the logo asset (PNG integrity + full-logo
  aspect ratio), the token palette (navy/red/Arial/light surfaces, legacy
  fonts gone), and badge coverage for every workforce status. Suite: 82.


## 2.0.0 — AI drafting, federal forms + e-sign, variable schedules, multi-entity, jurisdiction architecture

### 1 · AI drafting assistant (HR in the driver's seat)
- Root cause: the vendor's differentiator was humans drafting every
  communication; the in-house gap was the blank page, not judgment. "AI
  Draft" now sits on case messages, custom notices, and review feedback —
  the model gets a tightly scoped case context (entity, applicable law for
  the designation set, dates, balances) plus a hard constraint: no language
  waiving FEHA/CFRA/FMLA rights, no medical references beyond the case
  record, no promised outcomes. Drafts land in inline editable panels beside
  the case context; nothing sends without a human click. Every AI path
  degrades to a deterministic offline draft, labeled as such — demo mode
  needs no network.
- "Today's Actions" morning briefing (admin dashboard): a structured digest
  (certs ≤7d, unacked payroll flags, ADA milestones pending, RTW ≤14d
  without FFD, new intakes) goes to the model for prioritization; output is
  one action line per case with a deep link. Rules-based ordering when
  offline. Replaces "did I miss anything."
- Intake triage: rules run the moment a submission arrives (likely
  designation from the reason, ADA-language detection, corrective-action
  timing correlation against system data); AI re-analysis on demand.
  Suggestions render as a non-binding card on the Pending case; confirm and
  dismiss are one click each and BOTH are audited.

### 2 · Federal & CA notice generation + e-signature workflow
- Eleven documents (WH-380-E, WH-380-F, WH-381, WH-382, WH-384, CFRA
  designation distinct from WH-382, PDL notice, CFRA bonding for the
  PDL-sequential path, ADA interactive-process initiation, RTW clearance
  request, RTW confirmation), pre-populated from case data with the
  eligibility verdict computed live, branded with the employing entity's
  letterhead and masked-EIN header, stored through the storage adapter, and
  auto-attached to the case repository.
- E-sign ladder `generated → pending_hr_signature → signed → delivered`,
  one audit row per transition, signer identity + provider evidence captured
  at `signed`. Demo provider = audited in-app attestation; DocuSign slot
  stubbed behind `sign(documentId, signerUserId)` / `deliver(documentId)` in
  `src/lib/esign/index.js`, documented in docs/ESIGN_CONNECTOR.md exactly
  parallel to the HRIS seam.

### 3 · Variable schedule engine
- Root cause: a single static hours/week figure is wrong for field trades.
  Employees now carry `scheduleHistory` (standard_40, 4×10, 3×12, variable,
  per_diem). Entitlements integrate the history over the statutory window:
  PDL = the sum of scheduled hours across the actual 17⅓-week span from
  leave start (mid-leave changes included); FMLA/CFRA likewise over 12
  weeks. Adding a schedule period retroactively recomputes every open clock
  bank with a per-case audit row stating old → new.
- Intermittent usage now validates against the schedule in effect ON the
  usage date (a 10-hour day passes on a 4×10, fails on a 5×8 — tested).
- Per diem: zero scheduled hours; the 1,250-hour eligibility test uses
  ACTUAL imported hours, entitlement uses the trailing-12-month weekly
  average, and the case wears a "Per Diem" badge whose tooltip states the
  method.

### 4 · Multi-entity case routing
- Entity configuration panel (admin): legal name, masked EIN (display only —
  the full EIN never enters the system), HR contact, mailing address, policy
  date, notification recipients; consumed by every generated notice and
  every defense-binder exhibit header.
- Cross-entity transfers detected on ADP import diff: open cases get a
  review banner; HR's one-click confirmation records the
  integrated-employer determination ("prior leave counts toward the new
  entity's rolling window") in the immutable audit trail.
- All reports support combined vs single-entity scope (existing entity
  filter honored by the new Workload view as well).

### 5 · Jurisdiction architecture
- All statutory rule data moved into `src/lawdata.js` under jurisdiction
  keys: programs (weeks, eligibility thresholds, knowledge text), employer
  thresholds, notice-form mapping, payroll-coordination switches, and
  concurrency rules (state family clock, pregnancy clock, bonding-after-PDL
  behavior). `clocksFor`, `entitlementHours`, eligibility, and
  `payrollFlagsFor` dispatch on a jurisdiction argument; every case carries
  `jurisdiction` (backfilled 'CA'). The Knowledge Center derives from the
  registry — zero duplicated legal text. A TEST jurisdiction in the suite
  proves the same case yields different clocks/thresholds under a different
  registry entry, with no engine edits.

### 6 · Workload & capacity dashboard
- Read-only admin view: cases per specialist (open / pending action /
  overdue action), average case age by designation, intake→designation
  cycle time vs the ≤3-business-day target with offenders listed, cert-chain
  health percentages, and an 8-week RTW pipeline bar chart with FFD
  blocking. The same metrics module feeds the briefing digest.

### 7 · Risk signals — three to nine
- New: Mon/Fri pattern (>60% of ≥5 intermittent dates), PDL closed ≥30 days
  with no CFRA bonding case, medical leave ≥90 days with no interactive
  process, recert overdue on active leave, RTW passed without FFD clearance,
  cross-entity leave stacking under the integrated-employer doctrine. Every
  signal: severity, rationale, recommended next action, counsel-export flag
  (high-stakes kinds), surfaced on the page and in the CSV. Flag-don't-act
  framing unchanged. All pure, all tested.

### Plumbing
- Migration `0007_v20.sql`: schedule_history/jurisdiction on employees;
  jurisdiction (not-null, backfilled)/designated_at/triage/transfer_review
  on cases; entity configuration columns + read-all/admin-write RLS + seeded
  Carson rows with placeholder EINs; e-sign columns on case_documents
  (status check, signed_by FK → hr_users, signed_at); cases_secure refreshed
  (triage masked from managers).
- 17 new tests (79 total): 4/10 + variable PDL entitlements, mid-leave
  schedule-change recompute, per-diem eligibility/entitlement fallbacks,
  usage-date schedule validation, all six new signal kinds (positive and
  negative cases), CA-vs-TEST jurisdiction dispatch across clocks /
  entitlement / eligibility, WH-381 merge correctness, CFRA-vs-WH-382
  distinctness, full 11-form render smoke, e-sign payload shape + ladder,
  business-day cycle math.
- Demo seed SV=4: 25 employees with non-standard schedule histories (4 with
  mid-stream changes), entity configuration rows, crafted Mon/Fri-pattern,
  ADA-gap, cross-entity-stack and triaged-intake cases, five documents
  across all four e-sign states; stale SV=3 localStorage resets cleanly.
- New modules: `lib/compliance/schedule.js`, `lib/compliance/workload.js`,
  `lib/ai/index.js`, `lib/esign/index.js`, `pdf/forms.js`,
  `pages/Workload.jsx`, `pages/Entities.jsx`.


## 1.3.0 — Document management, designation lifecycle, employee portal, legal export

### P1 · Certification & medical documentation management
- Root cause: certifications were a boolean + a date — the actual paper lived
  in inboxes. Now every case has a document repository: employees upload from
  the portal (with submission confirmation), HR uploads from the case panel,
  and reviewers set one of four states — pending review, complete, incomplete,
  additional info required — with notes that surface back to the employee.
  Replacements chain as versions (`replaces_id`), every upload/review writes
  to the append-only audit log, and the "Waiting on you" panel in the portal
  derives outstanding items from the cert chain + recert schedule + doc states.
- Storage is an adapter (`src/lib/storage`): demo keeps base64 in
  localStorage under a hard budget (oversize files keep metadata with a
  note); production targets the private `case-documents` bucket with
  per-case-folder RLS; future S3/Azure providers implement the same three
  methods.

### P2 · Administrative document library
- Templates by category with `{{merge_fields}}`, insert-buttons, live white
  preview, and full version history (restore-as-new-version). Archive/restore
  without deletion. Saves audit with the new version number. Unknown merge
  fields render as ⟦field⟧ so a half-merged letter is impossible to miss.
  Twelve starter templates seeded across FMLA/CFRA/PDL/ADA/WC/policy/internal.

### P3 · Dynamic packet builder
- Packet definitions are configuration only: name, suggested designations,
  ordered template list. Admin composes them in the library; generation (case
  panel or Documents page) renders the *current* template versions against
  the case's merge context into one branded PDF — cover, contents, numbered
  sections, footers — attaches it to the case, and audits. Archived templates
  are skipped, order preserved (tested).

### P4 · Employee portal redesign
- The employee role no longer sees the administrative shell at all — nav
  collapses to a single focused portal: Home (status phrased plainly, dates,
  ref, designation set, lifecycle history), Balances (per-clock remaining
  with progress bars; deferred CFRA after PDL explicitly explained), 
  Eligibility (tenure/hours walk-through against the 12-month/1,250-hour
  tests, PDL's no-waiting-period called out), Documents (certification center
  above), Support (secure thread with the assigned case manager; unread
  badges both sides; HR replies from the case panel's Messages tab). Message
  bodies stay case-scoped — the audit trail records send events without content.

### P5 · Advanced designation lifecycle
- Cases now carry designation SETS with three classes: statutory clocks
  (FMLA/CFRA/PDL), tracking designations (WC, ADA — job-protection or
  accommodation status, no hour bank), and Personal. `clocksForSet` unions
  clocks while enforcing the rules that don't union: PDL and CFRA never run
  concurrently — selecting both defers CFRA as the sequential block.
- Audited transitions: presets (FMLA→ADA, FMLA+CFRA→ADA, PDL→CFRA bonding,
  WC→FMLA+CFRA, WC→ADA) plus custom multi-select, with effective date and
  reason. The builder is pure (`buildTransition`): it recomputes
  clocks/entitlement for the new set, infers `pdlPreceded` from the prior set
  (bonding after PDL charges CFRA alone — tested), keeps an exhausted bank
  visible when moving to tracking-only designations, resets usage only when a
  genuinely new clock starts, and appends an immutable history entry capturing
  used/total/exhausted at the moment of transition. Timeline renders in the
  case summary and the employee portal; the defense binder prints it.

### P6 · ADP import enhancements
- Roster statuses normalize to Active / Leave of Absence / Seasonal /
  Terminated / Retired / Inactive with per-status counts at preview. Checkbox
  filter controls which statuses may CREATE cases (default: Active, LOA,
  Seasonal); employee records import for all rows so the directory stays
  truthful. Excluded-row count shown; commit consumes the filtered diff.

### P7 · Case creation enhancements
- Multi-designation selection with live engine preview: concurrent clocks,
  sequential (reserved) blocks, tracking designations, and the governing
  entitlement at the employee's schedule. Employee picker is now search-first:
  file number is the primary key (prefix matches sort first), then name,
  employee ID, ADP associate number. Non-active employees excluded from new
  leave workflows unless explicitly included.

### P8 · Compliance Knowledge Center
- The static law map is gone. Eight programs (FMLA, CFRA, PDL, PFL, SDI,
  ADA/FEHA, WC, CA Paid Sick Leave) each carry: plain-English summary, who's
  covered, eligibility list, duration, job protection, certification rules,
  employer obligations, and authoritative source links (dol.gov, ecfr.gov,
  calcivilrights.ca.gov, eeoc.gov, edd.ca.gov, dir.ca.gov, leginfo) opening in
  new tabs. Searchable, jurisdiction-filtered, content-as-data for updates
  without code changes.

### P9 · Legal-ready case export
- Defense binder per case (admin + legal only): lettered exhibits — A summary
  & designation timeline, B compliance calculations with the rolling-window /
  PDL / CFRA methodology stated, C document inventory with review states and
  notes, D communications log, E generated notices/packets, F chronological
  append-only audit trail — as one PDF, or a ZIP adding stored document files
  and the audit CSV. The export action itself writes to the audit log.

### Plumbing
- New: `designations.js`, `templates.js`, `packets.js`, `storage/index.js`,
  `defensePacket.js`, `KnowledgeCenter.jsx`, `DocumentLibrary.jsx`,
  `EmployeePortal.jsx`; jszip dependency.
- 13 new unit tests (62 total): set-based clocks (incl. PDL+CFRA deferral and
  tracking-only entitlement), transition semantics (exhausted-bank
  preservation, fresh-bank reset, pdlPreceded inference, history chaining,
  validation), template rendering/versioning, packet assembly order.
- Migration `0006_v13.sql`: case_documents (+storage policies), doc_templates,
  packet_defs, case_messages (all RLS), designation-set columns + backfill,
  employees.adp_associate_id, refreshed cases_secure.
- Demo schema SV=3 (stale v1.2 localStorage resets); seed adds 12 templates,
  3 packets, 24 documents, 8 messages, status variety, ADP associate ids.


## 1.2.0 — Tiered feature release

### Tier 1 · operational gaps
- **Employee intake portal.** Root cause of intake friction: every request
  began as an HR phone call, so dates arrived wrong and incomplete. Fix: a
  standalone portal (`?intake=<token>`) — magic link tied to file number,
  last-name verification, no account needed. Submission creates a Pending
  case with a blank designation and idle clocks; HR reviews and designates.
  Production path is an anon-callable `submit_intake` RPC (security definer:
  validates token expiry/match + last name server-side, inserts, returns only
  the reference — nothing is readable through it). Demo path validates
  locally. Duplicate guard reuses `(file_number, start_date)`.
- **Payroll coordination flags.** One jsonb flag per case, computed at
  designation time (SDI offset on CA PDL, PFL on bonding/family care,
  intermittent timekeeping coding), each with a coordinate-by date.
  Acknowledge-to-clear with actor + date in the audit trail; unacknowledged
  flags surface in notifications, the dashboard, the case list, and the edge
  function (`payroll_due`). No pay is calculated — by design.
- **Manager self-service dashboard.** Managers now land on a team view: who's
  out, expected-back dates, paperwork status phrased as "with HR." Root cause
  of the status-email volume: managers had row access but no answer-shaped
  surface. Deliberately omits notes, hours, and reasons; includes a
  confidentiality reminder card.

### Tier 2 · compliance engine
- **ADA interactive-process tracker.** Five milestones (requested → initiated
  → offered → decision → resolved) stored per case, each write timestamped
  into the append-only audit log with optional detail text. Exposure heuristic
  auto-surfaces the tab on medical cases ≥75% used or projected to exhaust;
  tracker can also be opened manually. Production milestones go through the
  `record_ada_step` RPC; the `ada` jsonb is masked from managers/employees in
  `cases_secure`.
- **Recertification chain.** Certification tracking was binary
  (received/not). Now the `certifications` table is a chain: initial →
  recert → recert, with `nextRecertDue` computing the interval from the most
  recent *received* cert — 30 days for intermittent (29 CFR 825.308(c)),
  6 months continuous (825.308(b)); suppressed when the leave ends first,
  when no medical basis exists, or while an open recert request owns the
  date. Request/receive both audit; `recert_due` added to the edge function.
- **Fitness-for-duty checklist.** Required/waived decision, then requested →
  received → cleared, on the case's RTW tab; every step audits. A return
  inside 14 days without clearance is flagged in the panel, the notification
  bell, and the RTW email.

### Tier 3 · platform intelligence
- **Cross-case Risk Signals.** New page (admin + legal only, RLS-gated
  `corrective_actions` table): ≥2 intermittent cases in 12 months, leave
  opened ≤30 days after a corrective action, active leave concurrent with a
  recent PIP. Every signal carries its rationale; the page leads with
  flag-don't-act framing and notes that corrective timelines generally pause
  during protected leave. CSV export for counsel includes the rationale text.
- **Proactive exhaustion alerts.** The projection that lived only in Reports
  now pushes to the dashboard banner and the notification bell: "N employees
  projected to exhaust FMLA within 60 days — ADA review recommended,"
  click-through to the projection report. Intermittent cases project from the
  trailing 4-week burn; continuous from the scheduled end at ≥50% used.
- **HRIS live-sync seam.** Import refactored behind `RosterSource.fetch()`
  (`src/lib/adp/connector.js`): `FileRosterSource` wraps today's upload;
  `AdpApiRosterSource` is a documented stub carrying the ADP Workers v2 field
  mapping and credential rules (server-side only). Contract + invariants in
  `docs/HRIS_CONNECTOR.md`. diff/preview/commit/audit are untouched by design.

### Plumbing
- 20 new unit tests (49 total) covering payroll flags, recert intervals and
  chain anchoring, FFD blocking, ADA exposure, all three cross-case signal
  kinds, and exhaustion-alert inclusion/exclusion.
- Migration `0005_v12.sql`: case jsonb columns (payroll_flag/ffd/ada),
  `corrective_actions` + RLS, `intake_tokens` + `submit_intake`,
  `record_ada_step`, refreshed `cases_secure` masking.
- Demo localStorage schema bumped (SV=2): stale v1.0 demo data resets to seed.


## 1.0.0 — Production platform (from the LeaveIQ demo)

### Architecture
- **Single data provider with a backend switch.** The demo wrote state from a
  dozen components into localStorage; production needs one mutation path so
  every change can be audited. Root cause of demo drift: components owned
  their own writes. Fix: all reads/writes flow through `DataContext` actions;
  Supabase when configured, deterministic seed otherwise. No component touches
  storage or the network directly.
- **Statutory math extracted to a pure module** (`lib/compliance/engine.js`).
  The demo computed a flat 480-hour entitlement inline at case creation —
  wrong for part-time schedules, PDL, and military caregiver. Fix: one tested
  engine shared by UI, import, and reports; 20 unit tests pin the boundaries.

### Compliance corrections vs. the demo
- **Rolling window keyed to usage dates, not case start dates.** Start-date
  keying creates the day-366 cliff (entire entitlement "returns" at once).
  Usage-date keying lets hours age out individually — required for long
  intermittent leaves. Boundary pinned by test: usage exactly at window start
  is excluded; usage on the as-of date is included.
- **CFRA bonding modeled as a separate additional block.** `clocksFor` returns
  `[CFRA]` for bonding when PDL preceded it, `[FMLA, CFRA]` otherwise, and
  pregnancy disability never charges CFRA. The PDL→bonding stack test verifies
  FMLA exhausts concurrently with PDL while CFRA remains fully intact (480 h).
- **PDL in hours from the schedule**: 17⅓ workweeks × hrs/week (693.33 at 40,
  346.67 at 20), not a fixed-week figure.
- **Part-time proration inherent** in `entitlementHours`; blank schedule ⇒
  full-time assumed (explicit, tested).
- **Await-designation honored end-to-end**: blank designation imports as
  blank, `concurrent_clocks=[]`, `total_hours=0`; the case panel shows an
  "Assign" banner, and assignment recomputes clocks + entitlement with an
  audited old→new diff.

### ADP import
- Worksheet `"1"`, header-alias mapping for the 32-column export, file numbers
  as text. Root cause of past leading-zero loss: numeric coercion in the
  spreadsheet layer; the parser re-pads numeric file numbers to 6 digits and
  warns. Excel serial dates converted manually (epoch 25569) — `XLSX.SSF` is
  absent from the ESM build, and manual conversion also bundles cleaner.
- Diff stage guards: ADP blanks never erase known data; unrecognized
  designations import blank with a warning; duplicate cases blocked by
  `(file_number, start_date)` both client-side and as a DB unique constraint.
- Commit is transactional (`adp_import_commit` RPC) and writes `source='import'`
  audit rows.

### Security (database-enforced, not UI-trusted)
- RLS policies per persona; managers/employees scoped by helper
  `employee_in_scope()`.
- **Medical notes masked in the query layer**: the frontend selects from
  `cases_secure`, which nulls `notes` for managers and unrelated employees
  before data leaves Postgres.
- **Audit log append-only at the database**: UPDATE/DELETE revoked from every
  role including `service_role`, plus a reject trigger. The UI banner states a
  guarantee the database actually makes.

### Features added
- ADP Import page (upload → validate → preview → confirm → commit).
- Compliance Reports: open cases (with concurrent-clocks column),
  certification status, FMLA rolling 12-month usage, intermittent detail with
  attribution, exhaustion projection (trailing 4-week burn) — CSV + PDF.
- Audit Log page with actor/action/source/date filters and legal-hold export
  including old/new value jsonb.
- Case panel: per-clock remaining balances, intermittent log entry,
  certification mark-received, designation assignment.
- Documents: four letter types (notice, eligibility, designation,
  return-to-work) EN+ES with entity legal-name letterhead; generated letters
  attach to the case and log to the audit trail.
- Entity switcher (admin/legal), entity columns/charts, RTW-approaching alert,
  cert-alerts edge function with idempotent send ledger.

### Known scope notes
- Demo mode approximates per-clock "used" from continuous-case hours when no
  intermittent rows exist; production aggregates from `intermittent_log`.
- Hours-worked eligibility uses `hours_worked_12mo` when present and falls
  back to YTD flagged "(approx.)" — exact parity arrives when payroll supplies
  the trailing-12 figure in the roster.
