# Lead Finder: F0 (legal pages) + F1 (invite-only MVP)

Branch `lead-finder`. Spec: `..\LEAD-FINDER-SPEC.md`. Screenshots: `..\UI-PREVIEW\lead-finder\`.

Small / safe mode: one company per search; phone + website + contact-form link first; emails only
when the business publishes one on its own site, at its own domain (format + MX checks, never SMTP
probing, never guessed); no bulk sending. No billing changes: no `finder` plan, no Stripe.

## Owner go-live steps (in this order)

1. **Run migration 0019 AFTER 0018.** Supabase → SQL Editor → New query → paste
   `supabase/migrations/0019_finder.sql` (same text as `..\GO-LIVE\0019_finder.sql`) → Run.
   Safe to run twice.
2. **Env vars in Vercel** (Project → Settings → Environment Variables, Production):
   - `FINDER_BETA_BUSINESS_IDS`: invited testers' business ids, comma-separated. Leave empty to keep
     it owner-only. Your own businesses (`OWNER_BUSINESS_IDS`) always have it, unlimited.
   - `FINDER_BETA_CREDITS` (optional): starting credits per tester, granted once. Default 10.
   - Already set, reused: `AGENT_KEY_PEPPER` (hashes worker keys), `SUPABASE_SERVICE_ROLE_KEY`,
     `OWNER_BUSINESS_IDS`, `NEXT_PUBLIC_SITE_URL`, and the email vars (`EMAIL_PROVIDER` + SMTP or
     Resend) for the "remove my data" confirm email. Without an email provider the request is saved
     and the page says you'll confirm by email within 30 days.
3. **Merge** `lead-finder` into `main`. Vercel redeploys.
4. **Worker key.** Jephelen → Settings → **Lead Finder worker** (owner only) → name it
   ("Zilla on the HQ PC") → Create worker key → Copy (shown once). Paste it into
   `D:\Claude\Game\HQ\_TOOLS\zilla\keys.json` as `worker_key`. Test: search a company on
   People → Found, then `python zilla.py finder --once` in the zilla folder.

## What was built

| Part | Where |
|---|---|
| Found tab | People → **Found** (`/leads/found`): search one company (name + city or website), In progress (researching / pick one / not found), result cards: last-checked badge (amber 90 d, grey 180 d), phone + email with plain-words checks, website, contact form, source link, **Call**, **Email** (your own mail app, first-message template with who you are + opt-out), **+ Add to leads** (becomes a `finder` lead, counts toward the plan only now), **Report bounce / wrong number** |
| Intake | `/leads/found/hunt` "What are you hunting?": business, offer (500), target + industry and size chips, place + 5/15/50 km + province + country, needs chips, leave-out list, **required Acceptable Use tick** (version + database time saved) |
| Worker API | `POST /api/finder/worker/{claim,heartbeat,complete,lookup}` with `Authorization: Bearer jph_work_…`. HMAC(AGENT_KEY_PEPPER) lookup, revoke, 120 calls/min, strict input (unknown fields refused, every contact needs a source link), every call in `finder_audit`. Items carry no user info |
| Settings | **Lead Finder worker** card, owner only: create (shown once) / revoke / last seen |
| Legal (F0) | `/terms` and `/privacy` rewritten to the spec's sections, `/acceptable-use`, `/data-sources` (© OpenStreetMap contributors, ODbL), `/remove-my-data` (+ `/remove-my-data/confirm`). All with a yellow **"Draft, under legal review"** note and a legal footer |
| Zilla | `python zilla.py finder --once` / `--test`: see `_TOOLS\zilla\ZILLA.md` → Finder mode |

### Credits (F1)

Owner: unlimited, no credit rows. Invited testers: `FINDER_BETA_CREDITS` once. Known company (our
records, checked < 180 days): 1 credit at once. Needs research: 1 held, given back if nothing is
found. Several matches: pick one, free. Bounce / wrong number within 30 days: credit back
automatically while refunds stay ≤ 20% of credits used in 90 days, else "review". Two reports on a
contact and it stops being served. Same math in `src/lib/finder-credits.ts` and the SQL.

### Remove my data

Form → email with a link (72 h) → the page's **Confirm** button (so mail scanners can't trigger it)
→ matching records are deleted at once and the email / domain / phone / company go on the
`kb_suppression` do-not-collect list. The worker and every delivery skip suppressed values.
Rate limits: 5 an hour per IP, 3 a day per email.

### Safety

- Users can only read their own finder rows; every write is a SECURITY DEFINER function. The shared
  records (`kb_*`), workers, suppression and removal requests have no user access at all.
- The search itself runs with the service role only after the app checked the session and the
  invite list. Add to leads runs with the user's session, so the 0017 plan trigger still counts it.
- Ledger is append-only (trigger). Locked results can't hold contact values (check constraint).
- Shared records older than 12 months are deleted (on each worker claim).

## Checks run

- `npx tsc --noEmit` clean · `npm run lint` 0 errors (same 2 old warnings as main)
- `npm test` 73 pass (26 new: access, intake/search/removal input, normalising, credits + refunds,
  worker keys + payload checks, locked results, link safety)
- `npm run test:sql` (new): runs 0019 twice in PGlite (real Postgres in WebAssembly) and walks
  submit / hold / claim / complete / pick / stale re-queue / add to leads / bounce / removal /
  append-only / cascade. Owner checks via `auth.uid()` are NOT covered (PGlite runs as postgres).
- `npm run build` passes.
- Zilla `--test` on woshistudio.pages.dev and one OpenStreetMap lookup; output passes the server's checks.

## Not built yet (later phases)

List upload + 24 h deadline sweeper + late refunds + Discord alerts (F3), the `finder` plan, packs
and Stripe (F2), always-on loop (F4, `runner.py` doesn't run finder yet), weekly drops / locked
results / exclusivity (F5; `finder_unlock` exists but nothing makes locked results), background
re-checks and paid checkers (F6), public `/leads` page (F7), agent API `finder_search`.

## Test checklist (after the owner steps)

- [ ] People → Found shows; "What are you hunting?" saves only with the tick
- [ ] Search "Woshi Studio" + `woshistudio.pages.dev` → "Queued"; `python zilla.py finder --once`
      → result card with phone + contact form; Call / Add to leads work
- [ ] Same search again → instant "Found in our records"
- [ ] Tester business (in `FINDER_BETA_BUSINESS_IDS`): credits show 10, search holds one
- [ ] Other business: Found says invite-only
- [ ] `/remove-my-data` → email arrives → Confirm → "Done"; searching that site again finds nothing
- [ ] Revoke the worker key → `finder --once` gets 401
