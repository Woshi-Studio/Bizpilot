"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isLeadAlertMode } from "@/lib/lead-alerts";

export type LeadAlertState = { error?: string; success?: string };

// Settings -> Lead alerts. The choice lives on the user (user_metadata).
export async function saveLeadAlerts(_prev: LeadAlertState, formData: FormData): Promise<LeadAlertState> {
  const mode = formData.get("lead_alerts");
  if (!isLeadAlertMode(mode)) return { error: "Pick one of the options." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { lead_alerts: mode } });
  if (error) return { error: "Couldn't save. Please try again." };
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { success: "Saved." };
}
