-- Jephelen Phase 2: security hardening
-- Run AFTER 0010_woshi_merge.sql (this file uses leads.channel / follow_up_date).
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to run more than once.

-- ============================================================
-- 1. Billing columns are server-only
--    The "Users can update own businesses" policy (0001) lets an owner
--    change ANY column, including plan (0006) and stripe_customer_id
--    (0009). That meant anyone could give themselves premium.
--    Only the service role (the Stripe webhook / server billing code)
--    may set these now.
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
-- 2. AI quota can't be edited by users
--    0006 let owners update/delete their own ai_usage rows, so the
--    monthly limit could be reset from the browser. Users may now only
--    READ usage; counting happens in consume_ai_credit() below.
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

-- Atomically checks the plan's monthly cap and uses one AI credit.
-- Returns {"allowed": bool, "used": int, "limit": int}.
-- Keep the numbers in sync with AI_LIMITS in src/lib/ai-quota.ts.
create or replace function public.consume_ai_credit(p_business uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_plan  text;
  v_limit int;
  v_month text := to_char(now() at time zone 'utc', 'YYYY-MM');
  v_count int;
begin
  select b.plan into v_plan
  from public.businesses b
  where b.id = p_business and b.owner_id = auth.uid();

  if not found then
    raise exception 'not your business' using errcode = '42501';
  end if;

  v_limit := case when v_plan = 'premium' then 300 else 10 end;

  insert into public.ai_usage (business_id, month, count)
  values (p_business, v_month, 0)
  on conflict (business_id, month) do nothing;

  -- The row lock taken by UPDATE makes concurrent calls queue up,
  -- so two requests can't both take the last credit.
  update public.ai_usage u
  set count = u.count + 1
  where u.business_id = p_business
    and u.month = v_month
    and u.count < v_limit
  returning u.count into v_count;

  if v_count is null then
    select u.count into v_count
    from public.ai_usage u
    where u.business_id = p_business and u.month = v_month;
    return jsonb_build_object('allowed', false, 'used', coalesce(v_count, 0), 'limit', v_limit);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_count, 'limit', v_limit);
end;
$$;

revoke all on function public.consume_ai_credit(uuid) from public, anon;
grant execute on function public.consume_ai_credit(uuid) to authenticated;

-- ============================================================
-- 3. Public lead form: fixed fields + rate limit
--    Visitors (anyone who is not the business owner) can no longer set
--    status, channel or follow_up_date. Their leads are always
--    status 'new', channel 'inbound', no follow-up date.
--    Limits per business: 3 leads/hour from the same email or phone,
--    20 leads/hour in total from visitors.
-- ============================================================
create or replace function public.guard_public_lead()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_same  int;
  v_total int;
begin
  -- Admin/service inserts pass. (This function is SECURITY DEFINER, so
  -- current_user is the owner here; session_user is 'authenticator' for
  -- every request that comes through the Supabase API.)
  if session_user <> 'authenticator'
     or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  -- The owner logging their own outreach passes.
  if auth.uid() is not null and exists (
    select 1 from public.businesses b
    where b.id = new.business_id and b.owner_id = auth.uid()
  ) then
    return new;
  end if;

  -- Visitor: force the safe values.
  new.status := 'new';
  new.channel := 'inbound';
  new.follow_up_date := null;

  select count(*) into v_total
  from public.leads l
  where l.business_id = new.business_id
    and l.channel = 'inbound'
    and l.created_at > now() - interval '1 hour';

  if v_total >= 20 then
    raise exception 'too many leads for this business, try again later'
      using errcode = 'P0001';
  end if;

  if new.email is not null or new.phone is not null then
    select count(*) into v_same
    from public.leads l
    where l.business_id = new.business_id
      and l.created_at > now() - interval '1 hour'
      and (
        (new.email is not null and lower(l.email) = lower(new.email))
        or (new.phone is not null and l.phone = new.phone)
      );

    if v_same >= 3 then
      raise exception 'too many messages from you, try again later'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists leads_guard_public on public.leads;
create trigger leads_guard_public
  before insert on public.leads
  for each row execute function public.guard_public_lead();

-- Tighten the visitor insert policy to match (checked after the trigger).
drop policy if exists "Anyone can submit a lead to a public page" on public.leads;
create policy "Anyone can submit a lead to a public page"
  on public.leads for insert
  to anon, authenticated
  with check (
    status = 'new'
    and channel = 'inbound'
    and follow_up_date is null
    and public.business_accepts_leads(business_id)
  );

create index if not exists leads_business_created_idx
  on public.leads (business_id, created_at);
