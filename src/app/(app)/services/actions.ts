"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness, isMissingColumnError } from "@/lib/data";
import { SERVICE_UNITS, type Business } from "@/lib/types";
import { normalizeLine } from "@/lib/business-lines";
import { checkLineLimit, checkPlanLimit, planLimitFromError } from "@/lib/plan-limits";
import { SERVICE_IMAGE_BUCKET } from "@/lib/services-data";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ServiceFormState = {
  error?: string;
  success?: string;
  upgrade?: boolean;
  savedAt?: number;
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES: Record<string, { mime: string; magic: number[] }> = {
  jpg: { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  jpeg: { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  png: { mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
  webp: { mime: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] },
};

function readService(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  const rate = Number(formData.get("rate") ?? 0);
  const unit = String(formData.get("unit") ?? "project").trim();
  const description = String(formData.get("description") ?? "").trim().slice(0, 1000);
  if (!name) return { error: "Service name is required." };
  if (!Number.isFinite(rate) || rate < 0) return { error: "Rate must be a valid number." };
  return {
    name,
    rate: Math.round(rate * 100) / 100,
    unit: SERVICE_UNITS.some((u) => u.value === unit) ? unit : "project",
    description: description || null,
    business_line: normalizeLine(formData.get("business_line")),
  };
}

// Checks and uploads the optional picture. Returns its path, null for
// none, or an error.
async function uploadImage(
  supabase: SupabaseClient,
  business: Business,
  file: FormDataEntryValue | null
): Promise<{ path: string | null } | { error: string; upgrade?: boolean }> {
  if (!(file instanceof File) || file.size === 0) return { path: null };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Pictures can be up to 2 MB." };
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const type = IMAGE_TYPES[ext];
  if (!type || (file.type && file.type !== type.mime)) {
    return { error: "Pictures must be JPG, PNG or WEBP." };
  }
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!type.magic.every((b, i) => head[i] === b)) {
    return { error: "That picture looks damaged." };
  }
  const limited = await checkPlanLimit(supabase, business, "storage", { bytes: file.size });
  if (limited) return limited;
  const path = `${business.id}/${crypto.randomUUID()}.${ext === "jpeg" ? "jpg" : ext}`;
  const { error } = await supabase.storage
    .from(SERVICE_IMAGE_BUCKET)
    .upload(path, file, { contentType: type.mime, upsert: false });
  if (error) return { error: "The picture didn't upload. (Pictures need migration 0017.)" };
  return { path };
}

export async function createService(
  _prevState: ServiceFormState,
  formData: FormData
): Promise<ServiceFormState> {
  const values = readService(formData);
  if ("error" in values) return values;

  const { supabase, business } = await requireUserAndBusiness();

  const limited = await checkLineLimit(supabase, business, values.business_line);
  if (limited) return limited;

  const image = await uploadImage(supabase, business, formData.get("image"));
  if ("error" in image) return image;

  const row = { ...values, business_id: business.id, ...(image.path ? { image_path: image.path } : {}) };
  let { error } = await supabase.from("services").insert(row);
  if (isMissingColumnError(error)) {
    ({ error } = await supabase.from("services").insert({ ...values, business_id: business.id }));
  }

  if (error) {
    if (image.path) await supabase.storage.from(SERVICE_IMAGE_BUCKET).remove([image.path]);
    return planLimitFromError(error, business) ?? { error: error.message };
  }

  revalidatePath("/services");
  return { success: `${values.name} added.`, savedAt: Date.now() };
}

export async function updateService(
  _prevState: ServiceFormState,
  formData: FormData
): Promise<ServiceFormState> {
  const id = String(formData.get("id") ?? "");
  const values = readService(formData);
  if (!id) return { error: "Missing service." };
  if ("error" in values) return values;

  const { supabase, business } = await requireUserAndBusiness();
  const { data: before } = await supabase
    .from("services")
    .select("*")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!before) return { error: "Service not found." };

  if (values.business_line && values.business_line !== before.business_line) {
    const limited = await checkLineLimit(supabase, business, values.business_line);
    if (limited) return limited;
  }

  const image = await uploadImage(supabase, business, formData.get("image"));
  if ("error" in image) return image;
  const removeImage = formData.get("remove_image") === "on";
  const oldPath = (before as { image_path?: string | null }).image_path ?? null;

  const patch: Record<string, unknown> = { ...values };
  if (image.path) patch.image_path = image.path;
  else if (removeImage) patch.image_path = null;

  const { error } = await supabase.from("services").update(patch).eq("id", id).eq("business_id", business.id);
  if (error) {
    if (image.path) await supabase.storage.from(SERVICE_IMAGE_BUCKET).remove([image.path]);
    return planLimitFromError(error, business) ?? { error: error.message };
  }
  if (oldPath && (image.path || removeImage)) {
    await supabase.storage.from(SERVICE_IMAGE_BUCKET).remove([oldPath]);
  }

  revalidatePath("/services");
  return { success: "Saved.", savedAt: Date.now() };
}

// Makes a copy ("… (copy)") to tweak, without the picture.
export async function duplicateService(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const { supabase, business } = await requireUserAndBusiness();
  const { data: s } = await supabase
    .from("services")
    .select("name, rate, unit, description, business_line")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!s) return;
  await supabase.from("services").insert({
    ...s,
    name: `${s.name} (copy)`.slice(0, 200),
    business_id: business.id,
  });
  revalidatePath("/services");
}

export async function deleteService(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  const { data: s } = await supabase
    .from("services")
    .select("*")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();

  await supabase
    .from("services")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id);

  const path = (s as { image_path?: string | null } | null)?.image_path;
  if (path) await supabase.storage.from(SERVICE_IMAGE_BUCKET).remove([path]);

  revalidatePath("/services");
}
