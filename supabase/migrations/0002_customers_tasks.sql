-- BizPilot Phase 2: Customer Hub + Tasks
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run

-- ============================================================
-- customers
-- ============================================================
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  company text,
  status text not null default 'lead',
  next_follow_up date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_business_id_idx on public.customers (business_id);
create index if not exists customers_next_follow_up_idx on public.customers (next_follow_up);

alter table public.customers enable row level security;

create policy "Owners manage own customers"
  on public.customers for all
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
-- customer_notes
-- ============================================================
create table if not exists public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists customer_notes_customer_id_idx on public.customer_notes (customer_id);

alter table public.customer_notes enable row level security;

create policy "Owners manage own customer notes"
  on public.customer_notes for all
  using (
    exists (
      select 1 from public.customers c
      join public.businesses b on b.id = c.business_id
      where c.id = customer_id and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.customers c
      join public.businesses b on b.id = c.business_id
      where c.id = customer_id and b.owner_id = auth.uid()
    )
  );

-- ============================================================
-- tasks
-- ============================================================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  title text not null,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_business_id_idx on public.tasks (business_id);
create index if not exists tasks_due_date_idx on public.tasks (due_date);

alter table public.tasks enable row level security;

create policy "Owners manage own tasks"
  on public.tasks for all
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
-- updated_at triggers (function created in 0001)
-- ============================================================
drop trigger if exists customers_updated_at on public.customers;
create trigger customers_updated_at
  before update on public.customers
  for each row execute function public.handle_updated_at();

drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.handle_updated_at();
