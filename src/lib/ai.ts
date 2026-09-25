import Anthropic from "@anthropic-ai/sdk";

// One place for every model id and output cap.
// - main:  the full model, for advice that needs judgement
//          (coach, decisions, launchpad plan rewrite)
// - small: a cheaper model for short, templated writing
//          (message drafts, the daily plan)
// Output is capped so one request can't run up a large bill.
// Thinking is off on these calls: with a small cap it would eat the
// answer's token budget.
export const AI_CONFIG = {
  models: {
    main: "claude-sonnet-5",           // 2026-09-25: current model; cheaper than Opus for coach/decisions/launchpad
    small: "claude-haiku-4-5-20251001",
  },
  MAX_OUTPUT_TOKENS: 1500,
  // The launchpad rewrites a whole business plan; 1500 would cut it off.
  LONG_OUTPUT_TOKENS: 3000,
} as const;

// Kept for anything that still imports the old name.
export const AI_MODEL = AI_CONFIG.models.main;

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
