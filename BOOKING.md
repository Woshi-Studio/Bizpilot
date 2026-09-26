# Own booking page (Phase 2G) — replaces Calendly

Branch `booking`, built on top of `plans-themes`. Screenshots:
`D:\Claude\Game\HQ\03_BUSINESS\Jephelen\UI-PREVIEW\booking\`.

Lucy's link once it's live: **https://jephelen.vercel.app/book/woshi**

## Owner steps (in this order)

1. **Merge `plans-themes` into `main` first** (see PLANS-THEMES.md), and run
   its migration `0017_plans_limits.sql`.
2. **Run 0018 AFTER 0017.** Supabase → SQL Editor → New query → paste
   `supabase/migrations/0018_booking.sql` (same text as
   `GO-LIVE/PASTE_step13_booking_0018.sql`) → Run. Safe to run twice.
3. **Add `CRON_SECRET` in Vercel.** Project → Settings → Environment
   Variables → `CRON_SECRET`, Production, a random value of 32+ characters
   (PowerShell: `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})`).
   Vercel sends it to the reminder route by itself.
4. **Merge `booking` into `main`.** Vercel redeploys. `vercel.json` adds a
   cron job: `/api/cron/reminders` every 15 minutes.
   - ⚠ **Vercel Hobby plans only allow a cron job once a day**, and the
     deploy is refused with a 15-minute schedule. If that happens, either
     (a) change the schedule in `vercel.json` to `0 13 * * *` (reminders
     then only go out once a day — not good enough for the 1-hour one), or
     (b) keep the route and call it from outside every 15 minutes — e.g. a
     free cron-job.org job, or a Windows scheduled task on the HQ PC:
     `curl -H "Authorization: Bearer <CRON_SECRET>" https://jephelen.vercel.app/api/cron/reminders`.
     If the project is on Pro, nothing to do.
5. **Set up the page.** Jephelen → Settings → Booking (or the Booking card
   in Settings):
   - Link name is pre-filled **woshi** for the owner (reserved: other
     accounts can't take `woshi`, `vwa`, `jephelen`, …).
   - Time zone, weekly hours, notice, how far ahead, buffers, max a day,
     language, accent color, intro, "New leads go to" (business line) →
     tick **Page is on** → Save.
   - Add at least one **meeting type** (e.g. "Free intro call", 30 min,
     video link, a question or two).
   - Optional: logo; Google Calendar **secret address in iCal format**
     (Google Calendar → Settings → the calendar → Integrate calendar).
6. **Email.** Confirmations and reminders use the existing email provider
   (Gmail SMTP for the owner). Without a provider the visitor sees the
   confirmation on screen only, and the booking shows "Not emailed".
7. **Assistant key.** Live keys that had both `contacts:read` and
   `calendar:write` get `calendar:read` from the migration, so
   `python jeph.py bookings` works with the existing key. A new key: tick
   "Read bookings".

## One-click publish (branch `booking-publish`)

Screenshots: `D:\Claude\Game\HQ\03_BUSINESS\Jephelen\UI-PREVIEW\booking-publish\`. No SQL.

- **Calendar** and **Settings → Booking** show one big **Publish booking page** button until
  the page is really bookable. One click: page on; link name if missing (`woshi` for the
  owner); Mon–Fri 9:00–17:00 if no hours; a **30-min call** if there are no meeting types
  (or the first one switched back on if all are off). Then a popup: the full link, Copy,
  Open page, "✓ Copied".
- Once live: a bar "Your booking link: <url> [Copy] [Open]" on Calendar and Settings →
  Booking; **Unpublish** is in Settings → Booking only.
- Copy: Clipboard API → old select + `execCommand("copy")` → the link is selected in its
  box for Ctrl+C. "Copied" only shows when it really copied.
- "Copy my booking link" (Home, Bookings, Settings) now only appears when the page has a
  bookable meeting type; before, it copied a link that said "isn't available right now".
- Demo: `DEMO_BOOKING_OFF=1` shows the page before publishing.

## What was built

| Part | Where |
|---|---|
| Settings → Booking | `/settings/booking`: link name, weekly hours (several ranges a day), time zone, minimum notice, how far ahead, buffer before/after, max a day, EN/FR/ES, logo, accent color, intro, business line for new leads, Google iCal busy times |
| Meeting types | 15/30/45/60 min, description, location (video / phone / in person / "I'll call you"), up to 10 questions (short / long / choice, required), deposit (Boss), on/off. Each is its own link `/book/<slug>/<type>` |
| Public page | `/book/<slug>` (list; one type goes straight in) and `/book/<slug>/<type>`: month calendar of open days → times in the **visitor's** time zone (can be changed) → form (name, email, phone, note, questions) |
| Confirmation | `/booking/<token>`: details, Add to Google Calendar, .ics download, **Reschedule**, **Cancel** |
| Booking | One DB transaction (`booking_create`): the meeting on the calendar, the lead found or created by email (tagged with the business line; an existing customer is used if the email matches), a timeline note, the booking row. Then emails with an .ics to the visitor and the owner |
| Reminders | `/api/cron/reminders`: 24 h and 1 h before, each claimed in the DB before sending, so never twice |
| Owner side | `/bookings` (Upcoming / Past / Cancelled, Attended / No-show / Undo / Cancel), bookings on `/calendar` with a 🌐 "Booked online" badge and Attended / No-show in the side panel, **Copy my booking link** on Home, Calendar, Bookings and Settings |
| Agent API | `list_bookings` [calendar:read]; `jeph.py bookings` |

### What counts as busy

Weekly hours in the business's zone, minus: other bookings, calendar
**meetings, calls and blocked time** (no end time = 60 min, calls 30),
the Google iCal busy times (free / cancelled events skipped; repeating
events expanded), the buffers around each, minimum notice, how far ahead,
and max a day. The server checks the slot, then `booking_slot_check` checks
it again inside the DB under a per-business lock, plus a unique index on
(business, start) — two people can't take the same time.

### Protection

- Public pages read with the service key, filtered to the one business
  behind the link; the booking functions are callable by the service role
  only.
- Honeypot field + minimum time on the page; rate limits in the DB: 5 an
  hour per visitor IP (hashed), 3 an hour per email, 30 an hour per
  business.
- The manage token is 256-bit random; owners can't read it (column grant).
  Owners can read bookings and change **only** the status.
- Google iCal: only `https://calendar.google.com/calendar/ical/…/basic.ics`
  (checked in the app AND by a DB check), no other host / port / login /
  query, redirects only to another such address, 8 s timeout, 5 MB cap.
  Read only, cached ~15 min in `booking_ical_cache` (no user access).
- Plan gating via `plan_limits()` from 0017 (`booking_links`): Starter 0,
  Hustle 1, Boss and owner unlimited — a DB trigger on meeting types, the
  booking function (after a downgrade only the first N stay bookable), and
  the app. Deposits: Boss only (DB trigger too).
- All 0011–0017 protections kept (see the header of 0018).

### Deposit (behind a flag — not charged by card)

Boss can set a deposit per meeting type. It is **shown** on the page, in
the confirmation email and on the booking, with "you'll get a payment link
by email". Charging the card at booking needs **Stripe Connect** (the money
must go to each user's own Stripe account, not Jephelen's) plus a hold on
the slot until payment clears — not built. Until then, send an invoice.

## Woshi lines to change from Calendly → https://jephelen.vercel.app/book/woshi

**Not changed by this branch** (public copy needs Lucy's OK).
- Searched `03_BUSINESS\Woshi Studio Site\` and `HQ\_TOOLS\`: **no
  Calendly link found** in either.
- The Woshi outreach email templates (the Gmail sender) live somewhere
  else — **?**, location not found. Ask the owner of the email sender
  which template holds the Calendly link, then swap that one line.
- Site: add a "Book a call" button to `woshistudio.pages.dev` pointing at
  the link (only after Lucy approves the copy).

## Test checklist (after the owner steps)

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` (47), `npm run build` pass
- [ ] Settings → Booking: link `woshi`, hours Mon–Fri 9–5, Page is on, Save → "Saved."
- [ ] Add "Free intro call" 30 min with a required question → Copy link works
- [ ] Private window → `/book/woshi` → open days show; times in your zone; change zone → times move
- [ ] Book a time → confirmation page; email arrives with `invite.ics`; owner gets "New booking"
- [ ] Jephelen: meeting on the calendar with 🌐; lead created (tagged); timeline shows "Booked online"
- [ ] Book the same time again in another window → "that time was just taken"
- [ ] Add blocked time on the calendar → those times disappear from the page
- [ ] Minimum notice 4 h → nothing sooner; max 1 a day → the day disappears after one booking
- [ ] Paste the Google secret iCal address → Save says "N busy times found"; a Google event hides its slot
- [ ] Paste `https://example.com/x.ics` → refused
- [ ] Confirmation link → Reschedule → new time; both get "Moved" emails; calendar entry moves
- [ ] Cancel → time frees up; cancel emails; meeting leaves the calendar; timeline note
- [ ] Book 25 h ahead → 24 h reminder arrives once; 1 h reminder arrives once
- [ ] `curl /api/cron/reminders` without the secret → 401
- [ ] /bookings: Attended / No-show / Undo; No-show adds a timeline note
- [ ] Starter account: page can't be switched on; Hustle: second live type refused; Boss: deposit field works
- [ ] FR and ES page language: page + emails in that language
- [ ] `python jeph.py bookings` lists the booking
