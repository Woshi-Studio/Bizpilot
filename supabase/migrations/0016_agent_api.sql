-- Jephelen Phase 4: Agent API ("Discord remote control")
-- API keys an assistant can use to call /api/agent/<action>, plus an audit log.
-- Run AFTER 0014_owner_hub.sql (and after 0015 if it exists).
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to run more than once.
--
-- What changes:
--   1. api_keys: one row per key. Only a peppered hash of the key is stored.
--      Owners can list their keys and revoke them (set revoked_at), nothing
--      else. Keys are created only by the server (service role).
--   2. agent_audit: one row per API call. Owners can read; only the server
--      (service role) writes.
--
-- What does NOT change (all 0011-0014 protections kept):
--   - protect_business_billing trigger, businesses_plan_check
--   - ai_usage read-only for users, consume_ai_credit()
--   - guard_public_lead / guard_public_lead_line triggers and the public
--     lead insert policy
--   - receipts + client-docs bucket limits and policies
--   Nothing in this file drops or replaces any of those.

-- ============================================================
-- 1. api_keys
-- ============================================================
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  key_prefix text not null check (char_length(key_prefix) = 8),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table public.api_keys drop constraint if exists api_keys_scopes_check;
alter table public.api_keys add constraint api_keys_scopes_check
  check (
    cardinality(scopes) between 1 and 6
    and scopes <@ array[
      'customers:write',
      'leads:write',
      'contacts:read',
      'tasks:write',
      'calendar:write',
      'activities:write'
    ]::text[]
  );

create unique index if not exists api_keys_key_hash_idx on public.api_keys (key_hash);
create index if not exists api_keys_business_idx on public.api_keys (business_id, created_at desc);

alter table public.api_keys enable row level security;

drop policy if exists "Owners view own api keys" on public.api_keys;
create policy "Owners view own api keys"
  on public.api_keys for select
  to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
  );

-- Revoke only: the row must stay in the owner's business and end up revoked.
drop policy if exists "Owners revoke own api keys" on public.api_keys;
create policy "Owners revoke own api keys"
  on public.api_keys for update
  to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
  )
  with check (
    revoked_at is not null
    and exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
  );

-- Column-level grants: users can read everything except the hash, and can
-- only ever write revoked_at. No insert, no delete.
revoke all on public.api_keys from anon, authenticated;
grant select (id, business_id, name, key_prefix, scopes, created_at, last_used_at, revoked_at)
  on public.api_keys to authenticated;
grant update (revoked_at) on public.api_keys to authenticated;

-- A revoked key stays revoked, even for a user who edits revoked_at again.
create or replace function public.api_keys_stay_revoked()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is not null then
    new.revoked_at := old.revoked_at;
  end if;
  return new;
end;
$$;

drop trigger if exists api_keys_stay_revoked on public.api_keys;
create trigger api_keys_stay_revoked
  before update on public.api_keys
  for each row execute function public.api_keys_stay_revoked();

-- ============================================================
-- 2. agent_audit
-- ============================================================
create table if not exists public.agent_audit (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  key_id uuid references public.api_keys (id) on delete set null,
  action text not null check (char_length(action) between 1 and 60),
  input jsonb,
  result text check (result is null or char_length(result) <= 500),
  ok boolean not null default false,
  created_at timestamptz not null default now()
);

-- Rate limit counts (per key, last minute / last day) use this index.
create index if not exists agent_audit_key_created_idx
  on public.agent_audit (key_id, created_at desc);
create index if not exists agent_audit_business_created_idx
  on public.agent_audit (business_id, created_at desc);

alter table public.agent_audit enable row level security;

drop policy if exists "Owners view own agent audit" on public.agent_audit;
create policy "Owners view own agent audit"
  on public.agent_audit for select
  to authenticated
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
  );

revoke all on public.agent_audit from anon, authenticated;
grant select on public.agent_audit to authenticated;
