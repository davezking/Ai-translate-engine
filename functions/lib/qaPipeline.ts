import type { Env } from "./env";
import { db, qaRetrievalTopN } from "./env";
import { getArticle, setArticleQaDraft } from "./db/articles";
import { listChunksByArticle } from "./db/chunks";
import { getCurrentPrompt } from "./db/prompts";
import { getStyleProfile } from "./db/styleProfiles";
import { retrieveLessons, type RetrievedLesson } from "./retrieval";
import { runQaPass } from "./qa";

export type QaOutcome =
  | {
      status: "qad";
      amharicDraft: string;
      topN: number;
      lessons: RetrievedLesson[];
      retrievalError?: string;
      /** Writer name of the style profile applied, or null if none was selected. */
      styleApplied: string | null;
    }
  | { status: "failed"; error: unknown };

/**
 * Shared QA pipeline: retrieve lessons, run the Gemini QA pass over the
 * reassembled machine translation, and store the result as the working draft
 * (status -> 'qad'). Used by both the standalone QA route and reassemble
 * (which triggers QA automatically after chunks are joined) — no fork.
 *
 * Never throws: any failure (missing prompt, no translated chunks, retrieval,
 * or Gemini) is reported in the returned outcome so the caller decides how to
 * respond. The pre-QA draft is left untouched on failure.
 */
export async function runQaPipeline(env: Env, articleId: string): Promise<QaOutcome> {
  const d1 = db(env);
  try {
    const article = await getArticle(d1, articleId);
    if (!article) throw new Error("Article not found");

    // Same machine source as the finalize compare (chunks, not amharic_draft):
    // the chunks' amharic_text is untouched by review edits, so re-running QA
    // always corrects the raw translation rather than an already-QA'd draft.
    const chunks = await listChunksByArticle(d1, articleId);
    const machineAmharic = chunks
      .map((c) => c.amharic_text ?? "")
      .filter((t) => t.trim())
      .join("\n\n");
    if (!machineAmharic.trim()) {
      throw new Error("No translated chunks to QA");
    }

    const promptEntry = await getCurrentPrompt(d1, "qa");
    if (!promptEntry) throw new Error("No 'qa' prompt configured");

    const topN = qaRetrievalTopN(env);

    // Retrieval is best-effort: if Vectorize/embedding is unavailable, QA
    // still runs (with general judgement) rather than failing the whole pass.
    let lessons: RetrievedLesson[] = [];
    let retrievalError: string | undefined;
    try {
      lessons = await retrieveLessons(env, article.source_english, topN);
    } catch (err) {
      retrievalError = err instanceof Error ? err.message : "Retrieval failed";
      console.error(`QA retrieval failed for article ${articleId}:`, err);
    }

    // Log which corrections were retrieved, for later quality inspection.
    console.log(
      `QA retrieval for article ${articleId}: topN=${topN}, retrieved=${lessons.length} ` +
        `[${lessons.map((l) => `${l.correctionId}@${l.score.toFixed(3)}`).join(", ")}]`,
    );

    // Selecting a style is optional (Requirement 15): no writer_style_id means
    // QA runs with general judgement only, same as before Sprint 4.1.
    let styleGuidelines: string | null = null;
    let styleApplied: string | null = null;
    if (article.writer_style_id) {
      const profile = await getStyleProfile(d1, article.writer_style_id);
      if (profile) {
        styleGuidelines = profile.derived_guidelines;
        styleApplied = profile.writer_name;
      }
    }

    const qaText = await runQaPass(env, {
      qaPromptBody: promptEntry.version.body,
      englishContext: article.source_english,
      machineAmharic,
      lessons,
      styleGuidelines,
    });

    await setArticleQaDraft(d1, articleId, qaText, Date.now());
    return { status: "qad", amharicDraft: qaText, topN, lessons, retrievalError, styleApplied };
  } catch (err) {
    console.error(`QA pipeline failed for article ${articleId}:`, err);
    return { status: "failed", error: err };
  }
}
