import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import { signOut } from "@/app/(auth)/actions";

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

  const [{ data: profile }, { data: business }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("businesses")
      .select("id, name, onboarding_completed")
      .eq("owner_id", user.id)
      .eq("onboarding_completed", true)
      .maybeSingle(),
  ]);

  if (!business) {
    redirect("/onboarding");
  }

  return (
    <AppShell
      businessName={business.name}
      userName={profile?.full_name ?? user.email ?? ""}
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  );
}
