import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stripeConfigured, tierConfigured, type PaidTier } from "@/lib/stripe";
import {
  AI_DAILY_CREDITS,
  PLAN_NAMES,
  isPaidPlan,
  normalizePlan,
} from "@/lib/ai-quota";
import SettingsForm from "./settings-form";
import PublicPageForm from "./public-page-form";
import PaymentMethodsForm from "./payment-methods-form";
import ChangeEmailForm from "./change-email-form";
import AssistantAccess, { type ApiKeyRow, type AuditRow } from "./assistant-access";
import type { PaymentMethod } from "@/lib/types";
import { startCheckout, openBillingPortal } from "./billing-actions";

export const metadata = { title: "Settings" };

const PAID_PLANS: {
  tier: PaidTier;
  price: string;
  perks: string;
}[] = [
  {
    tier: "premium",
    price: "$5 USD / 4 weeks",
    perks: `${AI_DAILY_CREDITS.premium} AI credits a day`,
  },
  {
    tier: "pro",
    price: "$15 USD / 4 weeks",
    perks: `${AI_DAILY_CREDITS.pro} AI credits a day · most powerful AI`,
  },
];

const BILLING_MESSAGES: Record<string, string> = {
  success: "🎉 Thanks for upgrading! Your new plan is on its way.",
  cancelled: "Checkout cancelled — no charge was made.",
  error: "Something went wrong starting checkout. Please try again.",
  unconfigured: "Billing isn't switched on yet.",
  nocustomer: "No billing account found yet.",
};

const EMAIL_MESSAGES: Record<string, string> = {
  partial:
    "One link confirmed. Now click the confirm link in the other inbox to finish.",
  changed: "Your login email is updated.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string; email?: string }>;
}) {
  const { billing, email: emailStatus } = await searchParams;
  const billingMessage = billing ? BILLING_MESSAGES[billing] : null;
  const emailMessage = emailStatus ? EMAIL_MESSAGES[emailStatus] ?? null : null;
  const billingReady = stripeConfigured();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, business_type, description, currency")
    .eq("owner_id", user.id)
    .maybeSingle();

  const [{ data: profile }, planResult, publicResult, paymentMethodsResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("businesses")
        .select("plan")
        .eq("owner_id", user.id)
        .maybeSingle(),
      supabase
        .from("businesses")
        .select("slug, public_page_enabled, tagline, services")
        .eq("owner_id", user.id)
        .maybeSingle(),
      business
        ? supabase
            .from("payment_methods")
            .select("*")
            .eq("business_id", business.id)
            .order("position")
        : Promise.resolve({ data: null, error: null }),
    ]);

  // Assistant access (migration 0016). Tolerate the tables not existing yet.
  const [keysResult, auditResult] = business
    ? await Promise.all([
        supabase
          .from("api_keys")
          .select("id, name, key_prefix, scopes, created_at, last_used_at, revoked_at")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("agent_audit")
          .select("id, key_id, action, result, ok, created_at")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ])
    : [null, null];
  const agentReady = !!keysResult && !keysResult.error;
  const apiKeys = agentReady ? ((keysResult.data ?? []) as ApiKeyRow[]) : [];
  const agentAudit =
    auditResult && !auditResult.error ? ((auditResult.data ?? []) as AuditRow[]) : [];

  const paymentMethods = paymentMethodsResult.error
    ? []
    : ((paymentMethodsResult.data ?? []) as PaymentMethod[]);

  // The `plan` column ships in migration 0006 — until the user runs it,
  // fall back to "free" instead of breaking the whole settings page.
  if (planResult.error) {
    console.warn(
      "businesses.plan column missing (migration 0006 not run yet?):",
      planResult.error.message
    );
  }
  const plan = normalizePlan(planResult.data?.plan);
  const paid = isPaidPlan(plan);

  // Public-page columns ship in migration 0007 — tolerate their absence
  const publicPage = publicResult.error ? null : publicResult.data;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage your profile and business details.
      </p>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Your plan
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              You&apos;re on the{" "}
              <span className="font-medium text-slate-700">
                {PLAN_NAMES[plan]}
              </span>{" "}
              plan — {AI_DAILY_CREDITS[plan]} AI credits a day.
            </p>
          </div>
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
            {PLAN_NAMES[plan]}
          </span>
        </div>
        {billingMessage && (
          <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {billingMessage}
          </p>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {PAID_PLANS.map((p) => {
            const current = plan === p.tier;
            const canBuy = billingReady && tierConfigured(p.tier);
            return (
              <div
                key={p.tier}
                className={`rounded-lg border px-4 py-4 ${
                  current
                    ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">
                    {PLAN_NAMES[p.tier]}
                  </p>
                  {current && (
                    <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Current plan
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  {p.price}
                </p>
                <p className="mt-1 text-xs text-slate-500">{p.perks}</p>
                {current ? (
                  <p className="mt-3 text-xs text-indigo-700">
                    You&apos;re on {PLAN_NAMES[p.tier]}. Thank you! 💜
                  </p>
                ) : canBuy ? (
                  <form action={startCheckout}>
                    <input type="hidden" name="tier" value={p.tier} />
                    <button
                      type="submit"
                      className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                    >
                      {paid ? `Switch to ${PLAN_NAMES[p.tier]}` : `Upgrade to ${PLAN_NAMES[p.tier]}`}
                    </button>
                  </form>
                ) : (
                  <p className="mt-3 text-xs text-slate-400">Coming soon</p>
                )}
              </div>
            );
          })}
        </div>

        {paid && billingReady && (
          <form action={openBillingPortal}>
            <button
              type="submit"
              className="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Manage billing / cancel
            </button>
          </form>
        )}
      </div>

      {publicPage && (
        <div className="mt-8">
          <PublicPageForm
            defaults={{
              enabled: publicPage.public_page_enabled ?? false,
              slug: publicPage.slug ?? "",
              tagline: publicPage.tagline ?? "",
              services: publicPage.services ?? "",
            }}
          />
        </div>
      )}

      {business && (
        <div className="mt-8">
          <PaymentMethodsForm methods={paymentMethods} />
        </div>
      )}

      {business && (
        <div className="mt-8">
          <AssistantAccess keys={apiKeys} audit={agentAudit} ready={agentReady} />
        </div>
      )}

      <div className="mt-8">
        <SettingsForm
          defaults={{
            fullName: profile?.full_name ?? "",
            email: user.email ?? "",
            businessName: business?.name ?? "",
            businessType: business?.business_type ?? "other",
            description: business?.description ?? "",
            currency: business?.currency ?? "USD",
          }}
        />
      </div>

      <div className="mt-8">
        <ChangeEmailForm
          currentEmail={user.email ?? ""}
          pendingEmail={user.new_email ?? null}
          notice={emailMessage}
        />
      </div>
    </div>
  );
}
