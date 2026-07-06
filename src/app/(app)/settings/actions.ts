"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserAndBusiness } from "@/lib/data";

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

export async function updatePublicPage(
  _prevState: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const enabled = formData.get("public_page_enabled") === "on";
  const slugRaw = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  const tagline = String(formData.get("tagline") ?? "").trim();
  const services = String(formData.get("services") ?? "").trim();

  if (enabled && !/^[a-z0-9-]{3,40}$/.test(slugRaw)) {
    return {
      error:
        "The page address must be 3–40 characters: lowercase letters, numbers, and dashes only.",
    };
  }

  const { supabase, business } = await requireUserAndBusiness();

  const { error } = await supabase
    .from("businesses")
    .update({
      public_page_enabled: enabled,
      slug: slugRaw || null,
      tagline: tagline || null,
      services: services || null,
    })
    .eq("id", business.id);

  if (error) {
    if (error.code === "23505") {
      return { error: "That page address is taken — try another one." };
    }
    return { error: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/leads");
  return { success: "Public page saved." };
}
