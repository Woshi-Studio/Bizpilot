import Link from "next/link";
import type { FinderAccess } from "@/lib/finder";
import type { LeadSubStatus } from "@/lib/finder-server";
import {
  BOSS_CREDITS_PER_PERIOD,
  LEADSUB_CREDITS_PER_PERIOD,
  LOCKED_SEARCHES_PER_DAY,
  PACK_CREDITS,
  rolloverText,
  type FinderProduct,
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

export default function FinderSection({
  access,
  credits,
  sub,
  ready,
  intakeFilled,
  message,
  canBuy,
}: {
  canBuy: boolean;
  access: FinderAccess;
  credits: { balance: number; held: number } | null;
  sub: LeadSubStatus | null;
  ready: Record<FinderProduct, boolean>;
  intakeFilled: boolean;
  message: string | null;
}) {
  const owner = access === "owner";
  const boss = canBuy;
  const subActive = !!sub && ["active", "trialing", "past_due", "unpaid"].includes(sub.status);

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

      {!owner && !boss && (
        <div className="mt-4 rounded-2xl border border-accent/40 bg-accent-soft p-4">
          <p className="text-sm font-semibold text-accent-text">Boss only</p>
          <p className="mt-1 text-sm text-ink-2">
            The lead subscription and lead packs come with Boss. Your saved results unlock when you upgrade.
          </p>
          <Link href="#plan" className="btn-primary btn-sm mt-3">
            Upgrade to Boss
          </Link>
        </div>
      )}

      {boss && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col rounded-2xl border-2 border-line/70 bg-surface p-5">
            <p className="section-title">Lead subscription</p>
            <p className="mt-1 text-sm text-ink-2">
              {LEADSUB_CREDITS_PER_PERIOD} lead credits every 4 weeks, on top of Boss.
            </p>
            <p className="mt-3 text-sm">
              <span className="text-muted">Status: </span>
              <span className="font-medium text-ink">{subLine(sub)}</span>
            </p>
            <div className="mt-4 flex flex-1 items-end">
              {subActive ? (
                <form action={openBillingPortal}>
                  <button type="submit" className="btn-secondary btn-sm">
                    Manage
                  </button>
                </form>
              ) : !intakeFilled && ready.leadsub ? (
                <Link href="/leads/search/hunt?need=leadsub" className="btn-secondary btn-sm">
                  First, tell us what you&apos;re hunting
                </Link>
              ) : (
                <BuyButton product="leadsub" ready={ready.leadsub} label={`Get ${LEADSUB_CREDITS_PER_PERIOD} leads every 4 weeks`} primary />
              )}
            </div>
          </div>

          <div className="flex flex-col rounded-2xl border-2 border-line/70 bg-surface p-5">
            <p className="section-title">Lead packs</p>
            <p className="mt-1 text-sm text-ink-2">One-time top-ups. Pack credits never expire.</p>
            <div className="mt-4 flex flex-1 flex-wrap items-end gap-3">
              <BuyButton product="pack25" ready={ready.pack25} label={`Buy ${PACK_CREDITS.pack25} leads`} />
              <BuyButton product="pack100" ready={ready.pack100} label={`Buy ${PACK_CREDITS.pack100} leads`} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
