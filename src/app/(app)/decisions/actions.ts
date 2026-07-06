"use server";

import { revalidatePath } from "next/cache";
import { requireUserAndBusiness } from "@/lib/data";
import {
  scoreDecision,
  QUESTIONS,
  type DecisionType,
} from "@/lib/decision-guard";

export type SaveDecisionState = {
  error?: string;
  success?: string;
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
