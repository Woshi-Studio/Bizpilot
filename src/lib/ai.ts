import Anthropic from "@anthropic-ai/sdk";

export const AI_MODEL = "claude-opus-4-8";

export function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function createAiClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export const MESSAGE_TYPES = [
  { value: "follow_up", label: "Follow-up" },
  { value: "payment_reminder", label: "Payment reminder" },
  { value: "quote", label: "Quote / proposal email" },
  { value: "appointment", label: "Appointment confirmation" },
  { value: "thank_you", label: "Thank you note" },
  { value: "custom", label: "Custom (describe below)" },
] as const;

export const TONES = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "strict", label: "Firm" },
  { value: "sales", label: "Sales-oriented" },
] as const;
