-- LeaveIQ automation · 0003
-- Server-side triggers (audit writing, hours rollup, updated_at) and the
-- single-transaction ADP import commit.

-- ── updated_at maintenance ──────────────────────────────────────────────────
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger employees_touch  before update on employees   for each row execute function touch_updated_at();
create trigger cases_touch      before update on leave_cases for each row execute function touch_updated_at();

-- ── audit row trigger: every case change recorded with old/new jsonb ───────
create or replace function audit_case_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor text := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email', 'system');
  diff_old jsonb := '{}'; diff_new jsonb := '{}'; k text;
begin
  if tg_op = 'INSERT' then
    insert into audit_events (case_id, case_ref, employee_id, action, changed_by, source, new_values)
    values (new.id, new.ref, new.employee_id,
            case when new.source = 'import' then 'Case auto-created from ADP import' ||
                 case when coalesce(new.leave_designation,'') = '' then ' — awaiting designation' else '' end
                 else 'Case created' end,
            actor, new.source,
            jsonb_build_object('leave_designation', new.leave_designation, 'status', new.status,
                               'start_date', new.start_date, 'end_date', new.end_date));
    return new;
  end if;
  -- UPDATE: record only changed columns
  for k in select jsonb_object_keys(to_jsonb(new)) loop
    if to_jsonb(new)->k is distinct from to_jsonb(old)->k and k not in ('updated_at','updated_by') then
      diff_old := diff_old || jsonb_build_object(k, to_jsonb(old)->k);
      diff_new := diff_new || jsonb_build_object(k, to_jsonb(new)->k);
    end if;
  end loop;
  if diff_new <> '{}'::jsonb then
    insert into audit_events (case_id, case_ref, employee_id, action, changed_by, source, old_values, new_values)
    values (new.id, new.ref, new.employee_id,
            case
              when diff_new ? 'leave_designation' then 'Designation assigned: ' || coalesce(new.leave_designation,'')
              when diff_new ? 'cert_received' and new.cert_received then 'Medical certification received'
              when diff_new ? 'status' then 'Status updated: ' || old.status || ' → ' || new.status
              else 'Case updated'
            end,
            actor, 'web', diff_old, diff_new);
  end if;
  return new;
end $$;
create trigger cases_audit after insert or update on leave_cases
  for each row execute function audit_case_change();

-- ── intermittent usage: roll up to the case + audit ─────────────────────────
create or replace function rollup_intermittent() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor text := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email', 'system');
begin
  update leave_cases
     set used_hours = (select coalesce(sum(hours_used),0) from intermittent_log where case_id = new.case_id)
   where id = new.case_id;
  insert into audit_events (case_id, employee_id, action, changed_by, source, new_values)
  select new.case_id, new.employee_id,
         'Intermittent usage logged: ' || new.hours_used || 'h on ' || new.usage_date,
         actor, 'web',
         jsonb_build_object('usage_date', new.usage_date, 'hours_used', new.hours_used);
  return new;
end $$;
create trigger intermittent_rollup after insert on intermittent_log
  for each row execute function rollup_intermittent();

-- ── ADP import commit: one transaction, all-or-nothing ──────────────────────
-- Payload shapes match src/lib/adp/diff.js exactly. Auto-created cases enter
-- as Pending with the designation exactly as exported — blank stays blank and
-- clocks stay idle (total_hours = 0) until HR designates.
create or replace function adp_import_commit(
  p_new_employees jsonb,
  p_updated_employees jsonb,
  p_cases jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb; ent_id bigint; emp_id bigint;
  n_added int := 0; n_updated int := 0; n_cases int := 0;
  actor text := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email', 'system');
begin
  if (select role from hr_users where auth_user_id = auth.uid() and active) not in ('admin','specialist') then
    raise exception 'not authorized to run imports';
  end if;

  -- new employees
  for rec in select * from jsonb_array_elements(coalesce(p_new_employees, '[]'::jsonb)) loop
    select id into ent_id from entities where code = rec->>'entity_code';
    insert into employees (entity_id, file_number, name, email, department, position, state,
                           hire_date, hours_per_week, hours_worked_12mo, hours_worked_ytd,
                           employment_type, status)
    values (coalesce(ent_id, (select id from entities order by id limit 1)),
            rec->>'file_number', rec->>'name', nullif(rec->>'email',''),
            nullif(rec->>'department',''), nullif(rec->>'position',''),
            coalesce(nullif(rec->>'state',''),'CA'),
            nullif(rec->>'hire_date','')::date,
            nullif(rec->>'hours_per_week','')::numeric,
            nullif(rec->>'hours_worked_12mo','')::numeric,
            nullif(rec->>'hours_worked_ytd','')::numeric,
            coalesce(nullif(rec->>'employment_type',''),'full-time'),
            coalesce(nullif(rec->>'status',''),'Active'));
    n_added := n_added + 1;
  end loop;

  -- field updates (ADP blanks never erase known data — diff already excludes them)
  for rec in select * from jsonb_array_elements(coalesce(p_updated_employees, '[]'::jsonb)) loop
    update employees e set
      name              = coalesce((select x->>'to' from jsonb_array_elements(rec->'changes') x where x->>'field'='name'), e.name),
      email             = coalesce((select x->>'to' from jsonb_array_elements(rec->'changes') x where x->>'field'='email'), e.email),
      entity_id         = coalesce((select id from entities where code = (select x->>'to' from jsonb_array_elements(rec->'changes') x where x->>'field'='entity_code')), e.entity_id),
      department        = coalesce((select x->>'to' from jsonb_array_elements(rec->'changes') x where x->>'field'='department'), e.department),
      position          = coalesce((select x->>'to' from jsonb_array_elements(rec->'changes') x where x->>'field'='position'), e.position),
      state             = coalesce((select x->>'to' from jsonb_array_elements(rec->'changes') x where x->>'field'='state'), e.state),
      hire_date         = coalesce((select (x->>'to')::date from jsonb_array_elements(rec->'changes') x where x->>'field'='hire_date'), e.hire_date),
      hours_per_week    = coalesce((select (x->>'to')::numeric from jsonb_array_elements(rec->'changes') x where x->>'field'='hours_per_week'), e.hours_per_week),
      hours_worked_12mo = coalesce((select (x->>'to')::numeric from jsonb_array_elements(rec->'changes') x where x->>'field'='hours_worked_12mo'), e.hours_worked_12mo),
      hours_worked_ytd  = coalesce((select (x->>'to')::numeric from jsonb_array_elements(rec->'changes') x where x->>'field'='hours_worked_ytd'), e.hours_worked_ytd),
      employment_type   = coalesce((select x->>'to' from jsonb_array_elements(rec->'changes') x where x->>'field'='employment_type'), e.employment_type),
      status            = coalesce((select x->>'to' from jsonb_array_elements(rec->'changes') x where x->>'field'='status'), e.status)
    where e.file_number = rec->>'file_number';
    insert into audit_events (employee_id, action, changed_by, source, new_values)
    select e.id, 'Employee record updated from ADP import', actor, 'import', rec->'changes'
      from employees e where e.file_number = rec->>'file_number';
    n_updated := n_updated + 1;
  end loop;

  -- auto-created cases (duplicate guard = unique (file_number, start_date))
  for rec in select * from jsonb_array_elements(coalesce(p_cases, '[]'::jsonb)) loop
    select id into emp_id from employees where file_number = rec->>'file_number';
    if emp_id is null then continue; end if;
    insert into leave_cases (entity_id, employee_id, file_number, leave_designation, status,
                             start_date, end_date, cert_due, owner, source, notes,
                             total_hours, used_hours, concurrent_clocks)
    values ((select entity_id from employees where id = emp_id), emp_id, rec->>'file_number',
            nullif(rec->>'leave_designation',''), 'Pending',
            (rec->>'start_date')::date, nullif(rec->>'end_date','')::date,
            (rec->>'start_date')::date + 15, actor, 'import',
            case when coalesce(rec->>'leave_designation','') = ''
                 then 'Imported from ADP roster — HR to assign designation before clocks start.'
                 else 'Imported from ADP roster.' end,
            0, 0, '{}')
    on conflict (file_number, start_date) do nothing;
    if found then n_cases := n_cases + 1; end if;
  end loop;

  insert into audit_events (action, changed_by, source, new_values)
  values ('ADP import committed: ' || n_added || ' new employees, ' || n_updated || ' updated, ' || n_cases || ' cases created',
          actor, 'import',
          jsonb_build_object('new', n_added, 'updated', n_updated, 'cases', n_cases));

  return jsonb_build_object('added', n_added, 'updated', n_updated, 'cases', n_cases);
end $$;
