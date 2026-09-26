import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stripeConfigured, tierConfigured } from "@/lib/stripe";
import { getAiCredits, isOwnerBusiness } from "@/lib/ai-quota";
import { getPlanState } from "@/lib/plan-limits";
import { normalizePlanValue, PLAN_LIMITS } from "@/lib/plans";
import { emailNote, emailStatus } from "@/lib/email";
import { ThemePicker } from "@/components/theme";
import SettingsForm from "./settings-form";
import PublicPageForm from "./public-page-form";
import PaymentMethodsForm from "./payment-methods-form";
import ChangeEmailForm from "./change-email-form";
import AssistantAccess, { type ApiKeyRow, type AuditRow } from "./assistant-access";
import PlanSection from "./plan-section";
import type { Business, PaymentMethod } from "@/lib/types";

export const metadata = { title: "Settings" };

const BILLING_MESSAGES: Record<string, string> = {
  success: "🎉 Thanks for upgrading! Your new plan is on its way.",
  cancelled: "Checkout cancelled — no charge was made.",
  error: "Something went wrong starting checkout. Please try again.",
  unconfigured: "Upgrades aren't switched on yet. Check back soon.",
  nocustomer: "No billing account found yet.",
};

const EMAIL_MESSAGES: Record<string, string> = {
  partial:
    "One link confirmed. Now click the confirm link in the other inbox to finish.",
  changed: "Your login email is updated.",
};

// What each person sees here (see PLANS-THEMES.md "Who sees what"):
//   everyone: Profile, Login email, Theme, Plan & usage
//   Hustle / Boss / owner: Email sending, Assistant access
//   Starter: a locked Assistant access teaser; no Email sending card
//   owner only: "Owner · no limits", setup hints that name settings
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string; email?: string }>;
}) {
  const { billing, email: emailParam } = await searchParams;
  const billingMessage = billing ? BILLING_MESSAGES[billing] ?? null : null;
  const emailMessage = emailParam ? EMAIL_MESSAGES[emailParam] ?? null : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: businessRow } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const business = businessRow as (Business & {
    slug?: string | null;
    public_page_enabled?: boolean | null;
    tagline?: string | null;
    services?: string | null;
  }) | null;

  const owner = business ? isOwnerBusiness(business.id) : false;
  const plan = normalizePlanValue(business?.plan);
  const paidFeatures = owner || plan !== "free";

  const [{ data: profile }, paymentMethodsResult, planState, ai, keysResult, auditResult] =
    await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      business
        ? supabase
            .from("payment_methods")
            .select("*")
            .eq("business_id", business.id)
            .order("position")
        : Promise.resolve({ data: null, error: null }),
      business ? getPlanState(supabase, business) : Promise.resolve(null),
      business ? getAiCredits(supabase, business) : Promise.resolve(null),
      // Assistant access (migration 0016). Tolerate the tables not existing yet.
      business && paidFeatures
        ? supabase
            .from("api_keys")
            .select("id, name, key_prefix, scopes, created_at, last_used_at, revoked_at")
            .eq("business_id", business.id)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve(null),
      business && paidFeatures
        ? supabase
            .from("agent_audit")
            .select("id, key_id, action, result, ok, created_at")
            .eq("business_id", business.id)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve(null),
    ]);

  const agentReady = !!keysResult && !keysResult.error;
  const apiKeys = agentReady ? ((keysResult.data ?? []) as ApiKeyRow[]) : [];
  const agentAudit =
    auditResult && !auditResult.error ? ((auditResult.data ?? []) as AuditRow[]) : [];

  const paymentMethods = paymentMethodsResult.error
    ? []
    : ((paymentMethodsResult.data ?? []) as PaymentMethod[]);

  // Public-page columns ship in migration 0007 — tolerate their absence
  const publicPage =
    business && "slug" in business
      ? {
          enabled: business.public_page_enabled ?? false,
          slug: business.slug ?? "",
          tagline: business.tagline ?? "",
          services: business.services ?? "",
        }
      : null;

  const send = business ? emailStatus(business) : null;
  const showEmailCard = owner || PLAN_LIMITS[plan].email !== 0;

  const jump = [
    ["profile", "Profile"],
    ["login", "Login email"],
    ["theme", "Theme"],
    ["plan", "Plan & usage"],
    ...(showEmailCard ? [["sending", "Email sending"]] : []),
    ["assistant", "Assistant"],
    ["public", "Public page"],
    ["payments", "Payments"],
  ] as [string, string][];

  return (
    <div className="mx-auto max-w-6xl [&>*]:max-w-4xl">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Your profile, look, plan and business details.</p>

      <nav aria-label="Settings sections" className="mt-5 flex flex-wrap gap-2">
        {jump.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="chip">
            {label}
          </a>
        ))}
      </nav>

      <div id="profile" className="mt-8 scroll-mt-24">
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

      <div id="login" className="mt-8 scroll-mt-24">
        <ChangeEmailForm
          currentEmail={user.email ?? ""}
          pendingEmail={user.new_email ?? null}
          notice={emailMessage}
        />
      </div>

      <section id="theme" className="card mt-8 scroll-mt-24 p-6">
        <h2 className="section-title">Theme</h2>
        <p className="mt-1 text-sm text-muted">
          Pick the look you like. It follows you to every device you sign in on.
        </p>
        <div className="mt-5">
          <ThemePicker plan={plan} unlimited={owner} />
        </div>
      </section>

      {planState && (
        <div className="mt-8">
          <PlanSection
            state={planState}
            ai={ai}
            billingReady={stripeConfigured()}
            tierReady={{ premium: tierConfigured("premium"), pro: tierConfigured("pro") }}
            message={billingMessage}
          />
        </div>
      )}

      {showEmailCard && send && (
        <section id="sending" className="card mt-8 scroll-mt-24 p-6">
          <h2 className="section-title">Email sending</h2>
          {send.canSend ? (
            <p className="mt-1 text-sm text-muted">
              <span className="font-medium text-green-600">On.</span> Send emails to your
              customers and leads right from Jephelen
              {planState?.limits.email === null
                ? " — no daily limit."
                : ` — up to ${planState?.limits.email} a day.`}{" "}
              Every email shows on their timeline.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">{emailNote(send)}</p>
          )}
        </section>
      )}

      <div id="assistant" className="mt-8 scroll-mt-24">
        {business && paidFeatures ? (
          <AssistantAccess keys={apiKeys} audit={agentAudit} ready={agentReady} owner={owner} />
        ) : (
          <div className="card-empty p-6">
            <h2 className="section-title flex items-center gap-2">
              🤖 Assistant access
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                🔒 Hustle
              </span>
            </h2>
            <p className="mt-1 text-sm">
              Let an assistant (a chat bot or a helper on your computer) add customers, leads,
              tasks and meetings for you with a private key.
            </p>
            <Link href="#plan" className="btn-primary btn-sm mt-4">
              See Hustle
            </Link>
          </div>
        )}
      </div>

      {publicPage && (
        <div id="public" className="mt-8 scroll-mt-24">
          <PublicPageForm defaults={publicPage} />
        </div>
      )}

      {business && (
        <div id="payments" className="mt-8 scroll-mt-24">
          <PaymentMethodsForm methods={paymentMethods} />
        </div>
      )}
    </div>
  );
}
