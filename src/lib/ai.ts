// The AI layer. Every AI button goes through createAiClient() here.
//
// Provider: AI_PROVIDER env — "gemini" (default, Google's free tier) or
// "anthropic". Callers don't care which: both return the same shape.
//
// Gemini keys: GEMINI_API_KEYS (comma-separated, preferred) and/or
// GEMINI_API_KEY. When a key is out of quota (429) or refused (401/403,
// or 400 "API key not valid"), the next key is tried, so N free keys give
// about N times the free daily limit. If the main model (Flash) is out of
// quota on EVERY key, the call falls back to the small model (Flash Lite,
// much bigger free quota), again rotating keys. Key VALUES are never
// logged — only their position in the list ("key #2").
//
// Pro plan: AI_PROVIDER_PRO (e.g. "anthropic") picks the provider for
// businesses on the Pro plan. Unset (the default) = same as everyone else.
// If it says "anthropic" but ANTHROPIC_API_KEY is missing, Pro quietly
// uses the normal provider. Anthropic models can be set with
// ANTHROPIC_MODEL (main) and ANTHROPIC_MODEL_SMALL. Use aiFor(business)
// to get the right client and model ids for a business.
//
// Users never see a raw provider error: use aiFailure() in a catch block.

export { MESSAGE_TYPES, TONES } from "@/lib/ai-options";
import { isDemoMode } from "@/lib/demo";

export type AiProvider = "gemini" | "anthropic";

export const AI_PROVIDER: AiProvider =
  (process.env.AI_PROVIDER ?? "").trim().toLowerCase() === "anthropic"
    ? "anthropic"
    : "gemini";

const MODELS = {
  // -latest aliases, same as the owner's Athena bot (brain.py).
  gemini: {
    main: "gemini-flash-latest",
    small: "gemini-flash-lite-latest",
  },
  anthropic: {
    main: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5",
    small: process.env.ANTHROPIC_MODEL_SMALL?.trim() || "claude-haiku-4-5",
  },
} as const;

// One place for every model id and output cap.
// - main:  the full model, for advice that needs judgement
//          (coach, decisions, launchpad plan rewrite)
// - small: a lighter model for short, templated writing
//          (message drafts, the daily plan)
// Output is capped so one request can't run away.
export const AI_CONFIG = {
  provider: AI_PROVIDER,
  models: MODELS[AI_PROVIDER],
  geminiModels: MODELS.gemini,
  anthropicModels: MODELS.anthropic,
  MAX_OUTPUT_TOKENS: 1500,
  // The launchpad rewrites a whole business plan; 1500 would cut it off.
  LONG_OUTPUT_TOKENS: 3000,
  // Gemini Flash models may "think" before answering, and those thinking
  // tokens count against maxOutputTokens. This headroom is added on top so
  // thinking can't eat the answer. Prompts still keep answers short.
  GEMINI_THINKING_HEADROOM: 2048,
  REQUEST_TIMEOUT_MS: 60_000,
} as const;

// Kept for anything that still imports the old name.
export const AI_MODEL = AI_CONFIG.models.main;

// ------------------------------------------------------------------
// Friendly errors
// ------------------------------------------------------------------

export const AI_BREAK_MESSAGE =
  "AI is taking a short break. Please try again in a few minutes.";

// An error that is safe to show to the user as-is.
export class AiError extends Error {
  userMessage: string;
  constructor(userMessage: string, detail?: string) {
    super(detail ?? userMessage);
    this.name = "AiError";
    this.userMessage = userMessage;
  }
}

// Logs the real error on the server and returns the text for the user.
export function aiFailure(err: unknown, where: string): string {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[ai] ${where} failed (${AI_PROVIDER}): ${detail}`);
  return err instanceof AiError ? err.userMessage : AI_BREAK_MESSAGE;
}

// ------------------------------------------------------------------
// Keys
// ------------------------------------------------------------------

function geminiKeys(): string[] {
  const list = [
    ...(process.env.GEMINI_API_KEYS ?? "").split(","),
    process.env.GEMINI_API_KEY ?? "",
  ]
    .map((k) => k.trim())
    .filter(Boolean);
  return [...new Set(list)];
}

export function aiConfigured() {
  if (isDemoMode()) return true;
  if (AI_PROVIDER === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
  return geminiKeys().length > 0;
}

// Call this when aiConfigured() is false: logs what's missing for the
// owner, returns the friendly text for the user.
export function aiNotConfiguredMessage(where: string) {
  console.error(
    `[ai] ${where}: no AI key set — ` +
      (AI_PROVIDER === "anthropic"
        ? "ANTHROPIC_API_KEY is missing"
        : "GEMINI_API_KEYS / GEMINI_API_KEY is missing")
  );
  return AI_BREAK_MESSAGE;
}

// ------------------------------------------------------------------
// The client — same call shape for every provider
// ------------------------------------------------------------------

export type AiMessage = { role: "user" | "assistant"; content: string };

export type AiRequest = {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AiMessage[];
};

export type AiResponse = {
  content: { type: "text"; text: string }[];
  // "max_tokens" = the answer was cut off; callers that save the text
  // (launchpad) check it.
  stop_reason: "end_turn" | "max_tokens" | null;
};

export type AiClient = {
  messages: { create(req: AiRequest): Promise<AiResponse> };
};

export function createAiClient(
  provider: AiProvider = AI_PROVIDER
): AiClient {
  // DEMO MODE (dev only): canned answers, no real AI call, no keys used.
  if (isDemoMode()) return demoAiClient();
  return {
    messages: {
      create: (req) =>
        provider === "anthropic" ? anthropicCreate(req) : geminiCreate(req),
    },
  };
}

// ------------------------------------------------------------------
// Per-plan provider (Pro can use a stronger model)
// ------------------------------------------------------------------

function parseProvider(value: string | undefined): AiProvider | null {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "anthropic" || v === "gemini") return v;
  return null;
}

// Which provider a business on this plan uses.
export function providerForPlan(plan: string | null | undefined): AiProvider {
  if (plan === "pro") {
    const pro = parseProvider(process.env.AI_PROVIDER_PRO);
    if (pro === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
    if (pro === "gemini" && geminiKeys().length > 0) return "gemini";
  }
  return AI_PROVIDER;
}

export type AiForBusiness = {
  provider: AiProvider;
  client: AiClient;
  models: { main: string; small: string };
};

// The client and model ids to use for this business.
//   const ai = aiFor(business);
//   ai.client.messages.create({ model: ai.models.main, ... })
// When Pro runs on Anthropic and that call fails, the request is retried
// once on the normal provider, so a Pro user still gets an answer.
export function aiFor(business: { plan?: string | null }): AiForBusiness {
  const provider = providerForPlan(business.plan);
  const models = MODELS[provider];

  if (provider === AI_PROVIDER) {
    return { provider, client: createAiClient(provider), models };
  }

  const primary = createAiClient(provider);
  const fallback = createAiClient(AI_PROVIDER);
  const fallbackModels = MODELS[AI_PROVIDER];
  return {
    provider,
    models,
    client: {
      messages: {
        async create(req) {
          try {
            return await primary.messages.create(req);
          } catch (err) {
            if (!aiConfigured()) throw err;
            const detail = err instanceof Error ? err.message : String(err);
            console.warn(`[ai] pro ${provider} failed, using ${AI_PROVIDER}: ${detail}`);
            const model =
              req.model === models.small ? fallbackModels.small : fallbackModels.main;
            return fallback.messages.create({ ...req, model });
          }
        },
      },
    },
  };
}

// ------------------------------------------------------------------
// Gemini (REST, same request shape as brain.py)
// ------------------------------------------------------------------

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/%MODEL%:generateContent";

type GeminiPart = { text?: string; thought?: boolean };
type GeminiResponse = {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
};

const BLOCKED_MESSAGE =
  "The AI couldn't answer that one. Try rewording your request.";

// Reasons that mean "this key can't be used right now, try the next".
function keyProblem(status: number, body: string) {
  if (status === 429 || status === 401 || status === 403) return true;
  return status === 400 && /API_KEY_INVALID|API key not valid|API key expired/i.test(body);
}

// Start with the key that worked last time for that model (per server
// instance), so a spent key isn't retried first on every call.
const geminiStartIndex = new Map<string, number>();

// Every key failed with a key problem and at least one was a 429:
// this model's free daily quota is used up on all keys.
class GeminiExhausted extends AiError {}

async function geminiCreate(req: AiRequest): Promise<AiResponse> {
  const keys = geminiKeys();
  if (keys.length === 0) {
    throw new AiError(AI_BREAK_MESSAGE, "no Gemini key configured");
  }

  const body = JSON.stringify({
    ...(req.system
      ? { systemInstruction: { parts: [{ text: req.system }] } }
      : {}),
    contents: req.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      maxOutputTokens: req.max_tokens + AI_CONFIG.GEMINI_THINKING_HEADROOM,
    },
  });

  try {
    return await geminiTryModel(req.model, keys, body);
  } catch (err) {
    // Flash's free quota is small (~20/day/key); Flash Lite's is ~500.
    // When Flash is spent on every key, answer with Lite instead.
    const lite = AI_CONFIG.geminiModels.small;
    if (err instanceof GeminiExhausted && req.model !== lite) {
      console.warn("[ai] main exhausted → lite");
      return geminiTryModel(lite, keys, body);
    }
    throw err;
  }
}

async function geminiTryModel(
  model: string,
  keys: string[],
  body: string
): Promise<AiResponse> {
  const url = GEMINI_URL.replace("%MODEL%", encodeURIComponent(model));
  const problems: string[] = [];
  let saw429 = false;
  const first = geminiStartIndex.get(model) ?? 0;

  for (let n = 0; n < keys.length; n++) {
    const i = (first + n) % keys.length;
    let res: Response;
    try {
      // Auth as brain.py does it: the key as the ?key= query parameter.
      // The URL is never logged because of this.
      res = await fetch(`${url}?key=${encodeURIComponent(keys[i])}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(AI_CONFIG.REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (err) {
      const why = err instanceof Error ? err.name : "network error";
      throw new AiError(AI_BREAK_MESSAGE, `gemini ${model} key #${i + 1}: ${why}`);
    }

    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 300);
      const line = `key #${i + 1} → HTTP ${res.status}: ${text.replace(/\s+/g, " ")}`;
      problems.push(line);
      if (keyProblem(res.status, text)) {
        if (res.status === 429) saw429 = true;
        if (n < keys.length - 1) {
          console.warn(`[ai] gemini ${model} ${line} — trying next key`);
          continue;
        }
        const detail = `gemini ${model}: every key failed: ${problems.join(" | ")}`;
        throw saw429
          ? new GeminiExhausted(AI_BREAK_MESSAGE, detail)
          : new AiError(AI_BREAK_MESSAGE, detail);
      }
      throw new AiError(AI_BREAK_MESSAGE, `gemini ${model} failed: ${problems.join(" | ")}`);
    }

    geminiStartIndex.set(model, i);
    const data = (await res.json().catch(() => null)) as GeminiResponse | null;
    return parseGemini(data, model);
  }

  // Only reached if keys is empty, handled by the caller.
  throw new AiError(AI_BREAK_MESSAGE, "gemini: no key worked");
}

function parseGemini(data: GeminiResponse | null, model: string): AiResponse {
  if (!data) {
    throw new AiError(AI_BREAK_MESSAGE, `gemini ${model}: response was not JSON`);
  }
  if (data.promptFeedback?.blockReason) {
    throw new AiError(
      BLOCKED_MESSAGE,
      `gemini ${model}: prompt blocked (${data.promptFeedback.blockReason})`
    );
  }

  const cand = data.candidates?.[0];
  const reason = cand?.finishReason ?? "none";
  const text = (cand?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();

  if (!text) {
    if (["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "RECITATION"].includes(reason)) {
      throw new AiError(BLOCKED_MESSAGE, `gemini ${model}: answer blocked (${reason})`);
    }
    throw new AiError(AI_BREAK_MESSAGE, `gemini ${model}: empty answer (finishReason ${reason})`);
  }

  return {
    content: [{ type: "text", text }],
    stop_reason: reason === "MAX_TOKENS" ? "max_tokens" : "end_turn",
  };
}

// ------------------------------------------------------------------
// Anthropic (kept for later; set AI_PROVIDER=anthropic)
// ------------------------------------------------------------------

async function anthropicCreate(req: AiRequest): Promise<AiResponse> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiError(AI_BREAK_MESSAGE, "ANTHROPIC_API_KEY is missing");
  }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: req.model,
    max_tokens: req.max_tokens,
    ...(req.system ? { system: req.system } : {}),
    messages: req.messages,
  });

  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();

  if (!text) {
    throw new AiError(
      response.stop_reason === "refusal" ? BLOCKED_MESSAGE : AI_BREAK_MESSAGE,
      `anthropic ${req.model}: empty answer (stop_reason ${response.stop_reason})`
    );
  }

  return {
    content: [{ type: "text", text }],
    stop_reason: response.stop_reason === "max_tokens" ? "max_tokens" : "end_turn",
  };
}

// ------------------------------------------------------------------
// DEMO MODE only: canned answers for screenshots (see lib/demo.ts)
// ------------------------------------------------------------------

function demoAiClient(): AiClient {
  return {
    messages: {
      async create(req) {
        const sys = req.system ?? "";
        let text =
          "Here's a thought: follow up with your two overdue clients first, then send the Northwind invoice.";
        if (sys.includes("Athena")) {
          text =
            "Easy one! Open People → Customers, tap Ava's name, then hit **Send email** in the bar at the top. Want me to draft it for you? 💜";
        } else if (sys.includes("communication assistant")) {
          text = `Subject: Quick check-in on your new logo

Hi Ava,

Hope the week is going well! I wanted to check in on the logo concepts I sent on Friday. If #2 is still the favorite, I can have the warmer color version ready by Thursday.

Happy to hop on a quick call if that's easier.

Best,
Maya`;
        } else if (sys.includes("daily plans")) {
          text =
            "- Invoice Marcus for September — it's overdue\n- Send Ava the warmer logo version\n- Call Diego about the café menu\n- Set a follow-up date for Hannah";
        }
        return { content: [{ type: "text", text }], stop_reason: "end_turn" };
      },
    },
  };
}
