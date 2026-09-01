import type { Env } from "./env";
import { generateText } from "./gemini";
import type { RetrievedLesson } from "./retrieval";

export interface QaPassInput {
  /** The current `qa` prompt version body, loaded from the prompts table by the caller. */
  qaPromptBody: string;
  englishContext: string;
  /** The machine-translated Amharic to QA (reassembled chunk translations). */
  machineAmharic: string;
  /** Past correction lessons retrieved from the library, best match first. */
  lessons: RetrievedLesson[];
}

/**
 * Renders the retrieved lessons as a numbered block for the QA prompt, or a
 * short note when none were retrieved (a cold library, or retrieval degraded).
 * These are guidance from prior human corrections, not text to translate.
 */
function renderLessons(lessons: RetrievedLesson[]): string {
  if (lessons.length === 0) {
    return "(No past lessons retrieved — apply general QA judgement.)";
  }
  return lessons
    .map((l, i) => {
      const tag = l.topicTag ? ` [${l.topicTag}]` : "";
      return `${i + 1}.${tag} ${l.changeSummary}`;
    })
    .join("\n");
}

function buildUserContent(input: QaPassInput): string {
  return [
    "=== ENGLISH SOURCE (context, do not translate) ===",
    input.englishContext.trim(),
    "",
    "=== LESSONS FROM PAST HUMAN REVIEWS ===",
    "These summarize corrections human reviewers made on earlier translations of",
    "similar material. Apply the ones that are relevant to the text below; ignore",
    "any that do not apply. Do not copy them literally — use them as guidance.",
    "",
    renderLessons(input.lessons),
    "",
    "=== MACHINE AMHARIC TO QA (return your corrected version of THIS) ===",
    input.machineAmharic.trim(),
  ].join("\n");
}

/**
 * Runs the QA pass: the tunable `qa` prompt body is the system instruction
 * (never hardcoded here — the caller loads it from the prompts table), and the
 * retrieved lessons plus the machine Amharic are supplied as user content.
 * Returns the corrected Amharic text. Throws on Gemini failure or empty output
 * so the caller can leave the pre-QA draft intact.
 */
export async function runQaPass(env: Env, input: QaPassInput): Promise<string> {
  const qad = await generateText(env, input.qaPromptBody, buildUserContent(input));
  const trimmed = qad.trim();
  if (!trimmed) throw new Error("QA returned an empty result");
  return trimmed;
}
