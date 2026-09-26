-- Jephelen Phases 2D + 2E: themes, welcome tour, plans with real limits
-- Run AFTER 0016_agent_api.sql.
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to run more than once.
--
-- Plans (DB values stay free / premium / pro; the app calls them
-- Starter / Hustle / Boss). Keep in sync with PLAN_LIMITS in
-- src/lib/plans.ts.
--
--                                 Starter   Hustle   Boss
--   customers + open leads          10       150      unlimited
--   invoices + quotes / 28 days      5        50      unlimited
--   storage (client-docs+receipts)  50 MB     1 GB    10 GB
--   in-app emails a day              0        50      200
--   business lines                   1         3      unlimited
--   The owner's businesses (plan_unlimited_businesses) have no limits.
--
-- What changes:
--   1. profiles.theme ('clean' | 'dark' | 'neon' | 'retro') and
--      profiles.tour_done_at (welcome tour seen).
--   2. plan_unlimited_businesses: the owner's businesses. No user access at
--      all; filled from the SQL editor (see PLANS-THEMES.md) and by the
--      server for businesses in OWNER_BUSINESS_IDS.
--   3. plan_usage_events: one row per invoice/quote created, so the
--      28-day count can't be reset by deleting invoices. Users can read,
--      not write.
--   4. plan_limits(business) and plan_usage(business): SECURITY DEFINER,
--      caller must own the business (or be the server).
--   5. BEFORE INSERT/UPDATE triggers on customers, leads, invoices,
--      services, tasks and documents, plus a RESTRICTIVE insert policy on
--      storage.objects, so limits can't be skipped from the browser.
--   6. consume_email_send() now uses the plan's daily number
--      (0 / 50 / 200, owner unlimited) instead of a flat 50.
--   7. services.image_path + a private 'service-images' bucket (JPG / PNG /
--      WEBP, 2 MB, path <business_id>/<file>, owner only). Counts toward
--      the storage limit.
--   8. business_line_settings: per business line, the invoice currency,
--      tax (e.g. HST 13%) and default days until due. Owner only.
--   9. invoices.currency / tax_label / tax_rate: kept on each invoice so
--      it prints the same later. Empty currency = the business currency.
--  10. share_links: a long random token per invoice/quote or document, so
--      a customer can open it without a login (/i/<token>, /d/<token>).
--      Owners manage their links (revoke = set revoked_at). The public
--      reads go ONLY through shared_invoice(token) / shared_document(token),
--      SECURITY DEFINER, which return that one document and nothing else.
--  11. message_templates: the user's own quick templates, and their changes
--      to the built-in ones (the built-ins live in src/lib/templates.ts, in
--      English and French, so every account starts with them). Owner only.
--  12. Calendar: activities may also be 'reminder' or 'block' (personal /
--      blocked time, which the public booking page will respect later);
--      activities.ends_at (end of a meeting / block) and activities.done_at
--      (Mark done).
--
-- Who the limits apply to: every request made with a user's session
-- (the browser, server actions, the public lead form). Requests made
-- with the service role (the agent API, Stripe webhook, "Add to
-- customers") and SQL-editor imports skip the triggers; the agent API
-- checks the same limits in code (src/lib/plan-limits.ts).
--
-- What does NOT change (all 0011-0016 protections kept):
--   - protect_business_billing trigger, businesses_plan_check
--   - ai_usage read-only for users, consume_ai_credit()
--   - guard_public_lead / guard_public_lead_line triggers and the public
--     lead insert policy (they run first: triggers fire in name order and
--     leads_guard_* sorts before leads_plan_*)
--   - receipts + client-docs bucket limits and their permissive policies
--     (the new storage policy is RESTRICTIVE: it can only say no more often)
--   - email_usage read-only for users; consume_email_send keeps the owner
--     check, the row lock and the grants
--   - api_keys / agent_audit tables, policies and grants
--   Nothing in this file drops or replaces any of those, except
--   consume_email_send(), which is replaced with the same safety checks.

-- ============================================================
-- 1. Profile: theme + welcome tour
-- ============================================================
alter table public.profiles add column if not exists theme text;
alter table public.profiles add column if not exists tour_done_at timestamptz;

alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles add constraint profiles_theme_check
  check (theme is null or theme in ('clean', 'dark', 'neon', 'retro'));

-- ============================================================
-- 2. The owner's unlimited businesses
-- ============================================================
create table if not exists public.plan_unlimited_businesses (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.plan_unlimited_businesses enable row level security;
-- No policies on purpose: nobody signed in can read or write it.
revoke all on public.plan_unlimited_businesses from anon, authenticated;

-- ============================================================
-- 3. Invoice/quote creation log (for the rolling 28 days)
-- ============================================================
create table if not exists public.plan_usage_events (
  id bigint generated by default as identity primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('invoice')),
  created_at timestamptz not null default now()
);

create index if not exists plan_usage_events_business_idx
  on public.plan_usage_events (business_id, kind, created_at desc);

alter table public.plan_usage_events enable row level security;

drop policy if exists "Owners view own plan usage" on public.plan_usage_events;
create policy "Owners view own plan usage"
  on public.plan_usage_events for select
  to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
  );

revoke all on public.plan_usage_events from anon;
revoke insert, update, delete on public.plan_usage_events from authenticated;
grant select on public.plan_usage_events to authenticated;

-- ============================================================
-- 4. Helpers
-- ============================================================

-- True when this request comes from a user session (browser / server
-- action with the user's cookie / public page visitor). False for the
-- service role and for the SQL editor.
create or replace function public.plan_limits_apply()
returns boolean
language sql
stable
set search_path = ''
as $$
  select session_user = 'authenticator'
     and coalesce(auth.role(), '') <> 'service_role'
$$;

-- The limits of one business, no access check. Internal: only the
-- functions below (running as their owner) call it.
-- null = unlimited.
create or replace function public.plan_limits_internal(p_business uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan text;
begin
  select coalesce(b.plan, 'free') into v_plan
  from public.businesses b
  where b.id = p_business;

  if exists (
    select 1 from public.plan_unlimited_businesses u
    where u.business_id = p_business
  ) then
    return jsonb_build_object(
      'plan', coalesce(v_plan, 'free'), 'unlimited', true,
      'contacts', null, 'docs_28d', null, 'storage_bytes', null,
      'email_daily', null, 'business_lines', null
    );
  end if;

  return case coalesce(v_plan, 'free')
    when 'pro' then jsonb_build_object(
      'plan', 'pro', 'unlimited', false,
      'contacts', null, 'docs_28d', null, 'storage_bytes', 10737418240,
      'email_daily', 200, 'business_lines', null)
    when 'premium' then jsonb_build_object(
      'plan', 'premium', 'unlimited', false,
      'contacts', 150, 'docs_28d', 50, 'storage_bytes', 1073741824,
      'email_daily', 50, 'business_lines', 3)
    else jsonb_build_object(
      'plan', 'free', 'unlimited', false,
      'contacts', 10, 'docs_28d', 5, 'storage_bytes', 52428800,
      'email_daily', 0, 'business_lines', 1)
  end;
end;
$$;

revoke all on function public.plan_limits_internal(uuid) from public, anon, authenticated;

-- Bytes used in client-docs (<business>/...) and receipts (<owner>/...).
create or replace function public.plan_storage_used(p_business uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_bytes bigint;
begin
  select b.owner_id into v_owner from public.businesses b where b.id = p_business;
  select coalesce(sum(coalesce((o.metadata ->> 'size')::bigint, 0)), 0) into v_bytes
  from storage.objects o
  where (o.bucket_id in ('client-docs', 'service-images') and o.name like p_business::text || '/%')
     or (v_owner is not null and o.bucket_id = 'receipts'
         and o.name like v_owner::text || '/%');
  return v_bytes;
end;
$$;

revoke all on function public.plan_storage_used(uuid) from public, anon, authenticated;

-- Distinct business lines in use (customers, leads, services, tasks, invoices).
create or replace function public.plan_lines_used(p_business uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct lower(x.line))::int from (
    select business_line as line from public.customers where business_id = p_business and business_line is not null
    union all
    select business_line from public.leads where business_id = p_business and business_line is not null
    union all
    select business_line from public.services where business_id = p_business and business_line is not null
    union all
    select business_line from public.tasks where business_id = p_business and business_line is not null
    union all
    select business_line from public.invoices where business_id = p_business and business_line is not null
  ) x
$$;

revoke all on function public.plan_lines_used(uuid) from public, anon, authenticated;

-- Caller may look at this business: its owner, the server, or the SQL editor.
create or replace function public.plan_can_see(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.plan_limits_apply()
      or exists (
        select 1 from public.businesses b
        where b.id = p_business and b.owner_id = auth.uid()
      )
$$;

revoke all on function public.plan_can_see(uuid) from public, anon, authenticated;

-- Public: the limits of a business you own.
create or replace function public.plan_limits(p_business uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.plan_can_see(p_business) then
    raise exception 'not your business' using errcode = '42501';
  end if;
  return public.plan_limits_internal(p_business);
end;
$$;

revoke all on function public.plan_limits(uuid) from public, anon;
grant execute on function public.plan_limits(uuid) to authenticated, service_role;

-- Public: what a business you own has used, plus its limits.
create or replace function public.plan_usage(p_business uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_contacts int;
  v_docs int;
  v_email int;
begin
  if not public.plan_can_see(p_business) then
    raise exception 'not your business' using errcode = '42501';
  end if;

  select
    (select count(*) from public.customers c where c.business_id = p_business)
    + (select count(*) from public.leads l
       where l.business_id = p_business and l.status is distinct from 'converted')
  into v_contacts;

  select count(*) into v_docs
  from public.plan_usage_events e
  where e.business_id = p_business
    and e.kind = 'invoice'
    and e.created_at > now() - interval '28 days';

  select coalesce(max(u.count), 0) into v_email
  from public.email_usage u
  where u.business_id = p_business
    and u.day = to_char(now() at time zone 'utc', 'YYYY-MM-DD');

  return jsonb_build_object(
    'limits', public.plan_limits_internal(p_business),
    'contacts', v_contacts,
    'docs_28d', v_docs,
    'storage_bytes', public.plan_storage_used(p_business),
    'email_today', v_email,
    'business_lines', public.plan_lines_used(p_business)
  );
end;
$$;

revoke all on function public.plan_usage(uuid) from public, anon;
grant execute on function public.plan_usage(uuid) to authenticated, service_role;

-- ============================================================
-- 5a. Customers + open leads
--     Errors look like "plan_limit:contacts:10" so the app can show a
--     friendly message with an Upgrade button.
-- ============================================================
create or replace function public.enforce_plan_contacts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit int;
  v_used  int;
begin
  if not public.plan_limits_apply() then
    return new;
  end if;

  v_limit := (public.plan_limits_internal(new.business_id) ->> 'contacts')::int;

  if tg_table_name = 'leads' then
    if tg_op = 'UPDATE' then
      if new.status is not distinct from old.status then
        return new;
      end if;
      -- open -> open: no change in the count
      if old.status is distinct from 'converted' and new.status is distinct from 'converted' then
        return new;
      end if;
    end if;

    -- A converted lead stops counting, so it may only become "converted"
    -- once it really is a customer (same name). Stops freeing slots by
    -- marking leads converted.
    if new.status = 'converted' then
      if v_limit is null then
        return new;
      end if;
      if not exists (
        select 1 from public.customers c
        where c.business_id = new.business_id
          and lower(c.name) = lower(new.name)
      ) then
        raise exception 'plan_limit:convert' using errcode = 'P0001';
      end if;
      return new;
    end if;
    -- insert of an open lead, or converted -> open: counts again
  end if;

  if v_limit is null then
    return new;
  end if;

  -- One writer at a time per business, so two tabs can't both take the
  -- last slot.
  perform pg_advisory_xact_lock(hashtextextended('plan_contacts:' || new.business_id::text, 0));

  select
    (select count(*) from public.customers c where c.business_id = new.business_id)
    + (select count(*) from public.leads l
       where l.business_id = new.business_id and l.status is distinct from 'converted')
  into v_used;

  if v_used >= v_limit then
    raise exception 'plan_limit:contacts:%', v_limit using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists customers_plan_contacts on public.customers;
create trigger customers_plan_contacts
  before insert on public.customers
  for each row execute function public.enforce_plan_contacts();

drop trigger if exists leads_plan_contacts on public.leads;
create trigger leads_plan_contacts
  before insert or update of status on public.leads
  for each row execute function public.enforce_plan_contacts();

-- ============================================================
-- 5b. Invoices + quotes per rolling 28 days
-- ============================================================
create or replace function public.enforce_plan_docs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit int;
  v_used  int;
begin
  if not public.plan_limits_apply() then
    return new;
  end if;

  v_limit := (public.plan_limits_internal(new.business_id) ->> 'docs_28d')::int;

  if v_limit is not null then
    perform pg_advisory_xact_lock(hashtextextended('plan_docs:' || new.business_id::text, 0));

    select count(*) into v_used
    from public.plan_usage_events e
    where e.business_id = new.business_id
      and e.kind = 'invoice'
      and e.created_at > now() - interval '28 days';

    if v_used >= v_limit then
      raise exception 'plan_limit:docs:%', v_limit using errcode = 'P0001';
    end if;
  end if;

  -- Rolled back together with the invoice if the insert fails.
  insert into public.plan_usage_events (business_id, kind)
  values (new.business_id, 'invoice');

  return new;
end;
$$;

drop trigger if exists invoices_plan_docs on public.invoices;
create trigger invoices_plan_docs
  before insert on public.invoices
  for each row execute function public.enforce_plan_docs();

-- ============================================================
-- 5c. Business lines
-- ============================================================
create or replace function public.enforce_plan_lines()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit int;
  v_line  text;
begin
  if not public.plan_limits_apply() or new.business_line is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.business_line is not distinct from old.business_line then
    return new;
  end if;

  v_limit := (public.plan_limits_internal(new.business_id) ->> 'business_lines')::int;
  if v_limit is null then
    return new;
  end if;

  v_line := lower(new.business_line);

  -- A line already in use is always fine.
  if exists (select 1 from public.customers where business_id = new.business_id and lower(business_line) = v_line)
     or exists (select 1 from public.leads where business_id = new.business_id and lower(business_line) = v_line)
     or exists (select 1 from public.services where business_id = new.business_id and lower(business_line) = v_line)
     or exists (select 1 from public.tasks where business_id = new.business_id and lower(business_line) = v_line)
     or exists (select 1 from public.invoices where business_id = new.business_id and lower(business_line) = v_line)
  then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('plan_lines:' || new.business_id::text, 0));

  if public.plan_lines_used(new.business_id) >= v_limit then
    raise exception 'plan_limit:lines:%', v_limit using errcode = 'P0001';
  end if;

  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['customers', 'leads', 'services', 'tasks', 'invoices'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_plan_lines', t);
    execute format(
      'create trigger %I before insert or update of business_line on public.%I '
      'for each row execute function public.enforce_plan_lines()',
      t || '_plan_lines', t
    );
  end loop;
end;
$$;

-- ============================================================
-- 5d. Storage (client-docs + receipts)
-- ============================================================

-- documents rows: the file is uploaded first, so the total already
-- includes it. Over the limit -> the row is refused and the app deletes
-- the file.
create or replace function public.enforce_plan_storage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit bigint;
begin
  if not public.plan_limits_apply() then
    return new;
  end if;
  v_limit := (public.plan_limits_internal(new.business_id) ->> 'storage_bytes')::bigint;
  if v_limit is null then
    return new;
  end if;
  if public.plan_storage_used(new.business_id) > v_limit then
    raise exception 'plan_limit:storage:%', v_limit using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists documents_plan_storage on public.documents;
create trigger documents_plan_storage
  before insert on public.documents
  for each row execute function public.enforce_plan_storage();

-- ============================================================
-- 5e. Service pictures
-- ============================================================
alter table public.services add column if not exists image_path text;
alter table public.services drop constraint if exists services_image_path_len;
alter table public.services add constraint services_image_path_len
  check (image_path is null or (char_length(image_path) <= 600
         and image_path like business_id::text || '/%'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-images', 'service-images', false, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Owner only: the first folder of the path is the business id.
drop policy if exists "Owners manage own service images" on storage.objects;
create policy "Owners manage own service images"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'service-images'
    and exists (
      select 1 from public.businesses b
      where b.id::text = (storage.foldername(objects.name))[1]
        and b.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'service-images'
    and exists (
      select 1 from public.businesses b
      where b.id::text = (storage.foldername(objects.name))[1]
        and b.owner_id = auth.uid()
    )
  );

-- Direct uploads: no new file once the business is at its limit. (The
-- size of a new file isn't known yet when this runs, so one last file of
-- up to 10 MB can go over.)
create or replace function public.plan_storage_upload_ok(p_bucket text, p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_first    text;
  v_business uuid;
  v_limit    bigint;
begin
  if p_bucket not in ('client-docs', 'receipts', 'service-images') then
    return true;
  end if;

  v_first := split_part(coalesce(p_name, ''), '/', 1);
  if v_first !~ '^[0-9a-fA-F-]{36}$' then
    return true; -- not a path the other policies accept anyway
  end if;

  if p_bucket in ('client-docs', 'service-images') then
    v_business := v_first::uuid;
  else
    select b.id into v_business
    from public.businesses b
    where b.owner_id = v_first::uuid
    order by b.created_at
    limit 1;
  end if;

  if v_business is null then
    return true;
  end if;

  v_limit := (public.plan_limits_internal(v_business) ->> 'storage_bytes')::bigint;
  if v_limit is null then
    return true;
  end if;

  return public.plan_storage_used(v_business) < v_limit;
end;
$$;

revoke all on function public.plan_storage_upload_ok(text, text) from public, anon;
grant execute on function public.plan_storage_upload_ok(text, text) to authenticated;

drop policy if exists "Plan storage limit" on storage.objects;
create policy "Plan storage limit"
  on storage.objects
  as restrictive
  for insert
  to authenticated
  with check (public.plan_storage_upload_ok(bucket_id, name));

-- ============================================================
-- 6. In-app email: the plan's daily number
--    Same safety as 0015: SECURITY DEFINER, empty search_path, owner
--    check, UPDATE row lock, users can only read email_usage.
--    Returns {"allowed": bool, "used": int, "limit": int | null}.
-- ============================================================
create or replace function public.consume_email_send(p_business uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_limit int;
  v_day   text := to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  v_count int;
begin
  perform 1
  from public.businesses b
  where b.id = p_business and b.owner_id = auth.uid();

  if not found then
    raise exception 'not your business' using errcode = '42501';
  end if;

  v_limit := (public.plan_limits_internal(p_business) ->> 'email_daily')::int;

  if v_limit is not null and v_limit <= 0 then
    return jsonb_build_object('allowed', false, 'used', 0, 'limit', 0);
  end if;

  insert into public.email_usage (business_id, day, count)
  values (p_business, v_day, 0)
  on conflict (business_id, day) do nothing;

  -- The UPDATE row lock makes concurrent sends queue up.
  update public.email_usage u
  set count = u.count + 1
  where u.business_id = p_business
    and u.day = v_day
    and (v_limit is null or u.count < v_limit)
  returning u.count into v_count;

  if v_count is null then
    select u.count into v_count
    from public.email_usage u
    where u.business_id = p_business and u.day = v_day;
    return jsonb_build_object('allowed', false, 'used', coalesce(v_count, 0), 'limit', v_limit);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_count, 'limit', v_limit);
end;
$$;

revoke all on function public.consume_email_send(uuid) from public, anon;
grant execute on function public.consume_email_send(uuid) to authenticated;

-- ============================================================
-- 7. Per business line: currency, tax, days until due
-- ============================================================
create table if not exists public.business_line_settings (
  business_id uuid not null references public.businesses (id) on delete cascade,
  line text not null check (char_length(line) between 1 and 60),
  currency text not null default 'USD'
    check (currency in ('USD', 'CAD', 'EUR', 'GBP', 'AUD', 'MXN', 'DOP')),
  tax_label text check (tax_label is null or char_length(tax_label) between 1 and 30),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate >= 0 and tax_rate <= 30),
  due_days int not null default 14 check (due_days between 0 and 120),
  updated_at timestamptz not null default now(),
  primary key (business_id, line)
);

alter table public.business_line_settings enable row level security;

drop policy if exists "Owners manage own line settings" on public.business_line_settings;
create policy "Owners manage own line settings"
  on public.business_line_settings for all
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
  );

revoke all on public.business_line_settings from anon;

-- ============================================================
-- 8. Invoice currency + tax
-- ============================================================
alter table public.invoices add column if not exists currency text;
alter table public.invoices add column if not exists tax_label text;
alter table public.invoices add column if not exists tax_rate numeric(5, 2) not null default 0;

alter table public.invoices drop constraint if exists invoices_currency_check;
alter table public.invoices add constraint invoices_currency_check
  check (currency is null or currency in ('USD', 'CAD', 'EUR', 'GBP', 'AUD', 'MXN', 'DOP'));
alter table public.invoices drop constraint if exists invoices_tax_check;
alter table public.invoices add constraint invoices_tax_check
  check (tax_rate >= 0 and tax_rate <= 30
         and (tax_label is null or char_length(tax_label) between 1 and 30));

-- ============================================================
-- 9. Share links (view an invoice / a file without a login)
-- ============================================================
create table if not exists public.share_links (
  token text primary key check (token ~ '^[A-Za-z0-9_-]{40,64}$'),
  business_id uuid not null references public.businesses (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((invoice_id is null) <> (document_id is null))
);

create index if not exists share_links_invoice_idx on public.share_links (invoice_id);
create index if not exists share_links_document_idx on public.share_links (document_id);

alter table public.share_links enable row level security;

drop policy if exists "Owners manage own share links" on public.share_links;
create policy "Owners manage own share links"
  on public.share_links for all
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
    and (invoice_id is null or exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.business_id = share_links.business_id
    ))
    and (document_id is null or exists (
      select 1 from public.documents d
      where d.id = document_id and d.business_id = share_links.business_id
    ))
  );

revoke all on public.share_links from anon;
revoke delete on public.share_links from authenticated;

-- A revoked link stays revoked.
create or replace function public.share_links_stay_revoked()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is not null then
    new.revoked_at := old.revoked_at;
  end if;
  new.token := old.token;
  new.business_id := old.business_id;
  new.invoice_id := old.invoice_id;
  new.document_id := old.document_id;
  return new;
end;
$$;

drop trigger if exists share_links_stay_revoked on public.share_links;
create trigger share_links_stay_revoked
  before update on public.share_links
  for each row execute function public.share_links_stay_revoked();

-- The invoice / quote behind a link, for the public view page.
create or replace function public.shared_invoice(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invoice uuid;
  v_result  jsonb;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{40,64}$' then
    return null;
  end if;

  select l.invoice_id into v_invoice
  from public.share_links l
  where l.token = p_token and l.revoked_at is null and l.invoice_id is not null;

  if v_invoice is null then
    return null;
  end if;

  select jsonb_build_object(
    'number', i.number,
    'doc_type', i.doc_type,
    'status', i.status,
    'issue_date', i.issue_date,
    'due_date', i.due_date,
    'notes', i.notes,
    'currency', coalesce(i.currency, b.currency),
    'tax_label', i.tax_label,
    'tax_rate', i.tax_rate,
    'business_name', b.name,
    'owner_name', p.full_name,
    'customer_name', c.name,
    'customer_company', c.company,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', it.description,
        'quantity', it.quantity,
        'unit_price', it.unit_price
      ) order by it.position)
      from public.invoice_items it
      where it.invoice_id = i.id
    ), '[]'::jsonb)
  ) into v_result
  from public.invoices i
  join public.businesses b on b.id = i.business_id
  left join public.profiles p on p.id = b.owner_id
  left join public.customers c on c.id = i.customer_id
  where i.id = v_invoice;

  return v_result;
end;
$$;

revoke all on function public.shared_invoice(text) from public;
grant execute on function public.shared_invoice(text) to anon, authenticated;

-- The file behind a link. The server turns the path into a 60-second
-- download link with the service role.
create or replace function public.shared_document(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('path', d.path, 'name', d.name, 'mime', d.mime)
  from public.share_links l
  join public.documents d on d.id = l.document_id
  where p_token ~ '^[A-Za-z0-9_-]{40,64}$'
    and l.token = p_token
    and l.revoked_at is null
$$;

revoke all on function public.shared_document(text) from public;
grant execute on function public.shared_document(text) to anon, authenticated;

-- ============================================================
-- 10. Quick templates
-- ============================================================
create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_-]{1,60}$'),
  lang text not null default 'en' check (lang in ('en', 'fr')),
  name text not null check (char_length(name) between 1 and 60),
  subject text not null default '' check (char_length(subject) <= 200),
  body text not null default '' check (char_length(body) <= 5000),
  updated_at timestamptz not null default now(),
  unique (business_id, key, lang)
);

alter table public.message_templates enable row level security;

drop policy if exists "Owners manage own templates" on public.message_templates;
create policy "Owners manage own templates"
  on public.message_templates for all
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
  );

revoke all on public.message_templates from anon;

-- ============================================================
-- 11. Calendar entries: reminders, blocked time, end time, done
--     (0014 created the kind check inline; Postgres named it
--     activities_kind_check. Drop every check on activities that mentions
--     kind, then add the wider one.)
-- ============================================================
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.activities'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%kind%'
  loop
    execute format('alter table public.activities drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.activities
  add constraint activities_kind_check
  check (kind in ('email_sent', 'email_reply', 'call', 'meeting', 'note', 'file',
                  'invoice', 'task', 'reminder', 'block'));

alter table public.activities add column if not exists ends_at timestamptz;
alter table public.activities add column if not exists done_at timestamptz;

alter table public.activities drop constraint if exists activities_ends_after_start;
alter table public.activities add constraint activities_ends_after_start
  check (ends_at is null or ends_at > occurred_at);

create index if not exists activities_business_kind_time_idx
  on public.activities (business_id, kind, occurred_at);
