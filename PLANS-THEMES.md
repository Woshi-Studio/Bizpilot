# Plans, themes, sending and quick templates (Phases 2D + 2E)

Branch `plans-themes`. Screenshots: `D:\Claude\Game\HQ\03_BUSINESS\Jephelen\UI-PREVIEW\themes\`.

## Owner steps (in order)

1. **Run the migration.** Supabase → SQL Editor → New query → paste
   `supabase/migrations/0017_plans_limits.sql` (same text as
   `GO-LIVE/PASTE_step12_plans_0017.sql`) → Run. Safe to run twice.
2. **Mark your businesses unlimited.** The app does this by itself the first
   time you open Jephelen (it copies `OWNER_BUSINESS_IDS` into
   `plan_unlimited_businesses`, with the service key). To do it by hand:
   `insert into public.plan_unlimited_businesses (business_id) values ('<your business id>') on conflict do nothing;`
   Until one of these happens, the database treats your business by its plan
   (see "Before step 2" below).
3. **Merge** `plans-themes` into `main`. Vercel redeploys. No new env vars.
4. Check `NEXT_PUBLIC_SITE_URL` is set to the live address (it already is for
   Stripe). The invoice view links use it.

Before step 2: if your own business is on `free` in the database, the
triggers would stop you at 10 customers + leads. The app itself never limits
you (it reads `OWNER_BUSINESS_IDS`), and step 2 runs on your first page load
after the merge, so in practice this only matters for SQL-editor checks.

## Plans

DB values stay `free` / `premium` / `pro`; the app says **Starter / Hustle / Boss**.

| | Starter (free) | Hustle ($5 / 4 wks) | Boss ($15 / 4 wks) | Owner |
|---|---|---|---|---|
| Customers + open leads | 10 | 150 | unlimited | unlimited |
| Invoices + quotes, rolling 28 days | 5 | 50 | unlimited | unlimited |
| Storage (client files, receipts, service pictures) | 50 MB | 1 GB | 10 GB | unlimited |
| Emails sent from Jephelen a day | 0 (Copy / Open in my email) | 50 | 200 | unlimited |
| Business lines | 1 | 3 | unlimited | unlimited |
| AI credits a day (0013) | 10 | 100 | 500 | unlimited |
| Themes | Clean, Dark | all 4 | all 4 | all 4 |
| Assistant access (API keys) | locked teaser | yes | yes | yes |

How it's enforced:
- **Database (can't be skipped from the browser):** BEFORE INSERT/UPDATE
  triggers on customers, leads, invoices, services, tasks, documents; a
  RESTRICTIVE insert policy on storage; `consume_email_send()` now uses the
  plan's number. Errors read `plan_limit:<kind>:<n>`.
- **App:** every create action checks first and shows "You've reached 10
  customers and leads on Starter. Hustle gives you 150 for $5 every 4 weeks."
  with an **Upgrade** button (Settings → Plan). The agent API checks the same
  limits (it uses the service role, which the triggers let through) and
  answers **402** with the message; Starter keys get **403**.
- A **converted** lead stops counting (its customer counts instead). So a lead
  can only be marked converted once a customer with the same name exists;
  on plans with a limit, picking "Converted" runs "Add to customers".
- Storage: a direct upload is refused once the business is at its limit; one
  last file (≤ 10 MB) can go over because its size isn't known yet.
- Invoice count uses a log (`plan_usage_events`), so deleting invoices doesn't
  reset it.
- Existing data over a limit stays; only new rows are refused.

## Who sees what in Settings

| Section | Starter | Hustle | Boss | Owner |
|---|---|---|---|---|
| Profile, Login email | ✔ | ✔ | ✔ | ✔ |
| Theme (4 tiles) | Clean, Dark; Neon + Retro show 🔒 Hustle | all | all | all |
| Plan cards + Usage meter | ✔ | ✔ | ✔ | ✔ + "Owner · no limits" |
| Email sending card | hidden | ✔ (50/day) | ✔ (200/day) | ✔ (no limit) + setup hints |
| Assistant access | locked teaser | ✔ | ✔ | ✔ |
| Public page, Payments, Invoice settings, Templates | ✔ | ✔ | ✔ | ✔ |

Owner-only things never shown to others: the OWNER badge, setup messages that
name env vars or migrations ("ask Marlene…"), the owner's configured business
line names (Woshi Studio, VWA, …; other accounts only see lines they created).

## Themes

Clean · Dark · **Woshi Neon** (night purple, hot pink + cyan glow, Orbitron
headings, a 200 ms RGB jitter on the page title and logo every 6 s, neon
sidebar edge) · **Retro** (warm off-black CRT, phosphor green + amber, VT323
headings, faint scanlines, square buttons with hard shadows). All through the
CSS tokens in `globals.css` (`data-theme` on `<html>`). Reduced motion: no
glitch, no flicker. Saved in the browser and on the profile (`profiles.theme`),
so it follows the user. A paid theme falls back to Clean after a downgrade.

## Sending invoices, quotes and files

- **Invoice / quote page → Send by email.** Subject + a friendly message with
  the amount, due date and a **view link** are filled in; editable.
  - Plans with sending (Hustle, Boss, owner via Gmail SMTP): sent from
    Jephelen with an **HTML copy attached** (opens in any browser, prints to
    PDF — a server-side PDF would need a PDF package, so HTML was chosen).
    Logged as `email_sent` on the contact; status → **Sent** only after it
    really went out.
  - Everyone else: **Open in my email** (mailto with the link; email apps
    can't attach files through mailto) + **Mark as sent**.
- **View link** `/i/<token>`: no login, 256-bit random token, shows just that
  invoice with Print / Save as PDF and the payment notes. **Turn off view
  links** on the invoice page revokes them (a new link is made next send).
- **Documents list → Send**: the file is attached (≤ 10 MB) or, with Open in
  my email, a download link `/d/<token>` (60-second storage link per click).
- **Contact page → Send invoice** lists that contact's unsent invoices/quotes.
- Not built: **Pay by card (Stripe Payment Link)** — TODO; needs a decision on
  per-invoice links vs. Stripe invoices and a webhook to mark paid.

## Invoices: connected, fewer clicks

- The customer's business fills **Business** (a dropdown now, with "+ New
  business…"); the business line sets **currency** (CAD by default for Woshi
  Studio, VWA, Casa Norte; else the business currency), **tax** (HST 13% /
  GST 5%, off unless set) and the **due date** (14 days by default). Change
  them per line in **Settings → Invoice settings**.
- The line's **services show as one-click cards** under Line items, plus
  "Pick from all services"; every line has ✕. Typing a line still works.
- Payment methods: presets in Settings → Payments (Interac e-Transfer, bank
  transfer / EFT, PayPal, Zelle, cash / cheque); ticking them on the invoice
  writes them into the notes.
- Subtotal, tax line and total in the invoice's currency everywhere (page,
  list, view link, HTML copy, the income logged when marked paid).
- **Edit** any invoice or quote (`/invoices/<id>/edit`), **+ New quote** button.

## Quick templates (free, no AI)

11 built-ins in English and French (Follow-up, Thanks for the call, Payment
reminder friendly / firm, Quote attached, Invoice attached, Meeting
confirmation, Reschedule, Welcome new client, Job finished, Review request),
filled with the contact's name, your business, amount, invoice number, due
date and view link. In: Send email, Send invoice / file, AI Messages (quick
start, no credit). **Settings → Templates**: change a built-in (Reset puts it
back) or add your own (`message_templates`).

Timeline quick types: "Called: left voicemail" (+ follow-up in 2 days),
"Called: spoke, follow up in 3 days", "Emailed", "Meeting booked". The
follow-up becomes a task (customers) or the follow-up date (leads).

Date chips (Today 4pm · Tomorrow 10am · Next Monday 9am · In 3 days · In 1
week · In 2 weeks) on the invoice due date, task due date, lead and customer
follow-ups, meetings and timeline entries.

## Calendar

- **Month · Week · Day** views. Click any day (or an hour in Day view) or
  **+ New** to add: Meeting, Call, Reminder, **Personal / blocked time**
  (greyed; stored as activity kind `block` with `ends_at`, ready for the
  booking page in Phase 5 — not built here), or Task due. Customer / lead
  optional; date/time chips.
- Click an entry → side panel: **Edit · Delete · Mark done · Open contact**,
  and **Send confirmation** (the Meeting confirmation template, in-app or in
  your own email) when it's linked to a contact with an email.
- "Book meeting" on a contact opens the add dialog with that contact filled in.
- 0017: activities kinds `reminder`, `block`; columns `ends_at`, `done_at`.

## Welcome tour and free help

- 6 steps (Home → People → a contact's action bar → Work/Calendar → Money →
  Athena), spotlight + tooltip, no package. Starts once on first login
  (`profiles.tour_done_at`); the **?** in the top bar replays it.
- Athena answers ~30 how-to questions from a built-in guide
  (`src/lib/help-faq.ts`) with **no credit**, marked "📘 From the help guide".
  Anything else goes to the AI as before.

## Edit / Delete audit (what each list had, what was added)

| List | Before | Added |
|---|---|---|
| Customers | edit on page, delete on page (confirm) | "Edit details" in the action bar, opens from links |
| Leads | status, add to customers, delete (no confirm) | Edit link, delete confirms |
| Tasks | status, × delete (no confirm) | Edit (title, due, value, description), delete confirms |
| Invoices / quotes | delete (no confirm) | Edit page, Edit + Delete on list rows, confirm |
| Services | delete only | Edit, Duplicate, picture, delete confirms |
| Time entries | delete (no confirm) | Edit (date, hours, description), confirm |
| Goals / wins | × delete | Edit (win, kind, details), confirm |
| Money in / out | × delete | Edit (amount, date, category, description), confirm |
| Monthly repeats | "stop" | Edit (amount, next date, description), confirm |
| Documents | delete (confirm) | Rename, Send |
| Timeline (activities) | × delete | Edit (title, text), confirm |
| Payment methods | delete (no confirm) | confirm |

## Friction fixes

1. Invoice: customer → business → currency, tax, due date, services, all filled.
2. Business is a dropdown of your lines (+ new), not a blank box.
3. Services: one click adds a filled invoice line; New task "Pick from your
   services" fills title, value and description.
4. Services form: **Save & add another** (clears, cursor back in Name).
5. Contact action bar: Send invoice lists unsent ones; Edit details jumps open.
6. Quick templates, quick activity types (+ automatic follow-up) and date chips.
7. Payment method presets with example text.
8. Inline edits: Enter saves, Escape closes.
9. Plan limits say what's next and link straight to the upgrade.

Not done yet (next): remembering the last Business / customer picked per form,
success toasts with Undo, "Save & add another" on customers and invoices.

## Also fixed

- The contact page had a hydration error (note dates) that dropped Dark mode
  on that page; fixed, and the theme now re-applies itself if React ever
  rebuilds the page.
- Users never see env var names ("Email sending isn't connected yet — ask
  Marlene to finish setup" for the owner, "coming soon" for everyone else).

## Test checklist (after the owner steps)

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` (26), `npm run build` pass
- [ ] Settings → Theme: all 4 tiles switch the whole app; reload keeps it; a
      second browser signed in as you shows the same theme
- [ ] Starter account: Neon / Retro tiles show 🔒 Hustle and link to Plan
- [ ] OS "reduce motion" on: no title glitch, no scanline flicker
- [ ] Starter: 11th customer or lead → friendly message + Upgrade; the public
      page form says "can't take new requests online right now"
- [ ] Starter: 6th invoice in 28 days refused; deleting one doesn't free a slot
- [ ] Starter: a second business line refused; picking an existing one works
- [ ] Starter: marking a lead Converted adds it to customers
- [ ] Starter: upload that crosses 50 MB refused (documents, receipts, pictures)
- [ ] Settings → Plan: 3 cards, yours marked, usage bars match reality
- [ ] Owner: nothing limited; "Owner · no limits" shows
- [ ] Agent API with a Starter key → 403; Hustle key over a limit → 402
- [ ] New invoice for a Woshi Studio customer: Business = Woshi Studio,
      currency CAD, due in 14 days, its services as cards; + adds a line; ✕ removes
- [ ] Settings → Invoice settings: VWA → HST 13% → new VWA invoice shows the
      HST line and total
- [ ] Invoice page → Send by email (owner, SMTP): arrives with the HTML copy
      and the link; status → Sent; timeline shows Email sent
- [ ] Open the link in a private window: invoice shows, Print works
- [ ] Turn off view links → old link shows 404
- [ ] Client account without sending: Open in my email opens the mail app
      with the link; Mark as sent changes the status
- [ ] Documents → Send: file attached; Open in my email link downloads it
- [ ] Every list: Edit saves, Delete asks first
- [ ] Settings → Templates: change "Follow-up", use it in Send email, Reset
- [ ] Timeline → "Called: spoke, follow up in 3 days" → task due in 3 days
- [ ] First login of a new account: tour starts; Skip; "?" replays it
- [ ] Athena: "how do I add a customer?" → 📘 answer, credit count unchanged
- [ ] Calendar: Day view; click 2 PM → add a Call with a customer → it shows;
      click it → Mark done, Edit, Send confirmation, Delete all work
- [ ] Calendar: add Personal / blocked time → shows greyed with dashed border
