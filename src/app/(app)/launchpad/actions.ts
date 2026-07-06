"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import { checkAiQuota, recordAiUse } from "@/lib/ai-quota";
import { aiConfigured, createAiClient, AI_MODEL } from "@/lib/ai";
import {
  buildTemplatePlan,
  roadmapWithDates,
  type LaunchpadInputs,
} from "@/lib/launchpad";
import { BUSINESS_TYPES } from "@/lib/types";

export type LaunchpadState = {
  error?: string;
  success?: string;
};

export async function createPlan(
  _prevState: LaunchpadState,
  formData: FormData
): Promise<LaunchpadState> {
  const inputs: LaunchpadInputs = {
    idea: String(formData.get("idea") ?? "").trim(),
    location: String(formData.get("location") ?? "").trim(),
    budget: String(formData.get("budget") ?? "").trim(),
    hoursPerWeek: String(formData.get("hours_per_week") ?? "").trim(),
    goal: String(formData.get("goal") ?? "").trim(),
  };

  if (!inputs.idea) {
    return { error: "Describe your business idea first — one sentence is enough." };
  }

  const { supabase, business } = await requireUserAndBusiness();

  const { data: existing, error: planCheckError } = await supabase
    .from("business_plans")
    .select("id")
    .eq("business_id", business.id)
    .maybeSingle();

  if (planCheckError) {
    return {
      error:
        "Launchpad isn't set up yet — the database migration for this feature hasn't been run.",
    };
  }
  if (existing) {
    return { error: "You already have a plan — it's shown below." };
  }

  const typeLabel =
    BUSINESS_TYPES.find((t) => t.value === business.business_type)?.label ??
    business.business_type;

  const content = buildTemplatePlan(inputs, business.name, typeLabel);

  const { error } = await supabase.from("business_plans").insert({
    business_id: business.id,
    content,
    inputs,
  });

  if (error) {
    return { error: error.message };
  }

  // Load the week-1-to-year-1 roadmap into their real task list
  const roadmap = roadmapWithDates();
  await supabase.from("tasks").insert(
    roadmap.map((t) => ({
      business_id: business.id,
      title: t.title,
      due_date: t.due_date,
    }))
  );

  revalidatePath("/launchpad");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return {
    success:
      "Your plan is ready and your roadmap is loaded into Tasks — first deadlines this week.",
  };
}

export async function upgradePlanWithAi(
  _prevState: LaunchpadState
): Promise<LaunchpadState> {
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
      error: `You've used all ${quota.limit} AI generations included this month.`,
    };
  }

  const { data: plan } = await supabase
    .from("business_plans")
    .select("id, content, inputs")
    .eq("business_id", business.id)
    .maybeSingle();

  if (!plan) {
    return { error: "Create your plan first — then the AI can personalize it." };
  }

  const typeLabel =
    BUSINESS_TYPES.find((t) => t.value === business.business_type)?.label ??
    business.business_type;

  const client = createAiClient();

  try {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: `You are BizPilot's business planning coach. You write practical, encouraging, concrete business plans for first-time entrepreneurs. Plain language, no jargon, no fluff. Use markdown headings (#, ##). Include a short "Legal & money checklist" section that is explicitly educational, not legal advice, and tells them to check local requirements. Keep the whole plan under 700 words.`,
      messages: [
        {
          role: "user",
          content: `Rewrite and personalize this starter business plan. Make the advice specific to the actual idea, location, budget, and hours — not generic.

Business: "${business.name}" (${typeLabel})
Their answers: ${JSON.stringify(plan.inputs)}

Current template plan:
${plan.content}`,
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

    await supabase
      .from("business_plans")
      .update({ content: text, ai_generated: true })
      .eq("id", plan.id);

    await recordAiUse(supabase, business.id);
    revalidatePath("/launchpad");
    return { success: "Your plan has been personalized by the AI." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { error: `AI request failed: ${msg}` };
  }
}
