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
import { createAdminClient } from "@/lib/supabase/admin";

type Stripe = ReturnType<typeof getStripe>;

// A saved cus_ id that doesn't exist in the current Stripe mode (e.g. a
// TEST-mode customer after switching to LIVE keys). Stripe answers
// resource_missing / "No such customer".
function isMissingCustomer(err: unknown) {
  const e = err as { code?: string; message?: string; raw?: { code?: string } } | null;
  return (
    e?.code === "resource_missing" ||
    e?.raw?.code === "resource_missing" ||
    /no such customer/i.test(String(e?.message ?? ""))
  );
}

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

// Creates a Stripe customer for this business and saves the id.
// stripe_customer_id is billing-only (0011): users can't write it, so it is
// saved with the service-role client. business.id comes from
// requireUserAndBusiness(), so it is this user's own business.
async function createAndSaveCustomer(
  stripe: Stripe,
  business: { id: string; name: string },
  user: { id: string; email?: string | null }
): Promise<string> {
  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    name: business.name,
    metadata: { business_id: business.id },
  });
  const admin = createAdminClient();
  if (!admin) {
    redirect("/settings?billing=unconfigured");
  }
  const { error: saveError } = await admin
    .from("businesses")
    .update({ stripe_customer_id: customer.id })
    .eq("id", business.id)
    .eq("owner_id", user.id);
  if (saveError) {
    throw new Error(`Could not save Stripe customer: ${saveError.message}`);
  }
  return customer.id;
}

// Starts a Stripe Checkout session for a paid tier and redirects to it.
// The form sends only a tier name ("premium" or "pro"); the price id is
// looked up here on the server.
export async function startCheckout(formData: FormData) {
  const tier = formData.get("tier");
  if (!isPaidTier(tier)) {
    redirect("/settings?billing=error");
  }
  if (!tierConfigured(tier)) {
    redirect("/settings?billing=unconfigured");
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
      const existing = await stripe.subscriptions.list({ customer, status: "active", limit: 1 });
      if (existing.data.length > 0) {
        const portal = await stripe.billingPortal.sessions.create({
          customer,
          return_url: `${siteUrl()}/settings`,
        });
        return portal.url;
      }
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer,
        client_reference_id: business.id,
        line_items: [{ price: priceIdFor(tier), quantity: 1 }],
        success_url: `${siteUrl()}/settings?billing=success`,
        cancel_url: `${siteUrl()}/settings?billing=cancelled`,
        subscription_data: { metadata: { business_id: business.id, tier } },
      });
      if (!session.url) {
        redirect("/settings?billing=error");
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
    redirect("/settings?billing=error");
  }

  redirect(checkoutUrl);
}

// Opens the Stripe billing portal so a customer can cancel or update card.
export async function openBillingPortal() {
  if (!stripeConfigured()) {
    redirect("/settings?billing=unconfigured");
  }

  const { user, business } = await requireUserAndBusiness();
  const customerId = (business as { stripe_customer_id?: string | null })
    .stripe_customer_id;

  if (!customerId) {
    redirect("/settings?billing=nocustomer");
  }

  let portalUrl: string;
  try {
    const stripe = getStripe();
    const open = async (customer: string) =>
      (await stripe.billingPortal.sessions.create({ customer, return_url: `${siteUrl()}/settings` })).url;
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
    redirect("/settings?billing=error");
  }

  redirect(portalUrl);
}
