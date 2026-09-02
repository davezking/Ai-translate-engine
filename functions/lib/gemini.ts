import type { Env } from "./env";
import { geminiKey } from "./env";

const GEMINI_MODEL = "gemini-3.6-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

export interface GenerateTextOptions {
  responseMimeType?: string;
  temperature?: number;
}

/**
 * Calls Gemini server-side only (the key never leaves the Worker). `systemInstruction`
 * carries the task's prompt body loaded from the `prompts` table by the caller — this
 * module never hardcodes prompt text, only the wire format for talking to Gemini.
 */
export async function generateText(
  env: Env,
  systemInstruction: string,
  userContent: string,
  options: GenerateTextOptions = {},
): Promise<string> {
  const url = `${API_BASE}/models/${GEMINI_MODEL}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: userContent }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
    },
  };

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
    throw new Error(`Gemini request failed (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini returned an empty response");
  return text;
}
