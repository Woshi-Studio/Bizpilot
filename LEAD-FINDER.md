# Lead Finder

- **F2 (branch `finder-plans`)**: plans + locked results, lead credits from Stripe, the smart search
  box, "Find me customers", area + radius. Migration **0020**. This section.
- **F0 + F1 (live on main)**: legal pages, invite-only single search, worker, credits. Further down.

Screenshots: `..\UI-PREVIEW\lead-finder\` (07-11 are F2).

## F2: who gets what

| | Starter (free) | Hustle ($5) | Boss ($15) | Owner |
|---|---|---|---|---|
| See Search leads, run searches | yes, 5 a day | yes, 5 a day | yes | yes |
| Result card | **locked**: company, city, why it fits. Phone, email, website, contact name and source hidden + "Upgrade to Boss to unlock" | **locked** (same) | unlocked | unlocked |
| Cost of a search | free | free | 1 lead credit (not found = free) | nothing |
| Lead credits | none | none | 40 on every paid Boss invoice | unlimited |
| Lead subscription / packs | "Boss only" box | "Boss only" box | can buy | nothing to buy |
| "Find me customers" | yes, results locked, counts as 1 of the 5 | same | yes, 1 credit per company | yes |

- Locked results are **saved**. When the business becomes Boss, the next visit to Search leads
  unlocks all of them, free (`finder_unlock_all`).
- Locked values are never in the database row, so they can't reach the browser (the page HTML was
  checked: 0 matches for the demo phone, email, website and contact name). Candidate lists ("which
  one?") hide websites for locked accounts; users can no longer read that column at all.
- Invited testers (`FINDER_BETA_BUSINESS_IDS`) keep F1 behaviour: unlocked, paid with their beta credits.
- **`FINDER_OPEN`**: until it is `1`, only the owner and invited testers see the Lead Finder
  (everyone else: "opens soon"). Merging this branch does NOT open it to the public by itself.

### The numbers (change them in `src/lib/finder-plans.ts`)

| Constant | Value | What it does |
|---|---|---|
| `BOSS_CREDITS_PER_PERIOD` | 40 | credits on each paid Boss invoice |
| `LEADSUB_CREDITS_PER_PERIOD` | 100 | credits on each paid lead-sub invoice (x quantity) |
| `LEAD_CREDITS_ROLL_OVER` | false | false = a new grant removes what's left of the last grant of the same kind; the end of a subscription removes its leftovers. Pack credits never expire |
| `LOCKED_SEARCHES_PER_DAY` | 5 | free locked searches (and Find-me-customers runs) per 24 h |
| `DISCOVER_DEFAULT_COUNT` | 10 | new companies per "Find me customers" run |
| `LEAD_PRODUCTS_BOSS_ONLY` | true | lead sub + packs only for Boss (drives upgrades) |
| `PACK_CREDITS` | 25 / 100 | credits per pack |

Spending order: plan and lead-sub credits first (oldest grant first), pack credits last, so packs
survive the "no rollover" cut.

## F2: what Lucy creates in Stripe

Stripe Dashboard → Product catalogue → **+ Add product**. Prices are your call; the app only reads
the price ids. Same mode (Test or Live) as the keys in Vercel.

| # | Product name | Price type | Billing | Vercel env var for the price id (`price_...`) |
|---|---|---|---|---|
| 1 | **Jephelen Lead Subscription** (100 leads every 4 weeks) | Recurring | **Custom: every 4 weeks** (interval `week`, count `4`) | `STRIPE_PRICE_ID_LEADSUB` |
| 2 | **Jephelen Lead Pack: 25 leads** | One-off | once | `STRIPE_PRICE_ID_PACK25` |
| 3 | **Jephelen Lead Pack: 100 leads** | One-off | once | `STRIPE_PRICE_ID_PACK100` |

- Unset env var = that button says "Coming soon".
- Don't put these prices on the Hustle / Boss products: they must be their own products.

**Webhook events** (Developers → Webhooks → the Jephelen endpoint `/api/stripe/webhook` → Edit →
Select events). The endpoint had these three (per `PRO-TIER.md`; not checked on the live dashboard):
`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
**Add `invoice.paid`.** Without it, Boss and the lead sub grant no credits. Packs only need
`checkout.session.completed` (already there).

**Customer portal** (Settings → Billing → Customer portal): make sure customers can cancel
subscriptions; "Manage" on the lead sub opens it.

## F2: go-live steps (in this order)

1. **Run 0020 AFTER 0019**: `..\GO-LIVE\0020_finder_plans.sql` (same text as
   `supabase/migrations/0020_finder_plans.sql`). Safe to run twice. The app on main keeps working
   after it (the old `finder_submit` form still exists), so it can go in before the merge.
2. **Stripe**: create the 3 products above; add `invoice.paid` to the webhook.
3. **Vercel env vars** (Production): `STRIPE_PRICE_ID_LEADSUB`, `STRIPE_PRICE_ID_PACK25`,
   `STRIPE_PRICE_ID_PACK100`. When you want everyone in: `FINDER_OPEN=1`.
4. **Merge** `finder-plans` into `main`.
5. **Zilla**: `_TOOLS\zilla\finder.py` is already updated on the PC (backup:
   `finder.py.bak-2026-09-27`). Nothing to paste.

Order matters: 0020 before the webhook sends `invoice.paid` (a grant before 0020 fails, and Stripe
retries it for 3 days, so it isn't lost).

## F2: what was built

| Part | Where |
|---|---|
| Tab renamed | People → **Search leads** (`/leads/search`, title "Search for leads"). `/leads/found` and `/leads/found/*` redirect (next.config.ts) |
| Smart search box | One box: company name, website, business email, phone, or a person's name. A chip says what it looks like ("Looks like an email"). City optional. Personal emails (gmail etc.) are refused. Person: "It's a person →" asks where they work (required) and only finds them where that company lists them on its own site. `src/lib/finder-query.ts` (libphonenumber-js) |
| Intake optional | Search works without "What are you hunting?". The Acceptable Use tick is still required (on the search form the first time; the profile row then holds only the version). AUP version bumped to `2026-09-27.2` for the person rule |
| Intake | "About your business" first (what you do, your services, your ideal customer: "so we can find companies that need what you sell"); 33 customer kinds + "Other: type it"; area **Canada · USA · Canada + USA · Worldwide**; radius **N/A · 15 · 50 · 200 miles** (stored as 24 / 80 / 322 km) |
| Find me customers | Button on Search leads and the intake page. Starts a discovery run (`finder_discover_submit`); Zilla finds new businesses on OpenStreetMap from the intake and sends them to `/api/finder/worker/discovered`; each becomes a normal search item (known ones delivered at once). Skips companies already in the user's results, leads or searches, the leave-out list and the removal list. One run at a time |
| Locked cards | `result-card.tsx`: fixed blurred shapes (never the real values), "Source: hidden", **Upgrade to Boss to unlock** |
| Settings → Lead Finder | Credits, lead-sub status (Active · next credits date / ends date / payment failed), buy buttons or "Coming soon", "Boss only" box for Starter / Hustle |
| Checkout | `settings/finder-billing-actions.ts`: lead sub = subscription mode (a second active one opens the portal instead); packs = payment mode. Price ids only from env |
| Webhook | `invoice.paid` → grant (Boss price → 40, lead-sub price → 100), once per invoice id. `checkout.session.completed` for packs → grant once per session id (price checked from the line items, not from the browser). Lead-sub events never change the plan (before, any unknown price was treated as Hustle). Leaving Boss: Boss leftovers expire and the lead sub is set to end with its period. The plan checkout ignores the lead sub when checking "already paying" |
| Legal | AUP section 5 "Business contacts only, never people-searching"; Privacy line on person lookups |
| Zilla | `finder.py`: kinds company / domain / email / phone (Overpass by number near the city) / person (company's own site only) / discover (INDUSTRY_TAGS). Area + radius from the intake. Same politeness and email rules |

### "Find me customers": customer kind → OpenStreetMap tags (`INDUSTRY_TAGS` in finder.py)

| Kind (id) | OSM tags |
|---|---|
| offices | office=company, consulting, coworking, administrative, association, employment_agency, architect, engineer, research, quango, logistics, energy_supplier, telecommunication |
| medical | amenity=clinic, dentist, doctors; healthcare=clinic, dentist, doctor, physiotherapist, optometrist, laboratory, rehabilitation |
| seniors | amenity=nursing_home; social_facility=nursing_home, assisted_living, group_home |
| pharmacy | amenity=pharmacy; shop=chemist |
| restaurants | amenity=restaurant, cafe, bar, pub, fast_food, food_court, ice_cream |
| grocery | shop=supermarket, convenience, greengrocer, butcher, bakery, deli, alcohol |
| retail | shop=clothes, shoes, gift, furniture, hardware, doityourself, electronics, books, jewelry, florist, department_store, variety_store, sports, toys, mall, optician, stationery, houseware |
| construction | craft=builder, carpenter, electrician, plumber, roofer, hvac, painter, tiler, stonemason, glaziery, insulation, plasterer, floorer, window_construction; office=construction_company |
| home_services | craft=gardener, locksmith, handicraft, upholsterer; shop=garden_centre |
| manufacturing | man_made=works; industrial=*; craft=metal_construction, brewery, winery, distillery, printer, sawmill |
| warehousing | building=warehouse; industrial=warehouse, depot, logistics, distributor |
| trucking | office=logistics, moving_company, courier; shop=truck, trailer; amenity=truck_wash |
| property | office=property_management |
| real_estate | office=estate_agent, property_management |
| auto | shop=car, car_repair, car_parts, tyres, motorcycle; amenity=car_wash, car_rental |
| beauty | shop=hairdresser, beauty, cosmetics, massage, tattoo, nails |
| fitness | leisure=fitness_centre, sports_centre, dance, ice_rink, swimming_pool; sport=yoga, fitness |
| education | amenity=school, college, university, language_school, driving_school, music_school, training |
| daycare | amenity=kindergarten, childcare |
| hotels | tourism=hotel, motel, guest_house, hostel, apartment |
| churches | amenity=place_of_worship |
| nonprofits | office=ngo, charity, association, foundation, religion; amenity=community_centre, social_centre, social_facility |
| government | office=government; amenity=townhall, courthouse, library, police, fire_station |
| tech | office=it, telecommunication, software; shop=computer, mobile_phone |
| legal | office=lawyer, notary |
| accounting | office=accountant, tax_advisor |
| finance | amenity=bank; office=financial, financial_advisor, insurance |
| cleaning | shop=dry_cleaning, laundry; office=cleaning; craft=cleaning |
| events | amenity=events_venue, conference_centre, exhibition_centre; office=event_management; craft=caterer |
| entertainment | amenity=cinema, theatre, nightclub, arts_centre, casino; leisure=bowling_alley, amusement_arcade, escape_game |
| pets | shop=pet, pet_grooming; amenity=veterinary, animal_boarding |
| agriculture | shop=farm, agrarian; craft=agricultural_engines; landuse=farmyard |
| media | office=advertising_agency, newspaper, publisher, graphic_design; craft=photographer; shop=photo, copyshop |
| Other (typed) | a Nominatim text search inside the same box |

Where: the radius around the intake city; no radius = the city's own area, else the province;
Worldwide needs a city or a province. Each kind gets its own query and they take turns in the
list, businesses with a website first, chains last. Zilla sends 3x the wanted number; the database
keeps the first N that are new to the user.

## F2: checks run

- `npx tsc --noEmit` clean · `npm run lint` 0 errors (the same 2 old warnings as main)
- `npm test` **90 pass** (new: `finder-query.test.ts` 9 on the 5 input kinds, chips, personal-email
  refusal, person rules; `finder-plans.test.ts` 4 on price ids, invoice/pack grants, Boss-only;
  `finder-credits.test.ts` +2 on grant idempotency and no rollover; `finder.test.ts` access
  Starter/Hustle locked vs Boss unlocked, locked card hides website/source/contact, miles/km,
  area; `finder-worker.test.ts` + the `discovered` payload)
- `npm run test:sql` runs 0019 and then **0020 twice (and 0019 again after it)** in PGlite:
  locked results for Starter and Hustle hold no phone/email/website/address/source; no credits
  used; daily cap; unlock refused on Starter (`finder:upgrade`), free unlock of saved results on
  Boss; Boss search spends and delivers unlocked; the same invoice/session granted twice = once;
  no rollover (39 left expire at the next grant; pack credits kept; lead-sub pool separate;
  rollover switch; subscription end); owner writes no rows; the 0019 call form still works; the 5
  search kinds (domain, business email, phone match in any format, company without a city, person
  always researched); area + radius in the worker's claim; "Find me customers" (needs the intake
  and a kind; one run at a time; skips an existing lead, duplicates, the removal list and bad
  links; delivers known ones at once; holds 1 credit per new company on Boss; locked and free on
  Starter); users can't read candidates or grants
- `npm run build` passes
- Zilla dry runs (`--test`, nothing sent): company "Treehaus" Kitchener → found (phone + 2 emails);
  domain woshistudio.pages.dev → found (phone + form); email info@kpl.org → found on kpl.org (the
  typed address itself isn't published there, so it isn't returned); phone 519-743-0271 +
  Kitchener → Kitchener Public Library via Overpass → found; person "Aaron Strik" at sbmltd.ca →
  found (listed on their leadership page); a made-up name at the same site → not found (no charge);
  **discover**: cleaning business → offices + manufacturing within 15 miles of Kitchener → 289
  candidates, 30 sent, both kinds taking turns; 2 of the first 3 enriched with contacts
- Screenshots (390 + 1440, real phone viewport, no sideways scroll): `07_search_locked_*`,
  `08_card_locked_*`, `07_search_boss_*`, `09_card_unlocked_*`, `10_settings_finder_*`, `11_intake_*`
- Locked page HTML checked: none of the demo's phone, email, website or contact name is in it

## F2: not built / known limits

- The lead subscription grants **credits**; Zilla doesn't yet drop new companies into the account
  on its own every 4 weeks. "Find me customers" is the manual version (one button, 10 per run).
- Person search needs the company (name or website). "Person + city only" would mean searching
  people across every business in a city, which is people-search; not built on purpose.
- A phone number we don't know yet needs a city (Overpass searches the map near it).
- Unlock-on-upgrade is free, so someone could run 5 free locked searches a day for weeks, then pay
  one Boss period and unlock them all. The daily cap limits it; charging 1 credit per unlock would
  close it (one line in `finder_unlock`).
- Downgrading from Boss with pack credits left: they stay, but results are locked until Boss again.
- Stripe flows were not run against Stripe (no test keys here). The webhook and checkout code is
  typed against stripe v22 (`invoice.parent.subscription_details`) and the grant logic is tested
  in SQL; the first real Test-mode purchase is the proof.

---

## F0 (legal pages) + F1 (invite-only MVP): live on main

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
