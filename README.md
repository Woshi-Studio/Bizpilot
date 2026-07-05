# BizPilot

**Your AI copilot for running a smarter business.**

BizPilot helps freelancers manage customers, organize tasks, generate communications, track money, and make smarter business decisions — all in one place.

Built with Next.js (App Router), TypeScript, Tailwind CSS, and Supabase.

## Current status: Phase 1 — Foundation

- ✅ Email/password authentication (signup, login, password reset)
- ✅ User profiles
- ✅ Business onboarding (freelancer-focused)
- ✅ Dashboard layout shell with placeholder cards
- 🔜 Phase 2: customers, tasks, notes, daily dashboard

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (free).
2. Create a new project (name it `bizpilot`, pick a region near you, set a strong database password).
3. When it finishes provisioning, open **Project Settings → API Keys**.
4. Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=<your Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon / publishable key>
```

### 3. Create the database schema

1. In the Supabase Dashboard, open **SQL Editor → New query**.
2. Paste the entire contents of [`supabase/migrations/0001_foundation.sql`](supabase/migrations/0001_foundation.sql).
3. Click **Run**. This creates the `profiles` and `businesses` tables, row-level security policies, and the signup trigger.

### 4. (Optional, recommended for local dev) Disable email confirmation

In **Authentication → Sign In / Providers → Email**, turn off "Confirm email" so you can sign up instantly during development. Turn it back on before launching.

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to the login page. Create an account, complete onboarding, and you'll land on the dashboard.

## Project structure

```
src/
  proxy.ts                  # Auth session refresh + route protection (Next 16 proxy)
  lib/
    supabase/client.ts      # Browser Supabase client
    supabase/server.ts      # Server Supabase client (cookie-based)
    types.ts                # Shared types + option lists
  app/
    (auth)/                 # Login, signup, forgot/reset password
    auth/callback/          # Email link verification endpoint
    onboarding/             # First-run business setup wizard
    (app)/                  # Protected shell: dashboard, settings
  components/
    app-shell.tsx           # Sidebar + topbar layout
supabase/
  migrations/               # SQL to run in the Supabase SQL Editor
```
