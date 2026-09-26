-- Jephelen Phase 2B: Owner Hub
-- (business lines, activity timeline, documents per contact, calendar data)
-- Run AFTER 0013_pro_tier.sql.
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to run more than once.
--
-- What changes:
--   1. business_line (free text, nullable) on customers, leads, services,
--      tasks and invoices, plus a one-time backfill from the outreach
--      markers loaded by PASTE_step4.
--   2. activities: one row per email, reply, call, meeting, note, file,
--      invoice or task. Owner-only. external_id dedupes imports.
--   3. documents + private storage bucket 'client-docs' (10 MB,
--      pdf/jpg/png/webp/docx/xlsx), path <business_id>/<customer_id>/<file>.
--   4. owner_hub_scoreboard(): counts for the dashboard card. SECURITY
--      INVOKER, so RLS still decides what it can see.
--
-- What does NOT change (all 0011/0012/0013 protections kept):
--   - protect_business_billing trigger, businesses_plan_check
--   - ai_usage read-only for users, consume_ai_credit()
--   - guard_public_lead trigger and the public lead insert policy
--   - receipts bucket limits
--   Nothing in this file drops or replaces any of those.

-- ============================================================
-- 1. Business lines
-- ============================================================
alter table public.customers add column if not exists business_line text;
alter table public.leads     add column if not exists business_line text;
alter table public.services  add column if not exists business_line text;
alter table public.tasks     add column if not exists business_line text;
alter table public.invoices  add column if not exists business_line text;

do $$
declare
  t text;
begin
  foreach t in array array['customers', 'leads', 'services', 'tasks', 'invoices'] loop
    execute format(
      'alter table public.%I drop constraint if exists %I',
      t, t || '_business_line_len'
    );
    execute format(
      'alter table public.%I add constraint %I check (business_line is null or char_length(business_line) between 1 and 60)',
      t, t || '_business_line_len'
    );
    execute format(
      'create index if not exists %I on public.%I (business_id, business_line)',
      t || '_business_line_idx', t
    );
  end loop;
end;
$$;

-- Backfill (only rows that have no line yet, so re-running is harmless)
update public.leads set business_line = 'VWA'
where business_line is null and message like '[VWA outreach]%';

update public.leads set business_line = 'Woshi Studio'
where business_line is null and message like '[Woshi Studio outreach]%';

update public.services set business_line = 'VWA'
where business_line is null and name like 'VWA ·%';

update public.services set business_line = 'Woshi Studio'
where business_line is null and name like 'Woshi ·%';

-- Customers loaded by PASTE_step4 carry the line in their first note.
update public.customers c set business_line = 'VWA'
where c.business_line is null and exists (
  select 1 from public.customer_notes n
  where n.customer_id = c.id and n.body like 'VWA%'
);

update public.customers c set business_line = 'Woshi Studio'
where c.business_line is null and exists (
  select 1 from public.customer_notes n
  where n.customer_id = c.id and n.body like 'Woshi client%'
);

-- Visitors on the public page can't pick a business line. This is a
-- separate trigger; guard_public_lead (0011) is left exactly as it is.
create or replace function public.guard_public_lead_line()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if session_user <> 'authenticator'
     or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if auth.uid() is not null and exists (
    select 1 from public.businesses b
    where b.id = new.business_id and b.owner_id = auth.uid()
  ) then
    return new;
  end if;

  new.business_line := null;
  return new;
end;
$$;

drop trigger if exists leads_guard_public_line on public.leads;
create trigger leads_guard_public_line
  before insert on public.leads
  for each row execute function public.guard_public_lead_line();

-- ============================================================
-- 2. Activities (the timeline)
-- ============================================================
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  business_line text check (business_line is null or char_length(business_line) between 1 and 60),
  kind text not null check (kind in ('email_sent', 'email_reply', 'call', 'meeting', 'note', 'file', 'invoice', 'task')),
  subject text check (subject is null or char_length(subject) <= 300),
  body text check (body is null or char_length(body) <= 5000),
  occurred_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual', 'mailer', 'gmail', 'phone_line', 'import')),
  external_id text check (external_id is null or char_length(external_id) <= 300),
  created_at timestamptz not null default now()
);

-- Plain (not partial) unique index so "on conflict (business_id, external_id)"
-- works. Manual rows have external_id null, and nulls never collide.
create unique index if not exists activities_business_external_idx
  on public.activities (business_id, external_id);
create index if not exists activities_business_occurred_idx
  on public.activities (business_id, occurred_at desc);
create index if not exists activities_customer_idx
  on public.activities (customer_id, occurred_at desc);
create index if not exists activities_lead_idx
  on public.activities (lead_id, occurred_at desc);
create index if not exists activities_business_kind_idx
  on public.activities (business_id, kind, business_line);

alter table public.activities enable row level security;

drop policy if exists "Owners manage own activities" on public.activities;
create policy "Owners manage own activities"
  on public.activities for all
  to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
    -- a linked customer / lead must belong to the same business
    and (customer_id is null or exists (
      select 1 from public.customers c
      where c.id = customer_id and c.business_id = activities.business_id
    ))
    and (lead_id is null or exists (
      select 1 from public.leads l
      where l.id = lead_id and l.business_id = activities.business_id
    ))
  );

revoke all on public.activities from anon;

-- ============================================================
-- 3. Documents per contact + private bucket
-- ============================================================
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  path text not null unique check (char_length(path) <= 600),
  size bigint not null check (size > 0 and size <= 10485760),
  mime text not null check (mime in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )),
  uploaded_at timestamptz not null default now()
);

create index if not exists documents_customer_idx
  on public.documents (customer_id, uploaded_at desc);
create index if not exists documents_business_idx
  on public.documents (business_id);

alter table public.documents enable row level security;

drop policy if exists "Owners manage own documents" on public.documents;
create policy "Owners manage own documents"
  on public.documents for all
  to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
    and exists (
      select 1 from public.customers c
      where c.id = customer_id and c.business_id = documents.business_id
    )
    -- the stored path must sit under this business and this customer
    and path like (business_id::text || '/' || customer_id::text || '/%')
  );

revoke all on public.documents from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-docs', 'client-docs', false, 10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Owner only: the first folder of the path is the business id, and the
-- signed-in user must own that business. Second folder must be one of
-- that business's customers.
drop policy if exists "Owners manage own client docs" on storage.objects;
create policy "Owners manage own client docs"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'client-docs'
    and exists (
      select 1 from public.businesses b
      where b.id::text = (storage.foldername(objects.name))[1]
        and b.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'client-docs'
    and exists (
      select 1
      from public.businesses b
      join public.customers c on c.business_id = b.id
      where b.id::text = (storage.foldername(objects.name))[1]
        and c.id::text = (storage.foldername(objects.name))[2]
        and b.owner_id = auth.uid()
    )
  );

-- ============================================================
-- 4. Dashboard scoreboard counts
--    SECURITY INVOKER: runs as the caller, so RLS on leads/activities
--    still limits it to the owner's own rows.
-- ============================================================
create or replace function public.owner_hub_scoreboard(p_business uuid)
returns table (business_line text, metric text, n bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.business_line, 'lead_' || l.status, count(*)
  from public.leads l
  where l.business_id = p_business
  group by 1, 2
  union all
  select a.business_line, a.kind, count(*)
  from public.activities a
  where a.business_id = p_business
    and a.kind in ('email_sent', 'email_reply')
  group by 1, 2
$$;

revoke all on function public.owner_hub_scoreboard(uuid) from public, anon;
grant execute on function public.owner_hub_scoreboard(uuid) to authenticated;
