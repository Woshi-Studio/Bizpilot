# Pro tier — owner's steps

Two paid plans now sit next to Free:

| Plan    | Price              | AI credits a day | AI                          |
|---------|--------------------|------------------|-----------------------------|
| Free    | $0                 | 10               | Gemini                      |
| Premium | $5 USD / 4 weeks   | 100              | Gemini                      |
| Pro     | $15 USD / 4 weeks  | 500              | AI_PROVIDER_PRO, else Gemini |
| Owner   | —                  | unlimited        | (OWNER_BUSINESS_IDS)        |

Do these in order. Nothing goes live until step 7 (merge).

## 1. Run the migration

Supabase Dashboard → SQL Editor → New query → paste
`supabase/migrations/0013_pro_tier.sql` → Run. Safe to run twice.

It lets `plan` be `pro` and sets the daily caps to 10 / 100 / 500.

## 2. Make the two live prices in Stripe (live mode)

Product catalog → your product → Add price, **Recurring**, every **4 weeks**:

- Premium: **$5.00 USD** every 4 weeks
- Pro: **$15.00 USD** every 4 weeks

Copy each price id (`price_...`).

## 3. Vercel env vars (Project → Settings → Environment Variables, Production)

| Name                    | Value                              | Type            |
|-------------------------|------------------------------------|-----------------|
| `STRIPE_PRICE_ID`       | the new live **$5** price id       | Config is fine  |
| `STRIPE_PRICE_ID_PRO`   | the new live **$15** price id      | Config is fine  |
| `STRIPE_SECRET_KEY`     | live secret key (`sk_live_...`)    | **Sensitive**   |
| `STRIPE_WEBHOOK_SECRET` | from step 4 (`whsec_...`)          | **Sensitive**   |

A price id is not a secret. The two keys are.

Optional, for a stronger Pro AI:

| Name                    | Value                                   |
|-------------------------|-----------------------------------------|
| `AI_PROVIDER_PRO`       | `anthropic` (leave unset = Gemini)      |
| `ANTHROPIC_API_KEY`     | your Anthropic key (**Sensitive**)      |
| `ANTHROPIC_MODEL`       | optional, default `claude-sonnet-5`     |
| `ANTHROPIC_MODEL_SMALL` | optional, default `claude-haiku-4-5`    |

If `AI_PROVIDER_PRO=anthropic` but the key is missing, Pro quietly uses Gemini.
If an Anthropic call fails, that one request is retried on Gemini.

## 4. Stripe webhook (live mode)

Developers → Webhooks → Add endpoint:

- URL: `https://jephelen.vercel.app/api/stripe/webhook`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

Copy its signing secret into `STRIPE_WEBHOOK_SECRET` (step 3).

## 5. Stripe customer portal (live mode)

Settings → Billing → Customer portal:

- Turn on **cancel** and **update payment method**.
- Turn on **switch plans** and add both prices (Premium $5, Pro $15).

A customer who already pays and clicks "Switch to Pro" is sent to this
portal instead of a second checkout, so they never get two subscriptions.

## 6. Redeploy

Env var changes only apply to a new deployment.

## 7. Merge

Merge branch `pro-tier` into `main`.

## How to test after deploy

1. Sign in with a non-owner account → Settings shows two cards.
2. Upgrade to Pro → pay → back on Settings, the Pro card says "Current plan".
3. AI pages show "Pro plan · AI credits today: 0 of 500".
4. Cancel in the portal → plan goes back to Free.

## How the plan is set

- The webhook reads the subscription's price id: `STRIPE_PRICE_ID_PRO` →
  `pro`, `STRIPE_PRICE_ID` → `premium`. A price that matches neither is
  treated as `premium` and logged.
- `customer.subscription.deleted` (or a non-active status) → `free`.
- Checkout sends only the tier name; the price id is picked on the server.
