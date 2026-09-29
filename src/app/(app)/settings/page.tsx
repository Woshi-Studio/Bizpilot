import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAiCredits, isOwnerBusiness } from "@/lib/ai-quota";
import { getPlanState } from "@/lib/plan-limits";
import { PLAN_LABELS, normalizePlanValue, PLAN_LIMITS } from "@/lib/plans";
import { emailNote, emailStatus } from "@/lib/email";
import { ThemePicker } from "@/components/theme";
import SettingsForm from "./settings-form";
import ChangeEmailForm from "./change-email-form";
import AssistantAccess, { type ApiKeyRow, type AuditRow } from "./assistant-access";
import PlanSection from "./plan-section";
import FinderWorkers, { type WorkerRow } from "./finder-workers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business } from "@/lib/types";
import InviteSection from "./invite-section";
import { getFinderAccess } from "@/lib/finder-server";
import { referralLink } from "@/lib/referral";
import { referralCounts } from "@/lib/referral-server";
import { siteUrl } from "@/lib/stripe";

export const metadata = { title: "Settings" };

const EMAIL_MESSAGES: Record<string, string> = {
  partial:
    "One link confirmed. Now click the confirm link in the other inbox to finish.",
  changed: "Your login email is updated.",
};

// Settings holds only true settings (the owner's ruling, 2026-09-27):
//   everyone: Profile, Login email, Theme, Your plan (one line) + Usage
//   Hustle / Boss / owner: Email sending, Assistant access
//   Starter: a locked Assistant access teaser; no Email sending card
//   owner only: the Lead Finder worker
// Moved out: plans + Lead Finder credits -> /plans; payment methods and
// invoice settings -> Money -> Payments; booking page -> Calendar; public
// page -> People; quick templates -> AI -> Templates. Old URLs redirect.
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string; email?: string }>;
}) {
  const { billing, email: emailParam } = await searchParams;
  // Stripe used to send people back here: send them to Plans.
  if (billing) redirect(`/plans?billing=${encodeURIComponent(billing)}`);
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
  const business = businessRow as Business | null;

  const owner = business ? isOwnerBusiness(business.id) : false;
  const plan = normalizePlanValue(business?.plan);
  const paidFeatures = owner || plan !== "free";

  const [{ data: profile }, planState, ai, keysResult, auditResult] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
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
  // Lead Finder worker keys: owner only, server-only table (0019).
  const finderWorkers = owner ? await loadFinderWorkers() : null;
  // Invite a business: only where lead credits mean something.
  const invite =
    business && getFinderAccess(business) !== "none" ? referralLink(siteUrl(), business.id) : null;
  const inviteCounts = invite && business ? await referralCounts(business.id) : null;

  const agentReady = !!keysResult && !keysResult.error;
  const apiKeys = agentReady ? ((keysResult.data ?? []) as ApiKeyRow[]) : [];
  const agentAudit =
    auditResult && !auditResult.error ? ((auditResult.data ?? []) as AuditRow[]) : [];

  const send = business ? emailStatus(business) : null;
  const showEmailCard = owner || PLAN_LIMITS[plan].email !== 0;

  const jump = [
    ["profile", "Profile"],
    ["login", "Login email"],
    ["theme", "Theme"],
    ["plan", "Plan & usage"],
    ...(showEmailCard ? [["sending", "Email sending"]] : []),
    ...(invite ? [["invite", "Invite a business"]] : []),
    ["assistant", "Assistant"],
    ...(owner ? [["finder-worker", "Finder worker"]] : []),
  ] as [string, string][];

  return (
    <div className="mx-auto max-w-6xl [&>*]:max-w-4xl">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Your profile, login, look and what you&apos;ve used.</p>

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
          <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-sm text-ink-2">
              Your plan: <span className="font-semibold text-ink">{PLAN_LABELS[plan]}</span>
              {owner ? " · Owner, no limits" : ""}
            </p>
            <Link href="/plans" className="btn-secondary btn-sm">
              Plans &amp; billing →
            </Link>
          </div>
          <div className="mt-5">
            <PlanSection
              part="usage"
              state={planState}
              ai={ai}
              billingReady={false}
              tierReady={{ premium: false, pro: false }}
              message={null}
            />
          </div>
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

      {invite && <InviteSection link={invite} counts={inviteCounts} owner={owner} />}

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
            <Link href="/plans" className="btn-primary btn-sm mt-4">
              See Hustle
            </Link>
          </div>
        )}
      </div>

      {finderWorkers && (
        <div id="finder-worker" className="mt-8 scroll-mt-24">
          <FinderWorkers workers={finderWorkers.rows} ready={finderWorkers.ready} />
        </div>
      )}

      <p className="mt-8 text-sm text-muted">
        Looking for something else?{" "}
        <Link href="/calendar/booking-page" className="link">Booking page</Link> ·{" "}
        <Link href="/leads/public-page" className="link">Public page</Link> ·{" "}
        <Link href="/money/payments" className="link">Payments &amp; invoice settings</Link> ·{" "}
        <Link href="/messages/templates" className="link">Email templates</Link>
      </p>
    </div>
  );
}

async function loadFinderWorkers(): Promise<{ rows: WorkerRow[]; ready: boolean }> {
  const admin = createAdminClient();
  if (!admin || !process.env.AGENT_KEY_PEPPER) return { rows: [], ready: false };
  const { data, error } = await admin
    .from("finder_workers")
    .select("id, name, key_prefix, created_at, last_seen_at, revoked_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return { rows: [], ready: false };
  return { rows: (data ?? []) as WorkerRow[], ready: true };
}
