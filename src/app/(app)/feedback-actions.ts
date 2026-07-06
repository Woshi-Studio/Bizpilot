"use server";

import { requireUserAndBusiness } from "@/lib/data";

export type FeedbackState = {
  error?: string;
  success?: string;
};

export async function submitFeedback(
  _prevState: FeedbackState,
  formData: FormData
): Promise<FeedbackState> {
  const message = String(formData.get("message") ?? "").trim();
  const page = String(formData.get("page") ?? "").slice(0, 200);

  if (!message) {
    return { error: "Write something first 🙂" };
  }
  if (message.length > 2000) {
    return { error: "Keep it under 2000 characters." };
  }

  const { supabase, business } = await requireUserAndBusiness();

  const { error } = await supabase.from("feedback").insert({
    business_id: business.id,
    message,
    page: page || null,
  });

  if (error) {
    return { error: "Couldn't send feedback right now — try again later." };
  }

  return { success: "Thanks! Every bit of feedback makes BizPilot better." };
}
