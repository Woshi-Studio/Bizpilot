# Security changes — Phase 2 ("Jephelen safe")

Branch: `phase2-security`. Nothing here is live yet. The database part is
`supabase/migrations/0011_security.sql` and must be applied by hand (steps below).

**The SQL has not been run anywhere.** There was no local Postgres to try it on.
Run it on a test copy or check the result queries in step 5 right after applying.

---

## 1. What changed and why

### HIGH — free premium
| Where | Change |
|---|---|
| `supabase/migrations/0011_security.sql:14-46` | New trigger `businesses_protect_billing`. A signed-in user can no longer set or change `plan` or `stripe_customer_id`, on insert or update. Before, the update policy in `0001_foundation.sql:54-57` let an owner change any column, so anyone could set `plan = 'premium'` from the browser. The service role (Stripe webhook) and the SQL editor still can. |
| `src/lib/supabase/admin.ts` (new) | A server-only service-role client. |
| `src/app/(app)/settings/billing-actions.ts:34` | Checkout saves `stripe_customer_id` with the service-role client, limited to the caller's own business. Without this, checkout would hit the new trigger. |

### HIGH — AI quota
| Where | Change |
|---|---|
| `0011_security.sql:54-66` | `ai_usage` is now read-only for users. The old policy (`0006_launch_kit.sql:24-37`) let users update or delete their own usage rows and reset their limit. |
| `0011_security.sql:71-117` | New `consume_ai_credit(p_business uuid)`. It checks that `auth.uid()` owns the business, reads the plan (free 10 / premium 300 a month, UTC month), and adds one use in the same step, so two requests at once can't both take the last credit. Returns `{allowed, used, limit}`. |
| `src/lib/ai-quota.ts:22` | `consumeAiCredit()` calls the function **before** each AI request. **It now fails closed**: any error means no AI (the old code allowed on error). `checkAiQuota` and `recordAiUse` are gone. |
| `src/lib/ai.ts:11-18` | `AI_CONFIG`: `models.main = "claude-opus-4-8"` (unchanged), `models.small = "claude-haiku-4-5"`, `MAX_OUTPUT_TOKENS = 1500`, `LONG_OUTPUT_TOKENS = 3000`. Adaptive thinking is removed from these calls. With a small cap, thinking would use up the answer's tokens. |

Which AI actions changed (all used opus + 8000 tokens + thinking before):

| Action | File | Model now | Max tokens |
|---|---|---|---|
| Coach | `src/app/(app)/coach/actions.ts:71` | main (opus-4-8) | 1500 |
| Decision advice | `src/app/(app)/decisions/actions.ts:206` | main (opus-4-8) | 1500 |
| Launchpad plan rewrite | `src/app/(app)/launchpad/actions.ts:123` | main (opus-4-8) | 3000 |
| Message drafts | `src/app/(app)/messages/actions.ts:91` | **small (haiku-4-5)** | 1500 |
| Daily plan | `src/app/(app)/dashboard/actions.ts:58` | **small (haiku-4-5)** | 1500 |

- Launchpad gets 3000, not 1500. It rewrites a whole plan (up to about 700 words), and 1500 could cut it off. If the answer is cut off anyway (`launchpad/actions.ts:149`), the saved plan is kept, not overwritten.
- Trade-off: the credit is used before the AI call. A failed AI call still uses one credit. This is on purpose. A "give it back" function would let users reset their own count.

### MED
| Where | Change |
|---|---|
| `src/app/auth/callback/route.ts:8-20, 28` | `next` must start with one `/`. It can't start with `//` or `/\` and can't hold control characters (browsers drop tabs and newlines, so `/\t/evil.com` would become `//evil.com`). Anything else goes to `/dashboard`. |
| `src/app/(app)/money/actions.ts:8-17, 63-72` | Receipts must be jpg/jpeg/png/webp/pdf, and the file extension and file type must agree. Max 10 MB (was 6 MB). |
| `next.config.ts` | The server action upload limit went from 8 MB to 11 MB, so a 10 MB receipt fits. |
| `src/app/(app)/money/transaction-composer.tsx:131` | The file picker only offers the allowed types. |
| `0011_security.sql:209-218` | The `receipts` storage bucket enforces the same 10 MB limit and file types. Without this, a user could upload straight to storage and skip the app check. |
| `0011_security.sql:127-203` | Public lead form. For anyone who isn't the owner, the trigger `leads_guard_public` forces `status='new'`, `channel='inbound'`, `follow_up_date=null`. It rate-limits to **3 leads an hour from the same email or phone** and **20 inbound leads an hour per business**. The insert policy (was `0007_growth.sql:80-86`) now requires the same values. The owner logging their own outreach is not limited. |
| `src/app/b/[slug]/actions.ts:43-54` | Sends `status: "new"`, `channel: "inbound"`, and shows a friendly message when the rate limit hits. The bot-trap field (`website`) is unchanged. |

The limit uses email/phone, not IP. Anyone can call the database directly with the public key, so an IP sent from the browser can't be trusted. The 20-an-hour cap per business is the backstop. Its downside: a spammer could fill a business's 20 slots for an hour.

### LOW
| Where | Change |
|---|---|
| `src/lib/data.ts:9` | New `belongsToBusiness()` helper. |
| `tasks/actions.ts:35,38` · `time/actions.ts:28,31` · `invoices/actions.ts:62` · `money/actions.ts:56` | A customer/service/task id from a form must belong to the same business, or the save is refused. |
| `src/app/onboarding/actions.ts:42` | If the account already has a business, go to `/dashboard` instead of creating a second one. |
| `src/lib/data.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/money/export/route.ts`, `src/app/onboarding/page.tsx` | Business lookup takes the oldest row (`order created_at` + `limit(1)`). An account that already has two businesses no longer loops between `/dashboard` and `/onboarding`. |

### Health
- The 10 eslint errors are fixed: unescaped `'` in goals/leads/services/time, and set-state-in-effect in `coach-chat.tsx` and `task-composer.tsx`.
- `npx tsc --noEmit` passes. `npm run lint` shows 0 errors and 2 old warnings (unused `_prevState`). `npm run build` passes.

---

## 2. Apply 0011 to the live Supabase — in this order

The code and the SQL depend on each other:
- New code without 0011: every AI button says "unavailable" (it fails closed).
- 0011 without new code: AI usage stops being counted.

**So apply 0011 and deploy this branch within the same few minutes.**

1. **Check the service key is set in Vercel.** Project → Settings → Environment Variables → `SUPABASE_SERVICE_ROLE_KEY` must exist for Production. The Stripe webhook already needs it. Checkout now needs it too.

2. **Check whether 0010 is applied.** Supabase Dashboard → SQL Editor → New query, run:
   ```sql
   select
     to_regclass('public.services')        is not null as has_services,
     to_regclass('public.time_entries')    is not null as has_time_entries,
     to_regclass('public.payment_methods') is not null as has_payment_methods,
     exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='leads'
               and column_name='channel')            as leads_has_channel;
   ```
   - All `true` → 0010 is applied. Go to step 3.
   - Any `false` → open `supabase/migrations/0010_woshi_merge.sql`, paste all of it, Run. Then run the check again. 0011 **will fail** without 0010, because it uses `leads.channel`.

3. **Look before you lock (optional, 1 minute).** This shows anyone who may have given themselves premium:
   ```sql
   select id, name, plan, stripe_customer_id
   from public.businesses
   where plan = 'premium' and stripe_customer_id is null;
   ```
   Any row here is premium without ever paying through Stripe. Decide per row. To reset one: `update public.businesses set plan = 'free' where id = '<id>';` (the SQL editor is allowed).

   And accounts with more than one business:
   ```sql
   select owner_id, count(*) from public.businesses group by owner_id having count(*) > 1;
   ```
   The app now uses the oldest one. Delete extras only if you're sure they're empty.

4. **Apply 0011.** SQL Editor → New query → paste all of `supabase/migrations/0011_security.sql` → Run. You can run it again safely.
   - CLI instead (only if this project is linked to the Supabase CLI): `supabase db push`. This pushes every migration the live database doesn't have yet, so check step 2 first.

5. **Check it applied:**
   ```sql
   select tgname from pg_trigger
   where tgname in ('businesses_protect_billing', 'leads_guard_public');          -- 2 rows
   select proname from pg_proc where proname = 'consume_ai_credit';              -- 1 row
   select policyname, cmd from pg_policies where tablename = 'ai_usage';         -- only SELECT
   select file_size_limit, allowed_mime_types from storage.buckets where id = 'receipts';
   ```

6. **Deploy the branch** (merge `phase2-security` to `main`, or however you normally deploy).

---

## 3. How to test each fix

Use a test account on the live site after deploying, or a preview deploy pointed at the same database.

**Free premium blocked**
1. Log in. Open the browser console on the site. Using the app's Supabase client, or a `fetch` to `/rest/v1/businesses?id=eq.<your id>` with your session token, send `PATCH {"plan":"premium"}`.
2. Expect error `42501 … can only be changed by billing`. The plan stays `free`.
3. Real checkout: Settings → Upgrade → pay with a Stripe test card → the plan flips to premium (the webhook uses the service role).

**AI quota**
1. SQL editor: `select public.consume_ai_credit('<business id>');` → error `not your business` (the SQL editor has no user). This proves the owner check.
2. As a free user, press any AI button 10 times → the 11th says "You've used all 10 …".
3. Console: `DELETE /rest/v1/ai_usage?business_id=eq.<id>` → nothing is deleted (permission denied or 0 rows).
4. Fail closed: on a preview deploy pointed at a database *without* 0011, AI buttons say "AI is unavailable right now".
5. Message drafts and the daily plan are shorter and come from the smaller model. Coach, decisions and launchpad still use opus-4-8.

**Open redirect**
- `/auth/callback?code=x&next=//evil.com` → after login you land on `/dashboard`, not evil.com.
- Same for `next=/%5Cevil.com` (that's `/\evil.com`) and `next=https://evil.com`.
- `next=/tasks` still works.

**Receipts**
- Upload a `.txt`, or an `.exe` renamed to `.jpg` (its type won't match) → "Receipts must be a JPG, PNG, WEBP or PDF file."
- Upload a file over 10 MB → "too large (max 10MB)".
- A normal JPG or PDF still attaches.

**Public lead form** (`/b/<your slug>`)
- Send the form 4 times with the same email within an hour → the 4th says "You've sent a few messages already…".
- A lead sent in with `channel: 'email'` or a `follow_up_date` through the API is saved as `inbound`, with no date.
- Fill the hidden `website` field → "Thanks!" is shown, but nothing is saved (unchanged).
- Your own "Log outreach" on /leads still saves any channel and a follow-up date.

**Same-business ids**
- Post the task/time/invoice/money forms with a `customer_id` from another account → "That customer wasn't found."

**One business per account**
- While logged in with a business, post the onboarding form again → you go to `/dashboard`, and no second row is created.

---

## 4. Not done / for the owner
- The SQL is untested. See the top of this file.
- Nothing is pushed or deployed, and no live database was touched.
- The Stripe webhook still makes its own service-role client. It could reuse `src/lib/supabase/admin.ts`, but that's a tidy-up, not a fix.
- The AI limits (10 / 300) are written in two places: `consume_ai_credit` in SQL and `AI_LIMITS` in `src/lib/ai-quota.ts`. Change both together.
