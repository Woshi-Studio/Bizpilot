# Owner Hub (Phase 2B) — owner's steps

Everything in one place: all your businesses, customers, every email sent and
reply, calls, files, calendar and follow-ups.

## What was built

| Part | Where | What it does |
|------|-------|--------------|
| Business lines | every owner page | A **Business** filter at the top (Woshi Studio, VWA Language Access, Alpha Shop, Casa Norte, S&S Diesel, WhiskerTorium, Other, Unassigned). The choice sits in the link (`?line=VWA`), so a reload or a shared link keeps it. Create/edit forms get a **Business** box: pick from the list or type a new name. |
| Timeline | customer page, lead page | Every email, reply, call, meeting, note, file, task and invoice for that contact, newest first, with a line like `12 emails sent · 2 replies · 1 call · last contact Sep 25`. **+ Add activity** logs a note, call, meeting or email by hand. |
| Auto-log | tasks, invoices, notes, outreach, uploads | Creating a task or invoice, adding a customer note, logging outreach, or uploading a file adds a timeline row by itself. |
| Lead page | `/leads/<id>` (click a lead's name) | New. Edit the lead (incl. business), see its timeline, add it to customers. Converting a lead moves its past emails onto the new customer. |
| Documents | customer page | Upload PDF, JPG, PNG, WEBP, DOCX, XLSX up to 10 MB. Download links last 60 seconds. Only you can see them. |
| Calendar | sidebar → **Calendar** | Month and week views. Shows task due dates, lead and customer follow-ups, invoice due dates and meetings. Click an item to open it. **Add meeting** at the bottom. |
| Scoreboard | dashboard | One card per business: leads by status (new / contacted / meeting / declined / converted), emails sent, replies, and follow-ups due today or overdue. |
| Past outreach | `GO-LIVE/PASTE_step9_import-activities.sql` | Loads the 49 emails already sent, 2 replies, 4 bounces and 5 real phone calls into the timeline. |

The database change is `supabase/migrations/0014_owner_hub.sql`. It adds
`business_line` to customers, leads, services, tasks and invoices, the
`activities` and `documents` tables, the private `client-docs` storage bucket
and a scoreboard counter. Everything is owner-only. Nothing from 0011–0013
(billing lock, AI credit lock, public lead guard, receipts limits) is changed.

## Do these in order

The new pages need the new columns, so **run the SQL before you merge**.

1. **Run the migration.** Supabase Dashboard → SQL Editor → New query →
   paste `GO-LIVE/PASTE_step9-FIRST_owner-hub_0014.sql` (same text as
   `supabase/migrations/0014_owner_hub.sql`) → Run. Safe to run twice.
2. **Load past outreach.** New query → paste
   `GO-LIVE/PASTE_step9_import-activities.sql` → Run. The result should say
   `step 9: 60 new activities added`. Running it again says `0 new` — no
   duplicates.
3. **Merge.** GitHub → pull request `owner-hub` → `main` → Merge. Vercel
   deploys it.

To refresh the import later (new emails sent, new calls), run
`python make_step9_import.py` in `GO-LIVE`, then repeat step 2. Only new rows
are added. Test/simulated calls (`SIM-…`, `TEST…`, `probe…`) are left out;
add `--include-test-calls` to keep them.

## Test checklist (after step 3)

- [ ] Dashboard: the **Scoreboard by business** card shows a VWA card and a
      Woshi Studio card. VWA shows emails sent > 0.
- [ ] Dashboard: tap **VWA Language Access** in the Business row → only VWA
      is shown; the link now ends in `?line=VWA`. Reload → still VWA.
- [ ] Leads, Customers, Tasks, Pricing, Invoices: the Business row filters
      the list. **Unassigned** shows rows with no business.
- [ ] Leads → click **Sant La Haitian Neighborhood Center** → the lead page
      opens with a timeline showing `1 email sent`.
- [ ] Leads → **Hands Together for Haitians** → timeline shows the reply
      ("No thanks…").
- [ ] Customers → **Greg Marshall** → timeline shows the emails to
      partner@languageline.com.
- [ ] On any customer: **+ Add activity** → Call, title "Test call" → Save →
      it appears at the top. Hover it → × deletes it.
- [ ] On any customer: add a note → a 📝 Note row appears on the timeline too.
- [ ] Tasks: add a task for a customer with the Business box empty → the task
      takes the customer's business; the customer's timeline shows ✅ Task.
- [ ] Invoices → New → pick a customer → Create → the customer's timeline
      shows 🧾 Invoice.
- [ ] Customer page → **Documents** → upload a small PDF → it lists; click it
      → it downloads. Wait 2 minutes, then copy the download link from the
      browser's history into a new tab → it should fail (link expired).
- [ ] Try uploading a `.txt` or a file renamed from `.txt` to `.pdf` → it is
      refused.
- [ ] Delete the test document → it disappears.
- [ ] Calendar: month view shows follow-ups and task due dates; **Week** and
      the arrows move around; **Add meeting** (e.g. "Call with Greg", Tue
      Sep 29, 1:00 pm, customer Greg Marshall) → it shows on Sep 29 at 1:00
      and on Greg's timeline as "upcoming".
- [ ] Open the public page `/b/<your-slug>` in a private window and send a
      test lead → it arrives on Leads as **Unassigned** (visitors can't pick
      a business).
- [ ] Sign in as a second test account → none of the above data or files is
      visible there.
