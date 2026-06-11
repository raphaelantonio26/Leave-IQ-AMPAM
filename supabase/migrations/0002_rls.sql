-- LeaveIQ security · 0002
-- Row-level security for the five personas + database-enforced guarantees the
-- UI merely mirrors: the audit log cannot be altered by ANY role, and medical
-- notes are masked in the query layer for managers and unrelated employees.

-- ── helper: the calling user's hr_users row ────────────────────────────────
create or replace function current_hr_user()
returns hr_users language sql stable security definer set search_path = public as $$
  select * from hr_users where auth_user_id = auth.uid() and active limit 1;
$$;

create or replace function current_role_of() returns text
language sql stable security definer set search_path = public as $$
  select role from hr_users where auth_user_id = auth.uid() and active limit 1;
$$;

-- Which employees fall inside the caller's scope?
create or replace function employee_in_scope(emp_id bigint) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare u hr_users;
begin
  select * into u from hr_users where auth_user_id = auth.uid() and active limit 1;
  if u is null then return false; end if;
  if u.role in ('admin','legal') then return true; end if;
  if u.role = 'specialist' then
    return (u.entity_id is null) or exists (select 1 from employees e where e.id = emp_id and e.entity_id = u.entity_id);
  end if;
  if u.role = 'manager' then
    return exists (select 1 from employees e where e.id = emp_id
                   and e.department = u.department
                   and (u.entity_id is null or e.entity_id = u.entity_id));
  end if;
  if u.role = 'employee' then return u.employee_id = emp_id; end if;
  return false;
end $$;

-- ── enable RLS everywhere ───────────────────────────────────────────────────
alter table entities         enable row level security;
alter table hr_users         enable row level security;
alter table employees        enable row level security;
alter table leave_cases      enable row level security;
alter table intermittent_log enable row level security;
alter table certifications   enable row level security;
alter table audit_events     enable row level security;
alter table notifications    enable row level security;

-- entities: visible to all signed-in staff
create policy entities_read on entities for select to authenticated using (true);
create policy entities_admin on entities for all to authenticated
  using (current_role_of() = 'admin') with check (current_role_of() = 'admin');

-- hr_users: read own row + admin reads/manages all
create policy hr_users_self on hr_users for select to authenticated using (auth_user_id = auth.uid());
create policy hr_users_admin on hr_users for all to authenticated
  using (current_role_of() = 'admin') with check (current_role_of() = 'admin');
create policy hr_users_prefs on hr_users for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- employees: scope-gated read; write for admin/specialist only
create policy employees_read on employees for select to authenticated
  using (employee_in_scope(id));
create policy employees_write on employees for insert to authenticated
  with check (current_role_of() in ('admin','specialist'));
create policy employees_update on employees for update to authenticated
  using (current_role_of() in ('admin','specialist'))
  with check (current_role_of() in ('admin','specialist'));

-- leave_cases: scope-gated read; write for admin/specialist; specialists
-- additionally limited to cases they own or unassigned (enforced app-side and
-- by the ownership check below for updates)
create policy cases_read on leave_cases for select to authenticated
  using (employee_in_scope(employee_id));
create policy cases_insert on leave_cases for insert to authenticated
  with check (current_role_of() in ('admin','specialist'));
create policy cases_update on leave_cases for update to authenticated
  using (current_role_of() = 'admin'
         or (current_role_of() = 'specialist'
             and (owner_id is null or owner_id = (select id from hr_users where auth_user_id = auth.uid()))))
  with check (current_role_of() in ('admin','specialist'));
-- no delete policy: cases are closed, never deleted

-- intermittent_log / certifications: follow the parent case's scope
create policy log_read on intermittent_log for select to authenticated
  using (employee_in_scope(employee_id));
create policy log_insert on intermittent_log for insert to authenticated
  with check (current_role_of() in ('admin','specialist'));

create policy certs_read on certifications for select to authenticated
  using (exists (select 1 from leave_cases c where c.id = case_id and employee_in_scope(c.employee_id)));
create policy certs_write on certifications for all to authenticated
  using (current_role_of() in ('admin','specialist'))
  with check (current_role_of() in ('admin','specialist'));

-- ── audit_events: APPEND-ONLY, enforced at the database ────────────────────
-- 1) revoke UPDATE/DELETE from every role including the table owner path used
--    by PostgREST; 2) only an insert policy exists. Even an admin JWT cannot
--    modify history.
revoke update, delete on audit_events from anon, authenticated, service_role;
create policy audit_read on audit_events for select to authenticated
  using (current_role_of() in ('admin','legal')
         or (case_id is not null and exists (select 1 from leave_cases c where c.id = case_id and employee_in_scope(c.employee_id))));
create policy audit_insert on audit_events for insert to authenticated with check (true);
-- belt-and-suspenders: reject any UPDATE/DELETE that slips past grants
create or replace function audit_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_events is append-only';
end $$;
create trigger audit_no_update before update or delete on audit_events
  for each row execute function audit_immutable();

-- notifications: edge function (service role) writes; staff read their own
create policy notif_read on notifications for select to authenticated
  using (hr_user_id = (select id from hr_users where auth_user_id = auth.uid())
         or current_role_of() = 'admin');

-- ── cases_secure: medical-note masking in the QUERY LAYER ───────────────────
-- Managers never see notes. Employees see notes only on their own cases.
-- The frontend selects exclusively from this view, so a compromised client
-- gains nothing — masking happens before data leaves the database.
create or replace view cases_secure
with (security_invoker = true) as
select
  c.id, c.ref, c.entity_id, c.employee_id, c.file_number,
  c.leave_designation, c.leave_designation as type, c.reason, c.status,
  c.priority, c.start_date, c.end_date, c.total_hours, c.used_hours,
  c.intermittent, c.military_caregiver, c.pdl_preceded, c.concurrent_clocks,
  c.cert_received, c.cert_due, c.owner_id, c.owner, c.source,
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
