import type { Env } from "./env";
import { generateText } from "./gemini";

/**
 * The style-extraction prompt is deliberately NOT stored in the `prompts` table:
 * that table is the admin-tunable split/translate/qa surface (Phase 4.2), and its
 * key CHECK constraint has no 'style' key. Style derivation runs once per writer
 * profile (not per article), so its prompt lives in code, like compare.ts.
 */
const STYLE_EXTRACTION_PROMPT = `You are a writing style analyst working on Amharic-language editorial content.
You are given one or more sample articles written by a specific writer. Your job
is to extract reusable, concrete guidelines that describe HOW this writer writes —
not what the samples are about.

Do NOT summarize the content or topics of the samples. Extract only tone/voice
guidance that an editor could apply to a DIFFERENT article to make it read as if
this writer wrote it.

Cover, where evident from the samples:
- Register/formality (e.g. formal vs. conversational, use of honorifics)
- Sentence rhythm and length (short punchy sentences vs. long compound ones)
- Vocabulary choices (plain vs. elevated, technical vs. accessible, loanword usage)
- Paragraph structure and transitions
- Any recurring stylistic habits (rhetorical questions, direct address, idioms)

Be specific and actionable, not vague adjectives. Instead of "engaging tone", say
something like "opens paragraphs with a short rhetorical question, then answers it
in 2-3 short sentences before elaborating."

Return ONLY the guidelines as plain text (a short list of concrete points), with no
preamble, no restatement of the samples, and no markdown formatting.`;

function buildUserContent(sampleArticles: string[]): string {
  return sampleArticles
    .map((sample, i) => `=== SAMPLE ${i + 1} ===\n${sample.trim()}`)
    .join("\n\n");
}

/**
 * Runs the Gemini style-extraction pass over one or more writing samples.
 * Throws on Gemini failure or an empty result so the caller can fail profile
 * creation rather than store a blank/useless profile.
 */
export async function deriveStyleGuidelines(env: Env, sampleArticles: string[]): Promise<string> {
  const guidelines = await generateText(
    env,
    STYLE_EXTRACTION_PROMPT,
    buildUserContent(sampleArticles),
    { temperature: 0.2 },
  );
  const trimmed = guidelines.trim();
  if (!trimmed) throw new Error("Style extraction returned an empty result");
  return trimmed;
}
