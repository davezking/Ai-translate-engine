import type { Env } from "./env";
import { geminiKey } from "./env";

const PRIMARY_MODEL = "gemini-3.6-flash";
const FALLBACK_MODEL = "gemini-3.6-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Transient upstream failures (overload, rate limit, momentary infra hiccups) are worth
// retrying; anything else (bad request, auth, empty output) is not.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 1000;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

export interface GenerateTextOptions {
  responseMimeType?: string;
  temperature?: number;
}

/** Thrown only for a retryable status (429/5xx); lets generateText decide to fall back. */
class RetryableGeminiError extends Error {}

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

  let lastError: RetryableGeminiError | null = null;

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

      if (!RETRYABLE_STATUSES.has(res.status)) throw new Error(message);

      lastError = new RetryableGeminiError(message);
      if (attempt < maxAttempts - 1) {
        await sleep(retryDelayMs(res, attempt));
        continue;
      }
      throw lastError;
    }

    const data = (await res.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
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
 * Resilience against transient upstream failures (503 "high demand", 429 rate limits, 5xx)
 * has two layers: the primary model (gemini-3.6-flash) gets one attempt, and on any
 * retryable failure we immediately fall back to gemini-3.6-flash-lite — a separate,
 * lighter-tier model likely to have its own capacity — which then gets the full
 * MAX_ATTEMPTS retry-with-backoff budget before giving up. A non-retryable error (bad
 * request, empty output) is not worth re-trying on a different model and throws right away.
 */
export async function generateText(
  env: Env,
  systemInstruction: string,
  userContent: string,
  options: GenerateTextOptions = {},
): Promise<string> {
  try {
    return await callModel(env, PRIMARY_MODEL, systemInstruction, userContent, options, 1);
  } catch (err) {
    if (!(err instanceof RetryableGeminiError)) throw err;
    return await callModel(
      env,
      FALLBACK_MODEL,
      systemInstruction,
      userContent,
      options,
      MAX_ATTEMPTS,
    );
  }
}
