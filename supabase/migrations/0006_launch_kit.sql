-- BizPilot Phase 9: Launch Kit (plans, AI usage limits, feedback)
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run

-- ============================================================
-- Plan on each business (free | premium)
-- ============================================================
alter table public.businesses
  add column if not exists plan text not null default 'free'
  check (plan in ('free', 'premium'));

-- ============================================================
-- AI usage per month (for plan limits)
-- ============================================================
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  month text not null, -- 'YYYY-MM'
  count int not null default 0,
  unique (business_id, month)
);

alter table public.ai_usage enable row level security;

create policy "Owners manage own ai usage"
  on public.ai_usage for all
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
-- In-app feedback
-- ============================================================
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  message text not null,
  page text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "Owners manage own feedback"
  on public.feedback for all
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
