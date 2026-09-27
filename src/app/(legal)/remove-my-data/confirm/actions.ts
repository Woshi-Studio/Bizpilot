"use server";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConfirmState = { status?: "done" | "expired" | "unknown" | "error"; companies?: number; contacts?: number };

// The person pressed Confirm on the page their email link opened. A
// button (not the link itself) does the removal, so email scanners that
// open links can't trigger it.
export async function confirmRemoval(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const token = String(formData.get("t") ?? "");
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return { status: "unknown" };
  const db = createAdminClient();
  if (!db) return { status: "error" };
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await db.rpc("removal_request_verify", { p_token_hash: tokenHash });
  if (error || !data) {
    console.error("removal_request_verify failed:", error?.message ?? "no data");
    return { status: "error" };
  }
  const r = data as { status?: string; companies?: number; contacts?: number };
  if (r.status === "done") return { status: "done", companies: r.companies ?? 0, contacts: r.contacts ?? 0 };
  return { status: r.status === "expired" ? "expired" : "unknown" };
}
