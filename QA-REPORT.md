# QA report: 4 personas, 4 themes, desktop + phone

Branch `qa-fixes` (from `main` e1b72cb). Tested 2026-09-26 on `npm run dev` with
`DEMO_MODE=1` on port 3456 (fake data, no login, nothing touched the live site),
driven by Playwright + headless Edge.

Screenshots: `D:\Claude\Game\HQ\03_BUSINESS\Jephelen\UI-PREVIEW\qa\`
- `sweep_<theme>_<width>_<page>.png`: every main page, 4 themes, 1440 + 390, **before** the fixes
- `after_<theme>_<width>_<page>.png`: the same sweep **after** the fixes (`_bottom` = scrolled to the end)
- `p1_*`, `p2_*`, `p3_*`, `p4_*`: the persona sessions, step by step
- `after_sweep_*.json` / `sweep_*.json`: the machine checks per page (sideways scroll, covered buttons, contrast, console errors)

## Counts

| | |
|---|---|
| Found | **32** |
| Fixed | **22** |
| Left | **10** (4 of them only happen in demo mode or in `next dev`) |

After the fixes, the 4-theme sweep (32 pages x 4 themes x 2 widths = 256 page loads) shows:
**0 pages that scroll sideways** (was 3), **0 console errors or failed requests** on real pages
(was 1 page with a 500), and no button left under the Athena bubble or the phone tab bar
when you scroll to the end of a page.

## How the checks worked

- Every page was loaded in Clean, Dark, Neon and Retro at 1440 and 390 wide.
- On each page a script measured: sideways scroll, any button/link whose centre is covered
  by a fixed element (Athena, tab bar, tour) when scrolled to the end, text contrast
  (WCAG, 4.5:1 for normal text), console errors, failed requests.
- A "click everything" crawler opened the owner's pages and clicked every button and link
  one by one (with a Playwright pre-click check that fails when something else is on top).
- The 4 personas below were scripted as real sessions and every step was screenshotted
  and looked at.

---

## Persona 1: the owner, busy (desktop 1440 + phone 390, Clean)

**Tried:** Home → Add customer → contact page (scrolled, every action bar button) →
New invoice from services → Send by email → Calendar New → Booking settings → Save.
Also clicked every button/link on Home, Customers, Add customer, the contact page,
New invoice, the invoice page, Calendar and Booking settings (crawler).

**Broke:**
1. **Contact page action bar covered the page (the "overlap" the owner saw).** On desktop the
   9 buttons wrapped to 2 rows (~100px), and the bar sticks under the header, so while
   scrolling it sat on top of the Documents section: the file chooser and the **Upload**
   button could not be clicked. See `p1owner_p1owner_customers_..._blocked_59.png`.
2. The **Send invoice ▾** menu on the contact page was cut off on phones (the bar scrolls
   sideways, which clips anything that drops out of it).
3. Clicking a calendar item opens a side panel; on desktop the **Athena bubble sat on top of
   the panel's bottom buttons**.
4. Athena bubble covered the bottom-right card on Home at the end of the page.
5. "Upload file" / "Edit details" jump links landed with the heading tucked under the bar.
6. Document download link returns a plain "Could not create a download link" 500 page in demo
   (demo storage has no real files).

**Fixed:** 1–5. The bar is now **one short row (57px)** that scrolls sideways, full width with
a solid background, and shows a thin scrollbar on desktop so mouse users see there's more.
The Send-invoice menu now renders on top of everything and opens upward when it would hit
the phone tab bar (`menu_390_send_invoice_menu.png`). The calendar panel sits above Athena.
Pages have more bottom room. Jump links stop below the bar.
After: `p3_after_neon_1366_04_contact_scrolled_bar.png`, `p1_phone_390_*`.

**Left:** 6 (demo only; see "Left").

---

## Persona 2: brand-new Starter user on a phone (390, `DEMO_PLAN=free DEMO_TOUR=1`)

**Tried:** the welcome tour (all 6 steps, Back/Next/Skip, replay with "?"), Add customer and
New invoice while over the Starter limits (demo data has 13 contacts / 7 invoices),
Send email on Starter, Settings → Theme (tapping locked Neon/Retro), Settings → Plan,
Upgrade, every bottom tab, the account menu, Feedback.

**Broke:**
1. **Plan limits only showed up after filling the whole form.** Add customer and New invoice
   looked normal; the "you've reached 10" message only came after pressing Save.
2. **Account menu (the "MT" circle) didn't close when you tapped the page**; it only closed
   from inside the menu (its close layer only covered the header).
3. Athena bubble covered the end of pages and the action bar (full "Athena" pill is 150px wide
   on a 390px screen).
4. Theme tiles: the "🔒 HUSTLE" badge squeezed "Woshi Neon" onto two lines.
5. Every Upgrade button lands on Settings → Plan, which shows **"Coming soon"** under Hustle and
   Boss in demo (no Stripe prices in the demo env). Needs a check on live.

**Worked well:** the tour: every tooltip stayed on screen at 390 and 1440, the spotlight never
hid behind the tab bar, step 3 opened a contact page and found the bar, Skip/Esc ended it.
Locked themes send you to Plan without changing the theme. Sending on Starter shows a clear
"comes with Hustle" note.

**Fixed:** 1 (a notice with an Upgrade button now sits above the form:
`p2_run2_390_03_new_customer_limit.png`, `p2_run2_390_04_new_invoice_limit.png`), 2, 3
(the bubble is a round icon on phones, the pill on tablet/desktop), 4.

**Left:** 5 (config, check on live).

---

## Persona 3: Hustle user, Neon theme, laptop 1366

**Tried:** People → Leads → search, contact page action bar while scrolling, Send email with
quick templates (EN and FR), date chips on Tasks, Documents (Rename, Send), Athena
("how do I send an invoice?"), AI Messages → Generate.

**Broke:**
1. Same action bar overlap as persona 1 (at 1366 it was 2 rows too).
2. Date chips are 20px tall: fine with a mouse, too small for a thumb (seen on the phone runs).
3. Neon contrast: fine. Every Neon page passed the contrast check except faded past days in
   the calendar (see Left).

**Worked well:** templates fill subject + body, the EN/FR switch works, date chips set the date,
Athena answers from the help guide without spending a credit, AI Messages generates.

**Fixed:** 1, 2 (chips are bigger on phones, same on desktop).

**Left:** none specific to this persona.

---

## Persona 4: a visitor booking a meeting (phone 390 in Tokyo, desktop 1440 in Los Angeles)

**Tried:** `/book/bright-harbor` → Free intro call → pick a day → pick a time → details form →
book → confirmation; "Change" time zone; manage link → Reschedule → new time; Cancel →
confirm; `.ics` download; a past booking; a bad token. Also the Starter plan (booking off).

**Broke:**
1. **Phone: after tapping a time, the "Your details →" button was below the screen**
   (at 1029px on an 844px screen), so nothing seemed to happen. After tapping a day, the
   times were also mostly below the screen.
2. The booking page said **"With: Free intro call · Bright Harbor Studio"**: the meeting name
   again, under a heading that is already the meeting name.
3. When no meeting types are live (e.g. Starter), the page still said "Pick a meeting" above
   "This booking page isn't available right now."
4. In demo, Cancel reloads the page and still shows the booking (demo writes don't save).

**Worked well:** times show in the visitor's zone (GMT+9 in Tokyo, PDT in Los Angeles), the
zone picker has all 418 zones, reschedule works, `.ics` downloads as `text/calendar`,
past bookings say "This meeting took place", a bad token is a clean 404.

**Fixed:** 1 (the page now scrolls the times, then the Continue button, into view:
`p4_run3_390_04_slot_picked.png`), 2, 3.

**Left:** 4 (demo only).

---

## All pages, all themes (1440 + 390)

**Broke (before):**
1. **Invoices list on a phone was broken**: "Edit" and the "Draft" badge sat on top of each
   other, the date/business text was squeezed into a 70px column one word per line, and the
   customer name was hidden. Worst in Retro (header buttons ran off the screen).
   `sweep_clean_390_invoices.png`, `sweep_retro_390_invoices.png`.
2. **Invoice page and the customer's public invoice (`/i/<token>`) on a phone**: quantity and
   unit price ran together ("1$1,200.00"), the customer's email ran off the card.
   `sweep_clean_390_invoice.png`.
3. Money page on a phone scrolled 68px sideways (Export + month arrows didn't wrap).
4. Pricing page rows scrolled 5px sideways on a phone.
5. Invoices page title squeezed next to its buttons on a phone.
6. Time & Billing: 3 stat cards stacked, taking a whole phone screen.
7. **Clean theme grey text was too light** (2.4–2.6:1; needs 4.5:1): captions, table headers,
   "optional" labels, dates, the booking page's calendar and labels. ~25 pages.
8. Green and amber text (profit, "Today", "+ Income") at 3.2:1 in Clean.
9. Public business page `/b/<slug>` crashed with a 500 in demo mode.

**Fixed:** all 9. After: `after_clean_390_invoices.png`, `after_retro_390_invoices.png`,
`after_clean_390_invoice_bottom.png`, `after_clean_390_money.png`.
Dark, Neon and Retro already passed contrast except the items under "Left".

---

## Left (10)

| # | What | Where | Why left |
|---|---|---|---|
| 1 | Every Upgrade button lands on plan cards that say "Coming soon" | Settings → Plan | Demo has no Stripe prices. **Check on live** that Hustle/Boss show a real button. |
| 2 | Faded past / other-month days in the calendar are 1.4–1.8:1 | Calendar, all themes | On purpose (they're "off"), but hard to read. Design call. |
| 3 | Avatar initials ("AC") 3.3–3.5:1 | Contact header | Big bold text, close to the 3:1 large-text bar. Minor. |
| 4 | On a phone, before the action bar sticks, the round Athena button can sit on its 3rd button | Contact page, 390 | The bar scrolls sideways so the button is reachable. Minor. |
| 5 | Time formats are mixed: "12:00 p.m.", "10:00 AM", "2:00 PM EDT" | Calendar vs forms vs booking | Wording pass; not a bug. |
| 6 | Line item reads "Interpreting (Spanish) (per hour)" | New invoice from services | Double brackets when the service name has brackets. Cosmetic. |
| 7 | Download of a document shows a bare "Could not create a download link" page on a storage error | Contact → Documents | Real mode is fine when storage works; the error page is plain text. |
| 8 | Demo only: after Add customer / Create invoice you land on a 404 | Demo mode | The fake client doesn't save, so the new id doesn't exist. Not a real-user bug. |
| 9 | Demo only: Cancel booking reloads to the same booking | Demo mode | Same reason. |
| 10 | `next dev` only: "Encountered a script tag while rendering React component" in the console on 404 pages | Root layout theme script | React dev warning; the script is Next's own documented no-flash pattern and prod doesn't log it. |

## Top 10 friction points (not all bugs)

1. **Contact page on a phone:** the header card fills the first screen; the action bar (the
   whole point of the page) starts below it.
2. **Tasks and Leads on a phone** open with a big "add" form; the list you came for is a
   long scroll down.
3. **Business filter chips run off the right edge** ("Casa No…") with no hint that they scroll.
4. **Mixed date formats:** `2026-09-26` in lists and forms, "Sep 28" in cards, "Monday,
   September 28" on booking. Mixed time formats too (see Left 5).
5. **The welcome tour ends on a random customer's page** (step 3 opens a contact; steps 4–6
   then point at the nav while you stay there).
6. **Send invoice dialog: Send is greyed out** while "Making a view link…" runs, with no spinner.
   In dev it took several seconds.
7. **Starter demo data is already over the limits** (13 of 10 contacts, 7 of 5 invoices), so a
   new user's first "Add customer" meets an upgrade wall (now shown up front).
8. **Booking page shows the raw zone id** ("Times are in Asia/Tokyo", "America/Los Angeles")
   rather than a friendly name.
9. **Action bar on laptops** hides "Upload file" and "Edit details" off the right edge; a thin
   scrollbar now hints at it, but they're easy to miss.
10. **Invoice form:** the service tiles are fit-to-text widths on a phone, so the grid looks
    ragged; and a date field shows "yyyy-mm-dd" when empty.

## Files changed

`contact-actions.tsx`, `athena.tsx`, `app-shell.tsx`, `calendar-grid.tsx`, `invoices/page.tsx`,
`invoices/[id]/page.tsx`, `i/[token]/page.tsx`, `money/page.tsx`, `services-list.tsx`,
`time/page.tsx`, `customers/new/page.tsx`, `invoices/new/page.tsx`, `theme.tsx`, `date-chips.tsx`,
`booking-widget.tsx`, `manage-booking.tsx`, `book/[slug]/page.tsx`, `globals.css`,
`customers/[id]/page.tsx`, `leads/[id]/page.tsx`, `demo-client.ts` (demo only).

No security code touched: no auth, RLS, rate limits or plan checks changed (the new plan
notice only reads the same `checkPlanLimit` the save already uses; the database trigger is
still the wall). `npx tsc --noEmit`, `npm run lint` (0 errors, 2 old warnings),
`npm test` (47/47) and `npm run build` pass.
