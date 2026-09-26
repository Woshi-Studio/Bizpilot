// The app's navigation: 6 groups instead of 18 sidebar links.
// Every old URL still works — the groups only decide what the sidebar,
// the mobile tab bar and the page tabs show.

import type { IconName } from "@/components/icons";

export type NavPage = { label: string; href: string };
export type NavGroup = {
  key: string;
  label: string;
  icon: IconName;
  href: string;
  pages: NavPage[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "home",
    label: "Home",
    icon: "home",
    href: "/dashboard",
    pages: [
      { label: "Today", href: "/dashboard" },
      { label: "Goals & Wins", href: "/goals" },
    ],
  },
  {
    key: "people",
    label: "People",
    icon: "people",
    href: "/customers",
    pages: [
      { label: "Customers", href: "/customers" },
      { label: "Leads", href: "/leads" },
    ],
  },
  {
    key: "work",
    label: "Work",
    icon: "work",
    href: "/tasks",
    pages: [
      { label: "Tasks", href: "/tasks" },
      { label: "Calendar", href: "/calendar" },
    ],
  },
  {
    key: "money",
    label: "Money",
    icon: "money",
    href: "/invoices",
    pages: [
      { label: "Invoices", href: "/invoices" },
      { label: "Time & Billing", href: "/time" },
      { label: "Pricing", href: "/services" },
      { label: "In & Out", href: "/money" },
      { label: "Tax Center", href: "/tax" },
      { label: "Reports", href: "/reports" },
    ],
  },
  {
    key: "ai",
    label: "AI",
    icon: "ai",
    href: "/messages",
    pages: [
      { label: "Messages", href: "/messages" },
      { label: "Coach", href: "/coach" },
      { label: "Decision Guard", href: "/decisions" },
      { label: "Launchpad", href: "/launchpad" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: "settings",
    href: "/settings",
    pages: [{ label: "Settings", href: "/settings" }],
  },
];

const matches = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export function groupFor(pathname: string): NavGroup | undefined {
  return NAV_GROUPS.find((g) => g.pages.some((p) => matches(pathname, p.href)));
}

export function pageFor(pathname: string): NavPage | undefined {
  return groupFor(pathname)?.pages.find((p) => matches(pathname, p.href));
}


// A plain-language hint per page, used by Athena ("how do I…").
export const PAGE_HELP: Record<string, string> = {
  "/dashboard": "Home: today's tasks, follow-ups, money this month, the scoreboard by business and the AI daily plan.",
  "/goals": "Goals & Wins: set customer and revenue goals, a savings goal, and log wins.",
  "/customers": "People > Customers: search the list; click a name to open their one-page profile with every action on top.",
  "/leads": "People > Leads: log outreach, change lead status, turn a lead into a customer with 'Add to customers'.",
  "/tasks": "Work > Tasks: add a task at the top, then move it through To Do, In Progress, Review and Done.",
  "/calendar": "Work > Calendar: month or week view of tasks, follow-ups, invoices due and meetings; book a meeting from the form.",
  "/invoices": "Money > Invoices: create invoices and quotes, mark them sent or paid, print or save as PDF.",
  "/time": "Money > Time & Billing: log hours per customer and task, then bill them on an invoice.",
  "/services": "Money > Pricing: your services and rates, used when you build invoices.",
  "/money": "Money > In & Out: log income and expenses, attach receipts, set recurring items, export CSV.",
  "/tax": "Money > Tax Center: an estimate of what to set aside, and which expenses lack receipts.",
  "/reports": "Money > Reports: the Business Health Score, revenue by month and top customers.",
  "/messages": "AI > Messages: pick a message type, tone and customer, press Generate, then Copy or Send.",
  "/coach": "AI > Coach: ask business questions; it knows your numbers.",
  "/decisions": "AI > Decision Guard: run a big decision through a short checklist before you commit.",
  "/launchpad": "AI > Launchpad: build and rewrite a simple business plan.",
  "/settings": "Settings: business profile, public page, payment methods, plan & billing, email, appearance (light/dark).",
};
