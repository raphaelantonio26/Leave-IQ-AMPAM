-- LeaveIQ reference seed · 0004
-- Run once after 0001-0003. Replace emails with real staff addresses before
-- production; auth_user_id is linked at first sign-in (see HANDOFF.md).
-- NO employee data is seeded here — the workforce arrives via the ADP import.

insert into entities (code, name, legal_name, type, state) values
  ('AMPAM',     'AMPAM Parks Mechanical', 'AMPAM Parks Mechanical, Inc.', 'mechanical', 'CA'),
  ('MULTIMECH', 'Multimech',              'Multimech, Inc.',              'mechanical', 'CA'),
  ('SEAL',      'Seal Electric',          'Seal Electric, Inc.',          'electrical', 'CA')
on conflict (code) do nothing;

-- HR roster placeholders. Update emails, then link auth accounts:
--   update hr_users set auth_user_id = (select id from auth.users where email = hr_users.email);
insert into hr_users (name, email, role, entity_id, department) values
  ('Jordan Avery',   'jordan.avery@ampam.example',   'admin',      null, null),
  ('Sarah Toledano', 'sarah.toledano@ampam.example', 'specialist', null, null),
  ('Megan Krell',    'megan.krell@ampam.example',    'specialist', null, null),
  ('Daniel Reyes',   'daniel.reyes@ampam.example',   'specialist', (select id from entities where code='MULTIMECH'), null),
  ('Morgan Diaz',    'morgan.diaz@ampam.example',    'manager',    (select id from entities where code='AMPAM'), 'Field Operations'),
  ('Robin Sayer',    'robin.sayer@ampam.example',    'legal',      null, null)
on conflict (email) do nothing;

-- Storage: create the private bucket for certification uploads.
-- (Equivalent to creating "case-documents" in the dashboard, private, 25MB cap.)
insert into storage.buckets (id, name, public, file_size_limit)
values ('case-documents', 'case-documents', false, 26214400)
on conflict (id) do nothing;

create policy case_docs_rw on storage.objects for all to authenticated
  using (bucket_id = 'case-documents'
         and (select role from hr_users where auth_user_id = auth.uid() and active) in ('admin','specialist','legal'))
  with check (bucket_id = 'case-documents'
         and (select role from hr_users where auth_user_id = auth.uid() and active) in ('admin','specialist'));
