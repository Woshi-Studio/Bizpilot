-- Jephelen: Stripe billing link
-- Run this in the Supabase Dashboard -> SQL Editor -> New query -> Run

alter table public.businesses
  add column if not exists stripe_customer_id text;

create index if not exists businesses_stripe_customer_idx
  on public.businesses (stripe_customer_id)
  where stripe_customer_id is not null;
