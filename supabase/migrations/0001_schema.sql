-- LeaveIQ schema · 0001
-- Postgres 15+ (Supabase). All identifiers snake_case. File numbers are TEXT
-- everywhere — never numeric — to preserve ADP leading zeros.

create extension if not exists pgcrypto;

-- ── entities ────────────────────────────────────────────────────────────────
create table entities (
  id          bigint generated always as identity primary key,
  code        text not null unique,            -- AMPAM | MULTIMECH | SEAL
  name        text not null,
  legal_name  text not null,
  type        text not null check (type in ('mechanical','electrical')),
  state       text not null default 'CA',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── hr_users (linked to Supabase auth) ─────────────────────────────────────
create table hr_users (
  id                 bigint generated always as identity primary key,
  auth_user_id       uuid unique references auth.users (id) on delete set null,
  name               text not null,
  email              text not null unique,
  role               text not null check (role in ('admin','specialist','manager','employee','legal')),
  entity_id          bigint references entities (id),   -- null ⇒ all entities
  department         text,                              -- managers: team scope
  employee_id        bigint,                            -- employee role: own record (fk added below)
  notification_prefs jsonb not null default '{"cert_7d":true,"cert_3d":true,"cert_overdue":true,"rtw_14d":true,"email":true}'::jsonb,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

-- ── employees ──────────────────────────────────────────────────────────────
create table employees (
  id                bigint generated always as identity primary key,
  entity_id         bigint not null references entities (id),
  file_number       text not null unique,        -- ADP file number, leading zeros preserved
  name              text not null,
  email             text,
  department        text,
  position          text,
  state             text not null default 'CA',
  hire_date         date,
  hours_per_week    numeric(5,2),                -- null/0 ⇒ full-time (40) assumed by the engine
  hours_worked_12mo numeric(8,2),                -- payroll: hours in the trailing 12 months
  hours_worked_ytd  numeric(8,2),
  employment_type   text not null default 'full-time' check (employment_type in ('full-time','part-time')),
  status            text not null default 'Active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index employees_entity_idx on employees (entity_id);
create index employees_dept_idx   on employees (department);

alter table hr_users
  add constraint hr_users_employee_fk foreign key (employee_id) references employees (id);

-- ── leave_cases ─────────────────────────────────────────────────────────────
create table leave_cases (
  id                 bigint generated always as identity primary key,
  ref                text not null unique,
  entity_id          bigint not null references entities (id),
  employee_id        bigint not null references employees (id),
  file_number        text not null,              -- denormalized for import attribution
  leave_designation  text,                       -- NULL/'' ⇒ awaiting designation; clocks idle
  reason             text,                       -- own_serious_health | family_care | bonding | pregnancy_disability | military_caregiver | military_exigency | personal
  status             text not null default 'Pending' check (status in ('Pending','Active','Approved','Denied','Closed')),
  priority           text not null default 'Medium' check (priority in ('High','Medium','Low')),
  start_date         date not null,
  end_date           date,
  total_hours        numeric(8,2) not null default 0,  -- entitlement at designation time (prorated)
  used_hours         numeric(8,2) not null default 0,  -- rolled up from intermittent_log by trigger
  intermittent       boolean not null default false,
  military_caregiver boolean not null default false,
  pdl_preceded       boolean not null default false,   -- bonding after PDL ⇒ CFRA-only block
  concurrent_clocks  text[] not null default '{}',     -- e.g. {PDL,FMLA} — audit-critical
  cert_received      boolean not null default false,
  cert_due           date,
  owner_id           bigint references hr_users (id),
  owner              text,
  notes              text,                             -- masked by cases_secure for restricted roles
  source             text not null default 'web' check (source in ('web','import','system')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         text,
  unique (file_number, start_date)                     -- import duplicate-case guard
);
create index leave_cases_entity_idx   on leave_cases (entity_id);
create index leave_cases_employee_idx on leave_cases (employee_id);
create index leave_cases_status_idx   on leave_cases (status);
create index leave_cases_cert_idx     on leave_cases (cert_received, cert_due);

-- case reference generator: LV-<year>-<seq>
create sequence leave_case_ref_seq start 1001;
create or replace function gen_case_ref() returns trigger
language plpgsql as $$
begin
  if new.ref is null or new.ref = '' then
    new.ref := 'LV-' || to_char(now(), 'YYYY') || '-' || nextval('leave_case_ref_seq');
  end if;
  return new;
end $$;
create trigger leave_cases_ref before insert on leave_cases
  for each row execute function gen_case_ref();

-- ── intermittent_log ────────────────────────────────────────────────────────
-- Attribution model: each usage row belongs to ONE case, located by
-- (file_number, leave_start_date). Never aggregated at the employee level, so
-- simultaneous intermittent leaves cannot cross-contaminate.
create table intermittent_log (
  id               bigint generated always as identity primary key,
  case_id          bigint not null references leave_cases (id),
  employee_id      bigint not null references employees (id),
  file_number      text not null,
  leave_start_date date not null,
  usage_date       date not null,
  hours_used       numeric(6,2) not null check (hours_used > 0),
  approved_by      text,
  notes            text,
  created_at       timestamptz not null default now()
);
create index intermittent_case_idx  on intermittent_log (case_id);
create index intermittent_usage_idx on intermittent_log (employee_id, usage_date);

-- ── certifications ──────────────────────────────────────────────────────────
create table certifications (
  id           bigint generated always as identity primary key,
  case_id      bigint not null references leave_cases (id),
  kind         text not null default 'medical' check (kind in ('medical','recert','fitness_for_duty')),
  requested_at date,
  due_date     date,
  received_at  date,
  file_path    text,                       -- storage object in 'case-documents'
  notes        text,
  created_at   timestamptz not null default now()
);
create index certifications_case_idx on certifications (case_id);

-- ── audit_events (append-only; permissions hardened in 0002) ───────────────
create table audit_events (
  id          bigint generated always as identity primary key,
  case_id     bigint references leave_cases (id),
  case_ref    text,
  employee_id bigint references employees (id),
  action      text not null,
  changed_by  text not null default coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email','system'),
  changed_at  timestamptz not null default now(),
  source      text not null default 'web' check (source in ('web','import','system')),
  old_values  jsonb,
  new_values  jsonb
);
create index audit_events_case_idx on audit_events (case_id);
create index audit_events_time_idx on audit_events (changed_at desc);

-- ── notifications (sent-alert ledger for the edge function) ────────────────
create table notifications (
  id         bigint generated always as identity primary key,
  case_id    bigint references leave_cases (id),
  hr_user_id bigint references hr_users (id),
  kind       text not null,                -- cert_7d | cert_3d | cert_overdue | rtw_14d
  sent_at    timestamptz not null default now(),
  unique (case_id, hr_user_id, kind)       -- idempotency: never double-send
);
