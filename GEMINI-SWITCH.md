# Switch to free Google Gemini AI

Branch: `free-ai`. The AI buttons (Coach, Decision advisor, Launchpad rewrite,
AI Messages, Today's Plan) now use Google Gemini's free tier instead of
Anthropic. Users get daily AI credits. Errors are friendly.

## What changed

- `src/lib/ai.ts` — provider switch (`AI_PROVIDER`, default `gemini`).
  Models: main = `gemini-flash-latest`, small = `gemini-flash-lite-latest`.
  Several keys can be set; when one is out of quota (429) or refused
  (401/403/invalid key), the next is tried. Key values are never logged, only
  their number ("key #2").
- Users never see a raw provider error. They see
  "AI is taking a short break. Please try again in a few minutes."
  The real error is in the Vercel function logs, lines starting `[ai]`.
- Daily credits: free = 25 a day, premium = 200 a day, reset at midnight UTC.
  The owner's business (`OWNER_BUSINESS_IDS`) is unlimited and not counted.
- A small line on each AI page: "AI credits today: 7 of 25 · resets at
  midnight UTC".
- `supabase/migrations/0012_daily_ai_credits.sql` — counting moves from
  per-month to per-day. All 0011 protections are kept.

## Environment variables

| Name | Needed | Value |
|---|---|---|
| `GEMINI_API_KEYS` | yes (preferred) | all your Gemini keys, comma-separated, e.g. `AQ.aaa,AQ.bbb,AQ.ccc,AQ.ddd` |
| `GEMINI_API_KEY` | only if you use one key | one Gemini key (also works next to `GEMINI_API_KEYS`) |
| `OWNER_BUSINESS_IDS` | yes | your business id (see SQL below); more than one: comma-separated |
| `AI_PROVIDER` | no | leave unset = `gemini`. `anthropic` switches back (needs `ANTHROPIC_API_KEY`) |

`GEMINI_API_KEYS` is preferred: 4 free keys give about 4 times the free daily
limit. Never prefix any of these with `NEXT_PUBLIC_`.

## Owner steps, in order

1. **Find your business id.** Supabase Dashboard -> SQL Editor -> New query:

   ```sql
   select id, name, plan, created_at
   from public.businesses
   where name ilike '%woshi studio%';
   ```

   Copy the `id` (a long code like `3f2a…-…`).

2. **Vercel -> Project -> Settings -> Environment Variables.** Add, ticking
   both **Production** and **Preview**:
   - `GEMINI_API_KEYS` = your keys, comma-separated
   - `OWNER_BUSINESS_IDS` = the id from step 1

3. **Run the migration.** Supabase Dashboard -> SQL Editor -> New query ->
   paste all of `supabase/migrations/0012_daily_ai_credits.sql` -> Run.
   It is safe to run more than once. Run it BEFORE the code goes live: the
   new code reads today's row (`YYYY-MM-DD`), and until 0012 runs the database
   still counts by month.

4. **Push and merge.** Push `free-ai`, open a pull request into `main`, merge.
   Vercel deploys `main`. (New env vars only apply to deploys made after you
   add them.)

## How to test

1. Open a Preview deploy of `free-ai` (or production after merge) and sign in.
2. Coach: ask "How do I get my first 3 customers?" — you get an answer.
3. AI Messages, Today's Plan (Dashboard), Launchpad "personalize with AI",
   Decision advisor (premium only): each one answers.
4. Signed in as a normal free account: the credit line goes up by 1 per use,
   e.g. "AI credits today: 1 of 25 · resets at midnight UTC".
5. Signed in as yourself (Woshi Studio): the line says
   "AI credits today: unlimited (owner)".
6. Out of credits check (optional, SQL Editor, use a TEST business id):

   ```sql
   update public.ai_usage set count = 25
   where business_id = 'TEST-BUSINESS-ID'
     and month = to_char(now() at time zone 'utc', 'YYYY-MM-DD');
   ```

   The next AI click shows "You've used all of today's AI credits. AI credits
   today: 25 of 25 · resets at midnight UTC." Set it back to 0 after.
7. Error check: in Vercel -> Logs, filter `[ai]`. A failed call shows the
   status and which key number failed, never the key itself.

## Good to know

- Midnight UTC is 8 pm Eastern (summer) / 7 pm (winter).
- A credit is used when the button is pressed. If Gemini then fails, that
  credit is not given back.
- Gemini free keys have their own daily limits set by Google. When every key
  is spent, users see the "short break" message until Google resets them.
- Gemini Flash may "think" before answering; the app gives it 2,048 extra
  output tokens for that so answers are not cut short. Free tier, no bill.
