# Clean UI (Phase 2C)

Branch `clean-ui`. A calmer, modern Jephelen: fewer menus, one page per
thing, the actions right on the page. Screenshots (before/after, light
and dark, 1440 and 390 wide): `D:\Claude\Game\HQ\03_BUSINESS\Jephelen\UI-PREVIEW\`.

## What changed

1. **Navigation: 18 links → 6 groups.** Home · People · Work · Money · AI ·
   Settings. Inside a group, tabs across the top (People: Customers ·
   Leads; Money: Invoices · Time & Billing · Pricing · In & Out · Tax Center ·
   Reports; …). Phones get a bottom tab bar. **Every old URL still works**;
   `/home`, `/people`, `/work`, `/ai` also redirect. Goals & Wins lives
   under Home.
2. **Design system.** All colors, radius and shadows are tokens in
   `src/app/globals.css` (one purple accent + neutrals). Shared classes used
   on every page: `card`, `btn-primary|secondary|ghost|danger`, `input`,
   `label`, `chip`, `alert-*`, `page-title`, `section-title`. Bigger rounded
   cards with soft shadows, more space, clear type sizes, hover states.
3. **Dark mode.** Settings → Appearance (System / Light / Dark), or the moon
   button in the top bar. Saved in the browser (`localStorage`
   `jephelen-theme`), applied before the page paints (no flash).
4. **One page per contact** (`/customers/[id]`, `/leads/[id]`): header card
   (name, company, phone, email, address, website, business line, status),
   a sticky action bar (Send email · Add invoice · Send invoice · Write
   message (AI) · Book meeting · Ask for referral · Add task · Upload file),
   key facts (open tasks, unpaid invoices, next meeting), then Timeline,
   Documents, Notes, Weekly report, and "Edit details" folded at the bottom.
   Leads get the same page with "Add to customers" instead of invoices
   (documents need a customer, so leads have none).
5. **Customer list**: searchable table (cards on phones) with quick actions
   (email, call, AI message, new invoice) and status counts.
6. **Send email** from AI Messages (Send next to Copy) and from the contact
   page. See "Email" below.
7. **Athena**, a floating helper on every page (bottom right). Knows the
   page you're on and the app's features, drafts messages, never clicks or
   saves anything. Uses the normal AI credits (owner unlimited). Chat is
   kept only in the open tab.
8. **Fix:** the greeting is picked in the browser's time zone (it said
   "Good morning" at 10:51 pm because the server runs on UTC).
9. **Demo mode** for screenshots, development only (see below).

Security from migrations 0011–0014 is unchanged. No existing feature was
removed.

## New env vars

| Var | What | Where |
|---|---|---|
| `EMAIL_PROVIDER` | `smtp` or `resend`. Unset = nobody sends (Copy only). | server |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | SMTP login. Gmail: `smtp.gmail.com`, `465`, your Gmail, a 16-letter **app password**, `Your Name <you@gmail.com>` | server |
| `RESEND_API_KEY` | Resend key | server |
| `RESEND_DOMAIN` | verified domain; mail goes from `notify@<domain>` as "<name> via Jephelen", Reply-To = the user's email | server |
| `DEMO_MODE` | `1` = fake data, no login. **Only works with `npm run dev`**; ignored in production builds | dev machine only |

## Email rules

- `EMAIL_PROVIDER=smtp` → only businesses in `OWNER_BUSINESS_IDS` can send.
  Everyone else sees Copy + "coming soon".
- `EMAIL_PROVIDER=resend` (with key + domain) → every business can send.
- The recipient is never typed: the server reads the email from one of
  **that business's own** customers or leads (no open relay; one plain
  address, no line breaks).
- 50 emails a day per business, counted in the database
  (`consume_email_send()`, migration 0015). If 0015 isn't run, sending
  says so and nothing goes out.
- Every sent email is logged on the contact's timeline as `email_sent`
  (source `mailer`).

## Database: migration 0015 (why it exists)

`supabase/migrations/0015_clean_ui.sql`, safe to run more than once:

1. `customers.address`, `customers.website`, `leads.company`,
   `leads.address`, `leads.website` — the new contact header shows them.
   Optional text with length limits.
2. `email_usage` table (users can read, not write) + `consume_email_send()`
   (SECURITY DEFINER, owner check, row lock) — the 50/day limit. Counting
   timeline rows instead would let a user delete rows to reset it.

Before 0015 runs the app still works: the new fields just don't save
(the save retries without them) and email sending is off.

## Package added

- `nodemailer` (SMTP sending; loaded only when sending). `@types/nodemailer`
  as a dev dependency. Resend uses plain `fetch`, no package.

## Owner steps

1. Supabase → SQL Editor → run `0015_clean_ui.sql`.
2. Gmail: Google Account → Security → 2-Step Verification on → App
   passwords → create one called "Jephelen".
3. On the server env add: `EMAIL_PROVIDER=smtp`, `SMTP_HOST=smtp.gmail.com`,
   `SMTP_PORT=465`, `SMTP_USER=<gmail>`, `SMTP_PASS=<app password>`,
   `SMTP_FROM=Your Name <gmail>`. Make sure `OWNER_BUSINESS_IDS` has your
   business id. Redeploy.
4. Later, for clients: set up Resend, verify a domain, set
   `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `RESEND_DOMAIN`.
5. Never set `DEMO_MODE` on the server (it does nothing there anyway).

## Demo mode (screenshots)

```
DEMO_MODE=1 npx next dev -p 3456      # then open http://localhost:3456
npm test                               # proves demo is off in production
```

`src/lib/demo.ts` is the gate (`NODE_ENV !== "production"` AND
`DEMO_MODE=1`). The Supabase server client (`lib/supabase/server.ts`) and
the proxy both check it; the fake client (`lib/demo-client.ts`) refuses to
start outside demo mode; AI returns canned text; email pretends to send.
Checked: a production build started with `DEMO_MODE=1` still sends
`/dashboard` to `/login`.

## Test checklist

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` pass
- [ ] Sidebar shows 6 groups; each group's tabs switch pages; phone shows the bottom bar
- [ ] Old links (`/customers`, `/leads`, `/tasks`, `/money`, `/coach`, …) open the same pages
- [ ] Settings → Appearance: Dark sticks after reload; System follows the OS
- [ ] Dashboard greeting matches your local time of day
- [ ] Customer page: header shows address + website (after 0015); every action bar button works
- [ ] "Book meeting" opens Calendar with the contact pre-picked; "Add task" / "Add invoice" too
- [ ] Owner with SMTP: AI Messages → pick a customer → Generate → Send → mail arrives; timeline shows "Email sent"
- [ ] Client account (not in OWNER_BUSINESS_IDS, no Resend): no Send button, "coming soon" note, Copy works
- [ ] 51st email in a day is refused with the daily-limit message
- [ ] A lead with no email: Send is disabled with a clear note
- [ ] Athena opens on every page, answers "how do I send an invoice?", drafts a message, uses 1 credit per question (owner unlimited)
- [ ] Customer list search + status chips; quick actions work on phone and desktop
- [ ] Print an invoice: no nav, no Athena, no tab bar on the page
