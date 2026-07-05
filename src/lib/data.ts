import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Business } from "@/lib/types";

// Resolves the logged-in user and their onboarded business, redirecting
// away when either is missing. Use at the top of protected pages/actions.
export async function requireUserAndBusiness() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .eq("onboarding_completed", true)
    .maybeSingle();

  if (!business) {
    redirect("/onboarding");
  }

  return { supabase, user, business: business as Business };
}
