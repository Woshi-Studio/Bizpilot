"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import { consumeAiCredit, aiCreditError } from "@/lib/ai-quota";
import {
  aiConfigured,
  aiNotConfiguredMessage,
  aiFailure,
  createAiClient,
  AI_CONFIG,
  AI_BREAK_MESSAGE,
} from "@/lib/ai";

export type CoachState = {
  error?: string;
  question?: string;
  answer?: string;
};

export async function askCoach(
  _prevState: CoachState,
  formData: FormData
): Promise<CoachState> {
  const question = String(formData.get("question") ?? "").trim();

  if (!question) {
    return { error: "Ask something first 🙂" };
  }
  if (question.length > 1000) {
    return { error: "Keep the question under 1000 characters." };
  }

  if (!aiConfigured()) {
    return { error: aiNotConfiguredMessage("coach") };
  }

  const { supabase, business } = await requireUserAndBusiness();

  const quota = await consumeAiCredit(supabase, business);
  if (!quota.ok) {
    return { error: aiCreditError(quota) };
  }
  // Refresh the credit meter on the page.
  revalidatePath("/coach");

  // Gather a compact snapshot of the business so answers use THEIR numbers
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
  const [{ data: monthTx }, { count: customerCount }, { count: openTasks }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("type, amount")
        .eq("business_id", business.id)
        .gte("date", monthStart),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id)
        .is("completed_at", null),
    ]);

  const income = (monthTx ?? [])
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const expenses = (monthTx ?? [])
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);

  const client = createAiClient();

  try {
    const response = await client.messages.create({
      model: AI_CONFIG.models.main,
      max_tokens: AI_CONFIG.MAX_OUTPUT_TOKENS,
      system: `You are the Jephelen Coach — a practical small-business mentor inside the Jephelen app, advising the owner of "${business.name}", a freelance ${business.business_type} business.

Rules:
- Plain language, concrete steps, no corporate fluff. Encouraging but honest.
- Use their real numbers (provided below) when relevant.
- Keep answers under 250 words unless the question truly needs more.
- For legal or tax questions: give the educational picture and what questions to ask, then say clearly that local rules differ and a local accountant/lawyer should confirm — you are not a substitute for professional advice.

Their current numbers: this month income ${income.toFixed(2)} ${business.currency}, expenses ${expenses.toFixed(2)} ${business.currency}, ${customerCount ?? 0} customers, ${openTasks ?? 0} open tasks.`,
      messages: [{ role: "user", content: question }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!text) {
      return { error: AI_BREAK_MESSAGE };
    }

    return { question, answer: text };
  } catch (err) {
    return { error: aiFailure(err, "coach") };
  }
}
