"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUserAndBusiness, isMissingColumnError } from "@/lib/data";
import { normalizeLine } from "@/lib/business-lines";
import { TAX_PRESETS, isCurrency } from "@/lib/line-settings";

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

export async function addPaymentMethod(
  _prevState: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const label = String(formData.get("label") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();

  if (!label || !value) {
    return { error: "Both a label and a value are required." };
  }

  const { supabase, business } = await requireUserAndBusiness();

  const { count } = await supabase
    .from("payment_methods")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id);

  const { error } = await supabase.from("payment_methods").insert({
    business_id: business.id,
    label,
    value,
    position: count ?? 0,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/invoices/new");
  return { success: "Payment method added." };
}

export async function deletePaymentMethod(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  await supabase
    .from("payment_methods")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id);

  revalidatePath("/settings");
  revalidatePath("/invoices/new");
}

// Settings > Business lines: currency, tax and days until due for one
// line (business_line_settings, migration 0017).
export async function saveLineSettings(
  _prevState: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const line = normalizeLine(formData.get("line"));
  const currency = String(formData.get("currency") ?? "");
  const tax = String(formData.get("tax") ?? "none");
  const dueDays = Number(formData.get("due_days") ?? 14);

  if (!line) return { error: "Pick a business." };
  if (!isCurrency(currency)) return { error: "Pick a currency." };
  if (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 120) {
    return { error: "Days until due must be 0 to 120." };
  }
  const preset = TAX_PRESETS.find((t) => `${t.label}|${t.rate}` === tax);

  const { supabase, business } = await requireUserAndBusiness();
  const { error } = await supabase.from("business_line_settings").upsert(
    {
      business_id: business.id,
      line,
      currency,
      tax_label: preset?.label ?? null,
      tax_rate: preset?.rate ?? 0,
      due_days: dueDays,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id,line" }
  );
  if (error) {
    return {
      error: isMissingColumnError(error) || /business_line_settings/.test(error.message)
        ? "This needs a quick database update first (migration 0017)."
        : error.message,
    };
  }
  revalidatePath("/settings");
  revalidatePath("/invoices/new");
  return { success: `${line} saved.` };
}
