import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingForm from "./onboarding-form";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("id, onboarding_completed")
    .eq("owner_id", user.id)
    .eq("onboarding_completed", true)
    .maybeSingle();

  if (business) {
    redirect("/dashboard");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-indigo-600">
          BizPilot
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Let&apos;s set up your business — takes less than a minute.
        </p>
      </div>
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <OnboardingForm initialName={profile?.full_name ?? ""} />
      </div>
    </div>
  );
}
