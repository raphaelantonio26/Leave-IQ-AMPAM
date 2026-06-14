-- LeaveIQ v2.0 · 0007
-- Feature 3: variable schedules        Feature 5: jurisdiction architecture
-- Feature 4: entity configuration      Feature 2: e-signature workflow
-- Feature 1c/4b: triage + transfer review columns

-- ── variable schedules + jurisdiction ───────────────────────────────────────
alter table employees
  add column if not exists schedule_history jsonb not null default '[]',
  add column if not exists jurisdiction text not null default 'CA';

alter table leave_cases
  add column if not exists jurisdiction text,
  add column if not exists designated_at date,
  add column if not exists triage jsonb,
  add column if not exists transfer_review jsonb;

-- backfill, then enforce not-null
update leave_cases set jurisdiction = 'CA' where jurisdiction is null;
alter table leave_cases alter column jurisdiction set not null;
alter table leave_cases alter column jurisdiction set default 'CA';
update leave_cases set designated_at = created_at::date
 where designated_at is null and coalesce(leave_designation, '') <> '';

-- ── entity configuration (Feature 4a) ──────────────────────────────────────
alter table entities
  add column if not exists ein_masked text,                 -- display-masked ONLY; never store the full EIN here
  add column if not exists hr_contact_name text,
  add column if not exists hr_contact_title text,
  add column if not exists mailing_address text,
  add column if not exists policy_effective_date date,
  add column if not exists notification_recipients jsonb not null default '[]';

alter table entities enable row level security;
drop policy if exists entities_read on entities;
drop policy if exists entities_write on entities;
create policy entities_read on entities for select to authenticated using (true);
create policy entities_write on entities for all to authenticated
  using (current_role_of() = 'admin') with check (current_role_of() = 'admin');

-- seed/refresh the three entity configuration rows (placeholder EINs, Carson HQ)
update entities set
  ein_masked = coalesce(ein_masked, 'EIN xx-xxx7310'),
  hr_contact_name = coalesce(hr_contact_name, 'Jordan Avery'),
  hr_contact_title = coalesce(hr_contact_title, 'HR Administrator'),
  mailing_address = coalesce(mailing_address, '825 E Carson St, Carson, CA 90745'),
  policy_effective_date = coalesce(policy_effective_date, date '2025-01-01'),
  notification_recipients = case when notification_recipients = '[]'::jsonb
    then '["jordan.avery@yourdomain.com"]'::jsonb else notification_recipients end
 where code = 'AMPAM';
update entities set
  ein_masked = coalesce(ein_masked, 'EIN xx-xxx5594'),
  hr_contact_name = coalesce(hr_contact_name, 'Jordan Avery'),
  hr_contact_title = coalesce(hr_contact_title, 'HR Administrator'),
  mailing_address = coalesce(mailing_address, '825 E Carson St, Suite 200, Carson, CA 90745'),
  policy_effective_date = coalesce(policy_effective_date, date '2025-01-01'),
  notification_recipients = case when notification_recipients = '[]'::jsonb
    then '["jordan.avery@yourdomain.com"]'::jsonb else notification_recipients end
 where code = 'MULTIMECH';
update entities set
  ein_masked = coalesce(ein_masked, 'EIN xx-xxx4821'),
  hr_contact_name = coalesce(hr_contact_name, 'Jordan Avery'),
  hr_contact_title = coalesce(hr_contact_title, 'HR Administrator'),
  mailing_address = coalesce(mailing_address, '825 E Carson St, Suite 300, Carson, CA 90745'),
  policy_effective_date = coalesce(policy_effective_date, date '2025-01-01'),
  notification_recipients = case when notification_recipients = '[]'::jsonb
    then '["jordan.avery@yourdomain.com"]'::jsonb else notification_recipients end
 where code = 'SEAL';

-- ── e-signature workflow (Feature 2) ───────────────────────────────────────
alter table case_documents
  add column if not exists esign_status text
    check (esign_status in ('generated','pending_hr_signature','signed','delivered')),
  add column if not exists form_type text,
  add column if not exists signed_by bigint references hr_users (id),
  add column if not exists signed_at timestamptz;

-- ── refresh the masked view with v2.0 columns ───────────────────────────────
drop view if exists cases_secure;
create or replace view cases_secure
with (security_invoker = true) as
select
  c.id, c.ref, c.entity_id, c.employee_id, c.file_number,
  c.leave_designation, c.leave_designation as type, c.reason, c.status,
  c.priority, c.start_date, c.end_date, c.total_hours, c.used_hours,
  c.intermittent, c.military_caregiver, c.pdl_preceded, c.concurrent_clocks,
  c.designations, c.deferred_clocks, c.tracking_designations, c.designation_history,
  c.jurisdiction, c.designated_at, c.transfer_review,
  case when current_role_of() in ('admin','specialist','legal') then c.triage else null end as triage,
  c.cert_received, c.cert_due, c.owner_id, c.owner, c.source,
  c.payroll_flag, c.ffd,
  case when current_role_of() in ('admin','specialist','legal') then c.ada else null end as ada,
  c.created_at, c.updated_at, c.updated_by,
  case
    when current_role_of() in ('admin','specialist','legal') then c.notes
    when current_role_of() = 'employee'
         and c.employee_id = (select employee_id from hr_users where auth_user_id = auth.uid())
      then c.notes
    else null
  end as notes
from leave_cases c;
grant select on cases_secure to authenticated;
