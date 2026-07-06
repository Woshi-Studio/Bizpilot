-- BizPilot Phases 10+11: Launchpad (business plans)
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run

create table if not exists public.business_plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  content text not null,
  inputs jsonb not null default '{}'::jsonb,
  ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_plans_business_id_idx on public.business_plans (business_id);

alter table public.business_plans enable row level security;

create policy "Owners manage own business plans"
  on public.business_plans for all
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

drop trigger if exists business_plans_updated_at on public.business_plans;
create trigger business_plans_updated_at
  before update on public.business_plans
  for each row execute function public.handle_updated_at();
