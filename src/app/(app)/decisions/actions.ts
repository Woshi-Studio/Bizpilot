"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import { checkAiQuota, recordAiUse } from "@/lib/ai-quota";
import { aiConfigured, createAiClient, AI_MODEL } from "@/lib/ai";
import {
  scoreDecision,
  QUESTIONS,
  DECISION_TYPES,
  type DecisionType,
} from "@/lib/decision-guard";
import { formatMoney } from "@/lib/types";

export type SaveDecisionState = {
  error?: string;
  success?: string;
};

export type AdviceState = {
  error?: string;
  advice?: string;
  locked?: boolean; // free user hit the Pro wall
};

export async function saveDecision(
  _prevState: SaveDecisionState,
  formData: FormData
): Promise<SaveDecisionState> {
  const type = String(formData.get("decision_type") ?? "") as DecisionType;
  const title = String(formData.get("title") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").replace(",", ".");
  const answersRaw = String(formData.get("answers") ?? "{}");

  if (!QUESTIONS[type]) {
    return { error: "Unknown decision type." };
  }
  if (!title) {
    return { error: "Give the decision a short title." };
  }

  let answers: Record<string, string>;
  try {
    answers = JSON.parse(answersRaw);
  } catch {
    return { error: "Invalid answers." };
  }

  // Re-score server-side so stored results can't be tampered with
  const result = scoreDecision(type, answers);
  const amount = amountRaw ? Number(amountRaw) : null;

  const { supabase, business } = await requireUserAndBusiness();

  const { error } = await supabase.from("decisions").insert({
    business_id: business.id,
    decision_type: type,
    title,
    amount: amount && !Number.isNaN(amount) && amount > 0 ? amount : null,
    answers,
    risk_score: result.score,
    risk_level: result.level,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/decisions");
  return { success: "Saved to your decision history." };
}

export async function deleteDecision(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, business } = await requireUserAndBusiness();

  await supabase
    .from("decisions")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id);

  revalidatePath("/decisions");
}

// Records how a past decision actually turned out — this is what lets
// Decision Guard learn and reference outcomes later.
export async function setDecisionOutcome(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const outcome = String(formData.get("outcome") ?? "").trim();
  if (!id || !["good", "bad", "mixed"].includes(outcome)) return;

  const { supabase, business } = await requireUserAndBusiness();

  await supabase
    .from("decisions")
    .update({ outcome })
    .eq("id", id)
    .eq("business_id", business.id);

  revalidatePath("/decisions");
}

const OUTCOME_LABEL: Record<string, string> = {
  good: "turned out well",
  bad: "turned out badly",
  mixed: "was mixed",
};

// Pro-only: personalized AI advice grounded in the owner's real numbers
// and the outcomes of their past decisions of the same kind.
export async function getDecisionAdvice(
  _prevState: AdviceState,
  formData: FormData
): Promise<AdviceState> {
  const type = String(formData.get("decision_type") ?? "") as DecisionType;
  const title = String(formData.get("title") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").replace(",", ".");
  const answersRaw = String(formData.get("answers") ?? "{}");

  if (!QUESTIONS[type]) {
    return { error: "Unknown decision type." };
  }

  let answers: Record<string, string>;
  try {
    answers = JSON.parse(answersRaw);
  } catch {
    return { error: "Invalid answers." };
  }

  const { supabase, business } = await requireUserAndBusiness();

  // Pro gate — the AI advisor is a premium feature
  if ((business as { plan?: string }).plan !== "premium") {
    return { locked: true };
  }

  if (!aiConfigured()) {
    return {
      error:
        "AI is not set up yet — the ANTHROPIC_API_KEY is missing from .env.local.",
    };
  }

  const quota = await checkAiQuota(supabase, business);
  if (!quota.ok) {
    return {
      error: `You've used all ${quota.limit} AI generations included this month.`,
    };
  }

  const result = scoreDecision(type, answers);
  const typeLabel =
    DECISION_TYPES.find((t) => t.value === type)?.label ?? type;
  const cur = business.currency;

  // Real business context (last ~90 days)
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const [{ data: recentTx }, { count: customerCount }, { data: past }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("type, amount")
        .eq("business_id", business.id)
        .gte("date", since.toISOString().slice(0, 10)),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id),
      supabase
        .from("decisions")
        .select("title, risk_level, amount, outcome, created_at")
        .eq("business_id", business.id)
        .eq("decision_type", type)
        .not("outcome", "is", null)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

  const income = (recentTx ?? [])
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const expenses = (recentTx ?? [])
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);
  const marginPct =
    income > 0 ? Math.round(((income - expenses) / income) * 100) : null;

  const history =
    (past ?? []).length > 0
      ? (past ?? [])
          .map(
            (d) =>
              `- "${d.title}" (${d.risk_level} risk${d.amount ? `, ${formatMoney(Number(d.amount), cur)}` : ""}) — ${OUTCOME_LABEL[d.outcome as string] ?? d.outcome}`
          )
          .join("\n")
      : "None recorded yet.";

  const amount = amountRaw ? Number(amountRaw) : null;

  const client = createAiClient();
  try {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: `You are Jephelen's Decision Advisor — a sharp, honest business partner for "${business.name}", a freelance ${business.business_type} business. You advise on ONE specific decision, grounded in this owner's REAL numbers and the outcomes of their PAST decisions of the same kind.

Rules:
- Be specific to their situation, not generic. Reference their actual numbers and history when relevant.
- If their history shows a pattern (e.g. discounts that turned out badly), say so plainly.
- Give a clear recommendation, 2-4 concrete next steps, and one alternative to consider.
- Under 220 words. Plain language. Encouraging but honest.
- This is educational guidance, not professional financial/legal advice.

Their business context (last ~90 days): income ${formatMoney(income, cur)}, expenses ${formatMoney(expenses, cur)}${marginPct !== null ? `, profit margin ~${marginPct}%` : ""}, ${customerCount ?? 0} customers.

Their past "${typeLabel}" decisions and how they turned out:
${history}`,
      messages: [
        {
          role: "user",
          content: `I'm about to make this decision: "${title || typeLabel}"${amount ? ` (amount involved: ${formatMoney(amount, cur)})` : ""}.

Jephelen's quick risk check rated it ${result.level.toUpperCase()} risk (${result.score}/${result.maxScore}).

Here are my answers to the risk questions: ${JSON.stringify(answers)}

Given my real numbers and my past ${typeLabel.toLowerCase()} decisions above, what should I do?`,
        },
      ],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!text) {
      return { error: "The AI returned an empty response — try again." };
    }

    await recordAiUse(supabase, business.id);
    return { advice: text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { error: `AI request failed: ${msg}` };
  }
}
