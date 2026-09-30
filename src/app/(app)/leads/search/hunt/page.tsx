import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import { AUP_VERSION, kmToMiles } from "@/lib/finder";
import { canDiscover, getSpendAccess, loadProfile } from "@/lib/finder-server";
import { DISCOVER_DEFAULT_COUNT } from "@/lib/finder-plans";
import IntakeForm from "./intake-form";
import FindCustomers from "../find-customers";

export const metadata = { title: "What are you hunting?" };

export default async function HuntPage({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const { need } = await searchParams;
  const { supabase, business } = await requireUserAndBusiness();
  const { access } = await getSpendAccess(supabase, business);

  if (access === "none") {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="page-title">Lead Finder</h1>
        <p className="mt-6 card-empty p-6 text-sm">The Lead Finder opens soon.</p>
      </div>
    );
  }

  const { profile, ready } = await loadProfile(supabase, business.id);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/leads/search" className="text-sm font-medium text-muted hover:text-ink">
        ← Search leads
      </Link>
      <h1 className="page-title mt-2">What are you hunting?</h1>
      <p className="page-sub">
        Optional for a single search. Tell us about your business and who your customers are:
        &quot;Find me customers&quot; and the lead subscription use it to go find companies for you.
      </p>
      {need === "leadsub" && (
        <p className="alert-info mt-4">Fill this in first: the lead subscription uses it to find companies for you.</p>
      )}

      {!ready ? (
        <p className="mt-6 alert-warn">
          {access === "owner"
            ? "Not set up yet: run migrations 0019 and 0020 in Supabase first."
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
              industry_other: profile?.industry_other ?? "",
              company_sizes: profile?.company_sizes ?? [],
              place: profile?.place ?? "",
              radius_mi: kmToMiles(profile?.radius_km),
              province: profile?.province ?? "",
              area: profile?.area ?? profile?.country ?? "CA",
              needs: profile?.needs ?? ["phone", "website"],
              exclude: profile?.exclude ?? "",
              aupAccepted: profile?.aup_version === AUP_VERSION,
            }}
          />
          <div className="mt-6">
            <FindCustomers
              ready={canDiscover(profile)}
              summary={null}
              count={DISCOVER_DEFAULT_COUNT}
              locked={access === "locked"}
            />
          </div>
        </div>
      )}
    </div>
  );
}
