"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SettingsState = {
  error?: string;
  success?: string;
};

export async function updateSettings(
  _prevState: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const businessType = String(formData.get("business_type") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const currency = String(formData.get("currency") ?? "USD").trim();

  if (!fullName || !businessName || !businessType) {
    return { error: "Name, business name, and business type are required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (profileError) {
    return { error: profileError.message };
  }

  const { error: businessError } = await supabase
    .from("businesses")
    .update({
      name: businessName,
      business_type: businessType,
      description: description || null,
      currency,
    })
    .eq("owner_id", user.id);

  if (businessError) {
    return { error: businessError.message };
  }

  revalidatePath("/", "layout");
  return { success: "Settings saved." };
}
