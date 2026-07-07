"use server";

import { redirect } from "next/navigation";
import { requireUserAndBusiness } from "@/lib/data";
import { getStripe, stripeConfigured, siteUrl, proPriceId } from "@/lib/stripe";

// Starts a Stripe Checkout session for the Pro plan and redirects to it.
export async function startCheckout() {
  if (!stripeConfigured()) {
    redirect("/settings?billing=unconfigured");
  }

  const { supabase, user, business } = await requireUserAndBusiness();

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
      await supabase
        .from("businesses")
        .update({ stripe_customer_id: customerId })
        .eq("id", business.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: business.id,
      line_items: [{ price: proPriceId(), quantity: 1 }],
      success_url: `${siteUrl()}/settings?billing=success`,
      cancel_url: `${siteUrl()}/settings?billing=cancelled`,
      subscription_data: { metadata: { business_id: business.id } },
    });

    if (!session.url) {
      redirect("/settings?billing=error");
    }
    checkoutUrl = session.url;
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
