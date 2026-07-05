import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsForm from "./settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
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
      .select("name, business_type, description, currency")
      .eq("owner_id", user.id)
      .maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage your profile and business details.
      </p>

      <div className="mt-8">
        <SettingsForm
          defaults={{
            fullName: profile?.full_name ?? "",
            email: user.email ?? "",
            businessName: business?.name ?? "",
            businessType: business?.business_type ?? "other",
            description: business?.description ?? "",
            currency: business?.currency ?? "USD",
          }}
        />
      </div>
    </div>
  );
}
