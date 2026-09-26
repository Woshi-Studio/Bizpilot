import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getStripe, tierForPriceId, type PaidTier } from "@/lib/stripe";

// Stripe calls this endpoint when a payment succeeds or a subscription
// changes. We verify the signature, then set the business's plan to
// free, premium or pro. The paid tier comes from the subscription's price
// id (STRIPE_PRICE_ID = premium, STRIPE_PRICE_ID_PRO = pro). This runs server-to-server (no user session),
// so it uses the service-role key to update the row.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!secret || !serviceKey || !url) {
    return new Response("Billing webhook not configured", { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "bad signature";
    return new Response(`Webhook signature failed: ${msg}`, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  async function setPlan(customerId: string, plan: "free" | PaidTier) {
    const { error } = await admin
      .from("businesses")
      .update({ plan })
      .eq("stripe_customer_id", customerId);
    if (error) throw new Error(`set plan failed: ${error.message}`);
  }

  // The paid tier for a subscription, from its price id. A price that
  // matches neither env id still counts as paid (premium) so a paying
  // customer is never left on free; it is logged so the owner can fix it.
  function tierOf(sub: Stripe.Subscription): PaidTier {
    const priceId = sub.items.data[0]?.price?.id ?? null;
    const tier = tierForPriceId(priceId);
    if (!tier) {
      console.warn(
        `[stripe] price ${priceId ?? "(none)"} matches neither STRIPE_PRICE_ID nor STRIPE_PRICE_ID_PRO; treating as premium`
      );
      return "premium";
    }
    return tier;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const businessId = session.client_reference_id;
        const customerId =
          typeof session.customer === "string" ? session.customer : null;
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null;
        const sub = subId
          ? await getStripe().subscriptions.retrieve(subId)
          : null;
        const plan: PaidTier = sub ? tierOf(sub) : "premium";
        if (businessId && customerId) {
          // Ensure the customer id is stored, then upgrade
          const { error } = await admin
            .from("businesses")
            .update({ stripe_customer_id: customerId, plan })
            .eq("id", businessId);
          if (error) throw new Error(`upgrade failed: ${error.message}`);
        } else if (customerId) {
          await setPlan(customerId, plan);
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : null;
        if (customerId) {
          const active = sub.status === "active" || sub.status === "trialing";
          await setPlan(customerId, active ? tierOf(sub) : "free");
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : null;
        if (customerId) {
          await setPlan(customerId, "free");
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return new Response(`Webhook handler error: ${msg}`, { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
