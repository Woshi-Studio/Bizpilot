import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import { AUP_VERSION } from "@/lib/finder";
import { getFinderAccess, loadProfile } from "@/lib/finder-server";
import IntakeForm from "./intake-form";

export const metadata = { title: "What are you hunting?" };

export default async function HuntPage() {
  const { supabase, business } = await requireUserAndBusiness();
  const access = getFinderAccess(business.id);

  if (access === "none") {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="page-title">Lead Finder</h1>
        <p className="mt-6 card-empty p-6 text-sm">The Lead Finder is invite-only while we test it.</p>
      </div>
    );
  }

  const { profile, ready } = await loadProfile(supabase, business.id);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/leads/found" className="text-sm font-medium text-muted hover:text-ink">
        ← Found
      </Link>
      <h1 className="page-title mt-2">What are you hunting?</h1>
      <p className="page-sub">
        Tell us about your business and who you want to reach. We use it to find the right
        companies, and every search keeps a copy of it.
      </p>

      {!ready ? (
        <p className="mt-6 alert-warn">
          {access === "owner"
            ? "Not set up yet: run migration 0019 in Supabase first."
            : "The Lead Finder isn't switched on yet. Please check back soon."}
        </p>
      ) : (
        <div className="mt-6">
          <IntakeForm
            defaults={{
              my_business: profile?.my_business ?? business.name ?? "",
              offer: profile?.offer ?? "",
              target: profile?.target ?? "",
              industries: profile?.industries ?? [],
              company_sizes: profile?.company_sizes ?? [],
              place: profile?.place ?? "",
              radius_km: profile?.radius_km ?? null,
              province: profile?.province ?? "",
              country: profile?.country ?? "",
              needs: profile?.needs ?? ["phone", "website"],
              exclude: profile?.exclude ?? "",
              aupAccepted: profile?.aup_version === AUP_VERSION,
            }}
          />
        </div>
      )}
    </div>
  );
}
