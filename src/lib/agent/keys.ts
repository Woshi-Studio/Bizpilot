import { createHmac, randomBytes } from "node:crypto";

export { AGENT_SCOPES, isAgentScope, type AgentScope } from "@/lib/agent/scopes";

export const KEY_PREFIX = "jph_live_";
const BASE62 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
// 32 random bytes need at most 43 base62 digits.
const BODY_LENGTH = 43;
const KEY_PATTERN = /^jph_live_[0-9A-Za-z]{43}$/;

function toBase62(bytes: Buffer): string {
  let n = BigInt("0x" + bytes.toString("hex"));
  let out = "";
  while (n > BigInt(0)) {
    out = BASE62[Number(n % BigInt(62))] + out;
    n /= BigInt(62);
  }
  return out.padStart(BODY_LENGTH, "0");
}

// Returns null when AGENT_KEY_PEPPER is missing or too short.
export function getPepper(): string | null {
  const p = process.env.AGENT_KEY_PEPPER;
  return p && p.length >= 32 ? p : null;
}

// HMAC-SHA256(pepper, key) as hex. Without the pepper, a leaked database
// row can't be used to test guesses.
export function hashKey(key: string, pepper: string): string {
  return createHmac("sha256", pepper).update(key).digest("hex");
}

export function looksLikeKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

// New key: jph_live_ + 32 random bytes in base62. `prefix` is the first 8
// characters after jph_live_, stored for display ("jph_live_Ab12Cd34…").
export function generateKey(): { key: string; prefix: string } {
  const body = toBase62(randomBytes(32));
  return { key: KEY_PREFIX + body, prefix: body.slice(0, 8) };
}
