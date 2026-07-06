"use server";

import { requireUserAndBusiness } from "@/lib/data";
import { checkAiQuota, recordAiUse } from "@/lib/ai-quota";
import {
  aiConfigured,
  createAiClient,
  AI_MODEL,
  MESSAGE_TYPES,
  TONES,
} from "@/lib/ai";

export type GenerateState = {
  error?: string;
  message?: string;
};

export async function generateMessage(
  _prevState: GenerateState,
  formData: FormData
): Promise<GenerateState> {
  if (!aiConfigured()) {
    return {
      error:
        "AI is not set up yet — the ANTHROPIC_API_KEY is missing from .env.local.",
    };
  }

  const messageType = String(formData.get("message_type") ?? "");
  const tone = String(formData.get("tone") ?? "");
  const customerId = String(formData.get("customer_id") ?? "");
  const details = String(formData.get("details") ?? "").trim();

  const typeLabel = MESSAGE_TYPES.find((t) => t.value === messageType)?.label;
  const toneLabel = TONES.find((t) => t.value === tone)?.label;
  if (!typeLabel || !toneLabel) {
    return { error: "Pick a message type and a tone." };
  }
  if (messageType === "custom" && !details) {
    return { error: "Describe what the custom message should say." };
  }

  const { supabase, user, business } = await requireUserAndBusiness();

  const quota = await checkAiQuota(supabase, business);
  if (!quota.ok) {
    return {
      error: `You've used all ${quota.limit} AI messages included this month. Your counter resets on the 1st.`,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  let customerContext = "";
  if (customerId) {
    const { data: customer } = await supabase
      .from("customers")
      .select("name, company, email, status, next_follow_up")
      .eq("id", customerId)
      .eq("business_id", business.id)
      .maybeSingle();

    if (customer) {
      const { data: notes } = await supabase
        .from("customer_notes")
        .select("body, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(5);

      customerContext = `\nRecipient:
- Name: ${customer.name}
- Company: ${customer.company ?? "n/a"}
- Relationship status: ${customer.status}
${
  notes && notes.length > 0
    ? `- Recent notes about them (newest first):\n${notes
        .map((n) => `  - ${n.body}`)
        .join("\n")}`
    : ""
}`;
    }
  }

  const client = createAiClient();

  try {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: `You are the AI communication assistant inside BizPilot, writing on behalf of ${
        profile?.full_name ?? "the owner"
      }, who runs "${business.name}", a freelance ${
        business.business_type
      } business.

Write ready-to-send messages. Rules:
- Output ONLY the message itself — no preamble, no explanations, no "Here's your message".
- If it's an email, include a subject line as the first line ("Subject: ...").
- Keep it concise; small-business clients skim.
- Sound like a real person, not a corporation.
- Use placeholders in [square brackets] only for facts you don't have (like [invoice number] or [date]).`,
      messages: [
        {
          role: "user",
          content: `Write a ${typeLabel.toLowerCase()} message in a ${toneLabel.toLowerCase()} tone.${customerContext}${
            details ? `\n\nExtra details from me: ${details}` : ""
          }`,
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
    return { message: text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { error: `AI request failed: ${msg}` };
  }
}
