// Server helpers for services (with their pictures) and per-line
// invoice settings. SERVER ONLY.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PickableService } from "@/components/service-picker";
import type { LineSettings } from "@/lib/line-settings";

export const SERVICE_IMAGE_BUCKET = "service-images";

// Services for pickers, each with a short-lived picture link (1 hour).
export async function loadPickableServices(
  supabase: SupabaseClient,
  businessId: string
): Promise<(PickableService & { image_path?: string | null })[]> {
  const { data } = await supabase
    .from("services")
    .select("*")
    .eq("business_id", businessId)
    .order("name");
  const rows = (data ?? []) as (PickableService & { image_path?: string | null })[];
  return withImageUrls(supabase, rows);
}

export async function withImageUrls<T extends { image_path?: string | null }>(
  supabase: SupabaseClient,
  rows: T[]
): Promise<(T & { image_url: string | null })[]> {
  const paths = rows.map((r) => r.image_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage
      .from(SERVICE_IMAGE_BUCKET)
      .createSignedUrls(paths, 3600);
    for (const r of data ?? []) {
      if (r.path && r.signedUrl && !r.error) urls.set(r.path, r.signedUrl);
    }
  }
  return rows.map((r) => ({ ...r, image_url: r.image_path ? urls.get(r.image_path) ?? null : null }));
}

// Saved per-line settings (0017). [] before the migration.
export async function loadLineSettings(
  supabase: SupabaseClient,
  businessId: string
): Promise<Omit<LineSettings, "saved">[]> {
  const { data, error } = await supabase
    .from("business_line_settings")
    .select("line, currency, tax_label, tax_rate, due_days")
    .eq("business_id", businessId);
  if (error) return [];
  return (data ?? []) as Omit<LineSettings, "saved">[];
}
