# Agent API (Phase 4: Discord remote control)

Lets an assistant (for example a Discord bot, or `jeph.py` on the owner's PC)
add customers, leads, tasks and meetings in Jephelen with an API key.

## Owner steps (in order)

1. **Run the migration.** Supabase Dashboard -> SQL Editor -> New query ->
   paste `supabase/migrations/0016_agent_api.sql` (same text as
   `GO-LIVE/PASTE_step10_agent-api_0016.sql`) -> Run. Safe to run twice.
2. **Add the pepper.** Vercel -> Project -> Settings -> Environment Variables ->
   add `AGENT_KEY_PEPPER` for **Production**. Value: a random secret, 32+
   characters. To make one in PowerShell:
   `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | % {[char]$_})`
   Never change it later: every key made before a change stops working.
3. **Merge** the `agent-api` branch into `main` (Vercel redeploys).
4. **Create a key.** Jephelen -> Settings -> Assistant access -> name it
   (e.g. "Marlene on Discord"), leave all boxes ticked -> Create key ->
   Copy. The key is shown once only.
5. **Paste it** into `D:\Claude\Game\HQ\_TOOLS\jephelen\keys.json` as the
   `api_key` value. Test: `python jeph.py today`.

## Revoke a key

Settings -> Assistant access -> **Revoke** next to the key. It stops working
at once and cannot be switched back on; make a new key instead. If a key
leaks, revoke it first, then make a new one.

## How it works

- `POST /api/agent/<action>` with `Authorization: Bearer jph_live_...` and a
  JSON body. Answers `{"ok": true, "data": ...}` or `{"ok": false, "error": "..."}`.
- Keys are `jph_live_` + 32 random bytes in base62 (52 characters). Only
  HMAC-SHA256(AGENT_KEY_PEPPER, key) is stored, plus 8 characters for display.
- Each key has scopes. A call outside its scopes gets 403.
- Limits per key: 60 calls a minute, 1,000 a day (429 when over).
- Every call with a valid key is written to `agent_audit` (shown in
  Settings, last 50). Fields named like password/token/key/secret are
  blanked. Calls with a missing or wrong key are not logged (there is no
  business to log them under).
- The route uses the service-role key, but every query is filtered by the
  key's business. An id from another business answers 404.
- Unknown fields are rejected (400), so typos are loud.

Status codes: 200 ok · 400 bad input · 401 bad/revoked key · 403 missing
scope · 404 unknown action or id not found · 429 rate limit · 503 not set up
(pepper, service key or migration missing).

## Actions

| Action | Scope | Fields |
|---|---|---|
| `add_customer` | customers:write | name, email?, phone?, company?, business_line?, note? |
| `add_lead` | leads:write | name, email?, phone?, message?, business_line?, channel?, follow_up_date? (YYYY-MM-DD) |
| `find_contact` | contacts:read | q -> top 10 customers + leads (id, type, name, email, business_line) |
| `add_task` | tasks:write | title, due_date?, customer_id?, business_line?, value? |
| `complete_task` | tasks:write | task_id |
| `book_meeting` | calendar:write | title, starts_at (ISO with zone), customer_id? or lead_id?, notes?, business_line? |
| `log_activity` | activities:write | kind (note/call/email_sent/email_reply), subject, body?, customer_id?, lead_id?, occurred_at?, business_line? |
| `today` | contacts:read | date? (YYYY-MM-DD), utc_offset? (-04:00) -> follow-ups due/overdue, open tasks due today or overdue, meetings today + tomorrow |
| `set_lead_status` | leads:write | lead_id, status (new/contacted/meeting/converted/declined) |

`channel`: email, upwork, linkedin, freelancer, referral, inbound, other.
When business_line is left out, tasks/meetings/activities use the linked
contact's line.

## curl examples

Set the key once in the shell (it then stays out of your history):

```bash
read -s JPH_KEY   # paste the key, press Enter
BASE=https://jephelen.vercel.app
```

```bash
curl -s -X POST "$BASE/api/agent/today" \
  -H "Authorization: Bearer $JPH_KEY" -H "Content-Type: application/json" \
  -d '{"utc_offset":"-04:00"}'

curl -s -X POST "$BASE/api/agent/add_customer" \
  -H "Authorization: Bearer $JPH_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Maria","email":"maria@example.com","business_line":"Casa Norte","note":"Met at the market"}'

curl -s -X POST "$BASE/api/agent/find_contact" \
  -H "Authorization: Bearer $JPH_KEY" -H "Content-Type: application/json" \
  -d '{"q":"Greg"}'

curl -s -X POST "$BASE/api/agent/book_meeting" \
  -H "Authorization: Bearer $JPH_KEY" -H "Content-Type: application/json" \
  -d '{"title":"Call with Greg","starts_at":"2026-09-29T13:00-04:00","customer_id":"<id from find_contact>"}'

curl -s -X POST "$BASE/api/agent/set_lead_status" \
  -H "Authorization: Bearer $JPH_KEY" -H "Content-Type: application/json" \
  -d '{"lead_id":"<id>","status":"contacted"}'
```

## CLI

`D:\Claude\Game\HQ\_TOOLS\jephelen\jeph.py` (Python, standard library only):

```
python jeph.py today
python jeph.py find "Greg"
python jeph.py add-customer --name "Maria" --email maria@example.com --line "Casa Norte" --note "..."
python jeph.py add-lead --name "Tom" --channel referral --follow-up 2026-10-01
python jeph.py add-task --title "Send quote" --due 2026-09-30 --find "Maria" --value 250
python jeph.py complete-task <task_id>
python jeph.py book --title "Call with Greg" --at 2026-09-29T13:00-04:00 --find "Greg"
python jeph.py log --kind call --subject "Called Greg" --find "Greg"
python jeph.py lead-status <lead_id> contacted
```

`--find` looks the name up and stops (exit 2) if it matches more than one
contact, unless exactly one name matches exactly. Exit 1 = API error.

## Files

- `supabase/migrations/0016_agent_api.sql` - tables, RLS, grants
- `src/app/api/agent/[action]/route.ts` - auth, rate limit, audit
- `src/lib/agent/actions.ts` - the nine actions
- `src/lib/agent/validate.ts` - input checks + audit redaction
- `src/lib/agent/keys.ts`, `scopes.ts` - key format, hashing, scopes
- `src/app/(app)/settings/assistant-access.tsx`, `agent-actions.ts` - Settings UI
