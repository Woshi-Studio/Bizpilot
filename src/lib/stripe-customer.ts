// The business's Stripe customer. SERVER ONLY.
//
// stripe_customer_id is billing-only (0011): users can't write it, so it is
// saved with the service-role client. business.id comes from
// requireUserAndBusiness(), so it is the user's own business.

import { redirect } from "next/navigation";
import type { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

type Stripe = ReturnType<typeof getStripe>;

// A saved cus_ id that doesn't exist in the current Stripe mode (e.g. a
// TEST-mode customer after switching to LIVE keys). Stripe answers
// resource_missing / "No such customer".
export function isMissingCustomer(err: unknown) {
  const e = err as { code?: string; message?: string; raw?: { code?: string } } | null;
  return (
    e?.code === "resource_missing" ||
    e?.raw?.code === "resource_missing" ||
    /no such customer/i.test(String(e?.message ?? ""))
  );
}

// Creates a Stripe customer for this business and saves the id.
export async function createAndSaveCustomer(
  stripe: Stripe,
  business: { id: string; name: string },
  user: { id: string; email?: string | null },
  back = "/plans"
): Promise<string> {
  const admin = createAdminClient();
  if (!admin) redirect(`${back}?billing=unconfigured`);
  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    name: business.name,
    metadata: { business_id: business.id },
  });
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
