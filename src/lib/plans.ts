// Plans, limits and themes. Pure data + helpers, no imports, so
// `npm test` can load it with plain `node --test` (see plans.test.ts).
//
// DB values stay free / premium / pro. The app calls them
// Starter / Hustle / Boss. The real limits are enforced in the database
// (supabase/migrations/0017_plans_limits.sql) — keep the numbers in sync.

export type Plan = "free" | "premium" | "pro";

export const PLAN_ORDER: Plan[] = ["free", "premium", "pro"];

export const PLAN_LABELS: Record<Plan, string> = {
  free: "Starter",
  premium: "Hustle",
  pro: "Boss",
};

// USD, every 4 weeks.
export const PLAN_PRICES: Record<Plan, number> = { free: 0, premium: 5, pro: 15 };

export function priceText(plan: Plan) {
  return PLAN_PRICES[plan] === 0 ? "Free" : `$${PLAN_PRICES[plan]} every 4 weeks`;
}

export function normalizePlanValue(plan: string | null | undefined): Plan {
  return plan === "premium" || plan === "pro" ? plan : "free";
}

export type LimitKind = "contacts" | "docs" | "storage" | "email" | "lines";

const MB = 1024 * 1024;
const GB = 1024 * MB;

// null = unlimited
export const PLAN_LIMITS: Record<Plan, Record<LimitKind, number | null>> = {
  free: { contacts: 10, docs: 5, storage: 50 * MB, email: 0, lines: 1 },
  premium: { contacts: 150, docs: 50, storage: 1 * GB, email: 50, lines: 3 },
  pro: { contacts: null, docs: null, storage: 10 * GB, email: 200, lines: null },
};

// AI credits a day (enforced by consume_ai_credit(), 0013).
export const PLAN_AI_CREDITS: Record<Plan, number> = { free: 10, premium: 100, pro: 500 };

export const LIMIT_LABELS: Record<LimitKind, string> = {
  contacts: "Customers + leads",
  docs: "Invoices + quotes (last 28 days)",
  storage: "File storage",
  email: "Emails sent today",
  lines: "Business lines",
};

export function limitFor(plan: Plan, kind: LimitKind, unlimited = false): number | null {
  return unlimited ? null : PLAN_LIMITS[plan][kind];
}

export function nextPlan(plan: Plan): Plan | null {
  const i = PLAN_ORDER.indexOf(plan);
  return i >= 0 && i < PLAN_ORDER.length - 1 ? PLAN_ORDER[i + 1] : null;
}

export function formatBytes(bytes: number) {
  if (bytes >= GB) return `${+(bytes / GB).toFixed(1)} GB`;
  if (bytes >= MB) return `${+(bytes / MB).toFixed(bytes >= 10 * MB ? 0 : 1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function formatLimit(kind: LimitKind, value: number | null) {
  if (value === null) return "Unlimited";
  return kind === "storage" ? formatBytes(value) : String(value);
}

// What each limit is called in a sentence: "10 customers and leads".
function amount(kind: LimitKind, n: number | null) {
  if (n === null) return "unlimited " + noun(kind, 2);
  if (kind === "storage") return formatBytes(n);
  return `${n} ${noun(kind, n)}`;
}

function noun(kind: LimitKind, n: number) {
  const one = n === 1;
  switch (kind) {
    case "contacts":
      return "customers and leads";
    case "docs":
      return one ? "invoice or quote every 4 weeks" : "invoices and quotes every 4 weeks";
    case "storage":
      return "file storage";
    case "email":
      return one ? "email a day" : "emails a day";
    case "lines":
      return one ? "business line" : "business lines";
  }
}

// "You've reached 10 customers and leads on Starter. Hustle gives you 150
// for $5 every 4 weeks."
export function limitMessage(kind: LimitKind, plan: Plan): string {
  const limit = PLAN_LIMITS[plan][kind];
  const up = nextPlan(plan);
  let head: string;
  if (kind === "email" && limit === 0) {
    head = `Sending email from Jephelen isn't on ${PLAN_LABELS[plan]}.`;
  } else if (kind === "storage") {
    head = `You've used your ${amount(kind, limit)} on ${PLAN_LABELS[plan]}.`;
  } else {
    head = `You've reached ${amount(kind, limit)} on ${PLAN_LABELS[plan]}.`;
  }
  if (!up) return `${head} Delete something you don't need to make room.`;
  const upLimit = PLAN_LIMITS[up][kind];
  const gives =
    upLimit === null
      ? `${PLAN_LABELS[up]} has no limit`
      : `${PLAN_LABELS[up]} gives you ${kind === "storage" ? formatBytes(upLimit) : upLimit}`;
  return `${head} ${gives} for $${PLAN_PRICES[up]} every 4 weeks.`;
}

// The database says "plan_limit:contacts:10" (0017). Returns the kind,
// or "convert" for a lead marked converted without a customer.
export function parsePlanLimitError(
  message: string | null | undefined
): LimitKind | "convert" | null {
  const m = String(message ?? "").match(/plan_limit:(contacts|docs|storage|email|lines|convert)\b/);
  return m ? (m[1] as LimitKind | "convert") : null;
}

// ------------------------------------------------------------------
// Themes
// ------------------------------------------------------------------

export type ThemeId = "clean" | "dark" | "neon" | "retro";

export const THEMES: { id: ThemeId; label: string; blurb: string; paid: boolean }[] = [
  { id: "clean", label: "Clean", blurb: "Bright and calm", paid: false },
  { id: "dark", label: "Dark", blurb: "Easy on the eyes", paid: false },
  { id: "neon", label: "Woshi Neon", blurb: "Night city glow", paid: true },
  { id: "retro", label: "Retro", blurb: "Old-school computer", paid: true },
];

export function isThemeId(v: unknown): v is ThemeId {
  return v === "clean" || v === "dark" || v === "neon" || v === "retro";
}

export function themeAllowed(theme: ThemeId, plan: Plan, unlimited = false) {
  if (unlimited || plan !== "free") return true;
  return !THEMES.find((t) => t.id === theme)?.paid;
}

// The theme to use for a saved choice. A paid theme on Starter (e.g. after
// a downgrade) falls back to Clean. null = nothing saved.
export function effectiveTheme(
  saved: string | null | undefined,
  plan: Plan,
  unlimited = false
): ThemeId | null {
  if (!isThemeId(saved)) return null;
  return themeAllowed(saved, plan, unlimited) ? saved : "clean";
}
