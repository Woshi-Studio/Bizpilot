-- Jephelen Phase 2F (F0 + F1): Lead Finder + Contact Finder, invite-only MVP
-- Run AFTER 0018_booking.sql.
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to run more than once.
--
-- Small / safe mode (the owner's ruling, 2026-09-27):
--   - targeted per-request lookups only (one company per search);
--   - phone + website + contact-form link are the main result;
--   - emails only when the business publishes them on its own site
--     (format + mail-server checks, never SMTP probing);
--   - no bulk sending.
--
-- What changes:
--   1. leads: channel may also be 'finder'; + finder_result_id, verified_at.
--   2. User tables (the owner sees their own rows):
--        finder_profiles      the intake ("what are you hunting"), owner
--                             reads/writes; the Acceptable Use version is
--                             required and its time is set by the database
--        finder_jobs          read only for users
--        finder_job_items     read only for users
--        finder_results       read only for users; locked results hold no
--                             contact values at all
--        finder_credit_ledger read only for users; rows are only ever added
--        finder_bounce_reports read only for users
--        finder_audit         read only for users
--   3. Server-only tables (RLS on, no policies, no grants):
--        kb_companies, kb_contacts  the shared knowledge base: only what the
--                             worker found on public sources, always with a
--                             source link. Never what users upload.
--        finder_exclusives, kb_suppression, data_removal_requests,
--        finder_workers (worker keys: HMAC hash only, with AGENT_KEY_PEPPER)
--   4. SECURITY DEFINER functions, empty search_path:
--        service role only: finder_submit (F1: 'single' only),
--          finder_beta_grant, finder_worker_claim / _heartbeat / _complete /
--          _lookup, removal_request_create, removal_request_verify
--        signed-in owner (checked inside): finder_pick, finder_unlock,
--          finder_add_to_lead, finder_report_bounce, finder_credits
--
-- Credits (keep in sync with src/lib/finder-credits.ts):
--   balance = sum(delta). A search the knowledge base can answer spends 1.
--   A search that needs research holds 1 (-1 'hold'); when it ends the hold
--   comes back (+1 'release') and, if something was found, 1 is spent
--   (-1 'spend'). Not found = free. The owner's businesses
--   (plan_unlimited_businesses, or the server says so) write no credit rows.
--   Refunds for a bounce / wrong number: within 30 days, automatic while
--   refunds stay within 20% of the credits used in the last 90 days;
--   above that the report waits for the owner's review.
--
-- What does NOT change (all 0011-0018 protections kept):
--   - protect_business_billing, businesses_plan_check, plan values
--     (no 'finder' plan in F1), plan_limits_internal()
--   - every 0017 plan trigger (a lead added from the Finder counts toward
--     the plan's contact limit, because finder_add_to_lead runs with the
--     user's session)
--   - guard_public_lead and the public lead insert policy (visitors still
--     can only insert channel 'inbound')
--   - api_keys / agent_audit, email_usage, ai_usage, share_links, storage
--     policies, booking tables and functions
--   The only replaced object is the leads channel check (one value added).

-- ============================================================
-- 1. Leads: 'finder' channel + where the lead came from
-- ============================================================
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.leads'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%channel%'
  loop
    execute format('alter table public.leads drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.leads
  add constraint leads_channel_check
  check (channel in ('email', 'upwork', 'linkedin', 'freelancer', 'referral', 'inbound', 'other', 'finder'));

alter table public.leads add column if not exists finder_result_id uuid;
alter table public.leads add column if not exists verified_at timestamptz;

-- ============================================================
-- 2. Worker keys (Zilla on the owner's PC). Server only.
-- ============================================================
create table if not exists public.finder_workers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  key_prefix text not null check (char_length(key_prefix) = 8),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists finder_workers_key_hash_idx on public.finder_workers (key_hash);

alter table public.finder_workers enable row level security;
revoke all on public.finder_workers from anon, authenticated;

-- ============================================================
-- 3. The shared knowledge base. Server only.
-- ============================================================
create table if not exists public.kb_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  name_norm text not null check (char_length(name_norm) <= 200),
  domain text check (domain is null or (char_length(domain) <= 253 and domain ~ '^[a-z0-9.-]+$')),
  website text check (website is null or (char_length(website) <= 300 and website ~* '^https?://')),
  city text check (city is null or char_length(city) <= 120),
  city_norm text check (city_norm is null or char_length(city_norm) <= 120),
  region text check (region is null or char_length(region) <= 60),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  address text check (address is null or char_length(address) <= 300),
  phone_norm text check (phone_norm is null or phone_norm ~ '^[0-9]{4,20}$'),
  osm_ref text check (osm_ref is null or osm_ref ~ '^(node|way|relation)/[0-9]{1,20}$'),
  -- Fields that came from OpenStreetMap (ODbL share-alike): tagged, so they
  -- can be treated separately.
  osm_fields text[] not null default '{}',
  source_url text not null check (char_length(source_url) <= 500 and source_url ~* '^https?://'),
  licence text not null default 'own-site' check (licence in ('own-site', 'odbl', 'open-gov')),
  no_solicitation boolean not null default false,
  quality smallint not null default 50 check (quality between 0 and 100),
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists kb_companies_domain_idx on public.kb_companies (domain) where domain is not null;
create index if not exists kb_companies_name_city_idx on public.kb_companies (name_norm, city_norm);

create table if not exists public.kb_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.kb_companies (id) on delete cascade,
  kind text not null check (kind in ('email', 'phone', 'contact_form')),
  value text not null check (char_length(value) between 1 and 320),
  value_norm text not null check (char_length(value_norm) between 1 and 320),
  source_url text not null check (char_length(source_url) <= 500 and source_url ~* '^https?://'),
  licence text not null default 'own-site' check (licence in ('own-site', 'odbl', 'open-gov')),
  checks jsonb not null default '{}'::jsonb,
  quality smallint not null default 50 check (quality between 0 and 100),
  role_address boolean not null default false,
  osm_derived boolean not null default false,
  bad_reports int not null default 0 check (bad_reports >= 0),
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (company_id, kind, value_norm)
);

create index if not exists kb_contacts_value_idx on public.kb_contacts (kind, value_norm);

-- Removal requests become rows here; the worker and every delivery skip them.
create table if not exists public.kb_suppression (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('email', 'domain', 'phone', 'company')),
  value_norm text not null check (char_length(value_norm) between 1 and 320),
  request_id uuid,
  created_at timestamptz not null default now(),
  unique (kind, value_norm)
);

create table if not exists public.data_removal_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 3 and 254),
  company text check (company is null or char_length(company) <= 200),
  website text check (website is null or char_length(website) <= 300),
  phone text check (phone is null or char_length(phone) <= 50),
  details text check (details is null or char_length(details) <= 1000),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'done', 'expired', 'rejected')),
  removed_companies int not null default 0,
  removed_contacts int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '72 hours',
  verified_at timestamptz,
  done_at timestamptz
);

create unique index if not exists data_removal_requests_token_idx on public.data_removal_requests (token_hash);
create index if not exists data_removal_requests_ip_idx on public.data_removal_requests (ip_hash, created_at);
create index if not exists data_removal_requests_email_idx on public.data_removal_requests (lower(email), created_at);

-- City exclusivity for Boss (F5). Created now so the schema is complete.
create table if not exists public.finder_exclusives (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kb_company_id uuid references public.kb_companies (id) on delete cascade,
  city_norm text check (city_norm is null or char_length(city_norm) <= 120),
  category text check (category is null or char_length(category) <= 60),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null default now() + interval '90 days',
  created_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['kb_companies', 'kb_contacts', 'kb_suppression',
                           'data_removal_requests', 'finder_exclusives'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- ============================================================
-- 4. User tables
-- ============================================================

-- 4a. The intake form
create table if not exists public.finder_profiles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null default 'My hunt' check (char_length(name) between 1 and 60),
  my_business text not null check (char_length(my_business) between 1 and 200),
  offer text not null check (char_length(offer) between 1 and 500),
  target text not null default '' check (char_length(target) <= 500),
  industries text[] not null default '{}' check (cardinality(industries) <= 12),
  company_sizes text[] not null default '{}'
    check (company_sizes <@ array['solo', '2-10', '11-50', '51-200', '200+']::text[]),
  place text check (place is null or char_length(place) <= 120),
  radius_km int check (radius_km is null or radius_km in (5, 15, 50)),
  province text check (province is null or char_length(province) <= 60),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  needs text[] not null default '{}'
    check (needs <@ array['email', 'phone', 'decision_maker', 'website', 'address']::text[]),
  exclude text not null default '' check (char_length(exclude) <= 1000),
  aup_version text not null check (char_length(aup_version) between 1 and 20),
  aup_accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists finder_profiles_business_idx on public.finder_profiles (business_id, updated_at desc);

alter table public.finder_profiles enable row level security;

drop policy if exists "Owners manage own finder profiles" on public.finder_profiles;
create policy "Owners manage own finder profiles"
  on public.finder_profiles for all
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

revoke all on public.finder_profiles from anon;

-- The Acceptable Use time is the database's clock, not the browser's. It
-- only moves when the accepted version changes.
create or replace function public.finder_profiles_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.aup_accepted_at := now();
    new.created_at := now();
  else
    new.business_id := old.business_id;
    new.created_at := old.created_at;
    if new.aup_version is distinct from old.aup_version then
      new.aup_accepted_at := now();
    else
      new.aup_accepted_at := old.aup_accepted_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists finder_profiles_stamp on public.finder_profiles;
create trigger finder_profiles_stamp
  before insert or update on public.finder_profiles
  for each row execute function public.finder_profiles_stamp();

-- 4b. Jobs and their items
create table if not exists public.finder_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  profile_id uuid references public.finder_profiles (id) on delete set null,
  kind text not null default 'single' check (kind in ('single', 'list', 'pack')),
  status text not null default 'queued'
    check (status in ('queued', 'working', 'partial', 'done', 'late', 'failed', 'cancelled')),
  -- The intake as it was when the job was made
  intake jsonb not null default '{}'::jsonb,
  unlimited boolean not null default false,
  items_total int not null default 0 check (items_total >= 0),
  items_done int not null default 0 check (items_done >= 0),
  credits_held int not null default 0 check (credits_held >= 0),
  credits_spent int not null default 0 check (credits_spent >= 0),
  due_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists finder_jobs_business_idx on public.finder_jobs (business_id, created_at desc);

create table if not exists public.finder_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.finder_jobs (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  company text not null check (char_length(company) between 1 and 200),
  city text check (city is null or char_length(city) <= 120),
  website text check (website is null or char_length(website) <= 300),
  region text check (region is null or char_length(region) <= 60),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  status text not null default 'queued'
    check (status in ('queued', 'working', 'found', 'not_found', 'ambiguous', 'failed', 'cancelled')),
  -- true while one credit is held for this item
  held boolean not null default false,
  candidates jsonb,
  worker_id uuid references public.finder_workers (id) on delete set null,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  attempts int not null default 0 check (attempts >= 0),
  result_id uuid,
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists finder_job_items_queue_idx on public.finder_job_items (status, created_at);
create index if not exists finder_job_items_job_idx on public.finder_job_items (job_id);
create index if not exists finder_job_items_business_idx on public.finder_job_items (business_id, created_at desc);

-- 4c. What the user gets
create table if not exists public.finder_results (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  job_id uuid references public.finder_jobs (id) on delete set null,
  item_id uuid references public.finder_job_items (id) on delete set null,
  kb_company_id uuid references public.kb_companies (id) on delete set null,
  company_name text not null check (char_length(company_name) between 1 and 200),
  website text check (website is null or char_length(website) <= 300),
  city text check (city is null or char_length(city) <= 120),
  region text check (region is null or char_length(region) <= 60),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  address text check (address is null or char_length(address) <= 300),
  phone text check (phone is null or char_length(phone) <= 50),
  phone_checks jsonb,
  email text check (email is null or char_length(email) <= 254),
  email_checks jsonb,
  contact_form_url text check (contact_form_url is null or char_length(contact_form_url) <= 500),
  source_urls text[] not null default '{}' check (cardinality(source_urls) <= 10),
  why text check (why is null or char_length(why) <= 500),
  locked boolean not null default false,
  last_checked_at timestamptz not null default now(),
  lead_id uuid references public.leads (id) on delete set null,
  added_at timestamptz,
  created_at timestamptz not null default now(),
  -- A locked result holds no contact values at all.
  constraint finder_results_locked_empty check (
    not locked or (phone is null and email is null and contact_form_url is null
                   and phone_checks is null and email_checks is null)
  )
);

create index if not exists finder_results_business_idx on public.finder_results (business_id, created_at desc);

-- leads.finder_result_id -> finder_results (added once both tables exist)
alter table public.leads drop constraint if exists leads_finder_result_fk;
alter table public.leads add constraint leads_finder_result_fk
  foreign key (finder_result_id) references public.finder_results (id) on delete set null;

-- 4d. Credits: rows are only ever added
create table if not exists public.finder_credit_ledger (
  id bigint generated by default as identity primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  delta int not null check (delta between -100000 and 100000),
  reason text not null check (reason in ('grant', 'hold', 'release', 'spend', 'refund', 'unlock', 'adjust')),
  job_id uuid references public.finder_jobs (id) on delete set null,
  item_id uuid references public.finder_job_items (id) on delete set null,
  result_id uuid references public.finder_results (id) on delete set null,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists finder_credit_ledger_business_idx
  on public.finder_credit_ledger (business_id, created_at desc);

-- Nobody edits or deletes ledger rows. (The foreign keys above may still
-- set job/item/result ids to null when those rows go, and the rows go
-- with their business.)
create or replace function public.finder_ledger_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.businesses b where b.id = old.business_id) then
      raise exception 'the credit ledger is append-only' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.business_id is distinct from old.business_id
     or new.delta is distinct from old.delta
     or new.reason is distinct from old.reason
     or new.note is distinct from old.note
     or new.created_at is distinct from old.created_at
     or (new.job_id is distinct from old.job_id and new.job_id is not null)
     or (new.item_id is distinct from old.item_id and new.item_id is not null)
     or (new.result_id is distinct from old.result_id and new.result_id is not null)
  then
    raise exception 'the credit ledger is append-only' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists finder_ledger_append_only on public.finder_credit_ledger;
create trigger finder_ledger_append_only
  before update or delete on public.finder_credit_ledger
  for each row execute function public.finder_ledger_append_only();

-- 4e. Bounce / wrong-number reports
create table if not exists public.finder_bounce_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  result_id uuid not null references public.finder_results (id) on delete cascade,
  kind text not null check (kind in ('bounce', 'wrong_number', 'other')),
  note text check (note is null or char_length(note) <= 500),
  status text not null check (status in ('refunded', 'review', 'closed', 'rejected')),
  created_at timestamptz not null default now(),
  unique (result_id)
);

-- 4f. Audit
create table if not exists public.finder_audit (
  id bigint generated by default as identity primary key,
  business_id uuid references public.businesses (id) on delete cascade,
  worker_id uuid references public.finder_workers (id) on delete set null,
  actor text not null check (actor in ('user', 'worker', 'system', 'public')),
  action text not null check (char_length(action) between 1 and 60),
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists finder_audit_business_idx on public.finder_audit (business_id, created_at desc);
create index if not exists finder_audit_worker_idx on public.finder_audit (worker_id, created_at desc);

-- 4g. Read-only for the owner, nothing for anyone else
do $$
declare
  t text;
begin
  foreach t in array array['finder_jobs', 'finder_job_items', 'finder_results',
                           'finder_credit_ledger', 'finder_bounce_reports', 'finder_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'Owners view own ' || t, t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ('
      '  exists (select 1 from public.businesses b'
      '          where b.id = business_id and b.owner_id = auth.uid()))',
      'Owners view own ' || t, t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end;
$$;

-- ============================================================
-- 5. Helpers (internal: no grants to users)
--    Normalising must match src/lib/finder.ts and zilla\finder.py.
-- ============================================================
create or replace function public.finder_norm_company(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
           regexp_replace(
             replace(lower(coalesce(p, '')), '&', ' and '),
             '\m(inc|ltd|llc|corp|co|the|limited|incorporated)\M', ' ', 'g'),
           '[^a-z0-9]', '', 'g')
$$;

create or replace function public.finder_norm_domain(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
           regexp_replace(
             split_part(split_part(split_part(split_part(
               regexp_replace(lower(trim(coalesce(p, ''))), '^[a-z][a-z0-9+.-]*://', ''),
               '/', 1), '?', 1), '#', 1), ':', 1),
             '^www\.', ''),
           '')
$$;

create or replace function public.finder_norm_phone(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
           case
             when length(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g')) = 11
                  and left(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), 1) = '1'
               then substr(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), 2)
             else regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g')
           end,
           '')
$$;

create or replace function public.finder_norm_value(p_kind text, p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'email' then lower(trim(coalesce(p_value, '')))
    when 'phone' then coalesce(public.finder_norm_phone(p_value), '')
    else lower(trim(coalesce(p_value, '')))
  end
$$;

do $$
declare
  f text;
begin
  foreach f in array array['finder_norm_company(text)', 'finder_norm_domain(text)',
                           'finder_norm_phone(text)', 'finder_norm_value(text, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end;
$$;

-- Is this value on the removal list?
create or replace function public.finder_suppressed(p_kind text, p_value_norm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_value_norm, '') <> '' and exists (
    select 1 from public.kb_suppression s
    where s.kind = p_kind and s.value_norm = p_value_norm
  )
$$;

revoke all on function public.finder_suppressed(text, text) from public, anon, authenticated;

-- The caller is the owner of this business (or the server / SQL editor).
create or replace function public.finder_can_act(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or session_user <> 'authenticator'
      or exists (
        select 1 from public.businesses b
        where b.id = p_business and b.owner_id = auth.uid()
      )
$$;

revoke all on function public.finder_can_act(uuid) from public, anon, authenticated;

create or replace function public.finder_is_unlimited(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.plan_unlimited_businesses u where u.business_id = p_business
  )
$$;

revoke all on function public.finder_is_unlimited(uuid) from public, anon, authenticated;

create or replace function public.finder_balance(p_business uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(l.delta), 0)::int
  from public.finder_credit_ledger l
  where l.business_id = p_business
$$;

revoke all on function public.finder_balance(uuid) from public, anon, authenticated;

create or replace function public.finder_log(
  p_business uuid, p_worker uuid, p_actor text, p_action text, p_detail jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.finder_audit (business_id, worker_id, actor, action, detail)
  values (p_business, p_worker, p_actor, left(p_action, 60), p_detail)
$$;

revoke all on function public.finder_log(uuid, uuid, text, text, jsonb) from public, anon, authenticated;

-- A knowledge-base company can be served: checked in the last 180 days,
-- not on the removal list, at least one live contact.
create or replace function public.finder_kb_servable(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.kb_companies c
    where c.id = p_company
      and c.last_checked_at > now() - interval '180 days'
      and not public.finder_suppressed('domain', c.domain)
      and not public.finder_suppressed('company', c.name_norm)
      and exists (
        select 1 from public.kb_contacts k
        where k.company_id = c.id
          and k.bad_reports < 2
          and not public.finder_suppressed(k.kind, k.value_norm)
      )
  )
$$;

revoke all on function public.finder_kb_servable(uuid) from public, anon, authenticated;

-- Hand back the item's held credit and (when found) spend one. Keeps the
-- job's counters in step. Owner jobs (unlimited) write no rows.
create or replace function public.finder_settle(p_item uuid, p_found boolean, p_result uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.finder_job_items%rowtype;
  v_unlimited boolean;
begin
  select * into v_item from public.finder_job_items where id = p_item for update;
  if not found then
    return;
  end if;
  select j.unlimited into v_unlimited from public.finder_jobs j where j.id = v_item.job_id;

  if v_item.held then
    insert into public.finder_credit_ledger (business_id, delta, reason, job_id, item_id, note)
    values (v_item.business_id, 1, 'release', v_item.job_id, v_item.id, null);
    update public.finder_job_items set held = false where id = v_item.id;
    update public.finder_jobs
      set credits_held = greatest(credits_held - 1, 0), updated_at = now()
      where id = v_item.job_id;
  end if;

  if p_found and not coalesce(v_unlimited, false) then
    insert into public.finder_credit_ledger (business_id, delta, reason, job_id, item_id, result_id, note)
    values (v_item.business_id, -1, 'spend', v_item.job_id, v_item.id, p_result, null);
    update public.finder_jobs
      set credits_spent = credits_spent + 1, updated_at = now()
      where id = v_item.job_id;
  end if;
end;
$$;

revoke all on function public.finder_settle(uuid, boolean, uuid) from public, anon, authenticated;

-- Recount a job after one of its items changed.
create or replace function public.finder_job_refresh(p_job uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
  v_done int;
  v_found int;
  v_failed int;
  v_open int;
begin
  select count(*),
         count(*) filter (where status in ('found', 'not_found', 'failed', 'cancelled')),
         count(*) filter (where status = 'found'),
         count(*) filter (where status = 'failed'),
         count(*) filter (where status in ('queued', 'working', 'ambiguous'))
    into v_total, v_done, v_found, v_failed, v_open
  from public.finder_job_items where job_id = p_job;

  update public.finder_jobs j
  set items_total = v_total,
      items_done = v_done,
      status = case
        when v_open = 0 and v_failed = v_total and v_total > 0 then 'failed'
        when v_open = 0 then 'done'
        when v_done > 0 then 'partial'
        when exists (select 1 from public.finder_job_items i
                     where i.job_id = p_job and i.status = 'working') then 'working'
        else 'queued'
      end,
      finished_at = case when v_open = 0 then coalesce(j.finished_at, now()) else null end,
      updated_at = now()
  where j.id = p_job;
end;
$$;

revoke all on function public.finder_job_refresh(uuid) from public, anon, authenticated;

-- Build a result from the knowledge base (best contact of each kind).
create or replace function public.finder_deliver_kb(p_item uuid, p_company uuid, p_locked boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.finder_job_items%rowtype;
  v_c public.kb_companies%rowtype;
  v_phone record;
  v_email record;
  v_form record;
  v_result uuid;
  v_sources text[];
begin
  select * into v_item from public.finder_job_items where id = p_item;
  select * into v_c from public.kb_companies where id = p_company;
  if v_item.id is null or v_c.id is null then
    raise exception 'finder:not_found' using errcode = 'P0001';
  end if;

  select k.value, k.checks, k.source_url, k.last_checked_at into v_phone
  from public.kb_contacts k
  where k.company_id = v_c.id and k.kind = 'phone' and k.bad_reports < 2
    and not public.finder_suppressed('phone', k.value_norm)
  order by k.quality desc, k.last_checked_at desc limit 1;

  select k.value, k.checks, k.source_url, k.last_checked_at into v_email
  from public.kb_contacts k
  where k.company_id = v_c.id and k.kind = 'email' and k.bad_reports < 2
    and not public.finder_suppressed('email', k.value_norm)
  order by k.quality desc, k.role_address desc, k.last_checked_at desc limit 1;

  select k.value, k.source_url into v_form
  from public.kb_contacts k
  where k.company_id = v_c.id and k.kind = 'contact_form' and k.bad_reports < 2
    and not public.finder_suppressed('contact_form', k.value_norm)
  order by k.last_checked_at desc limit 1;

  select array_agg(distinct s) into v_sources
  from unnest(array[v_c.source_url, v_phone.source_url, v_email.source_url, v_form.source_url]) s
  where s is not null;

  insert into public.finder_results (
    business_id, job_id, item_id, kb_company_id, company_name, website, city, region, country,
    address, phone, phone_checks, email, email_checks, contact_form_url, source_urls, why,
    locked, last_checked_at
  ) values (
    v_item.business_id, v_item.job_id, v_item.id, v_c.id, v_c.name, v_c.website,
    v_c.city, v_c.region, v_c.country, v_c.address,
    case when p_locked then null else v_phone.value end,
    case when p_locked then null else v_phone.checks end,
    case when p_locked then null else v_email.value end,
    case when p_locked then null else v_email.checks end,
    case when p_locked then null else v_form.value end,
    coalesce(v_sources[1:10], '{}'),
    'From our records (checked ' || to_char(v_c.last_checked_at, 'YYYY-MM-DD') || ')',
    p_locked, v_c.last_checked_at
  ) returning id into v_result;

  update public.finder_job_items
    set status = 'found', result_id = v_result, candidates = null, updated_at = now()
    where id = v_item.id;
  return v_result;
end;
$$;

revoke all on function public.finder_deliver_kb(uuid, uuid, boolean) from public, anon, authenticated;

-- ============================================================
-- 6. Submitting a search (server only: the app checks the session,
--    the invite list and the Acceptable Use first)
--    Errors: finder:no_profile, finder:bad_input, finder:no_credits,
--            finder:rate, finder:kind
--    Returns {status: 'found'|'pick'|'queued', job_id, item_id,
--             result_id?, candidates?}
-- ============================================================
create or replace function public.finder_submit(
  p_business uuid,
  p_profile uuid,
  p_kind text,
  p_company text,
  p_city text,
  p_website text,
  p_region text,
  p_country text,
  p_unlimited boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.finder_profiles%rowtype;
  v_unlimited boolean;
  v_company text := nullif(trim(regexp_replace(coalesce(p_company, ''), '\s+', ' ', 'g')), '');
  v_city text := nullif(trim(coalesce(p_city, '')), '');
  v_website text := nullif(trim(coalesce(p_website, '')), '');
  v_region text := nullif(trim(coalesce(p_region, '')), '');
  v_country text := nullif(upper(trim(coalesce(p_country, ''))), '');
  v_domain text;
  v_job uuid;
  v_item uuid;
  v_result uuid;
  v_matches uuid[];
  v_candidates jsonb;
  v_recent int;
begin
  if coalesce(p_kind, '') <> 'single' then
    raise exception 'finder:kind' using errcode = 'P0001';
  end if;
  if v_company is null or char_length(v_company) > 200
     or char_length(coalesce(v_city, '')) > 120
     or char_length(coalesce(v_website, '')) > 300
     or char_length(coalesce(v_region, '')) > 60
     or (v_country is not null and v_country !~ '^[A-Z]{2}$')
     or (v_website is not null and v_website !~* '^(https?://)?[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]+)?(/[^\s]*)?$')
  then
    raise exception 'finder:bad_input' using errcode = 'P0001';
  end if;

  select * into v_profile
  from public.finder_profiles p
  where p.id = p_profile and p.business_id = p_business;
  if v_profile.id is null or v_profile.aup_version is null then
    raise exception 'finder:no_profile' using errcode = 'P0001';
  end if;

  v_unlimited := coalesce(p_unlimited, false) or public.finder_is_unlimited(p_business);

  -- One search at a time per business, so two tabs can't spend the same credit.
  perform pg_advisory_xact_lock(hashtextextended('finder:' || p_business::text, 0));

  if not v_unlimited then
    select count(*) into v_recent
    from public.finder_jobs j
    where j.business_id = p_business and j.created_at > now() - interval '1 hour';
    if v_recent >= 30 then
      raise exception 'finder:rate' using errcode = 'P0001';
    end if;
  end if;

  -- What we already know
  v_domain := public.finder_norm_domain(v_website);
  if v_domain is not null then
    select array_agg(c.id) into v_matches
    from public.kb_companies c
    where c.domain = v_domain and public.finder_kb_servable(c.id);
  else
    select array_agg(x.id) into v_matches
    from (
      select c.id
      from public.kb_companies c
      where c.name_norm = public.finder_norm_company(v_company)
        and (v_city is null or c.city_norm = lower(v_city))
        and (v_country is null or c.country is null or c.country = v_country)
        and public.finder_kb_servable(c.id)
      order by c.last_checked_at desc
      limit 6
    ) x;
  end if;

  if coalesce(cardinality(v_matches), 0) = 1
     and not v_unlimited and public.finder_balance(p_business) < 1 then
    raise exception 'finder:no_credits' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(v_matches), 0) = 0
     and not v_unlimited and public.finder_balance(p_business) < 1 then
    raise exception 'finder:no_credits' using errcode = 'P0001';
  end if;

  insert into public.finder_jobs (business_id, profile_id, kind, intake, unlimited, items_total)
  values (
    p_business, v_profile.id, 'single',
    to_jsonb(v_profile) - 'id' - 'business_id' - 'created_at' - 'updated_at',
    v_unlimited, 1
  )
  returning id into v_job;

  insert into public.finder_job_items (job_id, business_id, company, city, website, region, country)
  values (v_job, p_business, v_company, v_city, v_website, v_region, v_country)
  returning id into v_item;

  perform public.finder_log(p_business, null, 'user', 'submit',
    jsonb_build_object('job', v_job, 'kind', 'single', 'known', coalesce(cardinality(v_matches), 0)));

  -- Known, one match: deliver now, 1 credit.
  if coalesce(cardinality(v_matches), 0) = 1 then
    v_result := public.finder_deliver_kb(v_item, v_matches[1], false);
    perform public.finder_settle(v_item, true, v_result);
    perform public.finder_job_refresh(v_job);
    return jsonb_build_object('status', 'found', 'job_id', v_job, 'item_id', v_item, 'result_id', v_result);
  end if;

  -- Known, several matches: the user picks (free).
  if coalesce(cardinality(v_matches), 0) > 1 then
    select jsonb_agg(jsonb_build_object(
             'kb_id', c.id, 'name', c.name, 'city', c.city, 'website', c.website))
      into v_candidates
    from (select * from public.kb_companies where id = any (v_matches[1:5])) c;
    update public.finder_job_items
      set status = 'ambiguous', candidates = v_candidates, updated_at = now()
      where id = v_item;
    perform public.finder_job_refresh(v_job);
    return jsonb_build_object('status', 'pick', 'job_id', v_job, 'item_id', v_item, 'candidates', v_candidates);
  end if;

  -- Unknown: hold 1 credit and queue it for the worker.
  if not v_unlimited then
    insert into public.finder_credit_ledger (business_id, delta, reason, job_id, item_id)
    values (p_business, -1, 'hold', v_job, v_item);
    update public.finder_job_items set held = true where id = v_item;
    update public.finder_jobs set credits_held = 1 where id = v_job;
  end if;
  return jsonb_build_object('status', 'queued', 'job_id', v_job, 'item_id', v_item);
end;
$$;

revoke all on function public.finder_submit(uuid, uuid, text, text, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.finder_submit(uuid, uuid, text, text, text, text, text, text, boolean)
  to service_role;

-- Invite-only testers get a starting balance once.
create or replace function public.finder_beta_grant(p_business uuid, p_credits int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_credits is null or p_credits < 1 or p_credits > 1000 then
    return public.finder_balance(p_business);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('finder:' || p_business::text, 0));
  if not exists (
    select 1 from public.finder_credit_ledger l
    where l.business_id = p_business and l.reason = 'grant' and l.note = 'beta'
  ) then
    insert into public.finder_credit_ledger (business_id, delta, reason, note)
    values (p_business, p_credits, 'grant', 'beta');
    perform public.finder_log(p_business, null, 'system', 'beta_grant', jsonb_build_object('credits', p_credits));
  end if;
  return public.finder_balance(p_business);
end;
$$;

revoke all on function public.finder_beta_grant(uuid, int) from public, anon, authenticated;
grant execute on function public.finder_beta_grant(uuid, int) to service_role;

-- ============================================================
-- 7. Owner actions (a signed-in owner; checked inside)
-- ============================================================

-- Balance + held, for the page.
create or replace function public.finder_credits(p_business uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.finder_can_act(p_business) then
    raise exception 'not your business' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'balance', public.finder_balance(p_business),
    'held', coalesce((select sum(j.credits_held) from public.finder_jobs j
                      where j.business_id = p_business), 0),
    'unlimited', public.finder_is_unlimited(p_business)
  );
end;
$$;

revoke all on function public.finder_credits(uuid) from public, anon;
grant execute on function public.finder_credits(uuid) to authenticated, service_role;

-- Pick one of the candidates (free). p_choice = -1: "none of these".
create or replace function public.finder_pick(p_item uuid, p_choice int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.finder_job_items%rowtype;
  v_unlimited boolean;
  v_pick jsonb;
  v_result uuid;
begin
  select * into v_item from public.finder_job_items where id = p_item;
  if v_item.id is null or not public.finder_can_act(v_item.business_id) then
    raise exception 'finder:not_found' using errcode = 'P0001';
  end if;
  if v_item.status <> 'ambiguous' then
    raise exception 'finder:not_pickable' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('finder:' || v_item.business_id::text, 0));
  select j.unlimited into v_unlimited from public.finder_jobs j where j.id = v_item.job_id;

  if p_choice is null or p_choice < -1 or p_choice >= coalesce(jsonb_array_length(v_item.candidates), 0) then
    raise exception 'finder:bad_input' using errcode = 'P0001';
  end if;

  perform public.finder_log(v_item.business_id, null, 'user', 'pick',
    jsonb_build_object('item', v_item.id, 'choice', p_choice));

  if p_choice = -1 then
    if v_item.held then
      -- The worker already looked and found several; none was right.
      update public.finder_job_items set status = 'not_found', candidates = null, updated_at = now()
        where id = v_item.id;
      perform public.finder_settle(v_item.id, false, null);
      perform public.finder_job_refresh(v_item.job_id);
      return jsonb_build_object('status', 'not_found');
    end if;
    -- Our records had several; none was right: research it.
    if not coalesce(v_unlimited, false) then
      if public.finder_balance(v_item.business_id) < 1 then
        raise exception 'finder:no_credits' using errcode = 'P0001';
      end if;
      insert into public.finder_credit_ledger (business_id, delta, reason, job_id, item_id)
      values (v_item.business_id, -1, 'hold', v_item.job_id, v_item.id);
      update public.finder_jobs set credits_held = credits_held + 1 where id = v_item.job_id;
    end if;
    update public.finder_job_items
      set status = 'queued', held = not coalesce(v_unlimited, false), candidates = null, updated_at = now()
      where id = v_item.id;
    perform public.finder_job_refresh(v_item.job_id);
    return jsonb_build_object('status', 'queued');
  end if;

  v_pick := v_item.candidates -> p_choice;

  if v_pick ? 'kb_id' then
    if not coalesce(v_unlimited, false) and not v_item.held
       and public.finder_balance(v_item.business_id) < 1 then
      raise exception 'finder:no_credits' using errcode = 'P0001';
    end if;
    if not public.finder_kb_servable((v_pick ->> 'kb_id')::uuid) then
      raise exception 'finder:not_found' using errcode = 'P0001';
    end if;
    v_result := public.finder_deliver_kb(v_item.id, (v_pick ->> 'kb_id')::uuid, false);
    perform public.finder_settle(v_item.id, true, v_result);
    perform public.finder_job_refresh(v_item.job_id);
    return jsonb_build_object('status', 'found', 'result_id', v_result);
  end if;

  -- A candidate the worker found: research that exact one next.
  update public.finder_job_items
    set status = 'queued',
        company = left(coalesce(nullif(v_pick ->> 'name', ''), company), 200),
        city = left(coalesce(nullif(v_pick ->> 'city', ''), city), 120),
        website = left(coalesce(nullif(v_pick ->> 'website', ''), website), 300),
        candidates = null, worker_id = null, updated_at = now()
    where id = v_item.id;
  perform public.finder_job_refresh(v_item.job_id);
  return jsonb_build_object('status', 'queued');
end;
$$;

revoke all on function public.finder_pick(uuid, int) from public, anon;
grant execute on function public.finder_pick(uuid, int) to authenticated, service_role;

-- Unlock a locked result (1 credit). Locked results come with the weekly
-- drops (F5); nothing in F1 makes them yet.
create or replace function public.finder_unlock(p_result uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.finder_results%rowtype;
  v_unlimited boolean;
  v_phone record;
  v_email record;
  v_form record;
begin
  select * into v_r from public.finder_results where id = p_result;
  if v_r.id is null or not public.finder_can_act(v_r.business_id) then
    raise exception 'finder:not_found' using errcode = 'P0001';
  end if;
  if not v_r.locked then
    return jsonb_build_object('status', 'unlocked');
  end if;
  if v_r.kb_company_id is null or not public.finder_kb_servable(v_r.kb_company_id) then
    raise exception 'finder:not_found' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('finder:' || v_r.business_id::text, 0));
  v_unlimited := public.finder_is_unlimited(v_r.business_id);
  if not v_unlimited and public.finder_balance(v_r.business_id) < 1 then
    raise exception 'finder:no_credits' using errcode = 'P0001';
  end if;

  select k.value, k.checks into v_phone from public.kb_contacts k
  where k.company_id = v_r.kb_company_id and k.kind = 'phone' and k.bad_reports < 2
    and not public.finder_suppressed('phone', k.value_norm)
  order by k.quality desc, k.last_checked_at desc limit 1;
  select k.value, k.checks into v_email from public.kb_contacts k
  where k.company_id = v_r.kb_company_id and k.kind = 'email' and k.bad_reports < 2
    and not public.finder_suppressed('email', k.value_norm)
  order by k.quality desc, k.last_checked_at desc limit 1;
  select k.value into v_form from public.kb_contacts k
  where k.company_id = v_r.kb_company_id and k.kind = 'contact_form' and k.bad_reports < 2
  order by k.last_checked_at desc limit 1;

  update public.finder_results
    set locked = false,
        phone = v_phone.value, phone_checks = v_phone.checks,
        email = v_email.value, email_checks = v_email.checks,
        contact_form_url = v_form.value
    where id = v_r.id;

  if not v_unlimited then
    insert into public.finder_credit_ledger (business_id, delta, reason, result_id)
    values (v_r.business_id, -1, 'unlock', v_r.id);
  end if;
  perform public.finder_log(v_r.business_id, null, 'user', 'unlock', jsonb_build_object('result', v_r.id));
  return jsonb_build_object('status', 'unlocked');
end;
$$;

revoke all on function public.finder_unlock(uuid) from public, anon;
grant execute on function public.finder_unlock(uuid) to authenticated, service_role;

-- Add to leads. Runs with the user's session, so the 0017 plan trigger
-- counts the new lead toward the contact limit (plan_limit:contacts:N).
create or replace function public.finder_add_to_lead(p_result uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.finder_results%rowtype;
  v_lead uuid;
  v_message text;
begin
  select * into v_r from public.finder_results where id = p_result for update;
  if v_r.id is null or not public.finder_can_act(v_r.business_id) then
    raise exception 'finder:not_found' using errcode = 'P0001';
  end if;
  if v_r.locked then
    raise exception 'finder:locked' using errcode = 'P0001';
  end if;
  if v_r.lead_id is not null then
    return v_r.lead_id;
  end if;

  v_message := left(concat_ws(E'\n',
    'Found with the Lead Finder.',
    nullif(v_r.why, ''),
    case when v_r.contact_form_url is not null then 'Contact form: ' || v_r.contact_form_url end,
    case when cardinality(v_r.source_urls) > 0 then 'Source: ' || v_r.source_urls[1] end,
    'Last checked: ' || to_char(v_r.last_checked_at, 'YYYY-MM-DD')
  ), 2000);

  insert into public.leads (
    business_id, name, email, phone, message, status, channel,
    company, website, finder_result_id, verified_at
  ) values (
    v_r.business_id, v_r.company_name, v_r.email, v_r.phone, v_message, 'new', 'finder',
    v_r.company_name, v_r.website, v_r.id, v_r.last_checked_at
  ) returning id into v_lead;

  update public.finder_results set lead_id = v_lead, added_at = now() where id = v_r.id;
  perform public.finder_log(v_r.business_id, null, 'user', 'add_to_leads',
    jsonb_build_object('result', v_r.id, 'lead', v_lead));
  return v_lead;
end;
$$;

revoke all on function public.finder_add_to_lead(uuid) from public, anon;
grant execute on function public.finder_add_to_lead(uuid) to authenticated, service_role;

-- Report a bounce or a wrong number. Errors: finder:too_late,
-- finder:already_reported. Returns {status: refunded|review|closed}.
create or replace function public.finder_report_bounce(p_result uuid, p_kind text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.finder_results%rowtype;
  v_charged boolean;
  v_spent int;
  v_refunded int;
  v_status text;
  v_contact_kind text;
  v_value text;
begin
  if p_kind not in ('bounce', 'wrong_number', 'other') then
    raise exception 'finder:bad_input' using errcode = 'P0001';
  end if;
  select * into v_r from public.finder_results where id = p_result;
  if v_r.id is null or not public.finder_can_act(v_r.business_id) then
    raise exception 'finder:not_found' using errcode = 'P0001';
  end if;
  if v_r.created_at < now() - interval '30 days' then
    raise exception 'finder:too_late' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.finder_bounce_reports b where b.result_id = v_r.id) then
    raise exception 'finder:already_reported' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('finder:' || v_r.business_id::text, 0));

  select exists (
    select 1 from public.finder_credit_ledger l
    where l.result_id = v_r.id and l.reason in ('spend', 'unlock') and l.delta < 0
  ) into v_charged;

  if not v_charged then
    v_status := 'closed';
  else
    select coalesce(-sum(l.delta) filter (where l.reason in ('spend', 'unlock')), 0),
           coalesce(sum(l.delta) filter (where l.reason = 'refund'), 0)
      into v_spent, v_refunded
    from public.finder_credit_ledger l
    where l.business_id = v_r.business_id and l.created_at > now() - interval '90 days';
    -- Automatic while refunds stay within 20% of what was used (same as
    -- refundIsAutomatic() in src/lib/finder-credits.ts).
    if (v_refunded + 1) * 5 <= v_spent then
      v_status := 'refunded';
      insert into public.finder_credit_ledger (business_id, delta, reason, result_id, note)
      values (v_r.business_id, 1, 'refund', v_r.id, p_kind);
    else
      v_status := 'review';
    end if;
  end if;

  insert into public.finder_bounce_reports (business_id, result_id, kind, note, status)
  values (v_r.business_id, v_r.id, p_kind, left(nullif(trim(coalesce(p_note, '')), ''), 500), v_status);

  -- Mark the contact in the shared records; two reports and it stops being served.
  v_contact_kind := case p_kind when 'bounce' then 'email' when 'wrong_number' then 'phone' end;
  v_value := case p_kind when 'bounce' then v_r.email when 'wrong_number' then v_r.phone end;
  if v_contact_kind is not null and v_value is not null and v_r.kb_company_id is not null then
    update public.kb_contacts k
      set bad_reports = k.bad_reports + 1
      where k.company_id = v_r.kb_company_id and k.kind = v_contact_kind
        and k.value_norm = public.finder_norm_value(v_contact_kind, v_value);
  end if;

  perform public.finder_log(v_r.business_id, null, 'user', 'report_bounce',
    jsonb_build_object('result', v_r.id, 'kind', p_kind, 'status', v_status));
  return jsonb_build_object('status', v_status);
end;
$$;

revoke all on function public.finder_report_bounce(uuid, text, text) from public, anon;
grant execute on function public.finder_report_bounce(uuid, text, text) to authenticated, service_role;

-- ============================================================
-- 8. The worker (Zilla), through /api/finder/worker/<action>.
--    Service role only; the route checks the worker key first.
-- ============================================================

-- Claim up to p_limit queued items. Items with no heartbeat for 15
-- minutes go back to the queue first (3 tries, then failed + refund).
create or replace function public.finder_worker_claim(p_worker uuid, p_limit int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stale record;
  v_out jsonb;
  v_ids uuid[];
begin
  -- Keep shared records 12 months after their last check (Privacy Policy).
  delete from public.kb_contacts where last_checked_at < now() - interval '12 months';
  delete from public.kb_companies where last_checked_at < now() - interval '12 months';

  for v_stale in
    select i.id, i.job_id, i.attempts
    from public.finder_job_items i
    where i.status = 'working'
      and coalesce(i.heartbeat_at, i.claimed_at, i.updated_at) < now() - interval '15 minutes'
    for update skip locked
  loop
    if v_stale.attempts >= 3 then
      update public.finder_job_items
        set status = 'failed', worker_id = null, note = 'gave up after 3 tries', updated_at = now()
        where id = v_stale.id;
      perform public.finder_settle(v_stale.id, false, null);
    else
      update public.finder_job_items
        set status = 'queued', worker_id = null, updated_at = now()
        where id = v_stale.id;
    end if;
    perform public.finder_job_refresh(v_stale.job_id);
  end loop;

  with picked as (
    select i.id
    from public.finder_job_items i
    where i.status = 'queued'
    order by i.created_at
    limit greatest(1, least(coalesce(p_limit, 1), 5))
    for update skip locked
  ), claimed as (
    update public.finder_job_items i
      set status = 'working', worker_id = p_worker, claimed_at = now(), heartbeat_at = now(),
          attempts = i.attempts + 1, updated_at = now()
    from picked
    where i.id = picked.id
    returning i.id
  )
  select array_agg(claimed.id) into v_ids from claimed;

  if v_ids is null then
    return '[]'::jsonb;
  end if;

  update public.finder_jobs j set status = 'working', updated_at = now()
  where j.id in (select i.job_id from public.finder_job_items i where i.id = any (v_ids))
    and j.status = 'queued';

  -- Only what the research needs: no user ids, no business names.
  select jsonb_agg(jsonb_build_object(
           'item_id', i.id,
           'company', i.company,
           'city', i.city,
           'website', i.website,
           'region', i.region,
           'country', i.country,
           'needs', coalesce(j.intake -> 'needs', '[]'::jsonb),
           'intake_country', j.intake ->> 'country',
           'intake_province', j.intake ->> 'province',
           'due_at', j.due_at
         ) order by i.created_at)
    into v_out
  from public.finder_job_items i
  join public.finder_jobs j on j.id = i.job_id
  where i.id = any (v_ids);

  perform public.finder_log(null, p_worker, 'worker', 'claim', jsonb_build_object('items', cardinality(v_ids)));
  return coalesce(v_out, '[]'::jsonb);
end;
$$;

revoke all on function public.finder_worker_claim(uuid, int) from public, anon, authenticated;
grant execute on function public.finder_worker_claim(uuid, int) to service_role;

create or replace function public.finder_worker_heartbeat(p_worker uuid, p_items uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  update public.finder_job_items
    set heartbeat_at = now()
    where id = any (coalesce(p_items, '{}'))
      and worker_id = p_worker and status = 'working';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.finder_worker_heartbeat(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.finder_worker_heartbeat(uuid, uuid[]) to service_role;

-- Finish one item. p_payload (checked by the route first):
--   {outcome: found|not_found|ambiguous|failed,
--    company: {name, website, city, region, country, address, osm_ref,
--              osm_fields[], source_url, licence, no_solicitation},
--    contacts: [{kind, value, source_url, licence, checks, quality,
--                role_address, osm_derived}],
--    candidates: [{name, city, website, source_url}], why, note}
-- Returns {status, result_id?}. Errors: finder:not_yours.
create or replace function public.finder_worker_complete(p_worker uuid, p_item uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.finder_job_items%rowtype;
  v_outcome text := p_payload ->> 'outcome';
  v_co jsonb := coalesce(p_payload -> 'company', '{}'::jsonb);
  v_name text;
  v_name_norm text;
  v_domain text;
  v_city text;
  v_phone_norm text;
  v_company uuid;
  v_ct jsonb;
  v_kind text;
  v_value text;
  v_norm text;
  v_kept int := 0;
  v_phone jsonb;
  v_email jsonb;
  v_form jsonb;
  v_result uuid;
  v_sources text[];
begin
  select * into v_item from public.finder_job_items where id = p_item for update;
  if v_item.id is null or v_item.status <> 'working' or v_item.worker_id is distinct from p_worker then
    raise exception 'finder:not_yours' using errcode = 'P0001';
  end if;

  if v_outcome = 'ambiguous' then
    update public.finder_job_items
      set status = 'ambiguous',
          candidates = (
            select jsonb_agg(jsonb_build_object(
                     'name', left(c ->> 'name', 200),
                     'city', left(c ->> 'city', 120),
                     'website', left(c ->> 'website', 300),
                     'source_url', left(c ->> 'source_url', 500)))
            from (select c from jsonb_array_elements(coalesce(p_payload -> 'candidates', '[]'::jsonb)) c
                  limit 5) x
          ),
          worker_id = null, note = left(p_payload ->> 'note', 300), updated_at = now()
      where id = v_item.id;
    perform public.finder_job_refresh(v_item.job_id);
    perform public.finder_log(v_item.business_id, p_worker, 'worker', 'complete',
      jsonb_build_object('item', v_item.id, 'outcome', 'ambiguous'));
    return jsonb_build_object('status', 'ambiguous');
  end if;

  if v_outcome = 'found' then
    v_name := nullif(trim(left(v_co ->> 'name', 200)), '');
    v_name := coalesce(v_name, v_item.company);
    v_name_norm := public.finder_norm_company(v_name);
    v_domain := public.finder_norm_domain(v_co ->> 'website');
    v_city := nullif(trim(left(coalesce(v_co ->> 'city', v_item.city), 120)), '');

    -- On the removal list: keep nothing.
    if public.finder_suppressed('domain', v_domain) or public.finder_suppressed('company', v_name_norm) then
      v_outcome := 'not_found';
    end if;
  end if;

  if v_outcome = 'found' then
    -- The company row: by domain, then by name + city (+ phone)
    select (c ->> 'value') into v_value
    from jsonb_array_elements(coalesce(p_payload -> 'contacts', '[]'::jsonb)) c
    where c ->> 'kind' = 'phone' limit 1;
    v_phone_norm := public.finder_norm_phone(v_value);

    if v_domain is not null then
      select id into v_company from public.kb_companies where domain = v_domain;
    end if;
    if v_company is null then
      select id into v_company from public.kb_companies
      where name_norm = v_name_norm
        and city_norm is not distinct from lower(v_city)
        and (v_phone_norm is null or phone_norm is null or phone_norm = v_phone_norm)
      order by last_checked_at desc limit 1;
    end if;

    if v_company is null then
      insert into public.kb_companies (
        name, name_norm, domain, website, city, city_norm, region, country, address,
        phone_norm, osm_ref, osm_fields, source_url, licence, no_solicitation, last_checked_at
      ) values (
        v_name, v_name_norm, v_domain,
        case when v_domain is not null then left(v_co ->> 'website', 300) end,
        v_city, lower(v_city),
        nullif(left(v_co ->> 'region', 60), ''),
        nullif(upper(left(v_co ->> 'country', 2)), ''),
        nullif(left(v_co ->> 'address', 300), ''),
        v_phone_norm,
        nullif(v_co ->> 'osm_ref', ''),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_co -> 'osm_fields', '[]'::jsonb)) limit 10), '{}'),
        left(v_co ->> 'source_url', 500),
        coalesce(nullif(v_co ->> 'licence', ''), 'own-site'),
        coalesce((v_co ->> 'no_solicitation')::boolean, false),
        now()
      ) returning id into v_company;
    else
      update public.kb_companies
        set name = v_name,
            website = coalesce(case when v_domain is not null then left(v_co ->> 'website', 300) end, website),
            city = coalesce(v_city, city), city_norm = coalesce(lower(v_city), city_norm),
            region = coalesce(nullif(left(v_co ->> 'region', 60), ''), region),
            country = coalesce(nullif(upper(left(v_co ->> 'country', 2)), ''), country),
            address = coalesce(nullif(left(v_co ->> 'address', 300), ''), address),
            phone_norm = coalesce(v_phone_norm, phone_norm),
            osm_ref = coalesce(nullif(v_co ->> 'osm_ref', ''), osm_ref),
            source_url = coalesce(left(v_co ->> 'source_url', 500), source_url),
            no_solicitation = coalesce((v_co ->> 'no_solicitation')::boolean, no_solicitation),
            last_checked_at = now(), updated_at = now()
        where id = v_company;
    end if;

    -- Contacts (skipping anything on the removal list)
    for v_ct in
      select c from jsonb_array_elements(coalesce(p_payload -> 'contacts', '[]'::jsonb)) c limit 12
    loop
      v_kind := v_ct ->> 'kind';
      v_value := left(trim(coalesce(v_ct ->> 'value', '')), 320);
      if v_kind not in ('email', 'phone', 'contact_form') or v_value = ''
         or coalesce(v_ct ->> 'source_url', '') !~* '^https?://' then
        continue;
      end if;
      v_norm := public.finder_norm_value(v_kind, v_value);
      if v_norm = '' or public.finder_suppressed(v_kind, v_norm) then
        continue;
      end if;
      if v_kind = 'email' and public.finder_suppressed('domain', split_part(v_norm, '@', 2)) then
        continue;
      end if;
      insert into public.kb_contacts (
        company_id, kind, value, value_norm, source_url, licence, checks, quality,
        role_address, osm_derived, last_checked_at
      ) values (
        v_company, v_kind, v_value, v_norm, left(v_ct ->> 'source_url', 500),
        coalesce(nullif(v_ct ->> 'licence', ''), 'own-site'),
        coalesce(v_ct -> 'checks', '{}'::jsonb),
        least(100, greatest(0, coalesce((v_ct ->> 'quality')::int, 50))),
        coalesce((v_ct ->> 'role_address')::boolean, false),
        coalesce((v_ct ->> 'osm_derived')::boolean, false),
        now()
      )
      on conflict (company_id, kind, value_norm) do update
        set checks = excluded.checks, quality = excluded.quality, source_url = excluded.source_url,
            last_checked_at = now();
      v_kept := v_kept + 1;
      if v_kind = 'phone' and v_phone is null then v_phone := v_ct; end if;
      if v_kind = 'email' and v_email is null then v_email := v_ct; end if;
      if v_kind = 'contact_form' and v_form is null then v_form := v_ct; end if;
    end loop;

    if v_kept = 0 then
      v_outcome := 'not_found';
    else
      select array_agg(distinct s) into v_sources
      from unnest(array[v_co ->> 'source_url', v_phone ->> 'source_url',
                        v_email ->> 'source_url', v_form ->> 'source_url']) s
      where s is not null and s ~* '^https?://';

      insert into public.finder_results (
        business_id, job_id, item_id, kb_company_id, company_name, website, city, region,
        country, address, phone, phone_checks, email, email_checks, contact_form_url,
        source_urls, why, locked, last_checked_at
      )
      select v_item.business_id, v_item.job_id, v_item.id, v_company, c.name, c.website, c.city,
             c.region, c.country, c.address,
             left(v_phone ->> 'value', 50), v_phone -> 'checks',
             left(v_email ->> 'value', 254), v_email -> 'checks',
             left(v_form ->> 'value', 500),
             coalesce(v_sources[1:10], '{}'),
             nullif(left(p_payload ->> 'why', 500), ''),
             false, now()
      from public.kb_companies c where c.id = v_company
      returning id into v_result;

      update public.finder_job_items
        set status = 'found', result_id = v_result, worker_id = null, candidates = null, updated_at = now()
        where id = v_item.id;
      perform public.finder_settle(v_item.id, true, v_result);
    end if;
  end if;

  if v_outcome in ('not_found', 'failed') then
    update public.finder_job_items
      set status = v_outcome, worker_id = null, note = left(p_payload ->> 'note', 300), updated_at = now()
      where id = v_item.id;
    perform public.finder_settle(v_item.id, false, null);
  elsif v_outcome is distinct from 'found' then
    raise exception 'finder:bad_input' using errcode = 'P0001';
  end if;

  perform public.finder_job_refresh(v_item.job_id);
  perform public.finder_log(v_item.business_id, p_worker, 'worker', 'complete',
    jsonb_build_object('item', v_item.id, 'outcome', v_outcome, 'contacts', v_kept));
  return jsonb_build_object('status', v_outcome, 'result_id', v_result);
end;
$$;

revoke all on function public.finder_worker_complete(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finder_worker_complete(uuid, uuid, jsonb) to service_role;

-- What the knowledge base already has for a website or a name + city
-- (so the worker can skip work). Contacts on the removal list are left out.
create or replace function public.finder_worker_lookup(p_website text, p_name text, p_city text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_domain text := public.finder_norm_domain(p_website);
  v_id uuid;
begin
  if v_domain is not null then
    select id into v_id from public.kb_companies where domain = v_domain;
  elsif nullif(trim(coalesce(p_name, '')), '') is not null then
    select id into v_id from public.kb_companies
    where name_norm = public.finder_norm_company(p_name)
      and (nullif(trim(coalesce(p_city, '')), '') is null or city_norm = lower(trim(p_city)))
    order by last_checked_at desc limit 1;
  end if;
  if v_id is null then
    return null;
  end if;
  return (
    select jsonb_build_object(
      'name', c.name, 'website', c.website, 'city', c.city, 'country', c.country,
      'last_checked_at', c.last_checked_at, 'servable', public.finder_kb_servable(c.id),
      'contacts', coalesce((
        select jsonb_agg(jsonb_build_object('kind', k.kind, 'value', k.value,
                                            'source_url', k.source_url, 'last_checked_at', k.last_checked_at))
        from public.kb_contacts k
        where k.company_id = c.id and k.bad_reports < 2
          and not public.finder_suppressed(k.kind, k.value_norm)
      ), '[]'::jsonb)
    )
    from public.kb_companies c where c.id = v_id
  );
end;
$$;

revoke all on function public.finder_worker_lookup(text, text, text) from public, anon, authenticated;
grant execute on function public.finder_worker_lookup(text, text, text) to service_role;

-- ============================================================
-- 9. "Remove my business data" (public form, email-verified)
--    Server only. Errors: removal:rate, removal:bad_input.
-- ============================================================
create or replace function public.removal_request_create(
  p_email text, p_company text, p_website text, p_phone text, p_details text,
  p_token_hash text, p_ip_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(p_email) > 254
     or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'removal:bad_input' using errcode = 'P0001';
  end if;
  if p_ip_hash is not null and (
    select count(*) from public.data_removal_requests r
    where r.ip_hash = p_ip_hash and r.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'removal:rate' using errcode = 'P0001';
  end if;
  if (select count(*) from public.data_removal_requests r
      where lower(r.email) = lower(p_email) and r.created_at > now() - interval '1 day') >= 3 then
    raise exception 'removal:rate' using errcode = 'P0001';
  end if;

  insert into public.data_removal_requests (email, company, website, phone, details, token_hash, ip_hash)
  values (
    lower(trim(p_email)),
    nullif(left(trim(coalesce(p_company, '')), 200), ''),
    nullif(left(trim(coalesce(p_website, '')), 300), ''),
    nullif(left(trim(coalesce(p_phone, '')), 50), ''),
    nullif(left(trim(coalesce(p_details, '')), 1000), ''),
    p_token_hash, p_ip_hash
  ) returning id into v_id;

  perform public.finder_log(null, null, 'public', 'removal_request', jsonb_build_object('request', v_id));
  return v_id;
end;
$$;

revoke all on function public.removal_request_create(text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.removal_request_create(text, text, text, text, text, text, text)
  to service_role;

-- The person clicked the link in the email and pressed Confirm: add the
-- removal list rows and delete what the knowledge base holds, now.
-- Returns {status: done|expired|unknown, companies, contacts}.
create or replace function public.removal_request_verify(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.data_removal_requests%rowtype;
  v_email text;
  v_domain text;
  v_phone text;
  v_company text;
  v_companies int := 0;
  v_contacts int := 0;
  v_n int;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'unknown');
  end if;
  select * into v_req from public.data_removal_requests where token_hash = p_token_hash for update;
  if v_req.id is null then
    return jsonb_build_object('status', 'unknown');
  end if;
  if v_req.status = 'done' then
    return jsonb_build_object('status', 'done', 'companies', v_req.removed_companies,
                              'contacts', v_req.removed_contacts);
  end if;
  if v_req.status <> 'pending' or v_req.expires_at < now() then
    update public.data_removal_requests set status = 'expired' where id = v_req.id and status = 'pending';
    return jsonb_build_object('status', 'expired');
  end if;

  v_email := lower(trim(v_req.email));
  v_domain := public.finder_norm_domain(v_req.website);
  v_phone := public.finder_norm_phone(v_req.phone);
  v_company := nullif(public.finder_norm_company(v_req.company), '');

  insert into public.kb_suppression (kind, value_norm, request_id)
  select k, v, v_req.id
  from (values ('email', v_email), ('domain', v_domain), ('phone', v_phone), ('company', v_company)) s(k, v)
  where v is not null and v <> ''
  on conflict (kind, value_norm) do nothing;

  -- Whole companies: by the website's domain, or by the name
  delete from public.kb_companies c
  where (v_domain is not null and c.domain = v_domain)
     or (v_company is not null and c.name_norm = v_company);
  get diagnostics v_companies = row_count;

  -- Single contacts anywhere else
  delete from public.kb_contacts k
  where (k.kind = 'email' and k.value_norm = v_email)
     or (v_domain is not null and k.kind = 'email' and split_part(k.value_norm, '@', 2) = v_domain)
     or (v_phone is not null and k.kind = 'phone' and k.value_norm = v_phone);
  get diagnostics v_n = row_count;
  v_contacts := v_contacts + v_n;

  update public.data_removal_requests
    set status = 'done', verified_at = now(), done_at = now(),
        removed_companies = v_companies, removed_contacts = v_contacts
    where id = v_req.id;

  perform public.finder_log(null, null, 'public', 'removal_done',
    jsonb_build_object('request', v_req.id, 'companies', v_companies, 'contacts', v_contacts));
  return jsonb_build_object('status', 'done', 'companies', v_companies, 'contacts', v_contacts);
end;
$$;

revoke all on function public.removal_request_verify(text) from public, anon, authenticated;
grant execute on function public.removal_request_verify(text) to service_role;
