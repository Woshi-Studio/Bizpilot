"use server";

import { requireUserAndBusiness } from "@/lib/data";
import { checkAiQuota, recordAiUse } from "@/lib/ai-quota";
import { aiConfigured, createAiClient, AI_MODEL } from "@/lib/ai";

export type PlanState = {
  error?: string;
  plan?: string;
};

export async function generateDailyPlan(
  _prevState: PlanState
): Promise<PlanState> {
  if (!aiConfigured()) {
    return {
      error:
        "AI is not set up yet — the ANTHROPIC_API_KEY is missing from .env.local.",
    };
  }

  const { supabase, business } = await requireUserAndBusiness();

  const quota = await checkAiQuota(supabase, business);
  if (!quota.ok) {
    return {
      error: `You've used all ${quota.limit} AI generations included this month. Your counter resets on the 1st.`,
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: openTasks }, { data: followUps }, { data: customers }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("title, due_date, customers(name)")
        .eq("business_id", business.id)
        .is("completed_at", null)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(15),
      supabase
        .from("customers")
        .select("name, status, next_follow_up")
        .eq("business_id", business.id)
        .lte("next_follow_up", today)
        .limit(10),
      supabase
        .from("customers")
        .select("name, status, next_follow_up")
        .eq("business_id", business.id)
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);

  const client = createAiClient();

  try {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: `You are BizPilot, the AI copilot for "${business.name}", a freelance ${business.business_type} business. You give short, practical daily plans.

Rules:
- Output 3 to 5 prioritized action bullets for today, most important first.
- Each bullet: one line, concrete, starting with a verb.
- Base them ONLY on the data provided. Reference customers and tasks by name.
- If follow-ups are overdue, they come first.
- If there's little data, suggest sensible small-business actions (add customers, set follow-up dates) — still concrete.
- No preamble, no sign-off. Just the bullets.`,
      messages: [
        {
          role: "user",
          content: `Today is ${today}. Here's my current business data:

Open tasks (${openTasks?.length ?? 0}):
${
  openTasks && openTasks.length > 0
    ? openTasks
        .map((t) => {
          const cust = t.customers as unknown as { name: string } | null;
          return `- ${t.title}${t.due_date ? ` (due ${t.due_date})` : ""}${cust ? ` [customer: ${cust.name}]` : ""}`;
        })
        .join("\n")
    : "- none"
}

Follow-ups due or overdue (${followUps?.length ?? 0}):
${
  followUps && followUps.length > 0
    ? followUps
        .map((c) => `- ${c.name} (${c.status}, due ${c.next_follow_up})`)
        .join("\n")
    : "- none"
}

Customers (${customers?.length ?? 0} most recent):
${
  customers && customers.length > 0
    ? customers
        .map(
          (c) =>
            `- ${c.name} (${c.status}${c.next_follow_up ? `, next follow-up ${c.next_follow_up}` : ", no follow-up set"})`
        )
        .join("\n")
    : "- none yet"
}

What should I focus on today?`,
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
    return { plan: text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { error: `AI request failed: ${msg}` };
  }
}
