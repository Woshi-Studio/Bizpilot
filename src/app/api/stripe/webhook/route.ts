import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getStripe, tierForPriceId, type PaidTier } from "@/lib/stripe";
import {
  LEAD_CREDITS_ROLL_OVER,
  LEAD_PRODUCTS_BOSS_ONLY,
  finderPriceId,
  finderProductForPrice,
  invoiceGrant,
  packGrant,
  type Grant,
} from "@/lib/finder-plans";
import { paymentCleared } from "@/lib/referral";
import { rewardReferral } from "@/lib/referral-server";

// Stripe calls this endpoint when a payment succeeds or a subscription
// changes. We verify the signature, then:
//   - plans: set the business's plan to free, premium or pro (from the
//     subscription's price id: STRIPE_PRICE_ID = premium, STRIPE_PRICE_ID_PRO
//     = pro);
//   - Lead Finder (0020): grant lead credits on each paid Boss or lead-sub
//     invoice (invoice.paid) and on each paid pack Checkout
//     (checkout.session.completed), once per Stripe id; keep the lead-sub
//     status for Settings. The lead subscription never changes the plan.
// This runs server-to-server (no user session), so it uses the service-role
// key.
//
// Events to send here: checkout.session.completed, invoice.paid,
// customer.subscription.updated, customer.subscription.deleted.
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
        const kind = session.metadata?.kind ?? null;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

        // A lead pack: one grant per Checkout session, only once paid.
        if (kind === "finder_pack" || session.mode === "payment") {
          if (session.payment_status !== "paid") break;
          const businessId = await businessFor(admin, session.client_reference_id, customerId);
          if (!businessId) throw new Error("pack paid but no business found");
          const items = await getStripe().checkout.sessions.listLineItems(session.id, { limit: 10 });
          const grant = packGrant(
            items.data.map((l) => ({ priceId: l.price?.id ?? null, quantity: l.quantity })),
            process.env
          );
          if (!grant) {
            console.warn(`[stripe] checkout ${session.id} has no Lead Finder pack price; nothing granted`);
            break;
          }
          await grantCredits(admin, businessId, grant, `cs:${session.id}`);
          if (paymentCleared(session.amount_total)) await rewardReferral(admin, businessId);
          break;
        }

        const subId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
        const sub = subId ? await getStripe().subscriptions.retrieve(subId) : null;

        // The lead subscription: keep its status; the credits come with
        // invoice.paid. It never touches the plan.
        if (kind === "finder_leadsub" || (sub && isLeadSub(sub))) {
          if (sub) await saveLeadSub(admin, sub);
          break;
        }

        const businessId = session.client_reference_id;
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
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const details = invoice.parent?.subscription_details ?? null;
        const subRef = details?.subscription ?? null;
        const subId = typeof subRef === "string" ? subRef : subRef?.id ?? null;
        if (!subId) break; // not a subscription invoice
        const sub = await getStripe().subscriptions.retrieve(subId);
        const item = sub.items.data[0];
        const grant = invoiceGrant(item?.price?.id ?? null, item?.quantity ?? 1, process.env);
        if (isLeadSub(sub)) await saveLeadSub(admin, sub);
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
        // Referrals: the referred business's first payment that clears
        // (any plan, Hustle too) rewards the referrer, once (never throws).
        if (paymentCleared(invoice.amount_paid)) {
          const payer = await businessFor(admin, sub.metadata?.business_id ?? null, customerId);
          if (payer) await rewardReferral(admin, payer);
        }
        if (!grant) break; // Hustle: no lead credits
        const businessId = await businessFor(admin, sub.metadata?.business_id ?? null, customerId);
        if (!businessId) throw new Error("invoice paid but no business found");
        await grantCredits(admin, businessId, grant, `in:${invoice.id}:${grant.pool}`);
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : null;
        if (isLeadSub(sub)) {
          await saveLeadSub(admin, sub);
          if (!activeStatus(sub.status)) await expireOnEnd(admin, sub, customerId, "leadsub", event.id);
          break;
        }
        if (customerId) {
          const active = activeStatus(sub.status);
          const plan = active ? tierOf(sub) : "free";
          await setPlan(customerId, plan);
          if (plan !== "pro") await leftBoss(admin, sub, customerId, event.id);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : null;
        if (isLeadSub(sub)) {
          await saveLeadSub(admin, sub);
          await expireOnEnd(admin, sub, customerId, "leadsub", event.id);
          break;
        }
        if (customerId) {
          await setPlan(customerId, "free");
          await leftBoss(admin, sub, customerId, event.id);
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

function activeStatus(status: string) {
  return status === "active" || status === "trialing";
}

function isLeadSub(sub: Stripe.Subscription): boolean {
  if (sub.metadata?.kind === "finder_leadsub") return true;
  return sub.items.data.some((i) => finderProductForPrice(i.price?.id ?? null, process.env) === "leadsub");
}

// The business for a Stripe object: the id we put on it, checked against
// the customer when both are known; else the customer's business.
async function businessFor(
  admin: SupabaseClient,
  businessId: string | null | undefined,
  customerId: string | null
): Promise<string | null> {
  if (customerId) {
    const { data } = await admin
      .from("businesses")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const byCustomer = (data as { id?: string } | null)?.id ?? null;
    if (byCustomer) return byCustomer;
  }
  if (businessId && /^[0-9a-f-]{36}$/i.test(businessId)) {
    const { data } = await admin.from("businesses").select("id, stripe_customer_id").eq("id", businessId).maybeSingle();
    const row = data as { id?: string; stripe_customer_id?: string | null } | null;
    if (row?.id && (!customerId || !row.stripe_customer_id || row.stripe_customer_id === customerId)) return row.id;
  }
  return null;
}

// One grant per Stripe reference (finder_grant, 0020). A replayed event
// finds the reference and adds nothing.
async function grantCredits(admin: SupabaseClient, businessId: string, grant: Grant, ref: string) {
  const { data, error } = await admin.rpc("finder_grant", {
    p_business: businessId,
    p_pool: grant.pool,
    p_credits: grant.credits,
    p_ref: ref,
    p_rollover: LEAD_CREDITS_ROLL_OVER,
  });
  // Stripe retries a failed webhook for days, so a missing migration only
  // delays the grant.
  if (error) throw new Error(`lead credit grant failed: ${error.message}`);
  const out = data as { status?: string; credits?: number; expired?: number } | null;
  console.log(`[stripe] lead credits ${ref}: ${out?.status} +${out?.credits ?? 0} -${out?.expired ?? 0}`);
}

// A subscription ended: what is left of its credits goes (no rollover).
async function expireOnEnd(
  admin: SupabaseClient,
  sub: Stripe.Subscription,
  customerId: string | null,
  pool: "plan" | "leadsub",
  eventId: string
) {
  if (LEAD_CREDITS_ROLL_OVER) return;
  // Not worth a Stripe retry: the next grant of this kind expires them anyway.
  try {
    const businessId = await businessFor(admin, sub.metadata?.business_id ?? null, customerId);
    if (businessId) await grantCredits(admin, businessId, { pool, credits: 0 }, `end:${eventId}`);
  } catch (err) {
    console.error(`[stripe] expiring ${pool} credits failed:`, err instanceof Error ? err.message : err);
  }
}

// The business is no longer on Boss: Boss credits left go (no rollover).
// While lead products are Boss only, the lead subscription also stops at the
// end of its period. Since 2026-09-30 every plan can hold one (and spend its
// credits), so it keeps running.
async function leftBoss(admin: SupabaseClient, sub: Stripe.Subscription, customerId: string, eventId: string) {
  await expireOnEnd(admin, sub, customerId, "plan", eventId);
  if (!LEAD_PRODUCTS_BOSS_ONLY) return;
  const leadPrice = finderPriceId("leadsub", process.env);
  if (!leadPrice) return;
  try {
    const subs = await getStripe().subscriptions.list({ customer: customerId, price: leadPrice, status: "active", limit: 5 });
    for (const s of subs.data) {
      if (!s.cancel_at_period_end) {
        const updated = await getStripe().subscriptions.update(s.id, { cancel_at_period_end: true });
        await saveLeadSub(admin, updated);
        console.log(`[stripe] lead subscription ${s.id} set to end with its period (left Boss)`);
      }
    }
  } catch (err) {
    console.error("[stripe] stopping the lead subscription after leaving Boss failed:", err instanceof Error ? err.message : err);
  }
}

async function saveLeadSub(admin: SupabaseClient, sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  const businessId = await businessFor(admin, sub.metadata?.business_id ?? null, customerId);
  if (!businessId) return;
  const item = sub.items.data[0];
  const grant = invoiceGrant(item?.price?.id ?? null, item?.quantity ?? 1, process.env);
  const end = item?.current_period_end ?? null;
  const { error } = await admin.from("finder_lead_subs").upsert(
    {
      stripe_subscription_id: sub.id,
      business_id: businessId,
      status: sub.status,
      credits: grant?.pool === "leadsub" ? grant.credits : 0,
      current_period_end: end ? new Date(end * 1000).toISOString() : null,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" }
  );
  if (error) throw new Error(`lead sub save failed: ${error.message}`);
}
