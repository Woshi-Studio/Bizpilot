-- BizPilot Phase 7: Money Loop (receipts, recurring, invoices)
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run

-- ============================================================
-- Receipts: file path column + private storage bucket
-- ============================================================
alter table public.transactions
  add column if not exists receipt_path text;

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "Users manage own receipt files" on storage.objects;
create policy "Users manage own receipt files"
  on storage.objects for all
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- Recurring transactions (monthly templates)
-- ============================================================
create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  type text not null check (type in ('income', 'expense')),
  amount numeric(12, 2) not null check (amount > 0),
  category text not null default 'other',
  description text,
  next_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists recurring_business_id_idx on public.recurring_transactions (business_id);

alter table public.recurring_transactions enable row level security;

create policy "Owners manage own recurring transactions"
  on public.recurring_transactions for all
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
-- Invoices & quotes
-- ============================================================
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  number text not null,
  doc_type text not null default 'invoice' check (doc_type in ('invoice', 'quote')),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'paid')),
  issue_date date not null default current_date,
  due_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_business_id_idx on public.invoices (business_id);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  position int not null default 0
);

create index if not exists invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

create policy "Owners manage own invoices"
  on public.invoices for all
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

create policy "Owners manage own invoice items"
  on public.invoice_items for all
  using (
    exists (
      select 1 from public.invoices i
      join public.businesses b on b.id = i.business_id
      where i.id = invoice_id and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.invoices i
      join public.businesses b on b.id = i.business_id
      where i.id = invoice_id and b.owner_id = auth.uid()
    )
  );

drop trigger if exists invoices_updated_at on public.invoices;
create trigger invoices_updated_at
  before update on public.invoices
  for each row execute function public.handle_updated_at();
