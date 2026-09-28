import { requireUserAndBusiness } from "@/lib/data";
import { stripeConfigured, tierConfigured } from "@/lib/stripe";
import { getAiCredits, isOwnerBusiness } from "@/lib/ai-quota";
import { getPlanState } from "@/lib/plan-limits";
import { getFinderAccess, intakeFilled, loadCredits, loadLeadSub, loadProfile } from "@/lib/finder-server";
import { canBuyLeadProducts, finderProductReady } from "@/lib/finder-plans";
import { PlanFaq, PlanTable } from "@/components/plan-explainer";
import PlanSection from "../settings/plan-section";
import FinderSection from "../settings/finder-section";

export const metadata = { title: "Plans" };

const BILLING_MESSAGES: Record<string, string> = {
  success: "🎉 Thanks for upgrading! Your new plan is on its way.",
  cancelled: "Checkout cancelled — no charge was made.",
  error: "Something went wrong starting checkout. Please try again.",
  unconfigured: "Upgrades aren't switched on yet. Check back soon.",
  nocustomer: "No billing account found yet.",
  leads_ok: "🎉 Thanks! Your lead subscription is on. The credits arrive in a minute.",
  pack_ok: "🎉 Thanks! Your lead credits arrive in a minute.",
  boss_only: "Lead subscriptions and packs come with Boss.",
};

// Plans & billing: the plan cards (Upgrade / Manage), what each plan gets,
// the Lead Finder rules and lead products. Settings only links here.
export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const { billing } = await searchParams;
  const message = billing ? BILLING_MESSAGES[billing] ?? null : null;
  const { supabase, business } = await requireUserAndBusiness();
  const owner = isOwnerBusiness(business.id);
  const finderAccess = getFinderAccess(business);

  const [planState, ai, credits, leadSub, profile] = await Promise.all([
    getPlanState(supabase, business),
    getAiCredits(supabase, business),
    finderAccess !== "none" ? loadCredits(supabase, business.id) : Promise.resolve(null),
    finderAccess !== "none" ? loadLeadSub(supabase, business.id) : Promise.resolve(null),
    finderAccess !== "none" ? loadProfile(supabase, business.id).then((r) => r.profile) : Promise.resolve(null),
  ]);
  const leadMessage = billing && ["leads_ok", "pack_ok", "boss_only"].includes(billing) ? message : null;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="page-title">Plans</h1>
      <p className="page-sub">
        What each plan gets, and how to upgrade, switch or cancel. Billed every 4 weeks, in US dollars.
      </p>

      <div className="mt-6">
        <PlanSection
          part="plans"
          state={planState}
          ai={ai}
          billingReady={stripeConfigured()}
          tierReady={{ premium: tierConfigured("premium"), pro: tierConfigured("pro") }}
          message={leadMessage ? null : message}
        />
      </div>

      {finderAccess !== "none" && (
        <div className="mt-8">
          <FinderSection
            access={finderAccess}
            canBuy={finderAccess === "full" && canBuyLeadProducts({ plan: business.plan, owner })}
            credits={credits}
            sub={leadSub}
            intakeFilled={intakeFilled(profile)}
            ready={{
              leadsub: finderProductReady("leadsub", process.env),
              pack25: finderProductReady("pack25", process.env),
              pack100: finderProductReady("pack100", process.env),
            }}
            message={leadMessage}
          />
        </div>
      )}

      <section className="mt-10">
        <h2 className="section-title">Side by side</h2>
        <div className="mt-3">
          <PlanTable showPrices />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="section-title">Good to know</h2>
        <div className="mt-3">
          <PlanFaq inApp />
        </div>
      </section>
    </div>
  );
}
