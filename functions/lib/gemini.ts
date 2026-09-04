import type { Env } from "./env";
import { geminiKey } from "./env";

// Tried in order; each non-final model gets one attempt before moving to the next, and
// the final model gets the full retry-with-backoff budget. gemini-3.5-flash-lite and
// gemini-3.1-flash-lite are unverified against a live ListModels call (see the note on
// generateText below) — if either ID is wrong, ADVANCE_STATUSES below makes that a
// same-shaped failure as a capacity error, so the chain still falls through instead of
// breaking resilience the way the removed gemini-3.6-flash-lite fallback once did.
const MODEL_CHAIN = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Transient upstream failures (overload, rate limit, momentary infra hiccups) are worth
// retrying; anything else (bad request, auth, empty output) is not.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
// A 404 means the model ID itself is wrong/unsupported for this API version — not worth
// retrying, but (unlike other 4xx errors) worth trying the next model in the chain rather
// than failing outright, since a bad ID is a config problem with THIS model, not the request.
const ADVANCE_STATUSES = new Set([...RETRYABLE_STATUSES, 404]);
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 1000;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
}

export interface GenerateTextOptions {
  responseMimeType?: string;
  temperature?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(res: Response, attempt: number): number {
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }
  // Exponential backoff with jitter: ~1s, ~2s, ~4s.
  return BASE_DELAY_MS * 2 ** attempt + Math.random() * 250;
}

/** Thrown for a status in ADVANCE_STATUSES; lets generateText try the next model in the chain. */
class AdvanceableGeminiError extends Error {}

/** One model's worth of attempts against the Gemini API, with backoff between retries. */
async function callModel(
  env: Env,
  model: string,
  systemInstruction: string,
  userContent: string,
  options: GenerateTextOptions,
  maxAttempts: number,
): Promise<string> {
  const url = `${API_BASE}/models/${model}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: userContent }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
    },
  };

  let lastError: AdvanceableGeminiError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": geminiKey(env),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = (await res.text().catch(() => "")).trim();
      const detail = errText
        ? errText.slice(0, 500)
        : `empty body, content-type=${res.headers.get("content-type") ?? "none"}, statusText=${res.statusText || "none"}`;
      const message = `Gemini request failed (${res.status}) [model=${model}]: ${detail}`;

      if (!ADVANCE_STATUSES.has(res.status)) throw new Error(message);

      lastError = new AdvanceableGeminiError(message);
      if (RETRYABLE_STATUSES.has(res.status) && attempt < maxAttempts - 1) {
        await sleep(retryDelayMs(res, attempt));
        continue;
      }
      throw lastError;
    }

    const data = (await res.json()) as GeminiResponse;
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    // A response cut off by the model's output-token ceiling is never usable, however
    // much text it produced — never a retryable/advanceable case (a fallback model has
    // an equal or smaller budget, so trying it wouldn't help) or, worse, silently saved
    // as if complete. Amharic/Ge'ez costs more output tokens per word than English, so
    // this is more likely on long articles.
    if (candidate?.finishReason === "MAX_TOKENS") {
      throw new Error(`Gemini response was truncated (MAX_TOKENS) [model=${model}]`);
    }
    if (!text.trim()) throw new Error(`Gemini returned an empty response [model=${model}]`);
    return text;
  }

  throw lastError ?? new Error(`Gemini request failed after retries [model=${model}]`);
}

/**
 * Calls Gemini server-side only (the key never leaves the Worker). `systemInstruction`
 * carries the task's prompt body loaded from the `prompts` table by the caller — this
 * module never hardcodes prompt text, only the wire format for talking to Gemini.
 *
 * Walks MODEL_CHAIN in order. Every model but the last gets exactly one attempt; on a
 * retryable failure (429/5xx, including the "high demand" 503) or a 404 (wrong/unsupported
 * model ID), generateText immediately moves to the next model rather than burning retries
 * on one that's overloaded or, worse, doesn't exist. The last model in the chain has
 * nowhere left to fall back to, so it gets the full MAX_ATTEMPTS retry-with-backoff budget
 * before giving up for real. A non-retryable, non-404 error (bad request, empty output) is
 * not worth trying on a different model and throws immediately.
 *
 * gemini-3.5-flash-lite and gemini-3.1-flash-lite are unverified against a live ListModels
 * call for this project's key/API version — gemini-3.6-flash-lite, an earlier guess, turned
 * out not to exist (confirmed via a live 404) and was removed. If either current fallback ID
 * is also wrong, the 404-advances-the-chain behavior above means it degrades to "skip that
 * tier" rather than repeating that outage.
 */
export async function generateText(
  env: Env,
  systemInstruction: string,
  userContent: string,
  options: GenerateTextOptions = {},
): Promise<string> {
  let lastError: Error | null = null;

  for (let i = 0; i < MODEL_CHAIN.length; i++) {
    const isLastModel = i === MODEL_CHAIN.length - 1;
    try {
      return await callModel(
        env,
        MODEL_CHAIN[i],
        systemInstruction,
        userContent,
        options,
        isLastModel ? MAX_ATTEMPTS : 1,
      );
    } catch (err) {
      if (isLastModel || !(err instanceof AdvanceableGeminiError)) throw err;
      lastError = err;
    }
  }

  throw lastError ?? new Error("Gemini request failed: no models configured");
}
