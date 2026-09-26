"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import { SERVICE_UNITS } from "@/lib/types";
import { normalizeLine } from "@/lib/business-lines";

export type ServiceFormState = {
  error?: string;
  success?: string;
};

export async function createService(
  _prevState: ServiceFormState,
  formData: FormData
): Promise<ServiceFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const rate = Number(formData.get("rate") ?? 0);
  const unit = String(formData.get("unit") ?? "project").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) {
    return { error: "Service name is required." };
  }
  if (!Number.isFinite(rate) || rate < 0) {
    return { error: "Rate must be a valid number." };
  }

  const { supabase, business } = await requireUserAndBusiness();

  const { error } = await supabase.from("services").insert({
    business_id: business.id,
    name,
    rate,
    unit: SERVICE_UNITS.some((u) => u.value === unit) ? unit : "project",
    description: description || null,
    business_line: normalizeLine(formData.get("business_line")),
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/services");
  return { success: "Service added." };
}

export async function deleteService(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  await supabase
    .from("services")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id);

  revalidatePath("/services");
}
