// Safe to import from client components (no node:crypto here).
// Scopes an API key can hold. Keep in sync with api_keys_scopes_check
// in supabase/migrations/0016_agent_api.sql.
export const AGENT_SCOPES = [
  { value: "customers:write", label: "Add customers" },
  { value: "leads:write", label: "Add leads, change lead status" },
  { value: "contacts:read", label: "Search contacts, read today's list" },
  { value: "tasks:write", label: "Add and complete tasks" },
  { value: "calendar:write", label: "Book meetings" },
  { value: "activities:write", label: "Log notes, calls and emails" },
] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number]["value"];

export function isAgentScope(v: unknown): v is AgentScope {
  return AGENT_SCOPES.some((s) => s.value === v);
}
