-- LeaveIQ v1.2 · 0005
-- Tier 1: employee intake (magic link + RPC), payroll coordination flag
-- Tier 2: ADA interactive process, FFD checklist (certifications chain already exists)
-- Tier 3: corrective_actions (feeds cross-case risk signals)

-- ── case columns ────────────────────────────────────────────────────────────
alter table leave_cases
  add column if not exists payroll_flag jsonb,   -- {kind,severity,message,coordinate_by,acknowledged,acknowledged_by,acknowledged_at}
  add column if not exists ffd jsonb,            -- {required,requested_at,received_at,cleared_at}
  add column if not exists ada jsonb;            -- {tracked,requested,initiated,offered,decision,resolved,*_detail}

alter table leave_cases drop constraint if exists leave_cases_source_check;
alter table leave_cases add constraint leave_cases_source_check
  check (source in ('web','import','system','intake'));
alter table audit_events drop constraint if exists audit_events_source_check;
alter table audit_events add constraint audit_events_source_check
  check (source in ('web','import','system','intake'));

-- ── corrective actions (HR-admin maintained; read by admin/legal for signals) ─
create table if not exists corrective_actions (
  id          bigint generated always as identity primary key,
  employee_id bigint not null references employees (id),
  kind        text not null check (kind in ('verbal','written_warning','final_warning','PIP')),
  action_date date not null,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists corrective_actions_emp_idx on corrective_actions (employee_id, action_date desc);
alter table corrective_actions enable row level security;
create policy ca_read on corrective_actions for select to authenticated
  using (current_role_of() in ('admin','legal'));
create policy ca_write on corrective_actions for all to authenticated
  using (current_role_of() = 'admin') with check (current_role_of() = 'admin');

-- ── employee intake: magic links + anon-callable RPC ───────────────────────
create table if not exists intake_tokens (
  token       uuid primary key default gen_random_uuid(),
  file_number text not null references employees (file_number),
  created_by  bigint references hr_users (id),
  expires_at  timestamptz not null default now() + interval '30 days',
  used_at     timestamptz,                  -- single-submission links; null = reusable until expiry
  created_at  timestamptz not null default now()
);
alter table intake_tokens enable row level security;
create policy intake_tokens_admin on intake_tokens for all to authenticated
  using (current_role_of() in ('admin','specialist'))
  with check (current_role_of() in ('admin','specialist'));

-- The portal calls this with the ANON key. SECURITY DEFINER bypasses RLS in a
-- controlled way: the token must exist, be unexpired, and match the file
-- number; the last name must match the employee record. Nothing is readable —
-- the function only inserts and returns the reference.
create or replace function submit_intake(
  p_token uuid,
  p_file_number text,
  p_last_name text,
  p_reason text,
  p_start_date date,
  p_end_date date,
  p_intermittent boolean,
  p_notes text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  emp employees; tok intake_tokens; new_ref text; owner_name text := 'Sarah Toledano';
begin
  select * into tok from intake_tokens
   where token = p_token and expires_at > now() and used_at is null;
  if tok is null then raise exception 'This link is invalid or has expired. Contact HR for a new one.'; end if;
  if tok.file_number <> p_file_number then raise exception 'File number does not match this link.'; end if;

  select * into emp from employees where file_number = p_file_number and status <> 'Terminated';
  if emp is null then raise exception 'File number not found. Check your pay stub or contact HR.'; end if;
  if lower(split_part(emp.name, ' ', array_length(string_to_array(emp.name, ' '), 1)))
     not like lower(trim(p_last_name)) || '%' or trim(coalesce(p_last_name,'')) = '' then
    raise exception 'Last name does not match our records for that file number.';
  end if;
  if p_start_date is null then raise exception 'Estimated start date is required.'; end if;
  if exists (select 1 from leave_cases where file_number = emp.file_number and start_date = p_start_date) then
    raise exception 'A leave request starting % already exists for this file number.', p_start_date;
  end if;

  insert into leave_cases (entity_id, employee_id, file_number, leave_designation, reason,
                           status, start_date, end_date, cert_due, intermittent, owner, source, notes,
                           total_hours, used_hours, concurrent_clocks)
  values (emp.entity_id, emp.id, emp.file_number, null, nullif(p_reason,''),
          'Pending', p_start_date, p_end_date, p_start_date + 15, coalesce(p_intermittent,false),
          owner_name, 'intake',
          case when coalesce(trim(p_notes),'') = '' then 'Submitted via employee intake — HR to review and designate.'
               else 'Employee intake: ' || left(trim(p_notes), 500) end,
          0, 0, '{}')
  returning ref into new_ref;
  -- the cases_audit trigger writes the creation audit row (source='intake')

  update intake_tokens set used_at = now() where token = p_token;
  return jsonb_build_object('ref', new_ref, 'owner', owner_name);
end $$;
grant execute on function submit_intake(uuid, text, text, text, date, date, boolean, text) to anon;

-- ── ADA interactive process milestone RPC (audited) ─────────────────────────
create or replace function record_ada_step(p_case_id bigint, p_step text, p_detail text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor text := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email','system');
  today text := to_char(now(),'YYYY-MM-DD');
  label text;
begin
  if (select role from hr_users where auth_user_id = auth.uid() and active) not in ('admin','specialist') then
    raise exception 'not authorized';
  end if;
  if p_step not in ('tracked','requested','initiated','offered','decision','resolved') then
    raise exception 'unknown ADA step %', p_step;
  end if;
  label := case p_step
    when 'tracked' then 'ADA tracker opened'
    when 'requested' then 'Accommodation requested'
    when 'initiated' then 'Interactive process initiated'
    when 'offered' then 'Accommodation offered'
    when 'decision' then 'Accommodation decision recorded'
    else 'ADA process resolution documented' end;
  update leave_cases
     set ada = coalesce(ada,'{}'::jsonb)
               || jsonb_build_object('tracked', true)
               || case when p_step = 'tracked' then '{}'::jsonb else jsonb_build_object(p_step, today) end
               || case when coalesce(p_detail,'') <> '' then jsonb_build_object(p_step || '_detail', left(p_detail, 500)) else '{}'::jsonb end
   where id = p_case_id;
  insert into audit_events (case_id, case_ref, employee_id, action, changed_by, source, new_values)
  select c.id, c.ref, c.employee_id,
         label || case when coalesce(p_detail,'') <> '' then ': ' || left(p_detail, 500) else '' end,
         actor, 'web', jsonb_build_object('step', p_step, 'detail', p_detail)
    from leave_cases c where c.id = p_case_id;
  return jsonb_build_object('ok', true);
end $$;

-- ── refresh the masked view to include the new columns ─────────────────────
drop view if exists cases_secure;
create or replace view cases_secure
with (security_invoker = true) as
select
  c.id, c.ref, c.entity_id, c.employee_id, c.file_number,
  c.leave_designation, c.leave_designation as type, c.reason, c.status,
  c.priority, c.start_date, c.end_date, c.total_hours, c.used_hours,
  c.intermittent, c.military_caregiver, c.pdl_preceded, c.concurrent_clocks,
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
