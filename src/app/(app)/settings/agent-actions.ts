"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerBusiness } from "@/lib/ai-quota";
import { canUseAssistant } from "@/lib/plan-limits";
import {
  generateKey,
  getPepper,
  hashKey,
  isAgentScope,
} from "@/lib/agent/keys";

export type CreateKeyState = {
  error?: string;
  // The full key, returned once so the page can show it. Never stored.
  newKey?: string;
  newKeyName?: string;
};

const MAX_ACTIVE_KEYS = 10;

// Keys are created only here: the owner is checked with their own session,
// then the service role inserts (users have no insert right on api_keys).
export async function createApiKey(
  _prev: CreateKeyState,
  formData: FormData
): Promise<CreateKeyState> {
  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim();
  const scopes = [...new Set(formData.getAll("scopes").map(String))];

  if (!name || name.length > 60) {
    return { error: "Give the key a name (up to 60 characters)." };
  }
  if (!scopes.length || !scopes.every(isAgentScope)) {
    return { error: "Tick at least one thing this key may do." };
  }

  const { supabase, business } = await requireUserAndBusiness();

  if (!canUseAssistant(business)) {
    return { error: "Assistant access comes with Hustle and Boss. Upgrade in Settings → Plan." };
  }

  const pepper = getPepper();
  const admin = createAdminClient();
  if (!pepper || !admin) {
    return {
      error: isOwnerBusiness(business.id)
        ? "Assistant access isn't switched on yet (AGENT_KEY_PEPPER or the service key is missing)."
        : "Assistant access isn't ready yet. Please try again later.",
    };
  }

  const { count, error: countError } = await supabase
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id)
    .is("revoked_at", null);
  if (countError) {
    return {
      error: isOwnerBusiness(business.id)
        ? "Run migration 0016 first."
        : "Assistant access isn't ready yet. Please try again later.",
    };
  }
  if ((count ?? 0) >= MAX_ACTIVE_KEYS) {
    return { error: `You can have ${MAX_ACTIVE_KEYS} active keys. Revoke one first.` };
  }

  const { key, prefix } = generateKey();
  const { error } = await admin.from("api_keys").insert({
    business_id: business.id,
    name,
    key_prefix: prefix,
    key_hash: hashKey(key, pepper),
    scopes,
  });
  if (error) {
    return { error: "Could not create the key. Try again." };
  }

  revalidatePath("/settings");
  return { newKey: key, newKeyName: name };
}

// Revoking goes through the owner's own session: RLS only lets them set
// revoked_at on their own business's keys.
export async function revokeApiKey(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  const { supabase, business } = await requireUserAndBusiness();
  await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("business_id", business.id)
    .is("revoked_at", null);

  revalidatePath("/settings");
}
