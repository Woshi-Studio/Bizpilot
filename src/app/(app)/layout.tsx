import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import { signOut } from "@/app/(auth)/actions";
import Athena from "@/components/athena";

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
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!business) {
    redirect("/onboarding");
  }

  const userName = profile?.full_name ?? user.email ?? "";

  return (
    <AppShell
      businessName={business.name}
      userName={userName}
      signOutAction={signOut}
      athena={<Athena firstName={userName.split(/[\s@]/)[0] || "there"} />}
    >
      {children}
    </AppShell>
  );
}
