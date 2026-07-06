import Link from "next/link";
import { requireUserAndBusiness } from "@/lib/data";
import { LaunchpadIntake, AiUpgradeButton } from "./launchpad-form";

export const metadata = { title: "Launchpad" };

// Renders the plan's markdown-ish content with lightweight styling —
// headings and bullets only, no external renderer needed.
function PlanContent({ content }: { content: string }) {
  return (
    <div className="space-y-1">
      {content.split("\n").map((line, i) => {
        if (line.startsWith("# ")) {
          return (
            <h2 key={i} className="pt-2 text-xl font-bold text-slate-900">
              {line.slice(2)}
            </h2>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <h3 key={i} className="pt-4 text-sm font-semibold text-slate-800">
              {line.slice(3)}
            </h3>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <p key={i} className="flex gap-2 text-sm leading-6 text-slate-600">
              <span className="text-indigo-400">•</span>
              <span>{line.slice(2)}</span>
            </p>
          );
        }
        if (line.trim() === "") {
          return null;
        }
        return (
          <p key={i} className="text-sm leading-6 text-slate-600">
            {line}
          </p>
        );
      })}
    </div>
  );
}

export default async function LaunchpadPage() {
  const { supabase, business } = await requireUserAndBusiness();

  const [{ data: plan, error: planError }, { count: customerCount }, { data: incomeTx }] =
    await Promise.all([
      supabase
        .from("business_plans")
        .select("content, ai_generated, created_at")
        .eq("business_id", business.id)
        .maybeSingle(),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id),
      supabase
        .from("transactions")
        .select("id")
        .eq("business_id", business.id)
        .eq("type", "income")
        .limit(1),
    ]);

  const graduated =
    !!plan && (customerCount ?? 0) > 0 && (incomeTx ?? []).length > 0;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">🚀 Launchpad</h1>
      <p className="mt-1 text-sm text-slate-500">
        From &quot;I have an idea&quot; to a running business — with a plan and
        a roadmap that live inside your app.
      </p>

      {planError ? (
        <p className="mt-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Launchpad isn&apos;t set up yet — the database migration for this
          feature hasn&apos;t been run.
        </p>
      ) : !plan ? (
        <div className="mt-6">
          <LaunchpadIntake />
        </div>
      ) : (
        <>
          {graduated && (
            <div className="mt-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4">
              <p className="text-sm font-semibold text-green-800">
                🎉 You&apos;re live!
              </p>
              <p className="mt-1 text-sm text-green-700">
                You have real customers and real income — that&apos;s a
                running business. Keep the plan below as your compass, and
                check your{" "}
                <Link href="/tasks" className="font-medium underline">
                  roadmap tasks
                </Link>{" "}
                for what&apos;s next.
              </p>
            </div>
          )}

          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Your business plan{" "}
                {plan.ai_generated ? "· AI-personalized" : "· starter version"}
              </p>
              {!plan.ai_generated && <AiUpgradeButton />}
            </div>
            <div className="mt-4">
              <PlanContent content={plan.content} />
            </div>
          </div>

          <p className="mt-4 text-sm text-slate-500">
            Your 18-step roadmap lives in{" "}
            <Link
              href="/tasks"
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Tasks
            </Link>{" "}
            with real deadlines — the first ones are due this week.
          </p>
        </>
      )}
    </div>
  );
}
