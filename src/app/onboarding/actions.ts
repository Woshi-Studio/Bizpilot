"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OnboardingState = {
  error?: string;
};

export async function completeOnboarding(
  _prevState: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const businessType = String(formData.get("business_type") ?? "").trim();
  const primaryGoal = String(formData.get("primary_goal") ?? "").trim();

  if (!fullName || !businessName || !businessType || !primaryGoal) {
    return { error: "Please complete all steps before finishing." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (profileError) {
    return { error: profileError.message };
  }

  const { error: businessError } = await supabase.from("businesses").insert({
    owner_id: user.id,
    name: businessName,
    business_type: businessType,
    primary_goal: primaryGoal,
    onboarding_completed: true,
  });

  if (businessError) {
    return { error: businessError.message };
  }

  redirect("/dashboard");
}
