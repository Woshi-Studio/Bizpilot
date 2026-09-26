export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Business = {
  id: string;
  owner_id: string;
  name: string;
  business_type: string;
  description: string | null;
  primary_goal: string | null;
  currency: string;
  onboarding_completed: boolean;
  plan: string;
  goal_customers: number | null;
  goal_monthly_revenue: number | null;
  savings_goal_label: string | null;
  savings_current: number | null;
  savings_target: number | null;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: string;
  business_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: CustomerStatus;
  next_follow_up: string | null;
  business_line?: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerNote = {
  id: string;
  customer_id: string;
  body: string;
  created_at: string;
};

export type TaskStatus = "todo" | "inprogress" | "review" | "done";

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "inprogress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
];

export type Task = {
  id: string;
  business_id: string;
  customer_id: string | null;
  service_id: string | null;
  title: string;
  description: string | null;
  value: number | null;
  status: TaskStatus;
  due_date: string | null;
  completed_at: string | null;
  business_line?: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceUnit = "project" | "mo" | "hr" | "word" | "min";

export const SERVICE_UNITS: { value: ServiceUnit; label: string }[] = [
  { value: "project", label: "Per project" },
  { value: "mo", label: "Per month" },
  { value: "hr", label: "Per hour" },
  { value: "word", label: "Per word" },
  { value: "min", label: "Per minute" },
];

export type Service = {
  id: string;
  business_id: string;
  name: string;
  rate: number;
  unit: ServiceUnit;
  description: string | null;
  business_line?: string | null;
  created_at: string;
  updated_at: string;
};

export type TimeEntry = {
  id: string;
  business_id: string;
  customer_id: string | null;
  task_id: string | null;
  description: string | null;
  hours: number;
  entry_date: string;
  billed: "unbilled" | "billed" | "included";
  created_at: string;
};

export type Win = {
  id: string;
  business_id: string;
  title: string;
  category: "client" | "revenue" | "delivery" | "personal" | "other";
  details: string | null;
  created_at: string;
};

export const WIN_CATEGORIES = [
  { value: "client", label: "New client" },
  { value: "revenue", label: "Revenue milestone" },
  { value: "delivery", label: "Great delivery" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
] as const;

export type PaymentMethod = {
  id: string;
  business_id: string;
  label: string;
  value: string;
  position: number;
  created_at: string;
};

export type CustomerStatus = "lead" | "active" | "past";

export const CUSTOMER_STATUSES: {
  value: CustomerStatus;
  label: string;
  badgeClass: string;
}[] = [
  {
    value: "lead",
    label: "Lead",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    value: "active",
    label: "Active",
    badgeClass: "bg-green-50 text-green-700 border-green-200",
  },
  {
    value: "past",
    label: "Past",
    badgeClass: "bg-slate-100 text-slate-500 border-slate-200",
  },
];

export type Transaction = {
  id: string;
  business_id: string;
  customer_id: string | null;
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string | null;
  date: string;
  receipt_path: string | null;
  created_at: string;
  updated_at: string;
};

export const INCOME_CATEGORIES = [
  { value: "project", label: "Project payment" },
  { value: "retainer", label: "Retainer" },
  { value: "deposit", label: "Deposit" },
  { value: "other_income", label: "Other income" },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: "software", label: "Software & subscriptions" },
  { value: "equipment", label: "Equipment" },
  { value: "marketing", label: "Marketing" },
  { value: "travel", label: "Travel" },
  { value: "fees", label: "Fees & taxes" },
  { value: "other_expense", label: "Other expense" },
] as const;

export function categoryLabel(value: string) {
  const all = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];
  return all.find((c) => c.value === value)?.label ?? value;
}

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(amount);
}

export type Invoice = {
  id: string;
  business_id: string;
  customer_id: string | null;
  number: string;
  doc_type: "invoice" | "quote";
  status: "draft" | "sent" | "accepted" | "paid";
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  business_line?: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  position: number;
};

export const INVOICE_STATUS_META: Record<
  Invoice["status"],
  { label: string; badgeClass: string }
> = {
  draft: {
    label: "Draft",
    badgeClass: "bg-slate-100 text-slate-500 border-slate-200",
  },
  sent: {
    label: "Sent",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
  },
  accepted: {
    label: "Accepted",
    badgeClass: "bg-green-50 text-green-700 border-green-200",
  },
  paid: {
    label: "Paid",
    badgeClass: "bg-green-50 text-green-700 border-green-200",
  },
};

export type LeadChannel =
  | "email"
  | "upwork"
  | "linkedin"
  | "freelancer"
  | "referral"
  | "inbound"
  | "other";

export const LEAD_CHANNELS: { value: LeadChannel; label: string }[] = [
  { value: "inbound", label: "Public page (inbound)" },
  { value: "email", label: "Cold email" },
  { value: "upwork", label: "Upwork" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "freelancer", label: "Freelancer.com" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
];

export type LeadStatus = "new" | "contacted" | "meeting" | "converted" | "declined";

export const LEAD_STATUSES: { value: LeadStatus; label: string; badgeClass: string }[] = [
  { value: "new", label: "New", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "contacted", label: "Contacted", badgeClass: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "meeting", label: "Meeting booked", badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { value: "converted", label: "Converted", badgeClass: "bg-green-50 text-green-700 border-green-200" },
  { value: "declined", label: "Declined", badgeClass: "bg-slate-100 text-slate-500 border-slate-200" },
];

export type Lead = {
  id: string;
  business_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  channel: LeadChannel;
  follow_up_date: string | null;
  status: LeadStatus;
  business_line?: string | null;
  created_at: string;
};

export const BUSINESS_TYPES = [
  { value: "design", label: "Design & Creative" },
  { value: "development", label: "Web & Software Development" },
  { value: "writing", label: "Writing & Content" },
  { value: "consulting", label: "Consulting & Coaching" },
  { value: "marketing", label: "Marketing & Social Media" },
  { value: "photography", label: "Photography & Video" },
  { value: "other", label: "Other" },
] as const;

export const PRIMARY_GOALS = [
  { value: "organized", label: "Get organized" },
  { value: "followups", label: "Follow up with clients" },
  { value: "money", label: "Track my money" },
  { value: "all", label: "All of it" },
] as const;
