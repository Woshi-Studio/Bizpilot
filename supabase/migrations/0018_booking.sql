-- Jephelen Phase 2G: own booking page (replaces Calendly)
-- Run AFTER 0017_plans_limits.sql.
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to run more than once.
--
-- What changes:
--   1. plan_limits_internal() also returns 'booking_links':
--      Starter 0, Hustle 1, Boss unlimited, owner unlimited. Everything
--      else it returns is exactly as in 0017.
--   2. activities.source may also be 'booking' (bookings made online).
--   3. api_keys scopes: + 'calendar:read' (agent API list_bookings).
--      Live keys that already had BOTH contacts:read and calendar:write
--      get calendar:read too (they could already read today's meetings).
--   4. booking_settings: one per business. Public link name (slug), weekly
--      hours + time zone, notice, how far ahead, buffers, max a day, page
--      language, logo, accent color, intro, and an optional Google
--      "secret address in iCal format" (read only, https
--      calendar.google.com only). Owner only.
--   5. booking_meeting_types: name, 15/30/45/60 min, description,
--      location, intake questions, optional deposit (Boss). Owner only.
--      A trigger enforces the plan's number of live booking links.
--   6. bookings: one row per booking. Owners can read (not the visitor's
--      manage token or IP hash) and only change the status
--      (Attended / No-show / Cancelled). Created ONLY by the server
--      through booking_create(), which runs as the service role.
--   7. booking_ical_cache: the Google busy times, refreshed about every
--      15 minutes by the server. No user access at all.
--   8. booking_slot_check / booking_create / booking_reschedule /
--      booking_cancel: SECURITY DEFINER, service role only. One booking at
--      a time per business (advisory lock) + a unique start per business,
--      so the same time can't be booked twice. They check again: page on,
--      type live under the plan, weekly hours in the business time zone,
--      minimum notice, how far ahead, max per day, buffers, meetings,
--      calls and blocked time in the calendar, other bookings and the
--      Google busy times. Rate limits: 5 an hour per visitor IP, 3 an hour
--      per email, 30 an hour per business.
--   9. Storage: a PUBLIC 'booking-logos' bucket (PNG / JPG / WEBP, 512 KB,
--      path <business_id>/<file>, owner writes only). Logos are shown on a
--      public page anyway.
--
-- What does NOT change (all 0011-0017 protections kept):
--   - protect_business_billing, businesses_plan_check
--   - ai_usage read-only, consume_ai_credit()
--   - guard_public_lead / guard_public_lead_line and the public lead policy
--   - receipts / client-docs / service-images buckets and their policies,
--     the RESTRICTIVE "Plan storage limit" policy
--   - email_usage read-only, consume_email_send()
--   - api_keys / agent_audit policies, grants and the stay-revoked trigger
--   - every 0017 plan trigger, plan_usage(), plan_limits(), share_links
--   The only replaced objects are plan_limits_internal() (one key added),
--   the activities source check (one value added) and the api_keys scopes
--   check (one scope added).

-- ============================================================
-- 1. Plan limits: + booking_links
-- ============================================================
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
      'email_daily', null, 'business_lines', null, 'booking_links', null
    );
  end if;

  return case coalesce(v_plan, 'free')
    when 'pro' then jsonb_build_object(
      'plan', 'pro', 'unlimited', false,
      'contacts', null, 'docs_28d', null, 'storage_bytes', 10737418240,
      'email_daily', 200, 'business_lines', null, 'booking_links', null)
    when 'premium' then jsonb_build_object(
      'plan', 'premium', 'unlimited', false,
      'contacts', 150, 'docs_28d', 50, 'storage_bytes', 1073741824,
      'email_daily', 50, 'business_lines', 3, 'booking_links', 1)
    else jsonb_build_object(
      'plan', 'free', 'unlimited', false,
      'contacts', 10, 'docs_28d', 5, 'storage_bytes', 52428800,
      'email_daily', 0, 'business_lines', 1, 'booking_links', 0)
  end;
end;
$$;

revoke all on function public.plan_limits_internal(uuid) from public, anon, authenticated;

-- ============================================================
-- 2. Timeline rows made by the booking page
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
      and pg_get_constraintdef(con.oid) ilike '%source%'
  loop
    execute format('alter table public.activities drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.activities
  add constraint activities_source_check
  check (source in ('manual', 'mailer', 'gmail', 'phone_line', 'import', 'booking'));

-- ============================================================
-- 3. Agent API: calendar:read
-- ============================================================
alter table public.api_keys drop constraint if exists api_keys_scopes_check;
alter table public.api_keys add constraint api_keys_scopes_check
  check (
    cardinality(scopes) between 1 and 7
    and scopes <@ array[
      'customers:write',
      'leads:write',
      'contacts:read',
      'tasks:write',
      'calendar:write',
      'activities:write',
      'calendar:read'
    ]::text[]
  );

update public.api_keys
set scopes = array_append(scopes, 'calendar:read')
where revoked_at is null
  and scopes @> array['contacts:read', 'calendar:write']::text[]
  and not scopes @> array['calendar:read']::text[];

-- ============================================================
-- 4. Booking settings
-- ============================================================
create table if not exists public.booking_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  slug text not null,
  enabled boolean not null default false,
  timezone text not null default 'America/Toronto',
  weekly jsonb not null default
    '[[],[["09:00","17:00"]],[["09:00","17:00"]],[["09:00","17:00"]],[["09:00","17:00"]],[["09:00","17:00"]],[]]'::jsonb,
  min_notice_hours int not null default 4,
  horizon_days int not null default 60,
  buffer_before_min int not null default 0,
  buffer_after_min int not null default 15,
  max_per_day int,
  language text not null default 'en',
  logo_path text,
  accent text,
  intro text,
  business_line text,
  ical_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.booking_settings drop constraint if exists booking_settings_values_check;
alter table public.booking_settings add constraint booking_settings_values_check
  check (
    slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
    and char_length(timezone) between 1 and 64
    and jsonb_typeof(weekly) = 'array'
    and jsonb_array_length(weekly) = 7
    and pg_column_size(weekly) < 4000
    and min_notice_hours between 0 and 720
    and horizon_days between 1 and 365
    and buffer_before_min between 0 and 240
    and buffer_after_min between 0 and 240
    and (max_per_day is null or max_per_day between 1 and 50)
    and language in ('en', 'fr', 'es')
    and (logo_path is null or (char_length(logo_path) <= 300 and logo_path like business_id::text || '/%'))
    and (accent is null or accent ~ '^#[0-9a-f]{6}$')
    and (intro is null or char_length(intro) <= 1000)
    and (business_line is null or char_length(business_line) between 1 and 60)
    and (ical_url is null or (
      char_length(ical_url) <= 500
      and ical_url ~ '^https://calendar\.google\.com/calendar/ical/[^/?#[:space:]]{3,200}/(private-[0-9a-f]{16,64}|public)/basic\.ics$'
    ))
  );

create unique index if not exists booking_settings_slug_idx
  on public.booking_settings (lower(slug));

alter table public.booking_settings enable row level security;

drop policy if exists "Owners manage own booking settings" on public.booking_settings;
create policy "Owners manage own booking settings"
  on public.booking_settings for all
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

revoke all on public.booking_settings from anon;

-- A real time zone, and reserved link names only for the owner's
-- businesses (so nobody else can take /book/woshi).
create or replace function public.booking_settings_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'booking:timezone' using errcode = 'P0001';
  end if;

  if lower(new.slug) in ('woshi', 'jephelen', 'vwa', 'admin', 'api', 'book', 'booking', 'help', 'support')
     and (tg_op = 'INSERT' or lower(new.slug) is distinct from lower(old.slug))
     and public.plan_limits_apply()
     and not exists (
       select 1 from public.plan_unlimited_businesses u where u.business_id = new.business_id
     )
  then
    raise exception 'booking:slug_reserved' using errcode = 'P0001';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists booking_settings_guard on public.booking_settings;
create trigger booking_settings_guard
  before insert or update on public.booking_settings
  for each row execute function public.booking_settings_guard();

-- ============================================================
-- 5. Meeting types (each one is a booking link)
-- ============================================================
create table if not exists public.booking_meeting_types (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  slug text not null,
  name text not null,
  duration_min int not null default 30,
  description text,
  location_kind text not null default 'video',
  location_detail text,
  questions jsonb not null default '[]'::jsonb,
  deposit_cents int,
  business_line text,
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, slug)
);

alter table public.booking_meeting_types drop constraint if exists booking_meeting_types_values_check;
alter table public.booking_meeting_types add constraint booking_meeting_types_values_check
  check (
    slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$'
    and char_length(name) between 1 and 80
    and duration_min in (15, 30, 45, 60)
    and (description is null or char_length(description) <= 1000)
    and location_kind in ('video', 'phone', 'in_person', 'we_call')
    and (location_detail is null or char_length(location_detail) <= 300)
    and jsonb_typeof(questions) = 'array'
    and jsonb_array_length(questions) <= 10
    and pg_column_size(questions) < 8000
    and (deposit_cents is null or deposit_cents between 100 and 100000000)
    and (business_line is null or char_length(business_line) between 1 and 60)
    and position between 0 and 1000
  );

create index if not exists booking_meeting_types_business_idx
  on public.booking_meeting_types (business_id, position, created_at);

alter table public.booking_meeting_types enable row level security;

drop policy if exists "Owners manage own meeting types" on public.booking_meeting_types;
create policy "Owners manage own meeting types"
  on public.booking_meeting_types for all
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

revoke all on public.booking_meeting_types from anon;

-- Live links by plan (Starter 0, Hustle 1, Boss / owner unlimited) and
-- deposits on Boss only. Errors: plan_limit:booking:<n>, plan_limit:deposit.
create or replace function public.enforce_booking_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limits jsonb;
  v_limit  int;
  v_used   int;
begin
  new.updated_at := now();
  if not public.plan_limits_apply() then
    return new;
  end if;

  v_limits := public.plan_limits_internal(new.business_id);

  if new.deposit_cents is not null
     and (tg_op = 'INSERT' or new.deposit_cents is distinct from old.deposit_cents)
     and not coalesce((v_limits ->> 'unlimited')::boolean, false)
     and v_limits ->> 'plan' <> 'pro'
  then
    raise exception 'plan_limit:deposit' using errcode = 'P0001';
  end if;

  if new.active and (tg_op = 'INSERT' or not old.active) then
    v_limit := (v_limits ->> 'booking_links')::int;
    if v_limit is not null then
      perform pg_advisory_xact_lock(hashtextextended('plan_booking:' || new.business_id::text, 0));
      select count(*) into v_used
      from public.booking_meeting_types m
      where m.business_id = new.business_id and m.active and m.id <> new.id;
      if v_used >= v_limit then
        raise exception 'plan_limit:booking:%', v_limit using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists booking_meeting_types_plan on public.booking_meeting_types;
create trigger booking_meeting_types_plan
  before insert or update on public.booking_meeting_types
  for each row execute function public.enforce_booking_links();

-- ============================================================
-- 6. Bookings
-- ============================================================
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  meeting_type_id uuid references public.booking_meeting_types (id) on delete set null,
  activity_id uuid references public.activities (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  type_name text not null,
  duration_min int not null,
  location_kind text,
  location_detail text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed',
  name text not null,
  email text not null,
  phone text,
  note text,
  answers jsonb not null default '[]'::jsonb,
  visitor_tz text,
  language text not null default 'en',
  deposit_cents int,
  manage_token text not null,
  ip_hash text,
  email_status text,
  reminder_24h_at timestamptz,
  reminder_1h_at timestamptz,
  reschedule_count int not null default 0,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  rescheduled_at timestamptz
);

alter table public.bookings drop constraint if exists bookings_values_check;
alter table public.bookings add constraint bookings_values_check
  check (
    ends_at > starts_at
    and char_length(type_name) between 1 and 80
    and duration_min in (15, 30, 45, 60)
    and (location_kind is null or location_kind in ('video', 'phone', 'in_person', 'we_call'))
    and (location_detail is null or char_length(location_detail) <= 300)
    and status in ('confirmed', 'cancelled', 'attended', 'no_show')
    and char_length(name) between 1 and 120
    and char_length(email) between 3 and 254
    and (phone is null or char_length(phone) <= 50)
    and (note is null or char_length(note) <= 2000)
    and jsonb_typeof(answers) = 'array'
    and pg_column_size(answers) < 16000
    and (visitor_tz is null or char_length(visitor_tz) <= 64)
    and language in ('en', 'fr', 'es')
    and manage_token ~ '^[A-Za-z0-9_-]{43}$'
    and (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$')
    and (email_status is null or email_status in ('sent', 'not_configured', 'failed'))
    and reschedule_count between 0 and 20
  );

create unique index if not exists bookings_token_idx on public.bookings (manage_token);
create unique index if not exists bookings_one_per_start_idx
  on public.bookings (business_id, starts_at) where status = 'confirmed';
create index if not exists bookings_business_start_idx on public.bookings (business_id, starts_at);
create index if not exists bookings_reminders_idx on public.bookings (status, starts_at);
create index if not exists bookings_ip_idx on public.bookings (ip_hash, created_at);

alter table public.bookings enable row level security;

drop policy if exists "Owners view own bookings" on public.bookings;
create policy "Owners view own bookings"
  on public.bookings for select
  to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners mark own bookings" on public.bookings;
create policy "Owners mark own bookings"
  on public.bookings for update
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

-- Users read everything except the manage token (the visitor's key to
-- reschedule / cancel; the server needs it for reminder emails) and the
-- IP hash, and only ever
-- write status. No insert, no delete.
revoke all on public.bookings from anon, authenticated;
grant select (id, business_id, meeting_type_id, activity_id, customer_id, lead_id, type_name,
              duration_min, location_kind, location_detail, starts_at, ends_at, status, name,
              email, phone, note, answers, visitor_tz, language, deposit_cents, email_status,
              reminder_24h_at, reminder_1h_at, reschedule_count, created_at, cancelled_at,
              rescheduled_at)
  on public.bookings to authenticated;
grant update (status) on public.bookings to authenticated;

-- A cancelled booking stays cancelled (for users); cancelled_at is set.
create or replace function public.bookings_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'cancelled' and new.status <> 'cancelled' and public.plan_limits_apply() then
    new.status := 'cancelled';
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_guard_update on public.bookings;
create trigger bookings_guard_update
  before update on public.bookings
  for each row execute function public.bookings_guard_update();

-- ============================================================
-- 7. Google busy-time cache (server only)
-- ============================================================
create table if not exists public.booking_ical_cache (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  fetched_at timestamptz not null default now(),
  url_hash text,
  busy jsonb not null default '[]'::jsonb check (jsonb_typeof(busy) = 'array'),
  events int not null default 0,
  error text check (error is null or char_length(error) <= 200)
);

alter table public.booking_ical_cache enable row level security;
-- No policies on purpose: only the server (service role) reads and writes.
revoke all on public.booking_ical_cache from anon, authenticated;

-- ============================================================
-- 8. Booking functions (service role only)
-- ============================================================

-- Checks one start time for one meeting type. Raises booking:<reason>:
-- disabled, type, plan, grid, notice, horizon, hours, full, taken.
-- p_exclude: a booking being moved (its own time doesn't count as busy).
create or replace function public.booking_slot_check(
  p_business uuid,
  p_type uuid,
  p_starts timestamptz,
  p_exclude uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s          public.booking_settings%rowtype;
  t          public.booking_meeting_types%rowtype;
  v_links    int;
  v_rank     int;
  v_ends     timestamptz;
  v_from     timestamptz;
  v_to       timestamptz;
  v_local    timestamp;
  v_local_e  timestamp;
  v_ok       boolean := false;
  v_count    int;
  v_activity uuid;
  r          record;
begin
  select * into s from public.booking_settings where business_id = p_business;
  if not found or not s.enabled then
    raise exception 'booking:disabled' using errcode = 'P0001';
  end if;

  select * into t from public.booking_meeting_types
  where id = p_type and business_id = p_business;
  if not found or not t.active then
    raise exception 'booking:type' using errcode = 'P0001';
  end if;

  -- After a downgrade only the first N live types stay bookable
  -- (position, then oldest, then id).
  v_links := (public.plan_limits_internal(p_business) ->> 'booking_links')::int;
  if v_links is not null then
    select count(*) into v_rank
    from public.booking_meeting_types m
    where m.business_id = p_business and m.active
      and (m.position, m.created_at, m.id) < (t.position, t.created_at, t.id);
    if v_rank >= v_links then
      raise exception 'booking:plan' using errcode = 'P0001';
    end if;
  end if;

  if p_starts is null
     or extract(second from p_starts) <> 0
     or extract(minute from p_starts)::int % 15 <> 0 then
    raise exception 'booking:grid' using errcode = 'P0001';
  end if;

  v_ends := p_starts + make_interval(mins => t.duration_min);

  if p_starts < now() + make_interval(hours => s.min_notice_hours) then
    raise exception 'booking:notice' using errcode = 'P0001';
  end if;
  if p_starts > now() + make_interval(days => s.horizon_days) then
    raise exception 'booking:horizon' using errcode = 'P0001';
  end if;

  -- Inside one of that weekday's ranges, in the business's time zone.
  v_local := p_starts at time zone s.timezone;
  v_local_e := v_ends at time zone s.timezone;
  if v_local::date = v_local_e::date then
    for r in
      select value from jsonb_array_elements(coalesce(s.weekly -> extract(dow from v_local)::int, '[]'::jsonb))
    loop
      if to_char(v_local, 'HH24:MI') >= (r.value ->> 0)
         and to_char(v_local_e, 'HH24:MI') <= (r.value ->> 1) then
        v_ok := true;
        exit;
      end if;
    end loop;
  end if;
  if not v_ok then
    raise exception 'booking:hours' using errcode = 'P0001';
  end if;

  if s.max_per_day is not null then
    select count(*) into v_count
    from public.bookings b
    where b.business_id = p_business
      and b.status <> 'cancelled'
      and (p_exclude is null or b.id <> p_exclude)
      and (b.starts_at at time zone s.timezone)::date = v_local::date;
    if v_count >= s.max_per_day then
      raise exception 'booking:full' using errcode = 'P0001';
    end if;
  end if;

  v_from := p_starts - make_interval(mins => s.buffer_before_min);
  v_to := v_ends + make_interval(mins => s.buffer_after_min);

  if p_exclude is not null then
    select b.activity_id into v_activity from public.bookings b where b.id = p_exclude;
  end if;

  if exists (
       select 1 from public.bookings b
       where b.business_id = p_business
         and b.status <> 'cancelled'
         and (p_exclude is null or b.id <> p_exclude)
         and b.starts_at < v_to and b.ends_at > v_from
     )
     or exists (
       -- meetings, calls and blocked time in the calendar
       select 1 from public.activities a
       where a.business_id = p_business
         and a.kind in ('meeting', 'call', 'block')
         and (v_activity is null or a.id <> v_activity)
         and a.occurred_at < v_to
         and coalesce(a.ends_at, a.occurred_at + case a.kind when 'call' then interval '30 minutes'
                                                             else interval '60 minutes' end) > v_from
     )
     or exists (
       -- the Google calendar's busy times
       select 1
       from public.booking_ical_cache c, jsonb_array_elements(c.busy) e
       where c.business_id = p_business
         and (e ->> 0)::timestamptz < v_to
         and (e ->> 1)::timestamptz > v_from
     )
  then
    raise exception 'booking:taken' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ends_at', v_ends,
    'timezone', s.timezone,
    'type_name', t.name,
    'duration', t.duration_min,
    'line', coalesce(t.business_line, s.business_line),
    'location_kind', t.location_kind,
    'location_detail', t.location_detail,
    'deposit_cents', t.deposit_cents
  );
end;
$$;

revoke all on function public.booking_slot_check(uuid, uuid, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.booking_slot_check(uuid, uuid, timestamptz, uuid) to service_role;

-- A new booking: the meeting on the calendar, the lead (found or created
-- by email, tagged with the business line), a timeline note and the
-- booking row, all in one transaction.
create or replace function public.booking_create(
  p_business uuid,
  p_type uuid,
  p_starts timestamptz,
  p_name text,
  p_email text,
  p_phone text,
  p_note text,
  p_answers jsonb,
  p_visitor_tz text,
  p_language text,
  p_token text,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v          jsonb;
  v_ends     timestamptz;
  v_line     text;
  v_type     text;
  v_tz       text;
  v_email    text := lower(trim(coalesce(p_email, '')));
  v_name     text := left(regexp_replace(trim(coalesce(p_name, '')), '[\r\n]+', ' ', 'g'), 120);
  v_customer uuid;
  v_lead     uuid;
  v_activity uuid;
  v_booking  uuid;
  v_limit    int;
  v_used     int;
  v_count    int;
  v_body     text;
  v_when     text;
begin
  if char_length(v_name) < 1
     or char_length(v_email) > 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or coalesce(p_token, '') !~ '^[A-Za-z0-9_-]{43}$'
     or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$')
     or jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_answers, '[]'::jsonb)) > 10
     or coalesce(p_language, 'en') not in ('en', 'fr', 'es')
  then
    raise exception 'booking:input' using errcode = 'P0001';
  end if;

  -- One booking at a time per business.
  perform pg_advisory_xact_lock(hashtextextended('booking:' || p_business::text, 0));

  if p_ip_hash is not null then
    select count(*) into v_count from public.bookings b
    where b.ip_hash = p_ip_hash and b.created_at > now() - interval '1 hour';
    if v_count >= 5 then
      raise exception 'booking:rate' using errcode = 'P0001';
    end if;
  end if;

  select count(*) into v_count from public.bookings b
  where b.business_id = p_business and lower(b.email) = v_email
    and b.created_at > now() - interval '1 hour';
  if v_count >= 3 then
    raise exception 'booking:rate' using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.bookings b
  where b.business_id = p_business and b.created_at > now() - interval '1 hour';
  if v_count >= 30 then
    raise exception 'booking:rate' using errcode = 'P0001';
  end if;

  v := public.booking_slot_check(p_business, p_type, p_starts, null);
  v_ends := (v ->> 'ends_at')::timestamptz;
  v_line := v ->> 'line';
  v_type := v ->> 'type_name';
  v_tz := v ->> 'timezone';
  v_when := to_char(p_starts at time zone v_tz, 'Dy Mon FMDD, FMHH12:MI AM') || ' (' || v_tz || ')';

  -- The contact: a customer with this email, else a lead, else a new lead
  -- (if the plan has room; the booking goes ahead either way).
  select c.id into v_customer
  from public.customers c
  where c.business_id = p_business and lower(c.email) = v_email
  order by c.created_at
  limit 1;

  if v_customer is null then
    select l.id into v_lead
    from public.leads l
    where l.business_id = p_business and lower(l.email) = v_email
    order by (l.status = 'converted'), l.created_at desc
    limit 1;

    if v_lead is not null then
      if v_line is not null then
        update public.leads set business_line = v_line
        where id = v_lead and business_line is null;
      end if;
    else
      v_limit := (public.plan_limits_internal(p_business) ->> 'contacts')::int;
      v_used := 0;
      if v_limit is not null then
        perform pg_advisory_xact_lock(hashtextextended('plan_contacts:' || p_business::text, 0));
        select
          (select count(*) from public.customers c where c.business_id = p_business)
          + (select count(*) from public.leads l
             where l.business_id = p_business and l.status is distinct from 'converted')
        into v_used;
      end if;
      if v_limit is null or v_used < v_limit then
        insert into public.leads (business_id, name, email, phone, message, status, channel, business_line)
        values (
          p_business, v_name, v_email, nullif(left(trim(coalesce(p_phone, '')), 50), ''),
          left('Booked online: ' || v_type || ', ' || v_when
               || coalesce(E'\n' || nullif(trim(p_note), ''), ''), 2000),
          'new', 'inbound', v_line
        )
        returning id into v_lead;
      end if;
    end if;
  end if;

  v_body := 'Booked online.' || E'\n'
    || 'Email: ' || v_email
    || coalesce(E'\nPhone: ' || nullif(trim(p_phone), ''), '')
    || coalesce(E'\nNote: ' || nullif(trim(p_note), ''), '')
    || coalesce((
         select E'\n' || string_agg(left(coalesce(a ->> 'label', ''), 200) || ': ' || left(coalesce(a ->> 'value', ''), 2000), E'\n')
         from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
       ), '');

  insert into public.activities
    (business_id, customer_id, lead_id, business_line, kind, subject, body, occurred_at, ends_at, source)
  values
    (p_business, v_customer, v_lead, v_line, 'meeting',
     left(v_type || ' with ' || v_name, 300), left(v_body, 5000), p_starts, v_ends, 'booking')
  returning id into v_activity;

  insert into public.bookings (
    business_id, meeting_type_id, activity_id, customer_id, lead_id, type_name, duration_min,
    location_kind, location_detail, starts_at, ends_at, status, name, email, phone, note, answers,
    visitor_tz, language, deposit_cents, manage_token, ip_hash,
    reminder_24h_at, reminder_1h_at
  ) values (
    p_business, p_type, v_activity, v_customer, v_lead, left(v_type, 80), (v ->> 'duration')::int,
    v ->> 'location_kind', v ->> 'location_detail', p_starts, v_ends, 'confirmed', v_name, v_email,
    nullif(left(trim(coalesce(p_phone, '')), 50), ''), nullif(left(trim(coalesce(p_note, '')), 2000), ''),
    coalesce(p_answers, '[]'::jsonb), left(p_visitor_tz, 64), coalesce(p_language, 'en'),
    (v ->> 'deposit_cents')::int, p_token, p_ip_hash,
    -- too close for that reminder: mark it done so it never sends
    case when p_starts < now() + interval '25 hours' then now() end,
    case when p_starts < now() + interval '90 minutes' then now() end
  )
  returning id into v_booking;

  update public.activities set external_id = 'booking:' || v_booking::text where id = v_activity;

  -- Timeline: when it was booked (the meeting itself shows as upcoming).
  insert into public.activities
    (business_id, customer_id, lead_id, business_line, kind, subject, body, occurred_at, source, external_id)
  values
    (p_business, v_customer, v_lead, v_line, 'note',
     left('Booked online: ' || v_type, 300), 'For ' || v_when, now(), 'booking',
     'booking-made:' || v_booking::text);

  return jsonb_build_object(
    'booking_id', v_booking,
    'activity_id', v_activity,
    'customer_id', v_customer,
    'lead_id', v_lead,
    'starts_at', p_starts,
    'ends_at', v_ends,
    'contact_saved', (v_customer is not null or v_lead is not null)
  );
end;
$$;

revoke all on function public.booking_create(uuid, uuid, timestamptz, text, text, text, text, jsonb, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.booking_create(uuid, uuid, timestamptz, text, text, text, text, jsonb, text, text, text, text)
  to service_role;

-- Move a booking (from the visitor's reschedule link).
create or replace function public.booking_reschedule(p_token text, p_starts timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b      public.bookings%rowtype;
  v      jsonb;
  v_ends timestamptz;
  v_tz   text;
begin
  if coalesce(p_token, '') !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'booking:notfound' using errcode = 'P0001';
  end if;
  select * into b from public.bookings where manage_token = p_token;
  if not found then
    raise exception 'booking:notfound' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('booking:' || b.business_id::text, 0));
  select * into b from public.bookings where id = b.id for update;

  if b.status <> 'confirmed' or b.starts_at < now() or b.reschedule_count >= 5 then
    raise exception 'booking:closed' using errcode = 'P0001';
  end if;
  if b.meeting_type_id is null then
    raise exception 'booking:type' using errcode = 'P0001';
  end if;

  v := public.booking_slot_check(b.business_id, b.meeting_type_id, p_starts, b.id);
  v_ends := (v ->> 'ends_at')::timestamptz;
  v_tz := v ->> 'timezone';

  update public.bookings
  set starts_at = p_starts,
      ends_at = v_ends,
      duration_min = (v ->> 'duration')::int,
      rescheduled_at = now(),
      reschedule_count = reschedule_count + 1,
      reminder_24h_at = case when p_starts < now() + interval '25 hours' then now() end,
      reminder_1h_at = case when p_starts < now() + interval '90 minutes' then now() end
  where id = b.id;

  update public.activities
  set occurred_at = p_starts, ends_at = v_ends
  where id = b.activity_id and business_id = b.business_id;

  insert into public.activities
    (business_id, customer_id, lead_id, business_line, kind, subject, body, occurred_at, source)
  values
    (b.business_id, b.customer_id, b.lead_id, v ->> 'line', 'note',
     left('Rescheduled online: ' || b.type_name, 300),
     'Now ' || to_char(p_starts at time zone v_tz, 'Dy Mon FMDD, FMHH12:MI AM')
       || ' (' || v_tz || '). Was ' || to_char(b.starts_at at time zone v_tz, 'Dy Mon FMDD, FMHH12:MI AM') || '.',
     now(), 'booking');

  return jsonb_build_object('booking_id', b.id, 'old_starts_at', b.starts_at,
                            'starts_at', p_starts, 'ends_at', v_ends);
end;
$$;

revoke all on function public.booking_reschedule(text, timestamptz) from public, anon, authenticated;
grant execute on function public.booking_reschedule(text, timestamptz) to service_role;

-- Cancel a booking (from the visitor's cancel link).
create or replace function public.booking_cancel(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
begin
  if coalesce(p_token, '') !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'booking:notfound' using errcode = 'P0001';
  end if;
  select * into b from public.bookings where manage_token = p_token for update;
  if not found then
    raise exception 'booking:notfound' using errcode = 'P0001';
  end if;
  if b.status <> 'confirmed' or b.starts_at < now() then
    raise exception 'booking:closed' using errcode = 'P0001';
  end if;

  update public.bookings set status = 'cancelled', cancelled_at = now() where id = b.id;
  delete from public.activities where id = b.activity_id and business_id = b.business_id;

  insert into public.activities
    (business_id, customer_id, lead_id, kind, subject, body, occurred_at, source)
  values
    (b.business_id, b.customer_id, b.lead_id, 'note',
     left('Cancelled online: ' || b.type_name, 300),
     'Was ' || to_char(b.starts_at, 'YYYY-MM-DD HH24:MI') || ' UTC.', now(), 'booking');

  return jsonb_build_object('booking_id', b.id, 'starts_at', b.starts_at);
end;
$$;

revoke all on function public.booking_cancel(text) from public, anon, authenticated;
grant execute on function public.booking_cancel(text) to service_role;

-- ============================================================
-- 9. Logos (public bucket, owner writes)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('booking-logos', 'booking-logos', true, 524288,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners manage own booking logos" on storage.objects;
create policy "Owners manage own booking logos"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'booking-logos'
    and exists (
      select 1 from public.businesses b
      where b.id::text = (storage.foldername(objects.name))[1]
        and b.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'booking-logos'
    and exists (
      select 1 from public.businesses b
      where b.id::text = (storage.foldername(objects.name))[1]
        and b.owner_id = auth.uid()
    )
  );
