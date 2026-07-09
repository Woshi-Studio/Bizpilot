import { requireUserAndBusiness } from "@/lib/data";
import { formatMoney } from "@/lib/types";
import {
  DECISION_TYPES,
  RISK_META,
  type RiskLevel,
} from "@/lib/decision-guard";
import DecisionWizard from "./decision-wizard";
import { deleteDecision, setDecisionOutcome } from "./actions";

export const metadata = { title: "Decision Guard" };

type DecisionRow = {
  id: string;
  decision_type: string;
  title: string;
  amount: number | null;
  risk_level: RiskLevel;
  risk_score: number;
  outcome: string | null;
  created_at: string;
};

const OUTCOME_META: Record<
  string,
  { label: string; badgeClass: string }
> = {
  good: { label: "✅ Went well", badgeClass: "bg-green-50 text-green-700" },
  bad: { label: "❌ Went badly", badgeClass: "bg-red-50 text-red-700" },
  mixed: { label: "➖ Mixed", badgeClass: "bg-amber-50 text-amber-700" },
};

export default async function DecisionsPage() {
  const { supabase, business } = await requireUserAndBusiness();
  const isPremium = (business as { plan?: string }).plan === "premium";

  const { data } = await supabase
    .from("decisions")
    .select(
      "id, decision_type, title, amount, risk_level, risk_score, outcome, created_at"
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const decisions = (data ?? []) as DecisionRow[];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">Decision Guard</h1>
      <p className="mt-1 text-sm text-slate-500">
        Before you say yes — a gut check that catches expensive mistakes, and
        learns your business as you use it.
      </p>

      <div className="mt-6">
        <DecisionWizard isPremium={isPremium} />
      </div>

      {decisions.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-slate-800">
            Past decisions
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Mark how each one turned out — it teaches your AI advisor what
            works for your business.
          </p>
          <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {decisions.map((d) => {
              const meta = RISK_META[d.risk_level] ?? RISK_META.low;
              const typeMeta = DECISION_TYPES.find(
                (t) => t.value === d.decision_type
              );
              const outcomeMeta = d.outcome
                ? OUTCOME_META[d.outcome]
                : null;
              return (
                <li key={d.id} className="group px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{typeMeta?.emoji ?? "❓"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {d.title}
                      </p>
                      <p className="text-xs text-slate-400">
                        {typeMeta?.label ?? d.decision_type}
                        {d.amount
                          ? ` · ${formatMoney(Number(d.amount), business.currency)}`
                          : ""}{" "}
                        · {new Date(d.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`inline-block shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.badgeClass}`}
                    >
                      {meta.label}
                    </span>
                    <form action={deleteDecision}>
                      <input type="hidden" name="id" value={d.id} />
                      <button
                        type="submit"
                        aria-label="Delete decision"
                        className="text-slate-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                      >
                        &times;
                      </button>
                    </form>
                  </div>

                  {/* Outcome tracking */}
                  <div className="mt-2 flex items-center gap-2 pl-9">
                    {outcomeMeta ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${outcomeMeta.badgeClass}`}
                      >
                        {outcomeMeta.label}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">
                        How did it go?
                      </span>
                    )}
                    {[
                      { v: "good", label: "Good call" },
                      { v: "bad", label: "Bad call" },
                      { v: "mixed", label: "Mixed" },
                    ].map((o) => (
                      <form key={o.v} action={setDecisionOutcome}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="outcome" value={o.v} />
                        <button
                          type="submit"
                          className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                            d.outcome === o.v
                              ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-600"
                          }`}
                        >
                          {o.label}
                        </button>
                      </form>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
