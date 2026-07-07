import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";

// Stripe calls this endpoint when a payment succeeds or a subscription
// changes. We verify the signature, then flip the business between the
// free and premium plans. This runs server-to-server (no user session),
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

  async function setPlan(customerId: string, plan: "free" | "premium") {
    await admin
      .from("businesses")
      .update({ plan })
      .eq("stripe_customer_id", customerId);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const businessId = session.client_reference_id;
        const customerId =
          typeof session.customer === "string" ? session.customer : null;
        if (businessId && customerId) {
          // Ensure the customer id is stored, then upgrade
          await admin
            .from("businesses")
            .update({ stripe_customer_id: customerId, plan: "premium" })
            .eq("id", businessId);
        } else if (customerId) {
          await setPlan(customerId, "premium");
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : null;
        if (customerId) {
          const active = sub.status === "active" || sub.status === "trialing";
          await setPlan(customerId, active ? "premium" : "free");
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
