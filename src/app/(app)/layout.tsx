import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import { signOut } from "@/app/(auth)/actions";
import Athena from "@/components/athena";
import Tour from "@/components/tour";
import { ThemeSync } from "@/components/theme";
import { isOwnerBusiness } from "@/lib/ai-quota";
import { ensureUnlimitedFlag } from "@/lib/plan-limits";
import { effectiveTheme, normalizePlanValue } from "@/lib/plans";

type ProfileRow = {
  full_name: string | null;
  theme?: string | null;
  tour_done_at?: string | null;
};

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [profileResult, { data: business }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, theme, tour_done_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("businesses")
      .select("id, name, plan, onboarding_completed")
      .eq("owner_id", user.id)
      .eq("onboarding_completed", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!business) {
    redirect("/onboarding");
  }

  // Before migration 0017 there are no theme / tour columns.
  let profile = profileResult.data as ProfileRow | null;
  const migrated = !profileResult.error;
  if (!migrated) {
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    profile = data as ProfileRow | null;
  }

  const unlimited = isOwnerBusiness(business.id);
  if (unlimited) await ensureUnlimitedFlag(business.id);
  const plan = normalizePlanValue(business.plan);
  const serverTheme = effectiveTheme(profile?.theme, plan, unlimited);

  const userName = profile?.full_name ?? user.email ?? "";

  return (
    <AppShell
      businessName={business.name}
      userName={userName}
      signOutAction={signOut}
      athena={<Athena firstName={userName.split(/[\s@]/)[0] || "there"} />}
      extras={
        <>
          <ThemeSync serverTheme={serverTheme} paidOk={unlimited || plan !== "free"} />
          <Tour autoStart={migrated && !!profile && !profile.tour_done_at} />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
