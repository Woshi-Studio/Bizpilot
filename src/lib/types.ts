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
  created_at: string;
  updated_at: string;
};

export type CustomerNote = {
  id: string;
  customer_id: string;
  body: string;
  created_at: string;
};

export type Task = {
  id: string;
  business_id: string;
  customer_id: string | null;
  title: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
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
