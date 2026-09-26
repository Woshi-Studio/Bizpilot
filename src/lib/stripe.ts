import Stripe from "stripe";

// Billing is on when the secret key and at least one tier's price are set.
export function stripeConfigured() {
  return (
    !!process.env.STRIPE_SECRET_KEY &&
    (!!process.env.STRIPE_PRICE_ID?.trim() ||
      !!process.env.STRIPE_PRICE_ID_PRO?.trim())
  );
}

let client: Stripe | null = null;

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return client;
}

// The public URL of the deployed app, used for Stripe redirect URLs.
// Trim whitespace and trailing slash so a stray space in the env var
// (a common paste mistake) can't produce an invalid URL.
export function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ||
    "http://localhost:3000"
  );
}

// ------------------------------------------------------------------
// Paid tiers
//   premium: STRIPE_PRICE_ID      ($5 USD every 4 weeks)
//   pro:     STRIPE_PRICE_ID_PRO  ($15 USD every 4 weeks)
// Price ids are only ever read here, on the server. Checkout takes a
// tier name and looks the price up; a price id from the browser is
// never used.
// ------------------------------------------------------------------

export type PaidTier = "premium" | "pro";

export function isPaidTier(value: unknown): value is PaidTier {
  return value === "premium" || value === "pro";
}

// Trimmed of stray whitespace (a common paste mistake).
export function priceIdFor(tier: PaidTier) {
  const raw =
    tier === "pro" ? process.env.STRIPE_PRICE_ID_PRO : process.env.STRIPE_PRICE_ID;
  return raw?.trim() ?? "";
}

// Is checkout for this tier switched on?
export function tierConfigured(tier: PaidTier) {
  return !!process.env.STRIPE_SECRET_KEY && !!priceIdFor(tier);
}

// Which tier a Stripe price id belongs to, or null if it is neither.
export function tierForPriceId(priceId: string | null | undefined): PaidTier | null {
  if (!priceId) return null;
  const pro = priceIdFor("pro");
  const premium = priceIdFor("premium");
  if (pro && priceId === pro) return "pro";
  if (premium && priceId === premium) return "premium";
  return null;
}
