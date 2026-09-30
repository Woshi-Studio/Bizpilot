-- Jephelen: leads for everyone (Lucy, 2026-09-30)
--
-- Every plan can now buy lead credits (the packs and the lead
-- subscription), and every business gets WELCOME_LEAD_CREDITS (5) once.
-- A Starter / Hustle business with credits searches like Boss (the app
-- passes mode 'full' to finder_submit: 1 credit, unlocked result). This
-- adds the one thing the database didn't allow yet: unlocking a SAVED
-- locked result on Starter / Hustle, for 1 lead credit.
--
-- Additive only: one new function. No table, column or policy changes;
-- finder_unlock (Boss / owner, free) is untouched. Run AFTER 0020.
-- Safe to run twice.
--
-- The welcome credits need no SQL: the app calls finder_grant(business,
-- 'pack', 5, 'welcome:<business id>', false), which is idempotent per ref.

-- Unlock one locked result of p_business.
--   Boss / owner   -> finder_unlock (free, as before)
--   anyone else    -> 1 lead credit ('spend' row tied to the result, so the
--                     fair-credit check and bounce refunds treat it like a
--                     paid result); finder:no_credits when the balance is 0
-- Service role only: the app checks the session and passes the user's own
-- business. Returns {status: 'unlocked', credits: 0|1}.
create or replace function public.finder_unlock_paid(p_business uuid, p_result uuid)
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
  if p_business is null or p_result is null then
    raise exception 'finder:bad_input' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('finder:' || p_business::text, 0));

  select * into v_r from public.finder_results where id = p_result and business_id = p_business;
  if v_r.id is null then
    raise exception 'finder:not_found' using errcode = 'P0001';
  end if;
  if not v_r.locked then
    return jsonb_build_object('status', 'unlocked', 'credits', 0);
  end if;

  if public.finder_is_unlimited(p_business)
     or exists (select 1 from public.businesses b where b.id = p_business and b.plan = 'pro') then
    return public.finder_unlock(p_result) || jsonb_build_object('credits', 0);
  end if;

  if v_r.kb_company_id is null or not public.finder_kb_servable(v_r.kb_company_id) then
    raise exception 'finder:not_found' using errcode = 'P0001';
  end if;
  if public.finder_balance(p_business) < 1 then
    raise exception 'finder:no_credits' using errcode = 'P0001';
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

  insert into public.finder_credit_ledger (business_id, delta, reason, job_id, item_id, result_id, note)
  values (p_business, -1, 'spend', v_r.job_id, v_r.item_id, v_r.id, 'unlock');

  perform public.finder_log(p_business, null, 'user', 'unlock',
    jsonb_build_object('result', v_r.id, 'paid', true));
  return jsonb_build_object('status', 'unlocked', 'credits', 1);
end;
$$;

revoke all on function public.finder_unlock_paid(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finder_unlock_paid(uuid, uuid) to service_role;
