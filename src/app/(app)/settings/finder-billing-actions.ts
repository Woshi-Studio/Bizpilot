"use server";

import { redirect } from "next/navigation";
import { requireUserAndBusiness } from "@/lib/data";
import { getStripe, siteUrl } from "@/lib/stripe";
import { isOwnerBusiness } from "@/lib/ai-quota";
import { canBuyLeadProducts, finderPriceId, finderProductReady, isFinderProduct } from "@/lib/finder-plans";
import { getFinderAccess, intakeFilled, loadProfile } from "@/lib/finder-server";

// Lead Finder purchases (Settings -> Lead Finder). Boss only.
//   leadsub: Checkout in subscription mode (every 4 weeks); the credits
//            come with each paid invoice (webhook: invoice.paid).
//   pack25 / pack100: Checkout in payment mode; the credits come once per
//            paid session (webhook: checkout.session.completed).
// The form sends only the product name; the price id is read here.

const BACK = "/settings";

function isRedirect(err: unknown) {
  const d = (err as { digest?: string } | null)?.digest;
  return (err instanceof Error && err.message === "NEXT_REDIRECT") || (typeof d === "string" && d.startsWith("NEXT_REDIRECT"));
}

export async function buyLeadProduct(formData: FormData) {
  const product = formData.get("product");
  if (!isFinderProduct(product)) redirect(`${BACK}?billing=error#lead-finder`);
  if (!finderProductReady(product, process.env)) redirect(`${BACK}?billing=unconfigured#lead-finder`);

  const { supabase, business } = await requireUserAndBusiness();
  const owner = isOwnerBusiness(business.id);
  if (!canBuyLeadProducts({ plan: business.plan, owner }) || getFinderAccess(business) !== "full") {
    redirect(`${BACK}?billing=boss_only#lead-finder`);
  }
  const customer = (business as { stripe_customer_id?: string | null }).stripe_customer_id;
  if (!customer) redirect(`${BACK}?billing=nocustomer#lead-finder`);

  if (product === "leadsub") {
    // The lead subscription finds companies from the saved hunt.
    const { profile } = await loadProfile(supabase, business.id);
    if (!intakeFilled(profile)) redirect("/leads/search/hunt?need=leadsub");
  }

  let url: string;
  try {
    const stripe = getStripe();
    const price = finderPriceId(product, process.env);
    if (product === "leadsub") {
      // Already subscribed? Manage it in the portal instead of a second one.
      const existing = await stripe.subscriptions.list({ customer, price, status: "active", limit: 1 });
      if (existing.data.length > 0) {
        url = (await stripe.billingPortal.sessions.create({ customer, return_url: `${siteUrl()}/settings#lead-finder` })).url;
      } else {
        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          customer,
          client_reference_id: business.id,
          line_items: [{ price, quantity: 1 }],
          metadata: { kind: "finder_leadsub", business_id: business.id },
          subscription_data: { metadata: { kind: "finder_leadsub", business_id: business.id } },
          success_url: `${siteUrl()}/settings?billing=leads_ok#lead-finder`,
          cancel_url: `${siteUrl()}/settings?billing=cancelled#lead-finder`,
        });
        if (!session.url) redirect(`${BACK}?billing=error#lead-finder`);
        url = session.url;
      }
    } else {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer,
        client_reference_id: business.id,
        line_items: [{ price, quantity: 1 }],
        metadata: { kind: "finder_pack", business_id: business.id, product },
        success_url: `${siteUrl()}/settings?billing=pack_ok#lead-finder`,
        cancel_url: `${siteUrl()}/settings?billing=cancelled#lead-finder`,
      });
      if (!session.url) redirect(`${BACK}?billing=error#lead-finder`);
      url = session.url;
    }
  } catch (err) {
    if (isRedirect(err)) throw err;
    const e = err as { code?: string; message?: string } | null;
    console.error("Stripe lead product checkout failed:", { code: e?.code, message: e?.message });
    redirect(`${BACK}?billing=error#lead-finder`);
  }
  redirect(url);
}
