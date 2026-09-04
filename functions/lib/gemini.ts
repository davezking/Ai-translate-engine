import type { Env } from "./env";
import { geminiKey } from "./env";

const PRIMARY_MODEL = "gemini-3.6-flash";
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

  let lastError: Error | null = null;

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
      lastError = new Error(`Gemini request failed (${res.status}) [model=${model}]: ${detail}`);

      if (RETRYABLE_STATUSES.has(res.status) && attempt < maxAttempts - 1) {
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
 * Transient failures (503 "high demand", 429 rate limits, 5xx) are retried with backoff
 * up to MAX_ATTEMPTS before giving up, since callers otherwise fail an entire pipeline
 * step (translate/QA/etc.) on what is often a momentary spike.
 *
 * NOTE: an earlier revision of this function fell back to a second, lighter-tier model
 * (`gemini-3.6-flash-lite`) after the primary model's first failure. That model ID does
 * not exist for this API version (confirmed via a live 404 "is not found ... or is not
 * supported for generateContent" response) and has been removed. Don't reintroduce a
 * fallback model without first confirming its exact ID against the real ListModels
 * response for this project's API key/version.
 */
export async function generateText(
  env: Env,
  systemInstruction: string,
  userContent: string,
  options: GenerateTextOptions = {},
): Promise<string> {
  return callModel(env, PRIMARY_MODEL, systemInstruction, userContent, options, MAX_ATTEMPTS);
}
