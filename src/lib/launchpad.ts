// Launchpad — the "start a business from scratch" engine.
// The roadmap and template plan are rule-based (free, instant);
// the AI can rewrite the plan personally when a key with credit exists.

export type LaunchpadInputs = {
  idea: string;
  location: string;
  budget: string;
  hoursPerWeek: string;
  goal: string;
};

// Day offsets are from "today" when the roadmap is loaded.
export const ROADMAP_TASKS: { title: string; days: number }[] = [
  // This week
  { title: "Decide your business name (simple beats clever)", days: 2 },
  { title: "Set up your Jephelen public page so people can reach you", days: 3 },
  { title: "Check what registration/licenses your city or state requires", days: 5 },
  { title: "Open a separate bank account for business money", days: 7 },
  { title: "Tell 10 people you're open for business", days: 7 },
  // First month
  { title: "Write down your 1–3 core services and starting prices", days: 10 },
  { title: "Log every expense from day one (snap the receipts)", days: 12 },
  { title: "Set up a simple portfolio or social profile", days: 14 },
  { title: "Get your first paying customer 🎉", days: 21 },
  { title: "Ask your first customer for a testimonial or referral", days: 30 },
  // First 3 months
  { title: "Put aside a slice of every payment for taxes (ask an accountant how much)", days: 45 },
  { title: "Build a weekly routine: one marketing day, one admin hour", days: 50 },
  { title: "Review your prices — if you're fully booked, raise them", days: 60 },
  { title: "Reach 5 paying customers", days: 75 },
  // First year
  { title: "Revisit your business plan and update the goals", days: 120 },
  { title: "Only buy tools/upgrades that pay for themselves", days: 150 },
  { title: "Milestone: steady monthly income that covers your bills", days: 180 },
  { title: "Year review: what sold, what flopped — double down on what worked", days: 330 },
];

export function roadmapWithDates(from = new Date()) {
  return ROADMAP_TASKS.map((t) => {
    const due = new Date(from);
    due.setDate(due.getDate() + t.days);
    return { title: t.title, due_date: due.toISOString().slice(0, 10) };
  });
}

export function buildTemplatePlan(
  inputs: LaunchpadInputs,
  businessName: string,
  businessTypeLabel: string
) {
  const budget = inputs.budget ? `${inputs.budget}` : "a small starting budget";
  const hours = inputs.hoursPerWeek
    ? `${inputs.hoursPerWeek} hours/week`
    : "part-time hours";

  return `# Business Plan — ${businessName}

## The idea
${inputs.idea}

Type of business: ${businessTypeLabel}${inputs.location ? ` · Based in: ${inputs.location}` : ""}

## Who it's for
Start narrow. Pick ONE kind of customer you can describe in a sentence (e.g. "local restaurants that need better photos" beats "anyone who needs photos"). You can widen later — specialists win their first customers faster and can charge more.

## Your offer
Turn the idea into 1–3 concrete services with a clear result each. A confused customer never buys. For each service, finish this sentence: "You pay me X, and you get Y by Z."

## Pricing starting point
- Add up your real costs (tools, materials, travel) plus your time at a wage you'd accept.
- Check what 3 competitors charge${inputs.location ? ` around ${inputs.location}` : ""} — price near the middle, not the bottom.
- Cheapest attracts the worst customers. Compete on speed and clarity, not price.

## Startup budget
You said you can invest: ${budget}.
Rule of thumb: spend first on whatever gets you customers (a page, samples of your work, telling people). Delay everything else — most "startup costs" can wait until real money is coming in.

## Your time
You have about ${hours}. Protect it: a fixed weekly rhythm (one slot for finding customers, one for the actual work, one hour for admin in Jephelen) beats working "whenever."

## First-year goal
${inputs.goal || "Reach steady monthly income that covers your bills."}

## Legal & money checklist (educational, not legal advice)
- Check your local rules for registering the business — requirements differ by country and city.
- Keep business and personal money separate from day one.
- Save a slice of every payment for taxes — ask a local accountant what percentage.
- Get any agreements in writing, even a short email: what's included, price, deadline.

## How Jephelen carries this plan
Your roadmap is already loaded into Tasks with real deadlines. Leads from your public page land in the Leads inbox. Every payment and expense goes in Money. And before any big discount, deal, or purchase — run it through Decision Guard first.
`;
}
