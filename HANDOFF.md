# LeaveIQ — Deployment Runbook

Ordered steps from zero to production. Demo mode needs none of this — it runs
from `npm run dev` immediately.

## 1 · Supabase project

1. Create a project at supabase.com (region: US West for CA latency).
2. SQL Editor → run the four migrations **in order**:
   `0001_schema.sql` → `0002_rls.sql` → `0003_triggers.sql` → `0004_seed.sql` → `0005_v12.sql` → `0006_v13.sql` → `0007_v20.sql`.
3. `0004` also creates the private `case-documents` storage bucket; confirm it
   appears under Storage.

## 2 · HR accounts

1. Edit the emails in `0004_seed.sql` (or update the `hr_users` rows) to the
   real HR team addresses before running it.
2. Authentication → Users → invite each HR user (email invite).
3. After each first sign-in, link the auth account:
   ```sql
   update hr_users
      set auth_user_id = (select id from auth.users where email = hr_users.email)
    where auth_user_id is null;
   ```
   Anyone without a linked, active `hr_users` row gets **no data** — RLS
   default-denies.

## 3 · Frontend (Vercel or any static host)

1. Push the repo to GitHub; import into Vercel (framework preset: Vite).
2. Environment variables (Project → Settings → API for the values):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy. The header chip flips from DEMO to PRODUCTION when both vars are
   present. The anon key is safe to expose — every privilege lives in RLS.

## 4 · Email alerts

1. Create a Resend account, verify the sending domain, copy the API key.
2. ```bash
   supabase functions deploy cert-alerts
   supabase secrets set RESEND_API_KEY=re_xxx ALERT_FROM_EMAIL="LeaveIQ <leaveiq@yourdomain.com>"
   ```
3. Schedule weekday mornings (06:00 Pacific): Dashboard → Edge Functions →
   cert-alerts → Cron → `0 14 * * 1-5` (UTC).
4. Without `RESEND_API_KEY` the function dry-runs (logs instead of sending) —
   safe to test immediately. Re-runs never double-send: each
   (case, recipient, kind) is recorded once in `notifications`.
5. Per-user opt-outs live in `hr_users.notification_prefs`
   (`cert_7d`, `cert_3d`, `cert_overdue`, `rtw_14d`, `email`).

## 5 · First ADP import

1. Pull the usual export: `Leave Roster*.xlsx` from
   `G:\Human Resources\…` (worksheet `1`, file numbers as text).
2. LeaveIQ → ADP Import → drop the file → review the preview (new employees /
   updated records / cases to create) → **Confirm & commit**.
3. Imported leave rows arrive as **Pending**; blank designations stay blank
   and statutory clocks stay idle until assigned in the case panel
   ("Awaiting designation" banner → Assign).
4. Re-importing the same roster is safe: the duplicate-case guard is
   `unique (file_number, start_date)` at the database.

## 5b · Employee intake links (v1.2)

1. Generate a magic link for an employee (HR Admin/Specialist):
   ```sql
   insert into intake_tokens (file_number, created_by)
   values ('001482', (select id from hr_users where email = 'you@yourdomain.com'))
   returning token;
   ```
2. Share `https://<app-url>/?intake=<token>` with the employee (text/email).
   Links are single-submission and expire after 30 days.
3. The submission lands as a **Pending** case, designation blank, clocks idle,
   `source='intake'` in the audit log. In demo mode the Employees panel's
   "Copy leave-request link" button produces an equivalent demo link.

## 5c · v1.3 notes

- **Seed templates/packets**: demo seeds live in `src/data/demoSeed.js`; for
  production, create templates through the Document Library UI (admin) or
  insert into `doc_templates` / `packet_defs` — ids are client-assigned, keep
  them stable.
- **Employee portal auth**: the employee role maps to `hr_users.role =
  'employee'` with `employee_id` set; RLS confines them to their own cases,
  documents, and messages. The masked view denies HR notes to managers and
  exposes them to the employee on their own case only.
- **Storage**: documents go to the `case-documents` bucket under
  `case_{id}/…`; the 0006 storage policy lets employees read/write only their
  own case folders. Swapping to S3/Azure later = new adapter in
  `src/lib/storage/index.js`, nothing else changes.

## 5d · v2.0 notes

- **AI drafting** calls the Anthropic Messages API from the client; in
  environments without access the UI falls back to labeled offline drafts —
  no configuration required for demo mode.
- **E-sign** ships with the internal-attestation provider (the audited HR
  click). Wiring DocuSign = implementing two methods behind
  `src/lib/esign/index.js` per docs/ESIGN_CONNECTOR.md.
- **Jurisdictions**: new states register in `src/lawdata.js` only
  (programs/thresholds/forms/payroll/concurrency); nothing else changes.
- **Entity EINs**: store the MASKED display string only; the full EIN never
  enters this system.

## 6 · Verification checklist

- [ ] Sign in as a **manager** → open any case → notes show the lock panel
      (masking happens in `cases_secure`, not the UI — verify via the API too).
- [ ] Try `update audit_events set action='x' where id=1;` as any role →
      rejected (`audit_events is append-only`).
- [ ] Assign a designation to an awaiting-designation case → clocks +
      entitlement populate, audit row records old/new values.
- [ ] Log intermittent hours → case `used_hours` updates via trigger.
- [ ] Reports → FMLA rolling usage shows remaining hours sorted ascending.
- [ ] Submit an intake link end-to-end → case arrives Pending/unassigned.
- [ ] Assign PDL to a CA case → payroll flag appears with a coordinate-by date; acknowledge it → audit row.
- [ ] Open the ADA tab on a flagged case → record a milestone → audit row with the detail.
- [ ] Mark a recert received → next 30-day interval appears on the chain.
- [ ] Sign in as a manager → dashboard shows team view only (no notes/hours anywhere).
- [ ] Risk Signals page visible to admin/legal only; export produces rationale CSV.
- [ ] Upload a document as the employee → appears pending-review in the case panel; review with notes → status + notes visible in the portal.
- [ ] Edit a template → version bumps with history; archive → packet generation skips it.
- [ ] Generate a packet from a case → single PDF, attached to the repository, audit row written.
- [ ] Apply a designation transition (e.g. PDL → CFRA) → clocks recompute, timeline entry with at-transition state, audit row.
- [ ] Import a roster with terminated rows unchecked → counts shown, no cases created for them, employee records still updated.
- [ ] Export the defense binder PDF and ZIP → exhibits A–F populated; export logged to audit.
- [ ] Generate WH-381 from a case → letterhead shows entity legal name + masked EIN; doc lands in the repository at e-sign "generated"; route → sign → deliver writes three audit rows with the signer.
- [ ] Add a schedule period to an employee with an open case → entitlement recomputes with a "schedule change" audit row; an intermittent entry exceeding the day's scheduled hours is rejected.
- [ ] Import a roster moving an employee between entities → transfer banner on their open cases; confirming writes the integrated-employer determination.
- [ ] Run the morning briefing → action lines deep-link into cases.
- [ ] Risk Signals shows the nine kinds with recommended actions; CSV includes the counsel-export column.
- [ ] Run cert-alerts manually (`supabase functions invoke cert-alerts`) and
      confirm the `{scanned, alerts, sent}` response.

## Constraints honored

- No real employee PII anywhere in the repo — demo seed is fully synthetic.
- File numbers are TEXT end-to-end; leading zeros survive import/export.
- Rolling 12-month math is usage-date keyed (no day-366 cliff).
- The audit log is immutable at the database, not just hidden in the UI.
