# HubSpot sync: plan only (not built)

Goal: a Jephelen user taps **Connect HubSpot** once; after that, the leads and customers they
have (and Lead Finder results they add to leads) show up in their own HubSpot as contacts and
companies. One way: Jephelen → HubSpot. About **1 day** to build.

## Cost

- HubSpot's free CRM includes the CRM API (contacts, companies). **$0** for us and for the user.
  UNVERIFIED: re-check HubSpot's current API limits and app rules before building.
- A public app needs a free HubSpot developer account. Listing in the HubSpot marketplace is
  optional and not needed for this.

## How it connects (OAuth 2.0)

1. Settings → **Connect HubSpot** → `https://app.hubspot.com/oauth/authorize?client_id=…&scope=…&redirect_uri=…&state=…`
   (`state` = a random value tied to the user's session, checked on return).
2. HubSpot sends the user back to `/api/hubspot/callback?code=…&state=…`.
3. The server swaps the code for an access token (expires in about 30 minutes) and a refresh
   token, at `POST https://api.hubapi.com/oauth/v1/token`.
4. Tokens are stored server-side only (service role table, encrypted with a server secret, like
   the worker keys). The browser never sees them. **Disconnect** deletes them.
5. Before each sync: refresh the access token if it's expired.

## Scopes (the fewest that work)

- `crm.objects.contacts.read`, `crm.objects.contacts.write`
- `crm.objects.companies.read`, `crm.objects.companies.write`
- `oauth` (added by HubSpot)

## Dedupe

- **Contacts by email** (HubSpot's own unique key). Search first
  (`POST /crm/v3/objects/contacts/search`, filter `email EQ …`), then update or create. The batch
  upsert endpoint with `idProperty=email` does both in one call for up to 100 rows.
- **Companies by domain** (from the website, or a non-webmail email domain). Search on `domain`,
  then update or create; associate the contact with the company.
- No email and no domain: create the contact once, and remember its HubSpot id on our side so
  it's never created twice.
- We never delete in HubSpot, and never overwrite a field the user filled in HubSpot with an
  empty one.

## What gets sent

Same columns as the CSV export (`src/lib/lead-export.ts`): name, title, company, email, phone,
website, city, region, country, source. `source` goes into a custom property
`jephelen_source` (created on first connect). Emails that failed our free check are not sent.

## When it runs

- A **Sync now** button, plus a sync after "Add to leads" and after a lead/customer is saved.
- A nightly catch-up through the existing Vercel cron.
- Stay under HubSpot's rate limits: batch 100, back off on HTTP 429.

## Schema (additive, when it's built)

- `hubspot_connections` (business_id, hub_id, encrypted tokens, expires_at, connected_at) —
  service role only.
- `hubspot_ids` (business_id, kind lead/customer, row id, hubspot object id) — service role only.

## Build steps (~1 day)

1. HubSpot developer app + env vars (`HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`) — 30 min.
2. Migration + connect/callback/disconnect routes + Settings card — 3 hours.
3. Sync (batch upsert contacts by email, companies by domain, associations) — 3 hours.
4. Tests (dedupe rules, token refresh, never-send-bad-email) + one run on a free HubSpot
   account — 1.5 hours.

## Not in this plan

- HubSpot → Jephelen (two-way). Needs conflict rules; a second step if people ask.
- Deals, tasks, notes.
