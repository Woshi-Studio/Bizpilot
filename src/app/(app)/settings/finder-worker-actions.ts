"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerBusiness } from "@/lib/ai-quota";
import { getPepper } from "@/lib/agent/keys";
import { generateWorkerKey, hashWorkerKey } from "@/lib/finder-worker";

// Lead Finder worker keys (Zilla on the owner's PC). OWNER ONLY: the
// finder_workers table has no user access at all, so every read and
// write here uses the service role, after checking the signed-in user's
// business is one of OWNER_BUSINESS_IDS.

export type WorkerKeyState = { error?: string; newKey?: string; newKeyName?: string };

const MAX_ACTIVE = 3;

export async function createWorkerKey(_prev: WorkerKeyState, formData: FormData): Promise<WorkerKeyState> {
  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim();
  if (!name || name.length > 60) return { error: "Give the key a name (up to 60 characters)." };

  const { business } = await requireUserAndBusiness();
  if (!isOwnerBusiness(business.id)) return { error: "Only the owner can make worker keys." };

  const pepper = getPepper();
  const admin = createAdminClient();
  if (!pepper || !admin) return { error: "AGENT_KEY_PEPPER or the service key is missing." };

  const { count, error: countError } = await admin
    .from("finder_workers")
    .select("id", { count: "exact", head: true })
    .is("revoked_at", null);
  if (countError) return { error: "Run migration 0019 first." };
  if ((count ?? 0) >= MAX_ACTIVE) return { error: `You can have ${MAX_ACTIVE} active worker keys. Revoke one first.` };

  const { key, prefix } = generateWorkerKey();
  const { error } = await admin.from("finder_workers").insert({
    business_id: business.id,
    name,
    key_prefix: prefix,
    key_hash: hashWorkerKey(key, pepper),
  });
  if (error) return { error: "Could not create the key. Try again." };

  await admin.from("finder_audit").insert({
    business_id: business.id,
    actor: "user",
    action: "worker_key_created",
    detail: { name, prefix },
  });
  revalidatePath("/settings");
  return { newKey: key, newKeyName: name };
}

export async function revokeWorkerKey(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const { business } = await requireUserAndBusiness();
  if (!isOwnerBusiness(business.id)) return;
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("finder_workers").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null);
  await admin.from("finder_audit").insert({
    business_id: business.id,
    actor: "user",
    action: "worker_key_revoked",
    detail: { id },
  });
  revalidatePath("/settings");
}
