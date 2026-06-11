-- LeaveIQ v1.3 · 0006
-- P1 case document repository (employee upload + HR review)
-- P2 admin template library (versioned)         P3 packet definitions
-- P4 secure case messaging                      P5 designation sets + history
-- P6/P7 workforce status + ADP associate id
-- Multi-company note: doc_templates.entity_id null = all entities; per-entity
-- overrides are a future filter, no schema change required.

-- ── designation sets on cases ───────────────────────────────────────────────
alter table leave_cases
  add column if not exists designations text[] not null default '{}',
  add column if not exists deferred_clocks text[] not null default '{}',
  add column if not exists tracking_designations text[] not null default '{}',
  add column if not exists designation_history jsonb not null default '[]';

-- backfill sets from the legacy single designation
update leave_cases
   set designations = case when coalesce(leave_designation,'') = '' then '{}'::text[]
                           else string_to_array(replace(leave_designation,' ',''),'+') end
 where designations = '{}';

alter table employees add column if not exists adp_associate_id text;
create index if not exists employees_adp_assoc_idx on employees (adp_associate_id);

-- ── P1 · case document repository ───────────────────────────────────────────
create table if not exists case_documents (
  id            bigint generated always as identity primary key,
  case_id       bigint not null references leave_cases (id),
  employee_id   bigint references employees (id),
  category      text not null check (category in
                  ('initial_cert','recert','rtw_release','ffd','ada','wc','notice','correspondence','other')),
  filename      text not null,
  mime          text,
  size          bigint,
  storage_path  text,                -- object key in the case-documents bucket
  storage_note  text,
  status        text not null default 'pending_review'
                  check (status in ('pending_review','complete','incomplete','needs_info')),
  review_notes  text default '',
  reviewed_by   text,
  reviewed_at   timestamptz,
  uploaded_by   text not null,
  uploaded_role text not null check (uploaded_role in ('employee','hr')),
  version       int not null default 1,
  replaces_id   bigint references case_documents (id),
  uploaded_at   timestamptz not null default now()
);
create index if not exists case_documents_case_idx on case_documents (case_id, uploaded_at desc);
alter table case_documents enable row level security;

-- HR roles: full access. Employees: insert/select on their own cases only.
-- Managers: none — document existence can itself reveal medical context.
create policy case_docs_hr on case_documents for all to authenticated
  using (current_role_of() in ('admin','specialist','legal'))
  with check (current_role_of() in ('admin','specialist','legal'));
create policy case_docs_employee_read on case_documents for select to authenticated
  using (current_role_of() = 'employee' and employee_id =
         (select employee_id from hr_users where auth_user_id = auth.uid()));
create policy case_docs_employee_insert on case_documents for insert to authenticated
  with check (current_role_of() = 'employee'
              and uploaded_role = 'employee'
              and employee_id = (select employee_id from hr_users where auth_user_id = auth.uid())
              and case_id in (select id from leave_cases lc where lc.employee_id =
                  (select employee_id from hr_users where auth_user_id = auth.uid())));

-- storage policies: employees write/read only inside their own case folders
create policy "case docs employee rw" on storage.objects for all to authenticated
  using (
    bucket_id = 'case-documents' and (
      current_role_of() in ('admin','specialist','legal')
      or (current_role_of() = 'employee' and (string_to_array(name,'/'))[1] in (
            select 'case_' || lc.id::text from leave_cases lc
             where lc.employee_id = (select employee_id from hr_users where auth_user_id = auth.uid())))
    ))
  with check (
    bucket_id = 'case-documents' and (
      current_role_of() in ('admin','specialist','legal')
      or (current_role_of() = 'employee' and (string_to_array(name,'/'))[1] in (
            select 'case_' || lc.id::text from leave_cases lc
             where lc.employee_id = (select employee_id from hr_users where auth_user_id = auth.uid())))
    ));

-- ── P2 · template library (versioned, admin-managed) ───────────────────────
create table if not exists doc_templates (
  id          bigint primary key,
  entity_id   bigint references entities (id),    -- null = all entities
  category    text not null check (category in ('FMLA','CFRA','ADA','PDL','WC','state','policy','internal')),
  name        text not null,
  description text default '',
  body        text not null,
  version     int not null default 1,
  status      text not null default 'active' check (status in ('active','archived')),
  history     jsonb not null default '[]',        -- [{version, body, updated_by, updated_at}]
  updated_by  text,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
alter table doc_templates enable row level security;
create policy templates_read on doc_templates for select to authenticated
  using (current_role_of() in ('admin','specialist','legal'));
create policy templates_write on doc_templates for all to authenticated
  using (current_role_of() = 'admin') with check (current_role_of() = 'admin');

-- ── P3 · packet definitions (pure configuration) ───────────────────────────
create table if not exists packet_defs (
  id           bigint primary key,
  name         text not null,
  description  text default '',
  designations text[] not null default '{}',
  items        jsonb not null default '[]',       -- ordered template ids
  active       boolean not null default true,
  updated_at   timestamptz not null default now()
);
alter table packet_defs enable row level security;
create policy packets_read on packet_defs for select to authenticated
  using (current_role_of() in ('admin','specialist','legal'));
create policy packets_write on packet_defs for all to authenticated
  using (current_role_of() = 'admin') with check (current_role_of() = 'admin');

-- ── P4 · secure case messaging ──────────────────────────────────────────────
create table if not exists case_messages (
  id          bigint generated always as identity primary key,
  case_id     bigint not null references leave_cases (id),
  sender_role text not null check (sender_role in ('employee','hr')),
  sender_name text not null,
  body        text not null check (length(body) <= 4000),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists case_messages_case_idx on case_messages (case_id, created_at);
alter table case_messages enable row level security;
create policy msgs_hr on case_messages for all to authenticated
  using (current_role_of() in ('admin','specialist','legal'))
  with check (current_role_of() in ('admin','specialist','legal') and sender_role = 'hr');
create policy msgs_employee_read on case_messages for select to authenticated
  using (current_role_of() = 'employee' and case_id in
         (select id from leave_cases where employee_id =
           (select employee_id from hr_users where auth_user_id = auth.uid())));
create policy msgs_employee_send on case_messages for insert to authenticated
  with check (current_role_of() = 'employee' and sender_role = 'employee' and case_id in
              (select id from leave_cases where employee_id =
                (select employee_id from hr_users where auth_user_id = auth.uid())));
create policy msgs_employee_mark_read on case_messages for update to authenticated
  using (current_role_of() = 'employee' and sender_role = 'hr' and case_id in
         (select id from leave_cases where employee_id =
           (select employee_id from hr_users where auth_user_id = auth.uid())))
  with check (sender_role = 'hr');   -- employees may only flip read_at on HR messages

-- ── refresh the masked view with v1.3 columns ───────────────────────────────
create or replace view cases_secure
with (security_invoker = true) as
select
  c.id, c.ref, c.entity_id, c.employee_id, c.file_number,
  c.leave_designation, c.leave_designation as type, c.reason, c.status,
  c.priority, c.start_date, c.end_date, c.total_hours, c.used_hours,
  c.intermittent, c.military_caregiver, c.pdl_preceded, c.concurrent_clocks,
  c.designations, c.deferred_clocks, c.tracking_designations, c.designation_history,
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
