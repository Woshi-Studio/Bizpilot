import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsForm from "./settings-form";
import PublicPageForm from "./public-page-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: business }, planResult, publicResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("businesses")
        .select("name, business_type, description, currency")
        .eq("owner_id", user.id)
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
    ]);

  // The `plan` column ships in migration 0006 — until the user runs it,
  // fall back to "free" instead of breaking the whole settings page.
  if (planResult.error) {
    console.warn(
      "businesses.plan column missing (migration 0006 not run yet?):",
      planResult.error.message
    );
  }
  const plan = planResult.data?.plan === "premium" ? "premium" : "free";

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
              <span className="font-medium capitalize text-slate-700">
                {plan}
              </span>{" "}
              plan — {plan === "premium" ? "300" : "10"} AI generations per
              month.
            </p>
          </div>
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
            {plan}
          </span>
        </div>
        {plan === "free" && (
          <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
            <p className="text-sm font-medium text-slate-700">
              Upgrade — coming soon
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Premium (more AI generations, more customers) will be available
              here once billing is set up. Nothing to do yet.
            </p>
            {/* TODO(stripe): replace this with a real "Upgrade" button that
                creates a Stripe Checkout session and redirects. Requires
                STRIPE_SECRET_KEY + STRIPE_PRICE_ID env vars and a
                stripe webhook route to flip businesses.plan to 'premium'. */}
            <button
              type="button"
              disabled
              className="mt-3 cursor-not-allowed rounded-md bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500"
            >
              Upgrade (coming soon)
            </button>
          </div>
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
    </div>
  );
}
