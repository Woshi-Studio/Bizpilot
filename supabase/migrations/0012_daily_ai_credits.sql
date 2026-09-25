-- Jephelen: daily AI credits (free Gemini tier)
-- Run AFTER 0011_security.sql.
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to run more than once.
--
-- What changes:
--   Before: 10 (free) / 300 (premium) AI credits per MONTH.
--   Now:    25 (free) / 200 (premium) AI credits per DAY, reset at
--           midnight UTC.
--   Keep the numbers in sync with AI_DAILY_CREDITS in src/lib/ai-quota.ts.
--
-- How days are keyed:
--   ai_usage (0006) has one row per (business_id, month) where month was
--   'YYYY-MM'. The same column now holds the day, 'YYYY-MM-DD' (UTC).
--   The two formats never collide, so old monthly rows are left alone
--   (harmless history) and each new day simply starts a new row at 0.
--   No table change, no data change.
--
-- What does NOT change (all 0011 protections kept):
--   - users may only SELECT their own ai_usage rows (no insert/update/delete)
--   - counting happens only inside consume_ai_credit(), SECURITY DEFINER,
--     with an empty search_path
--   - the caller must own the business (auth.uid() check)
--   - the UPDATE row lock stops two requests taking the last credit
--   - execute is granted to signed-in users only
--
-- The owner's unlimited business (OWNER_BUSINESS_IDS) is handled in the
-- app: it never calls this function, so it is never counted.

comment on column public.ai_usage.month is
  'Usage period key. ''YYYY-MM-DD'' (UTC day) since 0012; older rows are ''YYYY-MM''.';

-- Re-assert the 0011 lock-down (no-ops if 0011 already did it).
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

-- Atomically checks the plan's DAILY cap and uses one AI credit.
-- Returns {"allowed": bool, "used": int, "limit": int}.
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

  v_limit := case when v_plan = 'premium' then 200 else 25 end;

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
