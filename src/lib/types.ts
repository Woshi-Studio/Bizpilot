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
