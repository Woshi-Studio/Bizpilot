import Stripe from "stripe";

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PRICE_ID;
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

// Returns the configured Pro price ID, trimmed of stray whitespace.
export function proPriceId() {
  return process.env.STRIPE_PRICE_ID?.trim() ?? "";
}
