import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import { creditLine } from "@/lib/finder-credits";
import { AUP_VERSION, areaCountry, industryLabel, sortResults, type ResultSort } from "@/lib/finder";
import { applyHide, buildHaveIndex, haveLabel, type HaveRecord } from "@/lib/finder-suppress";
import { runFairChecks } from "@/lib/fair-credit-server";
import { isDemoMode } from "@/lib/demo";
import { alertMode, seenSince, wantsApp } from "@/lib/lead-alerts";
import { markLeadsSeen } from "@/lib/lead-alerts-server";
import { DISCOVER_DEFAULT_COUNT, LOCKED_SEARCHES_PER_DAY } from "@/lib/finder-plans";
import FindCustomers from "./find-customers";
import {
  canDiscover,
  getFinderAccess,
  intakeFilled,
  loadFinderPage,
  loadProfile,
  pendingItems,
  type FinderItem,
} from "@/lib/finder-server";
import SearchForm from "./search-form";
import ResultCard from "./result-card";
import { pickCandidate } from "./actions";

export const metadata = { title: "Search for leads" };

function PendingItem({ item }: { item: FinderItem }) {
  const where = [item.person ? `${item.person} at` : null, item.city, item.website].filter(Boolean).join(" · ");
  if (item.status === "ambiguous" && item.candidates?.length) {
    return (
      <li className="card p-4">
        <p className="text-sm font-semibold text-ink">
          Which &quot;{item.company}&quot;? <span className="font-normal text-muted">Pick one, free.</span>
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {item.candidates.map((c, i) => (
            <form key={i} action={pickCandidate}>
              <input type="hidden" name="item_id" value={item.id} />
              <input type="hidden" name="choice" value={i} />
              <button type="submit" className="btn-secondary btn-sm w-full justify-start text-left">
                {c.name}
                {c.city ? ` · ${c.city}` : ""}
                {c.website ? ` · ${c.website.replace(/^https?:\/\//, "")}` : ""}
              </button>
            </form>
          ))}
          <form action={pickCandidate}>
            <input type="hidden" name="item_id" value={item.id} />
            <input type="hidden" name="choice" value={-1} />
            <button type="submit" className="btn-ghost btn-sm">
              None of these
            </button>
          </form>
        </div>
      </li>
    );
  }
  const discover = item.query_kind === "discover";
  const label =
    discover && (item.status === "queued" || item.status === "working")
      ? "Looking for new matching companies: usually within 1 hour."
      : discover
        ? item.note ?? "No new matching companies this time."
        : item.status === "queued" || item.status === "working"
      ? "Researching: usually within 1 hour, at most 24 hours."
      : item.status === "not_found"
        ? "Not found. No charge."
        : item.status === "failed"
          ? "We couldn't finish this one. No charge."
          : item.status;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{item.company}</p>
        {where && <p className="truncate text-xs text-muted">{where}</p>}
      </div>
      <span className="text-xs text-muted">{label}</span>
    </li>
  );
}

// The user's own leads + customers, for "hide ones I have".
async function loadHave(supabase: Awaited<ReturnType<typeof requireUserAndBusiness>>["supabase"], businessId: string) {
  const [leads, customers] = await Promise.all([
    supabase.from("leads").select("*").eq("business_id", businessId).limit(10000),
    supabase.from("customers").select("*").eq("business_id", businessId).limit(10000),
  ]);
  return buildHaveIndex((leads.data ?? []) as HaveRecord[], (customers.data ?? []) as HaveRecord[]);
}

function viewHref(v: { hide: boolean; sort: ResultSort }) {
  const q = new URLSearchParams();
  if (v.hide) q.set("hide", "1");
  if (v.sort !== "newest") q.set("sort", v.sort);
  const s = q.toString();
  return `/leads/search${s ? `?${s}` : ""}#results`;
}

export default async function SearchLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ hide?: string; sort?: string }>;
}) {
  const { supabase, business, user } = await requireUserAndBusiness();
  const access = getFinderAccess(business);
  const sp = await searchParams;
  const hide = sp.hide === "1";
  const sort: ResultSort = sp.sort === "fresh" ? "fresh" : "newest";

  if (access === "none") {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="page-title">Search for leads</h1>
        <p className="page-sub">Find a business and the right way to reach it.</p>
        <div className="mt-6 card-empty p-6 text-sm">
          <p className="font-medium text-ink">The Lead Finder opens soon.</p>
          <p className="mt-1">Type a company, a website, an email or a phone number and get the business&apos;s phone, website and contact form.</p>
        </div>
      </div>
    );
  }

  // Fair credits: paid results whose email fails the free check get their
  // credit back before the page reads the balance.
  if (access === "full" && !isDemoMode()) {
    try {
      await runFairChecks(business.id);
    } catch (err) {
      console.error("fair credit check failed:", err instanceof Error ? err.message : err);
    }
  }

  const [{ profile, ready }, page, { data: me }, haveIdx] = await Promise.all([
    loadProfile(supabase, business.id),
    loadFinderPage(supabase, business.id, access),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    loadHave(supabase, business.id),
  ]);

  if (!ready || !page.ready) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="page-title">Search for leads</h1>
        <p className="mt-6 alert-warn">
          {access === "owner"
            ? "Not set up yet: run migrations 0019 and 0020 in Supabase first."
            : "The Lead Finder isn't switched on yet. Please check back soon."}
        </p>
      </div>
    );
  }

  const unlimited = access === "owner";
  const locked = access === "locked";
  const pending = pendingItems(page.items);
  const hasIntake = intakeFilled(profile);
  const outOfCredits = access === "full" && page.balance <= 0;
  const { shown, hidden } = applyHide(sortResults(page.results, sort), haveIdx, hide);
  // Lead alerts: what's new since the last visit, then clear the bell.
  const newSince = Date.parse(seenSince(user.user_metadata));
  const newCount = page.results.filter((r) => Date.parse(r.created_at) > newSince).length;
  if (newCount > 0 && wantsApp(alertMode(user.user_metadata)) && !isDemoMode()) await markLeadsSeen(user);
  const unlockedCount = page.results.filter((r) => !r.locked).length;
  const note = locked
    ? `Free search (${LOCKED_SEARCHES_PER_DAY} a day): you see the company, city and why it fits. Boss unlocks the phone, email, website and source.`
    : outOfCredits
      ? "You're out of lead credits. Get more in Settings → Plans."
      : "Known companies show at once (1 credit).";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Search for leads</h1>
          <p className="page-sub">
            Find a business and the right way to reach it. Results join your leads only when you tap
            Add to leads, so they don&apos;t count toward your plan until then.
          </p>
        </div>
        {!locked && (
          <p className="inline-flex rounded-full border border-line/70 bg-surface px-3 py-1 text-xs font-medium text-ink-2">
            {creditLine(page.balance, page.held, unlimited)}
          </p>
        )}
        {locked && (
          <Link href="/plans" className="btn-primary btn-sm">
            Upgrade to Boss to unlock
          </Link>
        )}
      </div>

      <div className="mt-6 card p-5 sm:p-6">
        <Link href="/leads/search/hunt" className="btn-primary w-full px-6 py-3 text-base sm:w-auto">
          {hasIntake ? "🎯 Edit what you're hunting" : "🎯 Tell us what you're hunting"}
        </Link>
        <p className="mt-2 text-sm text-muted">Better matches + powers Find me customers.</p>
      </div>

      <div className="mt-6">
        <SearchForm
          disabled={outOfCredits}
          note={note}
          needsAup={!profile || profile.aup_version !== AUP_VERSION}
          defaultCountry={areaCountry(profile?.area) ?? profile?.country ?? "CA"}
        />
        {outOfCredits && (
          <Link href="/plans#lead-finder" className="btn-secondary btn-sm mt-3">
            Get more lead credits
          </Link>
        )}
      </div>

      <div className="mt-6">
        <FindCustomers
          ready={canDiscover(profile)}
          summary={
            profile
              ? [...(profile.industries ?? []).map(industryLabel), ...(profile.industry_other ? [profile.industry_other] : [])]
                  .slice(0, 3)
                  .join(", ") || null
              : null
          }
          count={DISCOVER_DEFAULT_COUNT}
          locked={locked}
        />
      </div>

      {pending.length > 0 && (
        <section className="mt-8">
          <h2 className="section-title">In progress</h2>
          <ul className="mt-3 space-y-3">
            {pending
              .filter((i) => i.status === "ambiguous")
              .map((i) => (
                <PendingItem key={i.id} item={i} />
              ))}
          </ul>
          {pending.some((i) => i.status !== "ambiguous") && (
            <ul className="card mt-3 divide-y divide-line/60">
              {pending
                .filter((i) => i.status !== "ambiguous")
                .map((i) => (
                  <PendingItem key={i.id} item={i} />
                ))}
            </ul>
          )}
        </section>
      )}

      <section id="results" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Results</h2>
          {page.results.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Link
                href={viewHref({ hide, sort: sort === "fresh" ? "newest" : "fresh" })}
                className="btn-ghost btn-sm"
                title="Change the order"
              >
                {sort === "fresh" ? "Order: freshest check first" : "Order: newest first"}
              </Link>
              <Link href={viewHref({ hide: !hide, sort })} className="btn-secondary btn-sm" aria-pressed={hide}>
                {hide ? "✓ Hiding ones I have" : "Hide ones I have"}
              </Link>
              {unlockedCount > 0 && (
                <a href="/leads/search/export" className="btn-secondary btn-sm" download>
                  ⬇ Download CSV ({unlockedCount})
                </a>
              )}
            </div>
          )}
        </div>
        {newCount > 0 && (
          <p className="mt-2 text-xs font-medium text-ink-2">
            {newCount} new since your last visit.
          </p>
        )}
        {hide && hidden > 0 && (
          <p className="mt-2 text-xs text-muted">
            {hidden} hidden: already in your leads or customers.{" "}
            <Link href={viewHref({ hide: false, sort })} className="link">
              Show them
            </Link>
          </p>
        )}
        {page.results.length === 0 ? (
          <p className="mt-3 card-empty p-6 text-center text-sm">
            Nothing yet. Search for a business above.
          </p>
        ) : shown.length === 0 ? (
          <p className="mt-3 card-empty p-6 text-center text-sm">
            You already have every result here in your leads or customers.
          </p>
        ) : (
          <ul className="mt-3 grid gap-4 lg:grid-cols-2">
            {shown.map((r) => (
              <ResultCard
                key={r.id}
                result={r}
                have={r.have ? haveLabel(r.have) : null}
                isNew={Date.parse(r.created_at) > newSince}
                canUnlock={!locked}
                reportedStatus={page.reported.get(r.id) ?? null}
                sender={{
                  name: (me as { full_name?: string | null } | null)?.full_name ?? null,
                  business: business.name,
                  offer: profile?.offer ?? null,
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-xs text-muted">
        We check, we don&apos;t guarantee: format, mail server and &quot;still on their
        website&quot; for emails; format and &quot;listed on their website&quot; for phones. A
        bounce or wrong number reported within 30 days gets the credit back, and an email that
        fails our free check (the domain has no mail server) gets its credit back on its own. People are only found
        where their own business lists them.{" "}
        <Link href="/data-sources" className="link">Where the data comes from</Link> ·{" "}
        <Link href="/acceptable-use" className="link">Acceptable Use</Link>
      </p>
    </div>
  );
}
