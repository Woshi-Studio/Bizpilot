-- Jephelen: Pro tier (second paid plan)
-- Run AFTER 0012_daily_ai_credits.sql.
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to run more than once.
--
-- What changes:
--   - businesses.plan may now be 'free', 'premium' or 'pro'.
--   - Daily AI credits: free 10, premium 100, pro 500 (reset at
--     midnight UTC). Keep in sync with AI_DAILY_CREDITS in
--     src/lib/ai-quota.ts.
--
-- What does NOT change (all 0011/0012 protections kept):
--   - only billing (service role / SQL editor) may change plan or
--     stripe_customer_id; a signed-in user can't set 'pro' on themselves
--   - users may only SELECT their own ai_usage rows
--   - counting happens only inside consume_ai_credit(), SECURITY DEFINER,
--     with an empty search_path, owner check, and the UPDATE row lock
--   - execute is granted to signed-in users only

-- ============================================================
-- 1. Allow 'pro' in businesses.plan
--    0006 added the column with an unnamed inline check, which Postgres
--    names businesses_plan_check. Drop every check constraint on
--    businesses that mentions plan (whatever its name), then add one
--    named constraint.
-- ============================================================
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.businesses'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%plan%'
  loop
    execute format('alter table public.businesses drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.businesses
  add constraint businesses_plan_check
  check (plan in ('free', 'premium', 'pro'));

-- ============================================================
-- 2. Billing columns stay server-only (same as 0011)
--    The trigger blocks ANY plan change by a signed-in user, so 'pro'
--    is covered. Re-created here so it is certainly in place.
-- ============================================================
create or replace function public.protect_business_billing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Service role, postgres (SQL editor) and other admin roles pass.
  if current_user not in ('authenticated', 'anon')
     or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.plan is distinct from 'free' or new.stripe_customer_id is not null then
      raise exception 'plan and stripe_customer_id can only be set by billing'
        using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.plan is distinct from old.plan
       or new.stripe_customer_id is distinct from old.stripe_customer_id then
      raise exception 'plan and stripe_customer_id can only be changed by billing'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists businesses_protect_billing on public.businesses;
create trigger businesses_protect_billing
  before insert or update on public.businesses
  for each row execute function public.protect_business_billing();

-- ============================================================
-- 3. ai_usage stays read-only for users (same as 0011/0012)
-- ============================================================
drop policy if exists "Owners manage own ai usage" on public.ai_usage;
drop policy if exists "Owners view own ai usage" on public.ai_usage;

create policy "Owners view own ai usage"
  on public.ai_usage for select
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
  );

revoke insert, update, delete on public.ai_usage from anon, authenticated;

-- ============================================================
-- 4. Daily caps: free 10, premium 100, pro 500
--    Atomically checks the plan's DAILY cap and uses one AI credit.
--    Returns {"allowed": bool, "used": int, "limit": int}.
-- ============================================================
create or replace function public.consume_ai_credit(p_business uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_plan  text;
  v_limit int;
  v_day   text := to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  v_count int;
begin
  select b.plan into v_plan
  from public.businesses b
  where b.id = p_business and b.owner_id = auth.uid();

  if not found then
    raise exception 'not your business' using errcode = '42501';
  end if;

  v_limit := case v_plan
    when 'pro' then 500
    when 'premium' then 100
    else 10
  end;

  insert into public.ai_usage (business_id, month, count)
  values (p_business, v_day, 0)
  on conflict (business_id, month) do nothing;

  -- The row lock taken by UPDATE makes concurrent calls queue up,
  -- so two requests can't both take the last credit.
  update public.ai_usage u
  set count = u.count + 1
  where u.business_id = p_business
    and u.month = v_day
    and u.count < v_limit
  returning u.count into v_count;

  if v_count is null then
    select u.count into v_count
    from public.ai_usage u
    where u.business_id = p_business and u.month = v_day;
    return jsonb_build_object('allowed', false, 'used', coalesce(v_count, 0), 'limit', v_limit);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_count, 'limit', v_limit);
end;
$$;

revoke all on function public.consume_ai_credit(uuid) from public, anon;
grant execute on function public.consume_ai_credit(uuid) to authenticated;
