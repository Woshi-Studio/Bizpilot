-- Jephelen: merge Woshi Studio Command Center v3 features
-- (pricing catalog, time tracking, wins log, goals, payment methods, richer leads)
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run

-- ============================================================
-- services: per-business rate/service catalog ("pricing")
-- ============================================================
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  rate numeric(12,2) not null default 0,
  unit text not null default 'project' check (unit in ('project', 'mo', 'hr', 'word', 'min')),
  description text,
  created_at timestamptz not null default now()
);

create index if not exists services_business_id_idx on public.services (business_id);

alter table public.services enable row level security;

create policy "Owners manage own services"
  on public.services for all
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

-- ============================================================
-- Link tasks to a service, carry a dollar value, and add
-- kanban-style status (Jephelen tasks were only done/not-done before)
-- ============================================================
alter table public.tasks
  add column if not exists service_id uuid references public.services (id) on delete set null,
  add column if not exists value numeric(12,2),
  add column if not exists description text,
  add column if not exists status text not null default 'todo' check (status in ('todo', 'inprogress', 'review', 'done'));

create index if not exists tasks_status_idx on public.tasks (status);

-- ============================================================
-- time_entries: hours logged against a customer/task
-- ============================================================
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  description text,
  hours numeric(6,2) not null check (hours > 0),
  entry_date date not null default current_date,
  billed text not null default 'unbilled' check (billed in ('unbilled', 'billed', 'included')),
  created_at timestamptz not null default now()
);

create index if not exists time_entries_business_id_idx on public.time_entries (business_id);
create index if not exists time_entries_customer_id_idx on public.time_entries (customer_id);

alter table public.time_entries enable row level security;

create policy "Owners manage own time entries"
  on public.time_entries for all
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

-- ============================================================
-- wins: small celebration/milestone log
-- ============================================================
create table if not exists public.wins (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title text not null,
  category text not null default 'other' check (category in ('client', 'revenue', 'delivery', 'personal', 'other')),
  details text,
  created_at timestamptz not null default now()
);

create index if not exists wins_business_id_idx on public.wins (business_id);

alter table public.wins enable row level security;

create policy "Owners manage own wins"
  on public.wins for all
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

-- ============================================================
-- payment_methods: shown on invoices, entered per business
-- (e.g. PayPal link, e-transfer email, bank details, custom)
-- ============================================================
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  label text not null,
  value text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists payment_methods_business_id_idx on public.payment_methods (business_id);

alter table public.payment_methods enable row level security;

create policy "Owners manage own payment methods"
  on public.payment_methods for all
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

-- ============================================================
-- Goals + a long-term savings target, on businesses
-- (generalized label instead of hardcoding "real estate" —
-- any freelancer signing up can point this at their own goal)
-- ============================================================
alter table public.businesses
  add column if not exists goal_customers int,
  add column if not exists goal_monthly_revenue numeric(12,2),
  add column if not exists savings_goal_label text,
  add column if not exists savings_current numeric(12,2),
  add column if not exists savings_target numeric(12,2);

-- ============================================================
-- Extend leads into a full outreach/pipeline tracker
-- (was just name/email/phone/message/new-or-converted)
-- ============================================================
alter table public.leads
  add column if not exists channel text not null default 'other' check (channel in ('email', 'upwork', 'linkedin', 'freelancer', 'referral', 'inbound', 'other')),
  add column if not exists follow_up_date date;

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('new', 'contacted', 'meeting', 'converted', 'declined'));

create index if not exists leads_follow_up_date_idx on public.leads (follow_up_date);

-- ============================================================
-- updated_at trigger for services (others use created_at only,
-- matching their Woshi equivalents which never edit in place)
-- ============================================================
alter table public.services add column if not exists updated_at timestamptz not null default now();

drop trigger if exists services_updated_at on public.services;
create trigger services_updated_at
  before update on public.services
  for each row execute function public.handle_updated_at();
