// Lead Finder money rules: the numbers to change live HERE.
// No imports, so `node --test` can load it. Prices are set in Stripe by the
// owner; the code only knows which env var holds which price id.

type Env = Record<string, string | undefined>;

// Lead credits Boss gets on every paid Boss invoice (every 4 weeks).
export const BOSS_CREDITS_PER_PERIOD = 40;

// Lead credits the lead subscription gives on every paid invoice.
export const LEADSUB_CREDITS_PER_PERIOD = 200; // Lucy 2026-09-27: 200 leads every 4 weeks for $29

// false = unused plan / lead-sub credits are removed when the next
// grant of the same kind arrives (and when that subscription ends).
// Pack credits never expire either way.
export const LEAD_CREDITS_ROLL_OVER = false;

// Free, locked searches a Starter / Hustle business can run in 24 hours.
export const LOCKED_SEARCHES_PER_DAY = 5;

// How many NEW companies one "Find me customers" run delivers.
export const DISCOVER_DEFAULT_COUNT = 10;

// Who may buy the lead subscription and packs: Boss only (it drives
// upgrades). The owner never needs them.
export const LEAD_PRODUCTS_BOSS_ONLY = true;

export type FinderProduct = "leadsub" | "pack25" | "pack100";

export const PACK_CREDITS: Record<"pack25" | "pack100", number> = { pack25: 25, pack100: 100 };

export const FINDER_PRICE_ENV: Record<FinderProduct, string> = {
  leadsub: "STRIPE_PRICE_ID_LEADSUB",
  pack25: "STRIPE_PRICE_ID_PACK25",
  pack100: "STRIPE_PRICE_ID_PACK100",
};

export function isFinderProduct(v: unknown): v is FinderProduct {
  return v === "leadsub" || v === "pack25" || v === "pack100";
}

export function finderPriceId(product: FinderProduct, env: Env): string {
  return (env[FINDER_PRICE_ENV[product]] ?? "").trim();
}

// Is the buy button switched on? (Needs the Stripe key and the price.)
export function finderProductReady(product: FinderProduct, env: Env): boolean {
  return !!(env.STRIPE_SECRET_KEY ?? "").trim() && !!finderPriceId(product, env);
}

export function finderProductForPrice(priceId: string | null | undefined, env: Env): FinderProduct | null {
  if (!priceId) return null;
  for (const p of ["leadsub", "pack25", "pack100"] as const) {
    const id = finderPriceId(p, env);
    if (id && id === priceId) return p;
  }
  return null;
}

export type Grant = { pool: "plan" | "leadsub" | "pack"; credits: number };

// What a paid subscription invoice grants, from its price id:
//   the Boss price (STRIPE_PRICE_ID_PRO) -> BOSS_CREDITS_PER_PERIOD
//   the lead-sub price                   -> LEADSUB_CREDITS_PER_PERIOD x quantity
//   anything else (Hustle, packs)        -> nothing
export function invoiceGrant(priceId: string | null | undefined, quantity: number | null | undefined, env: Env): Grant | null {
  if (!priceId) return null;
  const pro = (env.STRIPE_PRICE_ID_PRO ?? "").trim();
  if (pro && priceId === pro) return { pool: "plan", credits: BOSS_CREDITS_PER_PERIOD };
  if (finderProductForPrice(priceId, env) === "leadsub") {
    const q = Math.min(Math.max(Math.trunc(Number(quantity) || 1), 1), 10);
    return { pool: "leadsub", credits: LEADSUB_CREDITS_PER_PERIOD * q };
  }
  return null;
}

// What a paid one-time Checkout grants: the sum over its pack line items.
export function packGrant(lines: { priceId: string | null | undefined; quantity: number | null | undefined }[], env: Env): Grant | null {
  let credits = 0;
  for (const l of lines) {
    const p = finderProductForPrice(l.priceId, env);
    if (p === "pack25" || p === "pack100") {
      credits += PACK_CREDITS[p] * Math.min(Math.max(Math.trunc(Number(l.quantity) || 1), 1), 10);
    }
  }
  return credits > 0 ? { pool: "pack", credits } : null;
}

// Can this business buy the lead sub / a pack?
export function canBuyLeadProducts(opts: { plan: string | null | undefined; owner: boolean }): boolean {
  if (opts.owner) return false;
  return LEAD_PRODUCTS_BOSS_ONLY ? opts.plan === "pro" : true;
}

// How /plans shows the lead products. The cards always show (to everyone
// with Finder access); only the button changes:
//   "buy"     -> Boss: real Buy buttons
//   "upgrade" -> Starter / Hustle: "Available on Boss: Upgrade"
//   "owner"   -> the owner: unlimited, buttons shown but disabled
export type LeadProductView = "buy" | "upgrade" | "owner";

export function leadProductView(opts: { access: string; plan: string | null | undefined; owner: boolean }): LeadProductView {
  if (opts.owner || opts.access === "owner") return "owner";
  return opts.access === "full" && canBuyLeadProducts(opts) ? "buy" : "upgrade";
}

export function rolloverText(): string {
  return LEAD_CREDITS_ROLL_OVER
    ? "Unused credits carry over."
    : "Unused plan and subscription credits don't carry over. Pack credits never expire.";
}
