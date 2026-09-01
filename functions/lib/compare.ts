import type { Env } from "./env";
import { generateText } from "./gemini";

/**
 * Inputs to the finalize-time comparison. `machineAmharic` is the comparison
 * source and is intentionally a parameter, not hardcoded: today it is the
 * pre-edit machine translation (reassembled chunk translations); Sprint 3.2
 * swaps in the true QA output through this same field without touching callers.
 */
export interface CompareInput {
  englishContext: string;
  machineAmharic: string;
  humanFinalAmharic: string;
}

export interface CompareResult {
  /** What changed, why, and what to check next time — the retrievable lesson. */
  changeSummary: string;
  /** Number of distinct human corrections, per the definition in the prompt. */
  fixCount: number;
  /** Short lowercase kebab-case category, or null if the model omitted one. */
  topicTag: string | null;
}

/**
 * The compare prompt is deliberately NOT stored in the `prompts` table: that
 * table is the admin-tunable split/translate/qa surface (Phase 4.2), and its
 * key CHECK constraint has no 'compare' key. This comparison is an internal,
 * fixed part of the learning loop, so its prompt lives in code.
 *
 * The "one fix" definition below is the load-bearing part: it is written to be
 * spot-checkable by a human and to keep the count stable across repeat runs.
 */
const COMPARE_PROMPT = `You are a bilingual English-to-Amharic (Ge'ez script) translation reviewer.
You are given three texts:
1. The English source, for context.
2. The MACHINE Amharic translation — the machine/QA output, before any human review.
3. The HUMAN-FINAL Amharic translation — what the human reviewer approved.

Your job: describe how the human changed the machine translation into the final
version, and count the fixes.

Compare by MEANING and language, never character-by-character. Ge'ez text must not
be diffed as characters or bytes: a raw character difference is not by itself a fix,
and the same meaning written a different way is a fix only when the human clearly
changed it on purpose.

DEFINITION OF ONE FIX — count each distinct corrective change the human made:
- One mistranslated or wrong word, term, or phrase corrected = 1 fix.
- One grammar or Ge'ez morphology correction in one place (agreement, verb form,
  word order) = 1 fix.
- One tone, register, or style adjustment applied to a single span = 1 fix.
- One clause added or removed to fix meaning or completeness = 1 fix.

COUNTING RULES — apply these so the count is stable across runs:
- The SAME correction repeated in several places counts as ONE fix, not once per place.
- A contiguous rewrite of a single sentence made for a single reason counts as ONE fix.
- Cosmetic-only changes that do not change meaning (whitespace, punctuation with no
  meaning change, an equivalent rewording) do NOT count.
- If the human made no meaningful change at all, fixCount is 0 and changeSummary
  says so plainly.

Respond with ONLY this JSON object and no other text:
{
  "changeSummary": "1-4 sentences: what changed, why it was changed, and what to watch for next time",
  "fixCount": 0,
  "topicTag": "short-lowercase-kebab-case-category"
}`;

function buildUserContent(input: CompareInput): string {
  return [
    "=== ENGLISH SOURCE (context) ===",
    input.englishContext.trim(),
    "",
    "=== MACHINE AMHARIC (pre-review) ===",
    input.machineAmharic.trim(),
    "",
    "=== HUMAN-FINAL AMHARIC (approved) ===",
    input.humanFinalAmharic.trim(),
  ].join("\n");
}

function coerceFixCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`compare returned an invalid fixCount: ${JSON.stringify(value)}`);
  }
  return Math.round(n);
}

/**
 * Runs the Gemini finalize comparison. Throws on Gemini failure or a malformed
 * response so callers can keep finalize succeeding and mark capture retryable.
 */
export async function compareTranslations(env: Env, input: CompareInput): Promise<CompareResult> {
  const raw = await generateText(env, COMPARE_PROMPT, buildUserContent(input), {
    responseMimeType: "application/json",
    temperature: 0,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`compare returned non-JSON: ${raw.slice(0, 300)}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("compare returned a non-object JSON value");
  }

  const obj = parsed as Record<string, unknown>;
  const changeSummary = typeof obj.changeSummary === "string" ? obj.changeSummary.trim() : "";
  if (!changeSummary) {
    throw new Error("compare returned an empty changeSummary");
  }
  const topicTagRaw = typeof obj.topicTag === "string" ? obj.topicTag.trim() : "";

  return {
    changeSummary,
    fixCount: coerceFixCount(obj.fixCount),
    topicTag: topicTagRaw || null,
  };
}
