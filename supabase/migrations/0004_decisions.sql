-- BizPilot Phase 4: Decision Guard
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run

create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  decision_type text not null,
  title text not null,
  amount numeric(12, 2),
  answers jsonb not null default '{}'::jsonb,
  risk_score int not null default 0,
  risk_level text not null default 'low',
  outcome text,
  created_at timestamptz not null default now()
);

create index if not exists decisions_business_id_idx on public.decisions (business_id);

alter table public.decisions enable row level security;

create policy "Owners manage own decisions"
  on public.decisions for all
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
