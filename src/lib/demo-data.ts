// Fake sample data for DEMO MODE (see demo.ts). Every name, email and
// number here is made up. Dates are relative to "now" so the pages always
// look current.

import { DEMO_BUSINESS_ID, DEMO_USER_ID } from "./demo.ts";

export type Row = Record<string, unknown>;

const B = DEMO_BUSINESS_ID;

function day(offset: number) {
  const d = new Date(Date.now() + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
}
function ts(offsetDays: number, hour = 15) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}
const id = (prefix: string, n: number) =>
  `00000000-0000-4000-8000-${prefix}${String(n).padStart(12 - prefix.length, "0")}`;

export const DEMO_IDS = {
  customer: (n: number) => id("c", n),
  lead: (n: number) => id("1ead", n),
  invoice: (n: number) => id("1", n),
  task: (n: number) => id("7", n),
};

export function buildDemoData(): Record<string, Row[]> {
  const created = ts(-120);
  const c = DEMO_IDS.customer;
  const l = DEMO_IDS.lead;

  const customers: Row[] = [
    ["Ava Chen", "Northwind Bakery", "active", "Woshi Studio", 0, "ava@northwind.example", "(415) 555-0142", "12 Market St, San Francisco, CA", "northwindbakery.example"],
    ["Marcus Reed", "Reed & Co. Law", "active", "VWA", -2, "marcus@reedlaw.example", "(312) 555-0199", "400 Lake Ave, Chicago, IL", "reedlaw.example"],
    ["Priya Nair", "Lotus Yoga", "active", "Woshi Studio", 5, "priya@lotusyoga.example", "(646) 555-0110", null, "lotusyoga.example"],
    ["Diego Alvarez", "Casa Verde Café", "lead", "Casa Norte", 1, "diego@casaverde.example", "(305) 555-0123", "88 Ocean Dr, Miami, FL", null],
    ["Hannah Brooks", "Brooks Fitness", "active", "Alpha Shop", null, "hannah@brooksfit.example", "(512) 555-0177", null, null],
    ["Tom Becker", "Becker Auto", "past", "S&S Diesel", null, "tom@beckerauto.example", "(206) 555-0150", "9 Harbor Rd, Seattle, WA", null],
    ["Sofia Rossi", "Rossi Interiors", "active", "Woshi Studio", 12, "sofia@rossi.example", "(617) 555-0133", null, "rossiinteriors.example"],
    ["James Okafor", null, "lead", null, 3, "james.okafor@example.com", null, null, null],
  ].map((r, i) => ({
    id: c(i + 1),
    business_id: B,
    name: r[0],
    company: r[1],
    status: r[2],
    business_line: r[3],
    next_follow_up: r[4] === null ? null : day(r[4] as number),
    email: r[5],
    phone: r[6],
    address: r[7],
    website: r[8],
    created_at: ts(-100 + i * 7),
    updated_at: ts(-i),
  }));

  const leads: Row[] = [
    ["Olivia Park", "inbound", "new", "Woshi Studio", 0, "Hi! Loved your portfolio — could you redo our café menu and logo?", "Park Coffee Roasters"],
    ["Ben Carter", "linkedin", "contacted", "VWA", 2, "Needs Spanish interpreting for 3 depositions next month.", "Carter Legal"],
    ["Lena Fischer", "referral", "meeting", "Woshi Studio", 4, "Referred by Ava. Wants a brand refresh.", "Fischer Florals"],
    ["Noah Kim", "upwork", "new", "Alpha Shop", -1, "Shopify store setup, ~20 products.", null],
    ["Grace Liu", "email", "declined", null, null, null, "Liu Dental"],
    ["Mateo Silva", "inbound", "converted", "Casa Norte", null, "Catering menu design.", "Silva Catering"],
  ].map((r, i) => ({
    id: l(i + 1),
    business_id: B,
    name: r[0],
    channel: r[1],
    status: r[2],
    business_line: r[3],
    follow_up_date: r[4] === null ? null : day(r[4] as number),
    message: r[5],
    company: r[6],
    email: `${String(r[0]).split(" ")[0].toLowerCase()}@example.com`,
    phone: i % 2 ? `(555) 555-01${10 + i}` : null,
    address: null,
    website: null,
    created_at: ts(-20 + i * 3, 13 + i),
  }));

  const t = DEMO_IDS.task;
  const tasks: Row[] = [
    ["Send logo concepts to Ava", 0, "inprogress", 1, 450, "Woshi Studio"],
    ["Invoice Marcus for September", -1, "todo", 2, null, "VWA"],
    ["Book photo shoot with Priya", 2, "todo", 3, 300, "Woshi Studio"],
    ["Draft café menu for Diego", 4, "todo", 4, 600, "Casa Norte"],
    ["Review Sofia's moodboard feedback", 1, "review", 7, null, "Woshi Studio"],
    ["Update portfolio site", 6, "todo", null, null, null],
    ["Quarterly tax estimate", 9, "todo", null, null, null],
    ["Deliver brand guide to Hannah", -6, "done", 5, 800, "Alpha Shop"],
    ["Wrap-up call with Tom", -12, "done", 6, null, "S&S Diesel"],
  ].map((r, i) => ({
    id: t(i + 1),
    business_id: B,
    title: r[0],
    due_date: day(r[1] as number),
    status: r[2],
    customer_id: r[3] ? c(r[3] as number) : null,
    service_id: null,
    value: r[4],
    description: null,
    business_line: r[5],
    completed_at: r[2] === "done" ? ts(r[1] as number) : null,
    created_at: created,
    updated_at: created,
  }));

  const inv = DEMO_IDS.invoice;
  const invoices: Row[] = [
    ["INV-1042", "invoice", "sent", 1, -14, -4, "Woshi Studio"],
    ["INV-1043", "invoice", "paid", 2, -30, -16, "VWA"],
    ["INV-1044", "invoice", "sent", 3, -3, 11, "Woshi Studio"],
    ["Q-2001", "quote", "draft", 4, -1, 13, "Casa Norte"],
    ["INV-1045", "invoice", "draft", 7, 0, 14, "Woshi Studio"],
    ["INV-1041", "invoice", "paid", 5, -45, -31, "Alpha Shop"],
  ].map((r, i) => ({
    id: inv(i + 1),
    business_id: B,
    number: r[0],
    doc_type: r[1],
    status: r[2],
    customer_id: c(r[3] as number),
    issue_date: day(r[4] as number),
    due_date: day(r[5] as number),
    notes: null,
    business_line: r[6],
    created_at: ts(r[4] as number),
    updated_at: ts(r[4] as number),
  }));

  const invoice_items: Row[] = [
    [1, "Logo design — 3 concepts", 1, 1200],
    [1, "Revisions (hours)", 4, 75],
    [2, "Interpreting — deposition (hours)", 6, 95],
    [3, "Brand photo shoot", 1, 900],
    [4, "Menu design", 1, 650],
    [4, "Print-ready files", 1, 150],
    [5, "Interior brochure layout", 1, 1100],
    [6, "Brand guide", 1, 800],
  ].map((r, i) => ({
    id: id("11", i + 1),
    invoice_id: inv(r[0] as number),
    description: r[1],
    quantity: r[2],
    unit_price: r[3],
    position: i,
  }));

  const transactions: Row[] = [
    ["income", 570, "project", "INV-1043 paid", -16, 2],
    ["income", 800, "project", "Brand guide", -8, 5],
    ["income", 1200, "retainer", "Monthly retainer", -3, 1],
    ["income", 350, "deposit", "Menu deposit", -1, 4],
    ["expense", 54.99, "software", "Adobe Creative Cloud", -5, null],
    ["expense", 29, "software", "Website hosting", -9, null],
    ["expense", 180, "equipment", "Drawing tablet pen", -11, null],
    ["expense", 75, "marketing", "Instagram promo", -2, null],
    ["income", 2100, "project", "Website launch", -40, 7],
    ["expense", 42, "travel", "Client visit — gas", -38, null],
  ].map((r, i) => ({
    id: id("7a", i + 1),
    business_id: B,
    type: r[0],
    amount: r[1],
    category: r[2],
    description: r[3],
    date: day(r[4] as number),
    customer_id: r[5] ? c(r[5] as number) : null,
    receipt_path: null,
    created_at: ts(r[4] as number),
    updated_at: ts(r[4] as number),
  }));

  const activities: Row[] = [
    [1, "email_sent", "Logo concepts — first round", "Hi Ava, attached are three directions for the new Northwind mark…", -6, "mailer"],
    [1, "email_reply", "Re: Logo concepts — first round", "Love #2! Can we try it in a warmer color?", -5, "gmail"],
    [1, "call", "Kickoff call", "Talked timeline and budget. She wants it before the holiday menu.", -12, "manual"],
    [1, "meeting", "Review concepts together", null, 2, "manual"],
    [1, "note", null, "Prefers texts over email for quick questions.", -20, "manual"],
    [1, "invoice", "Invoice INV-1042 sent", null, -14, "manual"],
    [2, "meeting", "Deposition prep", null, 1, "manual"],
    [3, "meeting", "Photo shoot planning", null, 5, "manual"],
    [7, "email_sent", "Moodboard v2", null, -2, "mailer"],
  ].map((r, i) => ({
    id: id("ac", i + 1),
    business_id: B,
    customer_id: c(r[0] as number),
    lead_id: null,
    business_line: customers[(r[0] as number) - 1].business_line,
    kind: r[1],
    subject: r[2],
    body: r[3],
    occurred_at: ts(r[4] as number, 16),
    source: r[5],
    external_id: null,
    created_at: ts(r[4] as number, 16),
  }));
  activities.push(
    {
      id: id("ac", 50),
      business_id: B,
      customer_id: null,
      lead_id: l(3),
      business_line: "Woshi Studio",
      kind: "meeting",
      subject: "Intro call with Lena",
      body: null,
      occurred_at: ts(4, 17),
      source: "manual",
      external_id: null,
      created_at: ts(-1),
    },
    {
      id: id("ac", 51),
      business_id: B,
      customer_id: null,
      lead_id: l(3),
      business_line: "Woshi Studio",
      kind: "email_sent",
      subject: "Thanks for the referral!",
      body: "Hi Lena — Ava told me about Fischer Florals. Happy to help with the refresh.",
      occurred_at: ts(-2, 14),
      source: "mailer",
      external_id: null,
      created_at: ts(-2),
    }
  );

  const documents: Row[] = [
    ["Signed contract.pdf", 184_000, "application/pdf", -30],
    ["Logo concepts v1.png", 2_400_000, "image/png", -6],
    ["Brand questionnaire.docx", 56_000, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", -25],
  ].map((r, i) => ({
    id: id("d0", i + 1),
    business_id: B,
    customer_id: c(1),
    name: r[0],
    path: `${B}/${c(1)}/demo-${i}`,
    size: r[1],
    mime: r[2],
    uploaded_at: ts(r[3] as number),
  }));

  const customer_notes: Row[] = [
    [1, "Wants a friendly, hand-drawn feel. Hates neon.", -18],
    [1, "Budget approved for phase 2 (packaging).", -4],
    [2, "Always cc his paralegal, Jen.", -10],
  ].map((r, i) => ({
    id: id("e0", i + 1),
    customer_id: c(r[0] as number),
    body: r[1],
    created_at: ts(r[2] as number),
  }));

  const services: Row[] = [
    ["Logo & brand identity", 1200, "project", "Woshi Studio"],
    ["Social media retainer", 900, "mo", "Woshi Studio"],
    ["Interpreting (Spanish)", 95, "hr", "VWA"],
    ["Menu design", 650, "project", "Casa Norte"],
  ].map((r, i) => ({
    id: id("5e", i + 1),
    business_id: B,
    name: r[0],
    rate: r[1],
    unit: r[2],
    description: null,
    business_line: r[3],
    created_at: created,
    updated_at: created,
  }));

  const time_entries: Row[] = [
    [1, 1, "Logo sketches", 3.5, -3, "unbilled"],
    [2, 2, "Deposition interpreting", 6, -17, "billed"],
    [7, 5, "Moodboard", 2, -2, "unbilled"],
    [3, 3, "Shoot planning", 1.25, -1, "unbilled"],
  ].map((r, i) => ({
    id: id("71", i + 1),
    business_id: B,
    customer_id: c(r[0] as number),
    task_id: t(r[1] as number),
    description: r[2],
    hours: r[3],
    entry_date: day(r[4] as number),
    billed: r[5],
    created_at: ts(r[4] as number),
  }));

  const wins: Row[] = [
    ["Landed Rossi Interiors", "client", -9],
    ["Best month yet — $4.6k", "revenue", -30],
    ["Delivered Brooks brand guide early", "delivery", -8],
  ].map((r, i) => ({
    id: id("a1", i + 1),
    business_id: B,
    title: r[0],
    category: r[1],
    details: null,
    created_at: ts(r[2] as number),
  }));

  const payment_methods: Row[] = [
    { id: id("9a", 1), business_id: B, label: "Zelle", value: "maya@example.com", position: 0, created_at: created },
    { id: id("9a", 2), business_id: B, label: "PayPal", value: "paypal.me/brightharbor", position: 1, created_at: created },
  ];

  const recurring_transactions: Row[] = [
    { id: id("8e", 1), business_id: B, type: "expense", amount: 54.99, category: "software", description: "Adobe Creative Cloud", next_date: day(25) },
  ];

  const businesses: Row[] = [
    {
      id: B,
      owner_id: DEMO_USER_ID,
      name: "Bright Harbor Studio",
      business_type: "design",
      description: "Branding and design for small local businesses.",
      primary_goal: "all",
      currency: "USD",
      onboarding_completed: true,
      plan: "premium",
      goal_customers: 12,
      goal_monthly_revenue: 5000,
      savings_goal_label: "New laptop",
      savings_current: 900,
      savings_target: 2400,
      slug: "bright-harbor",
      public_page_enabled: true,
      tagline: "Friendly design for local businesses",
      services: "Logos, menus, websites",
      stripe_customer_id: null,
      created_at: created,
      updated_at: created,
    },
  ];

  const profiles: Row[] = [
    {
      id: DEMO_USER_ID,
      full_name: "Maya Torres",
      avatar_url: null,
      created_at: created,
      updated_at: created,
    },
  ];

  const decisions: Row[] = [];

  return {
    businesses,
    profiles,
    customers,
    leads,
    tasks,
    invoices,
    invoice_items,
    transactions,
    activities,
    documents,
    customer_notes,
    services,
    time_entries,
    wins,
    payment_methods,
    recurring_transactions,
    decisions,
    ai_usage: [{ business_id: B, month: new Date().toISOString().slice(0, 10), count: 7 }],
    business_plans: [],
    receipts: [],
    feedback: [],
  };
}

// owner_hub_scoreboard() result, computed from the sample rows.
export function demoScoreboard(data: Record<string, Row[]>): Row[] {
  const out = new Map<string, number>();
  const bump = (line: unknown, metric: string) => {
    const key = `${line ?? ""}|${metric}`;
    out.set(key, (out.get(key) ?? 0) + 1);
  };
  for (const lead of data.leads) bump(lead.business_line, `lead_${lead.status}`);
  for (const a of data.activities) {
    if (a.kind === "email_sent" || a.kind === "email_reply") bump(a.business_line, String(a.kind));
  }
  return [...out.entries()].map(([k, n]) => {
    const [line, metric] = k.split("|");
    return { business_line: line || null, metric, n };
  });
}
