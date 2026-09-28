import Link from "next/link";
import type { FinderAccess } from "@/lib/finder";
import type { LeadSubStatus } from "@/lib/finder-server";
import {
  BOSS_CREDITS_PER_PERIOD,
  LEAD_CREDITS_ROLL_OVER,
  LEADSUB_CREDITS_PER_PERIOD,
  LOCKED_SEARCHES_PER_DAY,
  PACK_CREDITS,
  rolloverText,
  type FinderProduct,
  type LeadProductView,
} from "@/lib/finder-plans";
import { buyLeadProduct } from "./finder-billing-actions";
import { openBillingPortal } from "./billing-actions";

function day(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "?";
}

function subLine(sub: LeadSubStatus | null): string {
  if (!sub) return "Not active";
  if (sub.status === "active" || sub.status === "trialing") {
    return sub.cancel_at_period_end
      ? `Active · ends ${day(sub.current_period_end)}`
      : `Active · next ${sub.credits || LEADSUB_CREDITS_PER_PERIOD} credits ${day(sub.current_period_end)}`;
  }
  if (sub.status === "past_due" || sub.status === "unpaid") return "Payment failed · update your card";
  return "Not active";
}

function BuyButton({ product, ready, label, primary }: { product: FinderProduct; ready: boolean; label: string; primary?: boolean }) {
  if (!ready) return <span className="text-xs text-muted">Coming soon</span>;
  return (
    <form action={buyLeadProduct}>
      <input type="hidden" name="product" value={product} />
      <button type="submit" className={`${primary ? "btn-primary" : "btn-secondary"} btn-sm`}>
        {label}
      </button>
    </form>
  );
}

// The button at the bottom of a lead-product card, by who is looking.
function CardAction({
  view,
  product,
  ready,
  label,
  primary,
}: {
  view: LeadProductView;
  product: FinderProduct;
  ready: boolean;
  label: string;
  primary?: boolean;
}) {
  if (view === "owner") {
    return (
      <button type="button" disabled className={`${primary ? "btn-primary" : "btn-secondary"} btn-sm`}>
        {label}
      </button>
    );
  }
  if (view === "upgrade") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">Available on Boss:</span>
        <Link href="#plan" className="btn-secondary btn-sm">
          Upgrade
        </Link>
      </div>
    );
  }
  return <BuyButton product={product} ready={ready} label={label} primary={primary} />;
}

function ProductCard({
  title,
  big,
  unit,
  lines,
  children,
}: {
  title: string;
  big: number;
  unit: string;
  lines: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border-2 border-line/70 bg-surface p-5">
      <p className="section-title">{title}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-ink">
        {big}
        <span className="text-sm font-medium text-muted"> {unit}</span>
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-2">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="mt-4 flex flex-1 flex-col justify-end gap-3">{children}</div>
    </div>
  );
}

export default function FinderSection({
  access,
  credits,
  sub,
  ready,
  intakeFilled,
  message,
  view,
}: {
  view: LeadProductView;
  access: FinderAccess;
  credits: { balance: number; held: number } | null;
  sub: LeadSubStatus | null;
  ready: Record<FinderProduct, boolean>;
  intakeFilled: boolean;
  message: string | null;
}) {
  const owner = view === "owner";
  const buy = view === "buy";
  const subActive = buy && !!sub && ["active", "trialing", "past_due", "unpaid"].includes(sub.status);
  const subLabel = `Get ${LEADSUB_CREDITS_PER_PERIOD} leads every 4 weeks`;

  return (
    <section id="lead-finder" className="card scroll-mt-24 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title">Lead Finder</h2>
          <p className="mt-1 text-sm text-muted">
            {owner
              ? "Owner account: unlimited searches, nothing to buy."
              : access === "full"
                ? `Boss gives you ${BOSS_CREDITS_PER_PERIOD} lead credits every 4 weeks. 1 credit = 1 business found with a way to reach it. ${rolloverText()}`
                : `You can search for free (${LOCKED_SEARCHES_PER_DAY} a day): results show the company, city and why it fits. Boss unlocks the phone, email, website and source, plus ${BOSS_CREDITS_PER_PERIOD} lead credits every 4 weeks.`}
          </p>
        </div>
        <Link href="/leads/search" className="btn-secondary btn-sm">
          Search leads
        </Link>
      </div>

      {message && <p className="alert-info mt-4">{message}</p>}

      {!owner && credits && (access === "full" || credits.balance > 0) && (
        <p className="mt-4 text-2xl font-bold tracking-tight text-ink">
          {credits.balance}
          <span className="text-sm font-medium text-muted"> lead credits</span>
          {credits.held > 0 && <span className="ml-2 text-xs font-medium text-muted">· {credits.held} held for searches in progress</span>}
        </p>
      )}

      <h3 className="section-title mt-6">Need more leads?</h3>
      {owner ? (
        <p className="alert-info mt-2">You&apos;re the owner, unlimited. This is what customers see.</p>
      ) : view === "upgrade" ? (
        <p className="mt-1 text-sm text-ink-2">
          These come with Boss. Your saved results unlock when you upgrade.
        </p>
      ) : (
        <p className="mt-1 text-sm text-ink-2">1 lead credit = 1 business found with a way to reach it.</p>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <ProductCard
          title="Leads subscription"
          big={LEADSUB_CREDITS_PER_PERIOD}
          unit="leads every 4 weeks"
          lines={[
            `${LEADSUB_CREDITS_PER_PERIOD} lead credits every 4 weeks, on top of Boss's ${BOSS_CREDITS_PER_PERIOD}.`,
            "Renews every 4 weeks. Cancel any time.",
            LEAD_CREDITS_ROLL_OVER ? "Unused credits carry over." : "Unused credits don't carry over.",
          ]}
        >
          {buy && (
            <p className="text-sm">
              <span className="text-muted">Status: </span>
              <span className="font-medium text-ink">{subLine(sub)}</span>
            </p>
          )}
          {subActive ? (
            <form action={openBillingPortal}>
              <button type="submit" className="btn-secondary btn-sm">
                Manage
              </button>
            </form>
          ) : buy && !intakeFilled && ready.leadsub ? (
            <Link href="/leads/search/hunt?need=leadsub" className="btn-secondary btn-sm">
              First, tell us what you&apos;re hunting
            </Link>
          ) : (
            <CardAction view={view} product="leadsub" ready={ready.leadsub} label={subLabel} primary />
          )}
        </ProductCard>

        {(["pack25", "pack100"] as const).map((p) => (
          <ProductCard
            key={p}
            title={`Pack ${PACK_CREDITS[p]}`}
            big={PACK_CREDITS[p]}
            unit="leads, one time"
            lines={[`${PACK_CREDITS[p]} lead credits, paid once.`, "Pack credits never expire."]}
          >
            <CardAction view={view} product={p} ready={ready[p]} label={`Buy ${PACK_CREDITS[p]} leads`} />
          </ProductCard>
        ))}
      </div>
    </section>
  );
}
