import { createClient } from "@supabase/supabase-js";

// Service-role client. It skips row-level security, so use it ONLY on the
// server, ONLY for writes a user must not be able to make themselves
// (plan, stripe_customer_id), and only after checking who owns the row.
// Returns null when the service key is not configured.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
