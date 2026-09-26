-- Jephelen: Clean UI (Phase 2C)
-- Run AFTER 0014_owner_hub.sql.
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to run more than once.
--
-- Why this migration exists (only two things, both needed by the redesign):
--
--   1. Contact header fields. The new one-page contact shows address and
--      website (customers) and company / address / website (leads). Those
--      columns did not exist. All are optional text with length limits.
--
--   2. Email send limit (50 a day per business). Sent emails are counted
--      in a new email_usage table that users can READ but not change, by
--      a SECURITY DEFINER function — the same pattern as ai_usage and
--      consume_ai_credit() (0011-0013). Counting timeline rows instead
--      would let a user delete rows to reset their own limit.
--
-- What does NOT change: every 0011-0014 policy, trigger and function.
-- The app keeps working before this is run: the new fields are hidden
-- and email sending says "run migration 0015".

-- ============================================================
-- 1. Contact fields
-- ============================================================
alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists website text;
alter table public.leads     add column if not exists company text;
alter table public.leads     add column if not exists address text;
alter table public.leads     add column if not exists website text;

do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('customers', 'address', 300),
      ('customers', 'website', 300),
      ('leads', 'company', 200),
      ('leads', 'address', 300),
      ('leads', 'website', 300)
    ) as t(tbl, col, maxlen)
  loop
    execute format(
      'alter table public.%I drop constraint if exists %I',
      spec.tbl, spec.tbl || '_' || spec.col || '_len'
    );
    execute format(
      'alter table public.%I add constraint %I check (%I is null or char_length(%I) <= %s)',
      spec.tbl, spec.tbl || '_' || spec.col || '_len', spec.col, spec.col, spec.maxlen
    );
  end loop;
end;
$$;

-- ============================================================
-- 2. Email send limit
-- ============================================================
create table if not exists public.email_usage (
  business_id uuid not null references public.businesses (id) on delete cascade,
  day text not null,
  count int not null default 0,
  primary key (business_id, day)
);

alter table public.email_usage enable row level security;

drop policy if exists "Owners view own email usage" on public.email_usage;
create policy "Owners view own email usage"
  on public.email_usage for select
  to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
  );

revoke insert, update, delete on public.email_usage from anon, authenticated;
revoke all on public.email_usage from anon;

-- Atomically checks the daily cap (50, UTC day) and counts one email.
-- Returns {"allowed": bool, "used": int, "limit": int}.
-- Keep the 50 in sync with EMAIL_DAILY_LIMIT in src/lib/email.ts.
create or replace function public.consume_email_send(p_business uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_limit int := 50;
  v_day   text := to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  v_count int;
begin
  perform 1
  from public.businesses b
  where b.id = p_business and b.owner_id = auth.uid();

  if not found then
    raise exception 'not your business' using errcode = '42501';
  end if;

  insert into public.email_usage (business_id, day, count)
  values (p_business, v_day, 0)
  on conflict (business_id, day) do nothing;

  -- The UPDATE row lock makes concurrent sends queue up.
  update public.email_usage u
  set count = u.count + 1
  where u.business_id = p_business
    and u.day = v_day
    and u.count < v_limit
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
