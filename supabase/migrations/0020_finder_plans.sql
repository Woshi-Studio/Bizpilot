-- Jephelen Phase 2F (F2): Lead Finder plans, locked results, credit grants
-- Run AFTER 0019_finder.sql.
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to run more than once.
--
-- The owner's access rules (2026-09-27):
--   Starter / Hustle: may search; every result comes back LOCKED (company,
--     city and why it fits only; no phone, email, website, address or
--     source). Locked searches cost no credits, with a daily cap.
--   Boss: unlocked results, paid with lead credits. Boss gets a credit grant
--     on every paid Boss invoice (every 4 weeks).
--   Lead subscription: N lead credits on every paid lead-sub invoice.
--   Packs (25 / 100): one-time top-ups, one grant per Stripe Checkout session.
--   Owner: unlimited, no credit rows (unchanged).
--   One smart search box: a company name, a website, a business email, a
--   phone number, or a person's name AT a company (business contacts only).
--   The "What are you hunting?" intake is optional for a single search; the
--   Acceptable Use tick is still required (a profile row with only the
--   Acceptable Use version is enough).
--   Plan and lead-sub credits don't roll over: a new grant first removes
--   what is left of the last grant of the same kind ('expire' rows). Pack,
--   beta and refund credits never expire. Credits from a grant are used
--   before pack credits (oldest grant first).
--
-- What changes:
--   1. finder_jobs.locked (default false = the 0019 behaviour).
--   2. finder_results: a locked result also holds no website, address or
--      source links (so a Starter can't read them through the API either).
--   3. finder_job_items.candidates: no longer readable by users directly
--      (it can hold websites); the app reads it with the service role and
--      strips it for locked accounts. Every other column stays readable.
--   4. finder_credit_ledger: reason 'expire' allowed.
--   5. New tables (server writes only): finder_grants (one row per Stripe
--      invoice / checkout session: the idempotency record),
--      finder_lead_subs (lead-sub status for Settings; owner reads).
--   6. finder_profiles: my_business and offer may be empty (the intake is
--      optional; the Acceptable Use version stays required); + area
--      (CA | US | CAUS | WORLD); radius_km also 24 / 80 / 322 (15 / 50 /
--      200 miles).
--   7. finder_job_items: query_kind (company | domain | email | phone |
--      person | discover), query_email, query_phone, person.
--      finder_profiles: industry_other; up to 40 industries.
--      finder_jobs: want (how many companies a "Find me customers" run
--      delivers).
--   8. Functions:
--        finder_pool_left, finder_grant           (service role)
--        finder_submit (new 6-argument form: p_query jsonb + p_mode +
--          p_daily_cap; the 0019 9-argument form stays and behaves as before)
--        finder_unlock_all                         (service role)
--        finder_discover_submit, finder_worker_discovered  (service role:
--          "Find me customers": the worker finds new matching businesses
--          on OpenStreetMap; each becomes a normal search item)
--        replaced: finder_settle, finder_deliver_kb, finder_pick,
--          finder_unlock, finder_worker_complete (locked-aware),
--          finder_worker_claim (sends the query kind to the worker)
--
-- What does NOT change: plan values, businesses_plan_check,
-- protect_business_billing, every 0017 trigger, the leads policies, the
-- worker key tables, the knowledge base, removal requests.

-- ============================================================
-- 1. Jobs remember whether their results are locked
-- ============================================================
alter table public.finder_jobs add column if not exists locked boolean not null default false;

-- ============================================================
-- 2. A locked result holds nothing a Starter shouldn't see
-- ============================================================
update public.finder_results
  set website = null, address = null, source_urls = '{}'
  where locked and (website is not null or address is not null or cardinality(source_urls) > 0);

alter table public.finder_results drop constraint if exists finder_results_locked_empty;
alter table public.finder_results add constraint finder_results_locked_empty check (
  not locked or (phone is null and email is null and contact_form_url is null
                 and phone_checks is null and email_checks is null
                 and website is null and address is null and cardinality(source_urls) = 0)
);

-- ============================================================
-- 3. The smart search box: what the user typed, and the intake optional
-- ============================================================
alter table public.finder_job_items add column if not exists query_kind text not null default 'company';
alter table public.finder_job_items add column if not exists query_email text;
alter table public.finder_job_items add column if not exists query_phone text;
alter table public.finder_job_items add column if not exists person text;

alter table public.finder_job_items drop constraint if exists finder_job_items_query_check;
alter table public.finder_job_items add constraint finder_job_items_query_check check (
  query_kind in ('company', 'domain', 'email', 'phone', 'person', 'discover')
  and (query_email is null or (char_length(query_email) <= 254 and query_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
  and (query_phone is null or query_phone ~ '^[0-9]{7,15}$')
  and (person is null or char_length(person) between 2 and 120)
);

alter table public.finder_profiles alter column my_business drop not null;
alter table public.finder_profiles alter column offer drop not null;

-- Industries: about 30 buckets now (was 12 at most), plus "Other: type it".
alter table public.finder_profiles add column if not exists industry_other text;
alter table public.finder_profiles drop constraint if exists finder_profiles_industry_other_check;
alter table public.finder_profiles add constraint finder_profiles_industry_other_check
  check (industry_other is null or char_length(industry_other) <= 120);

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.finder_profiles'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%cardinality(industries)%'
  loop
    execute format('alter table public.finder_profiles drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.finder_profiles add constraint finder_profiles_industries_check
  check (cardinality(industries) <= 40);

-- "Find me customers" runs: how many new companies to deliver.
alter table public.finder_jobs add column if not exists want int;
alter table public.finder_jobs drop constraint if exists finder_jobs_want_check;
alter table public.finder_jobs add constraint finder_jobs_want_check check (want is null or want between 1 and 50);

-- Where: ONE area choice (Canada, USA, Canada + USA, Worldwide) and a radius
-- of none / 15 / 50 / 200 miles, stored in km (24 / 80 / 322). The old
-- 5 / 15 / 50 km values stay valid for rows saved before.
alter table public.finder_profiles add column if not exists area text;
alter table public.finder_profiles drop constraint if exists finder_profiles_area_check;
alter table public.finder_profiles add constraint finder_profiles_area_check
  check (area is null or area in ('CA', 'US', 'CAUS', 'WORLD'));

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.finder_profiles'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%radius_km%'
  loop
    execute format('alter table public.finder_profiles drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.finder_profiles add constraint finder_profiles_radius_km_check
  check (radius_km is null or radius_km in (5, 15, 24, 50, 80, 322));

-- Candidates: server only (they can hold websites). Every other column
-- stays readable by the owner.
revoke select on public.finder_job_items from authenticated;
grant select (id, job_id, business_id, company, city, website, region, country, status, held,
              worker_id, claimed_at, heartbeat_at, attempts, result_id, note, created_at, updated_at,
              query_kind, query_email, query_phone, person)
  on public.finder_job_items to authenticated;

-- ============================================================
-- 4. Ledger: 'expire'
-- ============================================================
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.finder_credit_ledger'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%reason%'
  loop
    execute format('alter table public.finder_credit_ledger drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.finder_credit_ledger add constraint finder_credit_ledger_reason_check
  check (reason in ('grant', 'hold', 'release', 'spend', 'refund', 'unlock', 'adjust', 'expire'));

-- ============================================================
-- 5. Grants (idempotency) and lead-sub status
-- ============================================================
create table if not exists public.finder_grants (
  ref text primary key check (char_length(ref) between 3 and 200),
  business_id uuid not null references public.businesses (id) on delete cascade,
  pool text not null check (pool in ('plan', 'leadsub', 'pack')),
  credits int not null check (credits between 0 and 100000),
  expired int not null default 0 check (expired >= 0),
  created_at timestamptz not null default now()
);

create index if not exists finder_grants_business_idx on public.finder_grants (business_id, created_at desc);

alter table public.finder_grants enable row level security;
revoke all on public.finder_grants from anon, authenticated;

create table if not exists public.finder_lead_subs (
  stripe_subscription_id text primary key check (char_length(stripe_subscription_id) between 3 and 100),
  business_id uuid not null references public.businesses (id) on delete cascade,
  status text not null check (char_length(status) between 1 and 40),
  credits int not null default 0 check (credits between 0 and 100000),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists finder_lead_subs_business_idx on public.finder_lead_subs (business_id, updated_at desc);

alter table public.finder_lead_subs enable row level security;
drop policy if exists "Owners view own finder_lead_subs" on public.finder_lead_subs;
create policy "Owners view own finder_lead_subs"
  on public.finder_lead_subs for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
revoke all on public.finder_lead_subs from anon, authenticated;
grant select on public.finder_lead_subs to authenticated;

-- ============================================================
-- 6. What is left of the grants of one kind ('plan' or 'leadsub')
--    Keep in sync with poolLeft() in src/lib/finder-credits.ts.
--    Walks the ledger in order:
--      grant with note 'plan' / 'leadsub'  -> a new pool entry
--      expire (note = kind)                -> empties entries of that kind
--      hold / release                      -> skipped (they pair up)
--      any other +                         -> never-expiring credits
--      any other -                         -> oldest grant entry first,
--                                             then never-expiring credits
-- ============================================================
create or replace function public.finder_pool_left(p_business uuid, p_pool text)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_kinds text[] := '{}';
  v_left int[] := '{}';
  v_n int := 0;
  v_need int;
  v_take int;
  v_sum int := 0;
  i int;
begin
  for r in
    select l.delta, l.reason, l.note
    from public.finder_credit_ledger l
    where l.business_id = p_business
    order by l.id
  loop
    if r.reason in ('hold', 'release') then
      continue;
    end if;
    if r.reason = 'grant' and r.note in ('plan', 'leadsub') and r.delta > 0 then
      v_kinds := v_kinds || r.note;
      v_left := v_left || r.delta;
      v_n := v_n + 1;
      continue;
    end if;
    if r.reason = 'expire' then
      v_need := -r.delta;
      for i in 1 .. v_n loop
        if v_kinds[i] = r.note and v_need > 0 then
          v_take := least(v_left[i], v_need);
          v_left[i] := v_left[i] - v_take;
          v_need := v_need - v_take;
        end if;
      end loop;
      continue;
    end if;
    if r.delta < 0 then
      v_need := -r.delta;
      for i in 1 .. v_n loop
        exit when v_need = 0;
        v_take := least(v_left[i], v_need);
        v_left[i] := v_left[i] - v_take;
        v_need := v_need - v_take;
      end loop;
    end if;
  end loop;

  for i in 1 .. v_n loop
    if v_kinds[i] = p_pool then
      v_sum := v_sum + v_left[i];
    end if;
  end loop;
  return v_sum;
end;
$$;

revoke all on function public.finder_pool_left(uuid, text) from public, anon, authenticated;
grant execute on function public.finder_pool_left(uuid, text) to service_role;

-- Add credits once per Stripe reference (invoice id / checkout session id).
--   p_pool: 'plan' (Boss invoice), 'leadsub' (lead-sub invoice), 'pack'
--   p_credits: 0 = only expire what is left (a subscription ended)
--   p_rollover: false = what is left of the last grant of this kind is
--               removed first (plan / leadsub only; packs never expire)
-- Returns {status: granted|duplicate|owner, credits, expired, balance}.
create or replace function public.finder_grant(
  p_business uuid, p_pool text, p_credits int, p_ref text, p_rollover boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expire int := 0;
  v_inserted text;
begin
  if p_business is null or p_pool not in ('plan', 'leadsub', 'pack')
     or p_credits is null or p_credits < 0 or p_credits > 100000
     or p_ref is null or char_length(p_ref) not between 3 and 200 then
    raise exception 'finder:bad_input' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business) then
    raise exception 'finder:not_found' using errcode = 'P0001';
  end if;
  if public.finder_is_unlimited(p_business) then
    return jsonb_build_object('status', 'owner', 'credits', 0, 'expired', 0);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('finder:' || p_business::text, 0));

  if exists (select 1 from public.finder_grants g where g.ref = p_ref) then
    return jsonb_build_object('status', 'duplicate', 'credits', 0, 'expired', 0,
                              'balance', public.finder_balance(p_business));
  end if;

  if p_pool in ('plan', 'leadsub') and not coalesce(p_rollover, false) then
    v_expire := least(public.finder_pool_left(p_business, p_pool),
                      greatest(public.finder_balance(p_business), 0));
  end if;

  if v_expire = 0 and p_credits = 0 then
    return jsonb_build_object('status', 'granted', 'credits', 0, 'expired', 0,
                              'balance', public.finder_balance(p_business));
  end if;

  insert into public.finder_grants (ref, business_id, pool, credits, expired)
  values (p_ref, p_business, p_pool, p_credits, v_expire)
  on conflict (ref) do nothing
  returning ref into v_inserted;
  if v_inserted is null then
    return jsonb_build_object('status', 'duplicate', 'credits', 0, 'expired', 0,
                              'balance', public.finder_balance(p_business));
  end if;

  if v_expire > 0 then
    insert into public.finder_credit_ledger (business_id, delta, reason, note)
    values (p_business, -v_expire, 'expire', p_pool);
  end if;
  if p_credits > 0 then
    insert into public.finder_credit_ledger (business_id, delta, reason, note)
    values (p_business, p_credits, 'grant', p_pool);
  end if;

  perform public.finder_log(p_business, null, 'system', 'grant',
    jsonb_build_object('pool', p_pool, 'credits', p_credits, 'expired', v_expire, 'ref', left(p_ref, 80)));
  return jsonb_build_object('status', 'granted', 'credits', p_credits, 'expired', v_expire,
                            'balance', public.finder_balance(p_business));
end;
$$;

revoke all on function public.finder_grant(uuid, text, int, text, boolean) from public, anon, authenticated;
grant execute on function public.finder_grant(uuid, text, int, text, boolean) to service_role;

-- ============================================================
-- 7. Locked-aware versions of the 0019 functions
-- ============================================================

-- Settle: a locked job spends nothing (like the owner's).
create or replace function public.finder_settle(p_item uuid, p_found boolean, p_result uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.finder_job_items%rowtype;
  v_unlimited boolean;
  v_locked boolean;
begin
  select * into v_item from public.finder_job_items where id = p_item for update;
  if not found then
    return;
  end if;
  select j.unlimited, j.locked into v_unlimited, v_locked from public.finder_jobs j where j.id = v_item.job_id;

  if v_item.held then
    insert into public.finder_credit_ledger (business_id, delta, reason, job_id, item_id, note)
    values (v_item.business_id, 1, 'release', v_item.job_id, v_item.id, null);
    update public.finder_job_items set held = false where id = v_item.id;
    update public.finder_jobs
      set credits_held = greatest(credits_held - 1, 0), updated_at = now()
      where id = v_item.job_id;
  end if;

  if p_found and not coalesce(v_unlimited, false) and not coalesce(v_locked, false) then
    insert into public.finder_credit_ledger (business_id, delta, reason, job_id, item_id, result_id, note)
    values (v_item.business_id, -1, 'spend', v_item.job_id, v_item.id, p_result, null);
    update public.finder_jobs
      set credits_spent = credits_spent + 1, updated_at = now()
      where id = v_item.job_id;
  end if;
end;
$$;

revoke all on function public.finder_settle(uuid, boolean, uuid) from public, anon, authenticated;

-- Deliver from the knowledge base. Locked: company name, city, region,
-- country and "why" only.
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
    v_item.business_id, v_item.job_id, v_item.id, v_c.id, v_c.name,
    case when p_locked then null else v_c.website end,
    v_c.city, v_c.region, v_c.country,
    case when p_locked then null else v_c.address end,
    case when p_locked then null else v_phone.value end,
    case when p_locked then null else v_phone.checks end,
    case when p_locked then null else v_email.value end,
    case when p_locked then null else v_email.checks end,
    case when p_locked then null else v_form.value end,
    case when p_locked then '{}' else coalesce(v_sources[1:10], '{}') end,
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

-- Submit one search (service role only; the app checks the session, the
-- plan and the Acceptable Use first).
--   p_query  {kind: company|domain|email|phone|person, company, city,
--             website, region, country, email, phone, person}
--            company is the label shown in lists (the name, the domain or
--            the number as typed); for 'person' it is the person's company.
--   p_mode   'owner'  : unlimited, no credit rows
--            'full'   : Boss / invited tester: credits, unlocked results
--            'locked' : Starter / Hustle: free, locked results, at most
--                       p_daily_cap locked searches in 24 hours
-- Errors as 0019, plus finder:locked_cap.
-- Returns {status: found|pick|queued, job_id, item_id, result_id?,
--          candidates?, locked}.
create or replace function public.finder_submit(
  p_business uuid,
  p_profile uuid,
  p_kind text,
  p_query jsonb,
  p_mode text,
  p_daily_cap int
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.finder_profiles%rowtype;
  v_unlimited boolean;
  v_locked boolean;
  v_qkind text := coalesce(nullif(p_query ->> 'kind', ''), 'company');
  v_company text := nullif(trim(regexp_replace(coalesce(p_query ->> 'company', ''), '\s+', ' ', 'g')), '');
  v_city text := nullif(trim(coalesce(p_query ->> 'city', '')), '');
  v_website text := nullif(trim(coalesce(p_query ->> 'website', '')), '');
  v_region text := nullif(trim(coalesce(p_query ->> 'region', '')), '');
  v_country text := nullif(upper(trim(coalesce(p_query ->> 'country', ''))), '');
  v_email text := nullif(lower(trim(coalesce(p_query ->> 'email', ''))), '');
  v_phone text := public.finder_norm_phone(p_query ->> 'phone');
  v_person text := nullif(trim(regexp_replace(coalesce(p_query ->> 'person', ''), '\s+', ' ', 'g')), '');
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
  if coalesce(p_mode, '') not in ('owner', 'full', 'locked')
     or v_qkind not in ('company', 'domain', 'email', 'phone', 'person') then
    raise exception 'finder:bad_input' using errcode = 'P0001';
  end if;
  if v_company is null or char_length(v_company) > 200
     or char_length(coalesce(v_city, '')) > 120
     or char_length(coalesce(v_website, '')) > 300
     or char_length(coalesce(v_region, '')) > 60
     or (v_country is not null and v_country !~ '^[A-Z]{2}$')
     or (v_website is not null and v_website !~* '^(https?://)?[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]+)?(/[^\s]*)?$')
     or (v_qkind = 'email' and (v_email is null or char_length(v_email) > 254
                                or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
     or (v_qkind = 'phone' and (v_phone is null or v_phone !~ '^[0-9]{7,15}$'))
     or (v_qkind = 'person' and (v_person is null or char_length(v_person) not between 2 and 120))
     or (v_qkind in ('domain', 'email') and v_website is null)
  then
    raise exception 'finder:bad_input' using errcode = 'P0001';
  end if;
  if v_qkind <> 'email' then v_email := null; end if;
  if v_qkind <> 'phone' then v_phone := null; end if;
  if v_qkind <> 'person' then v_person := null; end if;

  -- The Acceptable Use must be accepted (the rest of the intake is optional).
  select * into v_profile
  from public.finder_profiles p
  where p.id = p_profile and p.business_id = p_business;
  if v_profile.id is null or v_profile.aup_version is null then
    raise exception 'finder:no_profile' using errcode = 'P0001';
  end if;

  v_unlimited := p_mode = 'owner' or public.finder_is_unlimited(p_business);
  v_locked := p_mode = 'locked' and not v_unlimited;

  perform pg_advisory_xact_lock(hashtextextended('finder:' || p_business::text, 0));

  if not v_unlimited then
    select count(*) into v_recent
    from public.finder_jobs j
    where j.business_id = p_business and j.created_at > now() - interval '1 hour';
    if v_recent >= 30 then
      raise exception 'finder:rate' using errcode = 'P0001';
    end if;
  end if;

  if v_locked then
    select count(*) into v_recent
    from public.finder_jobs j
    where j.business_id = p_business and j.locked and j.created_at > now() - interval '24 hours';
    if v_recent >= greatest(coalesce(p_daily_cap, 5), 0) then
      raise exception 'finder:locked_cap' using errcode = 'P0001';
    end if;
  end if;

  -- What we already know. A person is never looked up in our records (we
  -- don't keep people): it always goes to the worker, who checks the
  -- company's own site.
  v_domain := public.finder_norm_domain(v_website);
  if v_qkind = 'person' then
    v_matches := null;
  elsif v_domain is not null then
    select array_agg(c.id) into v_matches
    from public.kb_companies c
    where c.domain = v_domain and public.finder_kb_servable(c.id);
  elsif v_qkind = 'phone' then
    select array_agg(x.id) into v_matches
    from (
      select c.id from public.kb_companies c
      where c.phone_norm = v_phone and public.finder_kb_servable(c.id)
      union
      select k.company_id from public.kb_contacts k
      where k.kind = 'phone' and k.value_norm = v_phone and k.bad_reports < 2
        and public.finder_kb_servable(k.company_id)
      limit 6
    ) x;
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

  if coalesce(cardinality(v_matches), 0) <= 1
     and not v_unlimited and not v_locked and public.finder_balance(p_business) < 1 then
    raise exception 'finder:no_credits' using errcode = 'P0001';
  end if;

  insert into public.finder_jobs (business_id, profile_id, kind, intake, unlimited, locked, items_total)
  values (
    p_business, v_profile.id, 'single',
    to_jsonb(v_profile) - 'id' - 'business_id' - 'created_at' - 'updated_at',
    v_unlimited, v_locked, 1
  )
  returning id into v_job;

  insert into public.finder_job_items (
    job_id, business_id, company, city, website, region, country,
    query_kind, query_email, query_phone, person
  )
  values (v_job, p_business, v_company, v_city, v_website, v_region, v_country,
          v_qkind, v_email, v_phone, v_person)
  returning id into v_item;

  perform public.finder_log(p_business, null, 'user', 'submit',
    jsonb_build_object('job', v_job, 'kind', 'single', 'query', v_qkind, 'mode', p_mode,
                       'known', coalesce(cardinality(v_matches), 0)));

  if coalesce(cardinality(v_matches), 0) = 1 then
    v_result := public.finder_deliver_kb(v_item, v_matches[1], v_locked);
    perform public.finder_settle(v_item, true, v_result);
    perform public.finder_job_refresh(v_job);
    return jsonb_build_object('status', 'found', 'job_id', v_job, 'item_id', v_item,
                              'result_id', v_result, 'locked', v_locked);
  end if;

  if coalesce(cardinality(v_matches), 0) > 1 then
    select jsonb_agg(jsonb_build_object(
             'kb_id', c.id, 'name', c.name, 'city', c.city, 'website', c.website))
      into v_candidates
    from (select * from public.kb_companies where id = any (v_matches[1:5])) c;
    update public.finder_job_items
      set status = 'ambiguous', candidates = v_candidates, updated_at = now()
      where id = v_item;
    perform public.finder_job_refresh(v_job);
    return jsonb_build_object('status', 'pick', 'job_id', v_job, 'item_id', v_item,
                              'candidates', v_candidates, 'locked', v_locked);
  end if;

  if not v_unlimited and not v_locked then
    insert into public.finder_credit_ledger (business_id, delta, reason, job_id, item_id)
    values (p_business, -1, 'hold', v_job, v_item);
    update public.finder_job_items set held = true where id = v_item;
    update public.finder_jobs set credits_held = 1 where id = v_job;
  end if;
  return jsonb_build_object('status', 'queued', 'job_id', v_job, 'item_id', v_item, 'locked', v_locked);
end;
$$;

revoke all on function public.finder_submit(uuid, uuid, text, jsonb, text, int)
  from public, anon, authenticated;
grant execute on function public.finder_submit(uuid, uuid, text, jsonb, text, int)
  to service_role;

-- The 0019 form keeps working (the app on main calls it until this branch
-- is merged): owner = unlimited, everyone else = full, a company search.
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
language sql
security definer
set search_path = ''
as $$
  select public.finder_submit(
    p_business, p_profile, p_kind,
    jsonb_build_object('kind', 'company', 'company', p_company, 'city', p_city,
                       'website', p_website, 'region', p_region, 'country', p_country),
    case when coalesce(p_unlimited, false) then 'owner' else 'full' end,
    null::int)
$$;

revoke all on function public.finder_submit(uuid, uuid, text, text, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.finder_submit(uuid, uuid, text, text, text, text, text, text, boolean)
  to service_role;

-- The worker's claim: same as 0019, plus what kind of search it is.
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
           'kind', i.query_kind,
           'company', i.company,
           'city', i.city,
           'website', i.website,
           'region', i.region,
           'country', i.country,
           'email', i.query_email,
           'phone', i.query_phone,
           'person', i.person,
           'needs', coalesce(j.intake -> 'needs', '[]'::jsonb),
           'intake_country', j.intake ->> 'country',
           'intake_province', j.intake ->> 'province',
           'intake_area', j.intake ->> 'area',
           'intake_place', j.intake ->> 'place',
           'intake_radius_km', (j.intake ->> 'radius_km')::int,
           -- "Find me customers" runs only: what to look for, and how many
           'want', case when i.query_kind = 'discover' then j.want end,
           'intake_industries', case when i.query_kind = 'discover' then j.intake -> 'industries' end,
           'intake_industry_other', case when i.query_kind = 'discover' then j.intake ->> 'industry_other' end,
           'intake_exclude', case when i.query_kind = 'discover' then j.intake ->> 'exclude' end,
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

-- Pick one of the candidates (free). Locked jobs stay locked and hold nothing.
create or replace function public.finder_pick(p_item uuid, p_choice int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.finder_job_items%rowtype;
  v_unlimited boolean;
  v_locked boolean;
  v_free boolean;
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
  select j.unlimited, j.locked into v_unlimited, v_locked from public.finder_jobs j where j.id = v_item.job_id;
  v_free := coalesce(v_unlimited, false) or coalesce(v_locked, false);

  if p_choice is null or p_choice < -1 or p_choice >= coalesce(jsonb_array_length(v_item.candidates), 0) then
    raise exception 'finder:bad_input' using errcode = 'P0001';
  end if;

  perform public.finder_log(v_item.business_id, null, 'user', 'pick',
    jsonb_build_object('item', v_item.id, 'choice', p_choice));

  if p_choice = -1 then
    -- The worker already looked (a held credit, or a free job it has tried)
    -- and found several; none was right.
    if v_item.held or (v_free and v_item.attempts > 0) then
      update public.finder_job_items set status = 'not_found', candidates = null, updated_at = now()
        where id = v_item.id;
      perform public.finder_settle(v_item.id, false, null);
      perform public.finder_job_refresh(v_item.job_id);
      return jsonb_build_object('status', 'not_found');
    end if;
    if not v_free then
      if public.finder_balance(v_item.business_id) < 1 then
        raise exception 'finder:no_credits' using errcode = 'P0001';
      end if;
      insert into public.finder_credit_ledger (business_id, delta, reason, job_id, item_id)
      values (v_item.business_id, -1, 'hold', v_item.job_id, v_item.id);
      update public.finder_jobs set credits_held = credits_held + 1 where id = v_item.job_id;
    end if;
    update public.finder_job_items
      set status = 'queued', held = not v_free, candidates = null, updated_at = now()
      where id = v_item.id;
    perform public.finder_job_refresh(v_item.job_id);
    return jsonb_build_object('status', 'queued');
  end if;

  v_pick := v_item.candidates -> p_choice;

  if v_pick ? 'kb_id' then
    if not v_free and not v_item.held
       and public.finder_balance(v_item.business_id) < 1 then
      raise exception 'finder:no_credits' using errcode = 'P0001';
    end if;
    if not public.finder_kb_servable((v_pick ->> 'kb_id')::uuid) then
      raise exception 'finder:not_found' using errcode = 'P0001';
    end if;
    v_result := public.finder_deliver_kb(v_item.id, (v_pick ->> 'kb_id')::uuid, coalesce(v_locked, false));
    perform public.finder_settle(v_item.id, true, v_result);
    perform public.finder_job_refresh(v_item.job_id);
    return jsonb_build_object('status', 'found', 'result_id', v_result);
  end if;

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

-- Unlock a locked result. Only for Boss (plan 'pro') and the owner, and
-- free: the owner's rule is that saved locked results unlock on upgrade.
-- Anyone else: finder:upgrade.
create or replace function public.finder_unlock(p_result uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.finder_results%rowtype;
  v_c public.kb_companies%rowtype;
  v_phone record;
  v_email record;
  v_form record;
  v_sources text[];
begin
  select * into v_r from public.finder_results where id = p_result;
  if v_r.id is null or not public.finder_can_act(v_r.business_id) then
    raise exception 'finder:not_found' using errcode = 'P0001';
  end if;
  if not v_r.locked then
    return jsonb_build_object('status', 'unlocked');
  end if;
  if not public.finder_is_unlimited(v_r.business_id)
     and not exists (select 1 from public.businesses b where b.id = v_r.business_id and b.plan = 'pro') then
    raise exception 'finder:upgrade' using errcode = 'P0001';
  end if;
  if v_r.kb_company_id is null or not public.finder_kb_servable(v_r.kb_company_id) then
    raise exception 'finder:not_found' using errcode = 'P0001';
  end if;

  select * into v_c from public.kb_companies where id = v_r.kb_company_id;
  select k.value, k.checks, k.source_url into v_phone from public.kb_contacts k
  where k.company_id = v_c.id and k.kind = 'phone' and k.bad_reports < 2
    and not public.finder_suppressed('phone', k.value_norm)
  order by k.quality desc, k.last_checked_at desc limit 1;
  select k.value, k.checks, k.source_url into v_email from public.kb_contacts k
  where k.company_id = v_c.id and k.kind = 'email' and k.bad_reports < 2
    and not public.finder_suppressed('email', k.value_norm)
  order by k.quality desc, k.role_address desc, k.last_checked_at desc limit 1;
  select k.value, k.source_url into v_form from public.kb_contacts k
  where k.company_id = v_c.id and k.kind = 'contact_form' and k.bad_reports < 2
    and not public.finder_suppressed('contact_form', k.value_norm)
  order by k.last_checked_at desc limit 1;

  select array_agg(distinct s) into v_sources
  from unnest(array[v_c.source_url, v_phone.source_url, v_email.source_url, v_form.source_url]) s
  where s is not null;

  update public.finder_results
    set locked = false,
        website = v_c.website, address = v_c.address,
        source_urls = coalesce(v_sources[1:10], '{}'),
        phone = left(v_phone.value, 50), phone_checks = v_phone.checks,
        email = left(v_email.value, 254), email_checks = v_email.checks,
        contact_form_url = left(v_form.value, 500)
    where id = v_r.id;

  perform public.finder_log(v_r.business_id, null, 'user', 'unlock', jsonb_build_object('result', v_r.id));
  return jsonb_build_object('status', 'unlocked');
end;
$$;

revoke all on function public.finder_unlock(uuid) from public, anon;
grant execute on function public.finder_unlock(uuid) to authenticated, service_role;

-- Unlock every saved locked result of a business that is now Boss (or the
-- owner). Results whose company was removed stay locked. Returns how many
-- were unlocked.
create or replace function public.finder_unlock_all(p_business uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_n int := 0;
begin
  if not public.finder_is_unlimited(p_business)
     and not exists (select 1 from public.businesses b where b.id = p_business and b.plan = 'pro') then
    return 0;
  end if;
  for v_id in
    select r.id from public.finder_results r
    where r.business_id = p_business and r.locked
    order by r.created_at desc
    limit 500
  loop
    begin
      perform public.finder_unlock(v_id);
      v_n := v_n + 1;
    exception when others then
      null;
    end;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.finder_unlock_all(uuid) from public, anon, authenticated;
grant execute on function public.finder_unlock_all(uuid) to service_role;

-- The worker finishes an item: same as 0019, but a locked job gets a
-- locked result (the knowledge base still learns the contacts).
create or replace function public.finder_worker_complete(p_worker uuid, p_item uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.finder_job_items%rowtype;
  v_locked boolean;
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
  select coalesce(j.locked, false) into v_locked from public.finder_jobs j where j.id = v_item.job_id;

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

    if public.finder_suppressed('domain', v_domain) or public.finder_suppressed('company', v_name_norm) then
      v_outcome := 'not_found';
    end if;
  end if;

  if v_outcome = 'found' then
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
      select v_item.business_id, v_item.job_id, v_item.id, v_company, c.name,
             case when v_locked then null else c.website end,
             c.city, c.region, c.country,
             case when v_locked then null else c.address end,
             case when v_locked then null else left(v_phone ->> 'value', 50) end,
             case when v_locked then null else v_phone -> 'checks' end,
             case when v_locked then null else left(v_email ->> 'value', 254) end,
             case when v_locked then null else v_email -> 'checks' end,
             case when v_locked then null else left(v_form ->> 'value', 500) end,
             case when v_locked then '{}' else coalesce(v_sources[1:10], '{}') end,
             nullif(left(p_payload ->> 'why', 500), ''),
             v_locked, now()
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
    jsonb_build_object('item', v_item.id, 'outcome', v_outcome, 'contacts', v_kept, 'locked', v_locked));
  return jsonb_build_object('status', v_outcome, 'result_id', v_result);
end;
$$;

revoke all on function public.finder_worker_complete(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finder_worker_complete(uuid, uuid, jsonb) to service_role;

-- ============================================================
-- 8. "Find me customers": discovery runs
--    The app starts a run from the saved intake (industries + area +
--    radius). The worker finds NEW matching businesses on OpenStreetMap
--    and sends them back with /discovered; each one becomes a normal
--    search item in the same job (researched on its own website like a
--    single search, locked / credits / owner rules unchanged). Companies
--    the user already has (results, leads, earlier searches) are skipped.
-- ============================================================

-- Start a run (service role; the app checks the session and the plan).
-- Errors: finder:no_profile (intake not filled), finder:no_industries,
-- finder:discover_busy (one run at a time), finder:no_credits,
-- finder:locked_cap, finder:rate, finder:bad_input.
create or replace function public.finder_discover_submit(
  p_business uuid,
  p_profile uuid,
  p_mode text,
  p_want int,
  p_daily_cap int,
  p_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.finder_profiles%rowtype;
  v_unlimited boolean;
  v_locked boolean;
  v_recent int;
  v_job uuid;
  v_item uuid;
begin
  if coalesce(p_mode, '') not in ('owner', 'full', 'locked') or p_want is null or p_want not between 1 and 50 then
    raise exception 'finder:bad_input' using errcode = 'P0001';
  end if;
  select * into v_profile from public.finder_profiles p where p.id = p_profile and p.business_id = p_business;
  if v_profile.id is null or v_profile.aup_version is null or v_profile.my_business is null then
    raise exception 'finder:no_profile' using errcode = 'P0001';
  end if;
  if cardinality(v_profile.industries) = 0 and nullif(trim(coalesce(v_profile.industry_other, '')), '') is null then
    raise exception 'finder:no_industries' using errcode = 'P0001';
  end if;

  v_unlimited := p_mode = 'owner' or public.finder_is_unlimited(p_business);
  v_locked := p_mode = 'locked' and not v_unlimited;

  perform pg_advisory_xact_lock(hashtextextended('finder:' || p_business::text, 0));

  if exists (
    select 1 from public.finder_job_items i
    where i.business_id = p_business and i.query_kind = 'discover' and i.status in ('queued', 'working')
  ) then
    raise exception 'finder:discover_busy' using errcode = 'P0001';
  end if;
  if not v_unlimited then
    select count(*) into v_recent from public.finder_jobs j
    where j.business_id = p_business and j.created_at > now() - interval '1 hour';
    if v_recent >= 30 then
      raise exception 'finder:rate' using errcode = 'P0001';
    end if;
  end if;
  if v_locked then
    select count(*) into v_recent from public.finder_jobs j
    where j.business_id = p_business and j.locked and j.created_at > now() - interval '24 hours';
    if v_recent >= greatest(coalesce(p_daily_cap, 5), 0) then
      raise exception 'finder:locked_cap' using errcode = 'P0001';
    end if;
  end if;
  if not v_unlimited and not v_locked and public.finder_balance(p_business) < 1 then
    raise exception 'finder:no_credits' using errcode = 'P0001';
  end if;

  insert into public.finder_jobs (business_id, profile_id, kind, intake, unlimited, locked, items_total, want)
  values (p_business, v_profile.id, 'pack',
          to_jsonb(v_profile) - 'id' - 'business_id' - 'created_at' - 'updated_at',
          v_unlimited, v_locked, 1, p_want)
  returning id into v_job;

  insert into public.finder_job_items (job_id, business_id, company, city, region, country, query_kind)
  values (v_job, p_business,
          left(coalesce(nullif(trim(coalesce(p_label, '')), ''), 'Find me customers'), 200),
          nullif(left(coalesce(v_profile.place, ''), 120), ''),
          nullif(left(coalesce(v_profile.province, ''), 60), ''),
          v_profile.country, 'discover')
  returning id into v_item;

  perform public.finder_log(p_business, null, 'user', 'discover',
    jsonb_build_object('job', v_job, 'mode', p_mode, 'want', p_want));
  return jsonb_build_object('status', 'queued', 'job_id', v_job, 'item_id', v_item, 'locked', v_locked);
end;
$$;

revoke all on function public.finder_discover_submit(uuid, uuid, text, int, int, text) from public, anon, authenticated;
grant execute on function public.finder_discover_submit(uuid, uuid, text, int, int, text) to service_role;

-- The worker's list of new businesses for a run. p_payload:
--   {companies: [{name, website?, city?, region?, country?, source_url}]}
-- Up to the run's `want` new ones become search items; known ones (in our
-- records) are delivered at once. Boss: 1 credit held per new item (the
-- run stops early when credits run out). Returns {status, added, known}.
create or replace function public.finder_worker_discovered(p_worker uuid, p_item uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.finder_job_items%rowtype;
  v_job public.finder_jobs%rowtype;
  v_free boolean;
  v_want int;
  v_added int := 0;
  v_known int := 0;
  v_c jsonb;
  v_name text;
  v_norm text;
  v_domain text;
  v_city text;
  v_website text;
  v_country text;
  v_kb uuid;
  v_child uuid;
  v_result uuid;
  v_short boolean := false;
begin
  select * into v_item from public.finder_job_items where id = p_item for update;
  if v_item.id is null or v_item.status <> 'working' or v_item.worker_id is distinct from p_worker
     or v_item.query_kind <> 'discover' then
    raise exception 'finder:not_yours' using errcode = 'P0001';
  end if;
  select * into v_job from public.finder_jobs where id = v_item.job_id;
  v_free := coalesce(v_job.unlimited, false) or coalesce(v_job.locked, false);
  v_want := least(greatest(coalesce(v_job.want, 10), 1), 50);

  perform pg_advisory_xact_lock(hashtextextended('finder:' || v_item.business_id::text, 0));

  for v_c in
    select c from jsonb_array_elements(coalesce(p_payload -> 'companies', '[]'::jsonb)) c limit 150
  loop
    exit when v_added >= v_want;
    v_name := nullif(trim(regexp_replace(left(coalesce(v_c ->> 'name', ''), 200), '\s+', ' ', 'g')), '');
    continue when v_name is null;
    v_norm := public.finder_norm_company(v_name);
    continue when v_norm = '';
    v_website := nullif(left(coalesce(v_c ->> 'website', ''), 300), '');
    if v_website is not null and v_website !~* '^https?://[^\s]+$' then
      v_website := null;
    end if;
    v_domain := public.finder_norm_domain(v_website);
    v_city := nullif(trim(left(coalesce(v_c ->> 'city', ''), 120)), '');
    v_country := nullif(upper(left(coalesce(v_c ->> 'country', ''), 2)), '');
    if v_country is not null and v_country !~ '^[A-Z]{2}$' then
      v_country := null;
    end if;

    -- On the removal list, or already known to this user: skip.
    continue when public.finder_suppressed('domain', v_domain) or public.finder_suppressed('company', v_norm);
    continue when exists (
      select 1 from public.finder_results r
      where r.business_id = v_item.business_id
        and ((v_domain is not null and public.finder_norm_domain(r.website) = v_domain)
             or (public.finder_norm_company(r.company_name) = v_norm
                 and coalesce(lower(r.city), '') = coalesce(lower(v_city), coalesce(lower(r.city), ''))))
    );
    continue when exists (
      select 1 from public.leads l
      where l.business_id = v_item.business_id
        and ((v_domain is not null and public.finder_norm_domain(l.website) = v_domain)
             or public.finder_norm_company(coalesce(l.company, l.name)) = v_norm)
    );
    continue when exists (
      select 1 from public.finder_job_items i
      where i.business_id = v_item.business_id and i.id <> v_item.id and i.query_kind <> 'discover'
        and ((v_domain is not null and public.finder_norm_domain(i.website) = v_domain)
             or (public.finder_norm_company(i.company) = v_norm
                 and coalesce(lower(i.city), '') = coalesce(lower(v_city), coalesce(lower(i.city), ''))))
    );

    if not v_free and public.finder_balance(v_item.business_id) < 1 then
      v_short := true;
      exit;
    end if;

    insert into public.finder_job_items (job_id, business_id, company, city, website, region, country, query_kind)
    values (v_job.id, v_item.business_id, v_name, v_city, v_website,
            nullif(left(coalesce(v_c ->> 'region', ''), 60), ''), v_country, 'company')
    returning id into v_child;

    v_kb := null;
    if v_domain is not null then
      select c.id into v_kb from public.kb_companies c
      where c.domain = v_domain and public.finder_kb_servable(c.id);
    end if;
    if v_kb is not null then
      v_result := public.finder_deliver_kb(v_child, v_kb, coalesce(v_job.locked, false));
      perform public.finder_settle(v_child, true, v_result);
      v_known := v_known + 1;
    elsif not v_free then
      insert into public.finder_credit_ledger (business_id, delta, reason, job_id, item_id)
      values (v_item.business_id, -1, 'hold', v_job.id, v_child);
      update public.finder_job_items set held = true where id = v_child;
      update public.finder_jobs set credits_held = credits_held + 1 where id = v_job.id;
    end if;
    v_added := v_added + 1;
  end loop;

  update public.finder_job_items
    set status = case when v_added > 0 then 'found' else 'not_found' end,
        worker_id = null,
        note = left(case
                 when v_added = 0 and v_short then 'out of lead credits'
                 when v_added = 0 then coalesce(nullif(p_payload ->> 'note', ''), 'no new matching businesses found')
                 when v_short then v_added || ' new companies (stopped: out of lead credits)'
                 else v_added || ' new companies'
               end, 300),
        updated_at = now()
    where id = v_item.id;
  perform public.finder_job_refresh(v_job.id);
  perform public.finder_log(v_item.business_id, p_worker, 'worker', 'discovered',
    jsonb_build_object('item', v_item.id, 'added', v_added, 'known', v_known, 'short', v_short));
  return jsonb_build_object('status', 'ok', 'added', v_added, 'known', v_known);
end;
$$;

revoke all on function public.finder_worker_discovered(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finder_worker_discovered(uuid, uuid, jsonb) to service_role;
