import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const PLACEHOLDER_CARDS = [
  {
    title: "Today's Tasks",
    empty: "No tasks yet.",
    coming: "Task management is coming in the next update — you'll see your daily action list here.",
  },
  {
    title: "Customer Follow-ups",
    empty: "No follow-ups due.",
    coming: "Your customer hub is coming soon — follow-up reminders will show up here so you never forget a client.",
  },
  {
    title: "Money Snapshot",
    empty: "No income or expenses logged.",
    coming: "Simple money tracking is on the way — monthly totals and profit estimates will live here.",
  },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user!.id)
    .maybeSingle();

  const firstName = (profile?.full_name ?? "").split(" ")[0] || "there";

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-900">
        {greeting()}, {firstName} 👋
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Here&apos;s what&apos;s happening in your business today.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLACEHOLDER_CARDS.map((card) => (
          <div
            key={card.title}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-sm font-semibold text-slate-800">
              {card.title}
            </h2>
            <p className="mt-3 text-sm font-medium text-slate-600">
              {card.empty}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              {card.coming}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
