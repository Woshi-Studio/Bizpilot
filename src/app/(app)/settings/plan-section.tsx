import type { PaidTier } from "@/lib/stripe";
import type { PlanState } from "@/lib/plan-limits";
import type { AiCredit } from "@/lib/ai-quota";
import {
  LIMIT_LABELS,
  PLAN_AI_CREDITS,
  PLAN_LABELS,
  PLAN_LIMITS,
  PLAN_ORDER,
  formatLimit,
  priceText,
  type LimitKind,
  type Plan,
} from "@/lib/plans";
import { startCheckout, openBillingPortal } from "./billing-actions";

const KINDS: LimitKind[] = ["contacts", "docs", "storage", "email", "lines"];

function perks(plan: Plan): string[] {
  const l = PLAN_LIMITS[plan];
  return [
    l.contacts === null ? "Unlimited customers + leads" : `${l.contacts} customers + leads`,
    l.docs === null ? "Unlimited invoices + quotes" : `${l.docs} invoices + quotes every 4 weeks`,
    `${formatLimit("storage", l.storage)} file storage`,
    l.email ? `Send ${l.email} emails a day from Jephelen` : "Copy or open messages in your own email",
    l.lines === null ? "Unlimited business lines" : l.lines === 1 ? "1 business line" : `${l.lines} business lines`,
    `${PLAN_AI_CREDITS[plan]} AI credits a day${plan === "pro" ? " · best AI" : ""}`,
    plan === "free" ? "Clean and Dark themes" : "All 4 themes (Neon, Retro too)",
    ...(plan === "free" ? [] : ["Assistant access (API keys)"]),
  ];
}

function Meter({
  label,
  used,
  limit,
  kind,
}: {
  label: string;
  used: number | null;
  limit: number | null;
  kind: LimitKind | "ai";
}) {
  const fmt = (n: number) => (kind === "storage" ? formatLimit("storage", n) : String(n));
  const pct = limit === null || used === null ? 0 : limit === 0 ? 100 : Math.min(100, (used / limit) * 100);
  const full = limit !== null && used !== null && used >= limit;
  const tone = full ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-accent";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-2">{label}</span>
        <span className={`font-medium tabular-nums ${full ? "text-red-600" : "text-ink"}`}>
          {used === null ? "?" : fmt(used)}
          <span className="text-muted">
            {" "}/ {limit === null ? "Unlimited" : limit === 0 ? "Not on this plan" : fmt(limit)}
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${limit === null ? 0 : pct}%` }} />
      </div>
    </div>
  );
}

export default function PlanSection({
  state,
  ai,
  billingReady,
  tierReady,
  message,
}: {
  state: PlanState;
  ai: AiCredit | null;
  billingReady: boolean;
  tierReady: Record<PaidTier, boolean>;
  message: string | null;
}) {
  const { plan, unlimited, limits, usage } = state;
  const paid = plan !== "free";

  return (
    <section id="plan" className="scroll-mt-24">
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Plan</h2>
            <p className="mt-1 text-sm text-muted">
              You&apos;re on <span className="font-semibold text-ink">{PLAN_LABELS[plan]}</span>.
              Prices in USD, billed every 4 weeks. Cancel any time.
            </p>
          </div>
          {unlimited && (
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
              Owner · no limits
            </span>
          )}
        </div>

        {message && <p className="alert-info mt-4">{message}</p>}

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {PLAN_ORDER.map((p) => {
            const current = p === plan;
            const tier = p as PaidTier;
            const canBuy = p !== "free" && billingReady && tierReady[tier];
            const higher = PLAN_ORDER.indexOf(p) > PLAN_ORDER.indexOf(plan);
            return (
              <div
                key={p}
                className={`flex flex-col rounded-2xl border-2 p-5 ${
                  current ? "border-accent bg-accent-soft/40" : "border-line/70 bg-surface"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="section-title">{PLAN_LABELS[p]}</p>
                  {current && (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent-contrast)]">
                      Your plan
                    </span>
                  )}
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-ink">
                  {p === "free" ? "Free" : `$${p === "premium" ? 5 : 15}`}
                  {p !== "free" && <span className="text-sm font-medium text-muted"> / 4 weeks</span>}
                </p>
                <ul className="mt-3 flex-1 space-y-1.5 text-sm text-ink-2">
                  {perks(p).map((x) => (
                    <li key={x} className="flex gap-2">
                      <span aria-hidden className="text-accent">✓</span>
                      {x}
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  {current ? (
                    paid && billingReady ? (
                      <form action={openBillingPortal}>
                        <button type="submit" className="btn-secondary btn-sm w-full">
                          Manage billing
                        </button>
                      </form>
                    ) : (
                      <p className="text-center text-xs text-muted">
                        {p === "free" ? "Free forever" : "Thank you! 💜"}
                      </p>
                    )
                  ) : p === "free" ? (
                    paid && billingReady ? (
                      <form action={openBillingPortal}>
                        <button type="submit" className="btn-ghost btn-sm w-full">
                          Switch to Starter
                        </button>
                      </form>
                    ) : null
                  ) : canBuy ? (
                    <form action={startCheckout}>
                      <input type="hidden" name="tier" value={tier} />
                      <button
                        type="submit"
                        className={`${higher ? "btn-primary" : "btn-secondary"} btn-sm w-full`}
                      >
                        {higher ? "Upgrade" : "Switch"} to {PLAN_LABELS[p]} · {priceText(p).replace(" every 4 weeks", "")}
                      </button>
                    </form>
                  ) : (
                    <p className="text-center text-xs text-muted">Coming soon</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card mt-5 p-6">
        <h2 className="section-title">Usage</h2>
        <p className="mt-1 text-sm text-muted">
          {unlimited ? "Owner account: nothing is limited." : "What you've used on your plan."}
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {KINDS.map((k) => (
            <Meter
              key={k}
              kind={k}
              label={LIMIT_LABELS[k]}
              used={usage ? usage[k] : null}
              limit={limits[k]}
            />
          ))}
          <Meter
            kind="ai"
            label="AI credits today"
            used={ai ? ai.used : null}
            limit={ai?.unlimited ? null : ai?.limit ?? PLAN_AI_CREDITS[plan]}
          />
        </div>
        {unlimited && !state.fromDb && (
          <p className="mt-4 text-xs text-muted">
            Counted in the app (run migration 0017 for exact numbers; receipts aren&apos;t counted yet).
          </p>
        )}
      </div>
    </section>
  );
}
