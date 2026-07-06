-- BizPilot Phase 8: Growth Loop (public page + lead capture)
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run

-- ============================================================
-- Public page fields on businesses
-- ============================================================
alter table public.businesses
  add column if not exists slug text,
  add column if not exists public_page_enabled boolean not null default false,
  add column if not exists tagline text,
  add column if not exists services text;

create unique index if not exists businesses_slug_idx
  on public.businesses (slug)
  where slug is not null;

-- ============================================================
-- Leads submitted through the public page
-- ============================================================
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  email text check (email is null or char_length(email) <= 320),
  phone text check (phone is null or char_length(phone) <= 50),
  message text check (message is null or char_length(message) <= 2000),
  status text not null default 'new' check (status in ('new', 'converted')),
  created_at timestamptz not null default now()
);

create index if not exists leads_business_id_idx on public.leads (business_id);

alter table public.leads enable row level security;

-- Owners see and manage their own leads
create policy "Owners manage own leads"
  on public.leads for all
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

-- ============================================================
-- Helper functions so anonymous visitors can view a public page
-- and submit a lead — without any other access to your data
-- ============================================================
create or replace function public.get_public_business(page_slug text)
returns table (id uuid, name text, tagline text, services text, business_type text)
language sql
security definer set search_path = ''
stable
as $$
  select b.id, b.name, b.tagline, b.services, b.business_type
  from public.businesses b
  where b.slug = page_slug and b.public_page_enabled
$$;

create or replace function public.business_accepts_leads(bid uuid)
returns boolean
language sql
security definer set search_path = ''
stable
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = bid and b.public_page_enabled
  )
$$;

-- Anyone may submit a NEW lead, but only to a business whose
-- public page is enabled
create policy "Anyone can submit a lead to a public page"
  on public.leads for insert
  to anon, authenticated
  with check (
    status = 'new'
    and public.business_accepts_leads(business_id)
  );
