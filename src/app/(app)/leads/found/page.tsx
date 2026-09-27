import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import { creditLine } from "@/lib/finder-credits";
import {
  getFinderAccess,
  loadFinderPage,
  loadProfile,
  pendingItems,
  type FinderItem,
} from "@/lib/finder-server";
import SearchForm from "./search-form";
import ResultCard from "./result-card";
import { pickCandidate } from "./actions";

export const metadata = { title: "Found" };

function PendingItem({ item }: { item: FinderItem }) {
  const where = [item.city, item.website].filter(Boolean).join(" · ");
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
  const label =
    item.status === "queued" || item.status === "working"
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

export default async function FoundPage() {
  const { supabase, business, user } = await requireUserAndBusiness();
  const access = getFinderAccess(business.id);

  if (access === "none") {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="page-title">Found</h1>
        <p className="page-sub">Companies the Lead Finder found for you.</p>
        <div className="mt-6 card-empty p-6 text-sm">
          <p className="font-medium text-ink">The Lead Finder is invite-only while we test it.</p>
          <p className="mt-1">Type a company name and get its phone, website and contact form. It opens to everyone soon.</p>
        </div>
      </div>
    );
  }

  const [{ profile, ready }, page, { data: me }] = await Promise.all([
    loadProfile(supabase, business.id),
    loadFinderPage(supabase, business.id),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  if (!ready || !page.ready) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="page-title">Found</h1>
        <p className="mt-6 alert-warn">
          {access === "owner"
            ? "Not set up yet: run migration 0019 in Supabase first."
            : "The Lead Finder isn't switched on yet. Please check back soon."}
        </p>
      </div>
    );
  }

  const unlimited = access === "owner";
  const pending = pendingItems(page.items);
  const canSearch = !!profile && (unlimited || page.balance > 0);
  const note = !profile
    ? "Fill in \"What are you hunting?\" first. It takes a minute."
    : unlimited || page.balance > 0
      ? "Type the name and a city or their website. Known companies show at once (1 credit)."
      : "You're out of Finder credits. Invited testers get more from us: reply to your invite.";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Found</h1>
          <p className="page-sub">
            Companies we found for you. They join your leads only when you tap Add to leads, so they
            don&apos;t count toward your plan until then.
          </p>
        </div>
        <Link href="/leads/found/hunt" className="btn-secondary btn-sm">
          {profile ? "Edit what you're hunting" : "What are you hunting?"}
        </Link>
      </div>

      <p className="mt-4 inline-flex rounded-full border border-line/70 bg-surface px-3 py-1 text-xs font-medium text-ink-2">
        {creditLine(page.balance, page.held, unlimited)}
      </p>

      {!profile && (
        <div className="mt-6 rounded-2xl border border-accent/40 bg-accent-soft p-5">
          <p className="text-sm font-semibold text-accent-text">Start here</p>
          <p className="mt-1 text-sm text-ink-2">
            Tell us your business, your offer and who you want to reach. One minute, once.
          </p>
          <Link href="/leads/found/hunt" className="btn-primary btn-sm mt-3">
            What are you hunting?
          </Link>
        </div>
      )}

      <div className="mt-6">
        <SearchForm disabled={!canSearch} note={note} />
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

      <section className="mt-8">
        <h2 className="section-title">Results</h2>
        {page.results.length === 0 ? (
          <p className="mt-3 card-empty p-6 text-center text-sm">
            Nothing yet. Search for a company above.
          </p>
        ) : (
          <ul className="mt-3 grid gap-4 lg:grid-cols-2">
            {page.results.map((r) => (
              <ResultCard
                key={r.id}
                result={r}
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
        bounce or wrong number reported within 30 days gets the credit back.{" "}
        <Link href="/data-sources" className="link">Where the data comes from</Link> ·{" "}
        <Link href="/acceptable-use" className="link">Acceptable Use</Link>
      </p>
    </div>
  );
}
