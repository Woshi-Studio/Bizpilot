-- BizPilot Phase 1: Foundation schema
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run

-- ============================================================
-- profiles: one row per auth user, auto-created on signup
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================
-- businesses: one (or later more) business per user
-- ============================================================
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  business_type text not null default 'other',
  description text,
  primary_goal text,
  currency text not null default 'USD',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists businesses_owner_id_idx on public.businesses (owner_id);

alter table public.businesses enable row level security;

create policy "Users can view own businesses"
  on public.businesses for select
  using (auth.uid() = owner_id);

create policy "Users can create own businesses"
  on public.businesses for insert
  with check (auth.uid() = owner_id);

create policy "Users can update own businesses"
  on public.businesses for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Users can delete own businesses"
  on public.businesses for delete
  using (auth.uid() = owner_id);

-- ============================================================
-- Auto-create a profile row when a user signs up.
-- full_name comes from the signup metadata (options.data.full_name).
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Keep updated_at fresh on every update
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists businesses_updated_at on public.businesses;
create trigger businesses_updated_at
  before update on public.businesses
  for each row execute function public.handle_updated_at();
