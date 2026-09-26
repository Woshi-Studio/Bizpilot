"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import type { SavedTemplate } from "@/lib/templates";

export type TemplateState = { error?: string; success?: string; savedAt?: number };

// The user's saved templates / changes. [] before migration 0017.
export async function listTemplates(): Promise<SavedTemplate[]> {
  const { supabase, business } = await requireUserAndBusiness();
  const { data, error } = await supabase
    .from("message_templates")
    .select("id, key, lang, name, subject, body")
    .eq("business_id", business.id)
    .order("updated_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as SavedTemplate[];
}

// Saves a change to a built-in template, or a new / changed own template.
export async function saveTemplate(_prev: TemplateState, formData: FormData): Promise<TemplateState> {
  const lang = formData.get("lang") === "fr" ? "fr" : "en";
  let key = String(formData.get("key") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const subject = String(formData.get("subject") ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  const body = String(formData.get("body") ?? "").trim().slice(0, 5000);
  if (!name) return { error: "Give the template a name." };
  if (!body) return { error: "Write the message." };
  if (!key) key = `custom-${crypto.randomUUID().slice(0, 8)}`;
  if (!/^[a-z0-9_-]{1,60}$/.test(key)) return { error: "Bad template." };

  const { supabase, business } = await requireUserAndBusiness();
  const { error } = await supabase
    .from("message_templates")
    .upsert(
      { business_id: business.id, key, lang, name, subject, body, updated_at: new Date().toISOString() },
      { onConflict: "business_id,key,lang" }
    );
  if (error) {
    return { error: /message_templates/.test(error.message) ? "Templates need a quick database update (migration 0017)." : error.message };
  }
  revalidatePath("/settings");
  return { success: "Saved.", savedAt: Date.now() };
}

// Deletes an own template, or puts a built-in back to how it came.
export async function resetTemplate(formData: FormData) {
  const key = String(formData.get("key") ?? "");
  const lang = formData.get("lang") === "fr" ? "fr" : "en";
  if (!key) return;
  const { supabase, business } = await requireUserAndBusiness();
  await supabase.from("message_templates").delete().eq("business_id", business.id).eq("key", key).eq("lang", lang);
  revalidatePath("/settings");
}
