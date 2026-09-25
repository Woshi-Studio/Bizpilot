// Plain lists used by the AI Messages form. Kept apart from ai.ts so the
// browser bundle never pulls in the server-side AI provider code.

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
