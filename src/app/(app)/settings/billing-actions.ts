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
    let customerId = (business as { stripe_customer_id?: string | null })
      .stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: business.name,
        metadata: { business_id: business.id },
      });
      customerId = customer.id;
      // stripe_customer_id is billing-only (0011): users can't write it,
      // so save it with the service-role client. business.id comes from
      // requireUserAndBusiness(), so it is this user's own business.
      const admin = createAdminClient();
      if (!admin) {
        redirect("/settings?billing=unconfigured");
      }
      const { error: saveError } = await admin
        .from("businesses")
        .update({ stripe_customer_id: customerId })
        .eq("id", business.id)
        .eq("owner_id", user.id);
      if (saveError) {
        throw new Error(`Could not save Stripe customer: ${saveError.message}`);
      }
    }

    // Already paying (e.g. Premium → Pro)? A second checkout would make a
    // second subscription, so switch plans in the Stripe portal instead.
    const existing = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });
    if (existing.data.length > 0) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${siteUrl()}/settings`,
      });
      checkoutUrl = portal.url;
    } else {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: business.id,
        line_items: [{ price: priceIdFor(tier), quantity: 1 }],
        success_url: `${siteUrl()}/settings?billing=success`,
        cancel_url: `${siteUrl()}/settings?billing=cancelled`,
        subscription_data: { metadata: { business_id: business.id, tier } },
      });

      if (!session.url) {
        redirect("/settings?billing=error");
      }
      checkoutUrl = session.url;
    }
  } catch (err) {
    // Surface a friendly message instead of a scary server-error page.
    // (redirect() throws internally, so let its signal pass through.)
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if (
      typeof err === "object" &&
      err !== null &&
      "digest" in err &&
      typeof (err as { digest?: string }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    console.error("Stripe checkout failed:", err);
    redirect("/settings?billing=error");
  }

  redirect(checkoutUrl);
}

// Opens the Stripe billing portal so a customer can cancel or update card.
export async function openBillingPortal() {
  if (!stripeConfigured()) {
    redirect("/settings?billing=unconfigured");
  }

  const { business } = await requireUserAndBusiness();
  const customerId = (business as { stripe_customer_id?: string | null })
    .stripe_customer_id;

  if (!customerId) {
    redirect("/settings?billing=nocustomer");
  }

  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${siteUrl()}/settings`,
  });

  redirect(portal.url);
}
