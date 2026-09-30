"use server";

import { redirect } from "next/navigation";
import { requireUserAndBusiness } from "@/lib/data";
import {
  getStripe,
  stripeConfigured,
  siteUrl,
  isPaidTier,
  priceIdFor,
  tierConfigured,
} from "@/lib/stripe";
import { createAndSaveCustomer, isMissingCustomer } from "@/lib/stripe-customer";
import { finderPriceId } from "@/lib/finder-plans";

// Logs what Stripe really said (code + message), never secrets.
function logStripeError(where: string, err: unknown) {
  const e = err as { type?: string; code?: string; message?: string; statusCode?: number; requestId?: string } | null;
  console.error(`Stripe ${where} failed:`, {
    type: e?.type,
    code: e?.code,
    status: e?.statusCode,
    message: e?.message,
    request: e?.requestId,
  });
}

function isRedirect(err: unknown) {
  if (err instanceof Error && err.message === "NEXT_REDIRECT") return true;
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: string }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

// Starts a Stripe Checkout session for a paid tier and redirects to it.
// The form sends only a tier name ("premium" or "pro"); the price id is
// looked up here on the server.
export async function startCheckout(formData: FormData) {
  const tier = formData.get("tier");
  if (!isPaidTier(tier)) {
    redirect("/plans?billing=error");
  }
  if (!tierConfigured(tier)) {
    redirect("/plans?billing=unconfigured");
  }

  const { user, business } = await requireUserAndBusiness();

  let checkoutUrl: string;
  try {
    const stripe = getStripe();

    // Reuse or create the Stripe customer for this business
    let customerId =
      (business as { stripe_customer_id?: string | null }).stripe_customer_id ??
      (await createAndSaveCustomer(stripe, business, user));

    const run = async (customer: string): Promise<string> => {
      // Already paying (e.g. Premium -> Pro)? A second checkout would make
      // a second subscription, so switch plans in the Stripe portal instead.
      // (The Lead Finder's lead subscription doesn't count: it's not a plan.)
      const existing = await stripe.subscriptions.list({ customer, status: "active", limit: 10 });
      const leadPrice = finderPriceId("leadsub", process.env);
      const planSubs = existing.data.filter(
        (s) => !s.items.data.some((i) => leadPrice && i.price?.id === leadPrice) && s.metadata?.kind !== "finder_leadsub"
      );
      if (planSubs.length > 0) {
        const portal = await stripe.billingPortal.sessions.create({
          customer,
          return_url: `${siteUrl()}/plans`,
        });
        return portal.url;
      }
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer,
        client_reference_id: business.id,
        line_items: [{ price: priceIdFor(tier), quantity: 1 }],
        success_url: `${siteUrl()}/plans?billing=success`,
        cancel_url: `${siteUrl()}/plans?billing=cancelled`,
        subscription_data: { metadata: { business_id: business.id, tier } },
      });
      if (!session.url) {
        redirect("/plans?billing=error");
      }
      return session.url;
    };

    try {
      checkoutUrl = await run(customerId);
    } catch (err) {
      if (isRedirect(err) || !isMissingCustomer(err)) throw err;
      // The saved customer is from the other Stripe mode: make a fresh one
      // and try once more.
      logStripeError("checkout (saved customer missing, making a new one)", err);
      customerId = await createAndSaveCustomer(stripe, business, user);
      checkoutUrl = await run(customerId);
    }
  } catch (err) {
    // Surface a friendly message instead of a scary server-error page.
    // (redirect() throws internally, so let its signal pass through.)
    if (isRedirect(err)) throw err;
    logStripeError("checkout", err);
    redirect("/plans?billing=error");
  }

  redirect(checkoutUrl);
}

// Opens the Stripe billing portal so a customer can cancel or update card.
export async function openBillingPortal() {
  if (!stripeConfigured()) {
    redirect("/plans?billing=unconfigured");
  }

  const { user, business } = await requireUserAndBusiness();
  const customerId = (business as { stripe_customer_id?: string | null })
    .stripe_customer_id;

  if (!customerId) {
    redirect("/plans?billing=nocustomer");
  }

  let portalUrl: string;
  try {
    const stripe = getStripe();
    const open = async (customer: string) =>
      (await stripe.billingPortal.sessions.create({ customer, return_url: `${siteUrl()}/plans` })).url;
    try {
      portalUrl = await open(customerId);
    } catch (err) {
      if (isRedirect(err) || !isMissingCustomer(err)) throw err;
      logStripeError("portal (saved customer missing, making a new one)", err);
      portalUrl = await open(await createAndSaveCustomer(stripe, business, user));
    }
  } catch (err) {
    if (isRedirect(err)) throw err;
    logStripeError("portal", err);
    redirect("/plans?billing=error");
  }

  redirect(portalUrl);
}
