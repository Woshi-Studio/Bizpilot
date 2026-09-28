import { PLAN_AI_CREDITS, PLAN_LABELS, PLAN_LIMITS, PLAN_ORDER, PLAN_PRICES, formatLimit, type Plan } from "@/lib/plans";
import {
  BOSS_CREDITS_PER_PERIOD,
  LEADSUB_CREDITS_PER_PERIOD,
  LOCKED_SEARCHES_PER_DAY,
  PACK_CREDITS,
  LEAD_CREDITS_ROLL_OVER,
} from "@/lib/finder-plans";

// What each plan gets, in plain words. Used by the in-app Plans page and
// the public /pricing page (which hides prices unless SHOW_PUBLIC_PRICES).

const n = (v: number | null, unit: string) => (v === null ? `Unlimited ${unit}` : `${v} ${unit}`);

function rows(): { label: string; value: (p: Plan) => string }[] {
  return [
    { label: "Customers + open leads", value: (p) => n(PLAN_LIMITS[p].contacts, "") .trim() },
    { label: "Invoices + quotes (every 4 weeks)", value: (p) => n(PLAN_LIMITS[p].docs, "").trim() },
    { label: "File storage", value: (p) => formatLimit("storage", PLAN_LIMITS[p].storage) },
    {
      label: "Emails sent from Jephelen a day",
      value: (p) => (PLAN_LIMITS[p].email ? String(PLAN_LIMITS[p].email) : "Copy / open in your own email"),
    },
    { label: "Business lines", value: (p) => n(PLAN_LIMITS[p].lines, "").trim() },
    { label: "AI help a day", value: (p) => `${PLAN_AI_CREDITS[p]} credits` },
    { label: "Themes", value: (p) => (p === "free" ? "Clean, Dark" : "All 4") },
    { label: "Assistant access (API keys)", value: (p) => (p === "free" ? "—" : "Yes") },
    {
      label: "Lead Finder searches",
      value: (p) => (p === "pro" ? "Unlocked results" : `Free, ${LOCKED_SEARCHES_PER_DAY} a day, results locked`),
    },
    {
      label: "Lead credits every 4 weeks",
      value: (p) => (p === "pro" ? String(BOSS_CREDITS_PER_PERIOD) : "—"),
    },
    {
      label: "Leads subscription (add-on)",
      value: (p) => (p === "pro" ? `+${LEADSUB_CREDITS_PER_PERIOD} leads every 4 weeks` : "Boss only"),
    },
    {
      label: "Lead packs (one time)",
      value: (p) => (p === "pro" ? `${PACK_CREDITS.pack25} or ${PACK_CREDITS.pack100} leads` : "Boss only"),
    },
  ];
}

export function PlanTable({ showPrices }: { showPrices: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line/70 bg-surface">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="border-b border-line/70">
            <th className="px-4 py-3 font-medium text-muted"> </th>
            {PLAN_ORDER.map((p) => (
              <th key={p} className="px-4 py-3">
                <span className="section-title">{PLAN_LABELS[p]}</span>
                <span className="block text-xs font-medium text-muted">
                  {p === "free" ? "Free" : showPrices ? `$${PLAN_PRICES[p]} USD every 4 weeks` : "Paid, every 4 weeks"}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows().map((r) => (
            <tr key={r.label} className="border-b border-line/50 last:border-0">
              <td className="px-4 py-2.5 text-ink-2">{r.label}</td>
              {PLAN_ORDER.map((p) => (
                <td key={p} className="px-4 py-2.5 font-medium text-ink">
                  {r.value(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The Boss add-ons, as plain cards. No prices here: the public page hides
// them, and Stripe checkout shows the price before anyone pays.
export function LeadAddOns() {
  const cards = [
    {
      title: "Leads subscription",
      big: LEADSUB_CREDITS_PER_PERIOD,
      unit: "leads every 4 weeks",
      text: `On top of Boss's ${BOSS_CREDITS_PER_PERIOD}. Renews every 4 weeks; cancel any time.`,
    },
    {
      title: `Pack ${PACK_CREDITS.pack25}`,
      big: PACK_CREDITS.pack25,
      unit: "leads, one time",
      text: "A one-time top-up. Pack credits never expire.",
    },
    {
      title: `Pack ${PACK_CREDITS.pack100}`,
      big: PACK_CREDITS.pack100,
      unit: "leads, one time",
      text: "A one-time top-up. Pack credits never expire.",
    },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((c) => (
        <div key={c.title} className="card p-5">
          <h3 className="section-title">{c.title}</h3>
          <p className="mt-2 text-3xl font-bold tracking-tight text-ink">
            {c.big}
            <span className="text-sm font-medium text-muted"> {c.unit}</span>
          </p>
          <p className="mt-2 text-sm text-ink-2">{c.text}</p>
          <p className="mt-3 text-xs font-medium text-muted">Available on Boss</p>
        </div>
      ))}
    </div>
  );
}

export function PlanFaq({ inApp }: { inApp: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card p-5">
        <h3 className="section-title">Lead Finder: locked or unlocked</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          <li>
            <strong>Starter and Hustle</strong> can search for free ({LOCKED_SEARCHES_PER_DAY} a day). Each
            result shows the company, the city and why it fits. The phone, email, website, contact
            name and source stay locked.
          </li>
          <li>
            <strong>Boss</strong> sees everything. 1 lead credit = 1 business found with a way to reach
            it. Not found = free.
          </li>
          <li>Locked results are saved. They unlock when you move to Boss.</li>
        </ul>
      </div>
      <div className="card p-5">
        <h3 className="section-title">Lead subscription and packs (Boss)</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          <li>Boss comes with {BOSS_CREDITS_PER_PERIOD} lead credits every 4 weeks.</li>
          <li>
            The lead subscription adds {LEADSUB_CREDITS_PER_PERIOD} lead credits every 4 weeks, on top.
          </li>
          <li>
            Packs of {PACK_CREDITS.pack25} or {PACK_CREDITS.pack100} leads are one-time top-ups.
          </li>
          <li>
            {LEAD_CREDITS_ROLL_OVER
              ? "Unused credits carry over."
              : "Unused plan and subscription credits don't carry over to the next 4 weeks. Pack credits never expire."}
          </li>
        </ul>
      </div>
      <div className="card p-5">
        <h3 className="section-title">What &quot;every 4 weeks&quot; means</h3>
        <p className="mt-2 text-sm text-ink-2">
          You pay on the same weekday every 4 weeks, not on the same date every month. That&apos;s 13
          payments a year. Prices are in US dollars.
        </p>
      </div>
      <div className="card p-5">
        <h3 className="section-title">Upgrade, switch or cancel</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          <li>
            <strong>Upgrade:</strong> {inApp ? "press Upgrade on a plan below" : "sign up free, then pick a plan in the app"}.
            It starts at once.
          </li>
          <li>
            <strong>Switch or cancel:</strong> {inApp ? "press Manage billing" : "in the app, Plans → Manage billing"}.
            You can cancel any time; nothing more is charged after that.
          </li>
          <li>
            Going down a plan never deletes anything. If you have more than the new plan allows, it
            all stays; you just can&apos;t add more until you&apos;re under the limit.
          </li>
        </ul>
      </div>
    </div>
  );
}
