import type { Env } from "./env";
import { db, qaRetrievalTopN } from "./env";
import { getArticle, setArticleQaDraft } from "./db/articles";
import { listChunksByArticle, setChunkQa } from "./db/chunks";
import type { ChunkRow } from "./db/types";
import { getCurrentPrompt } from "./db/prompts";
import { getStyleProfile } from "./db/styleProfiles";
import { retrieveLessons, type RetrievedLesson } from "./retrieval";
import { runQaPass } from "./qa";

export type QaOutcome =
  | {
      status: "qad";
      amharicDraft: string;
      topN: number;
      /** Union of lessons retrieved across all chunks, deduped by correctionId (best score wins). */
      lessons: RetrievedLesson[];
      retrievalError?: string;
      /** Writer name of the style profile applied, or null if none was selected. */
      styleApplied: string | null;
      /** Ords of chunks whose QA pass failed and fell back to their plain translation. */
      failedOrds: number[];
    }
  | { status: "failed"; error: unknown };

/**
 * Combines each chunk's retrieved lessons into one list for the outcome/API
 * surface: a correction retrieved for more than one chunk appears once, at
 * its best score, ranked best-first.
 */
function combineLessons(perChunk: RetrievedLesson[][]): RetrievedLesson[] {
  const bestById = new Map<string, RetrievedLesson>();
  for (const lessons of perChunk) {
    for (const lesson of lessons) {
      const existing = bestById.get(lesson.correctionId);
      if (!existing || lesson.score > existing.score) {
        bestById.set(lesson.correctionId, lesson);
      }
    }
  }
  return [...bestById.values()].sort((a, b) => b.score - a.score);
}

/**
 * Shared QA pipeline: QAs each translated chunk independently — its own
 * retrieval query and its own Gemini pass — rather than one pass over the
 * whole reassembled article. A single article-wide pass dilutes retrieval
 * (one blurry query embedding a multi-topic article) and the lessons'
 * influence (a handful of short notes against a whole article of context),
 * and is more exposed to attention weakening toward the end of a long
 * generation (architecture.md §10 Risks). Stores each chunk's result
 * (chunks.amharic_qa) plus the joined article-level amharic_draft/amharic_qa
 * (status -> 'qad'). Used by both the standalone QA route and reassemble
 * (which triggers QA automatically after chunks are joined) — no fork.
 *
 * One chunk's QA pass failing never fails the whole pass (pipeline order:
 * "one chunk failing must never fail the article"): that chunk keeps its
 * plain translation, its ord is reported in failedOrds, and the rest still
 * QA normally. The pipeline only reports "failed" (leaving all state
 * untouched) when every chunk's QA pass fails, or an earlier step (missing
 * article/prompt, or no translated chunks) fails outright.
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
    const translated = chunks.filter((c) => Boolean(c.amharic_text?.trim()));
    if (translated.length === 0) {
      throw new Error("No translated chunks to QA");
    }

    const promptEntry = await getCurrentPrompt(d1, "qa");
    if (!promptEntry) throw new Error("No 'qa' prompt configured");

    const topN = qaRetrievalTopN(env);

    // Selecting a style is optional (Requirement 15): no writer_style_id means
    // QA runs with general judgement only, same as before Sprint 4.1. Style is
    // article-level (one selection per article), not per chunk.
    let styleGuidelines: string | null = null;
    let styleApplied: string | null = null;
    if (article.writer_style_id) {
      const profile = await getStyleProfile(d1, article.writer_style_id);
      if (profile) {
        styleGuidelines = profile.derived_guidelines;
        styleApplied = profile.writer_name;
      }
    }

    const perChunkLessons: RetrievedLesson[][] = [];
    let retrievalError: string | undefined;
    const failedOrds: number[] = [];
    const qaTextByChunkId = new Map<string, string>();

    // Sequential, not parallel: keeps each chunk's own retry-with-backoff
    // budget independent and stays well clear of the Workers Free plan's
    // 50-subrequest-per-request ceiling even under heavy retries.
    for (const chunk of translated) {
      const lessons = await retrieveChunkLessons(env, articleId, chunk, topN, (msg) => {
        retrievalError = msg;
      });
      perChunkLessons.push(lessons);

      try {
        const qaText = await runQaPass(env, {
          qaPromptBody: promptEntry.version.body,
          englishContext: chunk.english_text,
          machineAmharic: chunk.amharic_text as string,
          lessons,
          styleGuidelines,
        });
        qaTextByChunkId.set(chunk.id, qaText);
        await setChunkQa(d1, chunk.id, qaText);
      } catch (err) {
        failedOrds.push(chunk.ord);
        console.error(`QA failed for article ${articleId} chunk ${chunk.ord}:`, err);
      }
    }

    if (qaTextByChunkId.size === 0) {
      throw new Error("QA failed for every chunk");
    }

    const amharicDraft = translated
      .map((c) => qaTextByChunkId.get(c.id) ?? (c.amharic_text as string))
      .join("\n\n");

    await setArticleQaDraft(d1, articleId, amharicDraft, Date.now());
    return {
      status: "qad",
      amharicDraft,
      topN,
      lessons: combineLessons(perChunkLessons),
      retrievalError,
      styleApplied,
      failedOrds,
    };
  } catch (err) {
    console.error(`QA pipeline failed for article ${articleId}:`, err);
    return { status: "failed", error: err };
  }
}

/**
 * Retrieval for one chunk: best-effort, same as the whole-pipeline retrieval
 * used to be — if Vectorize/embedding is unavailable, that chunk still gets
 * QA'd (with general judgement) rather than failing. Logs which corrections
 * were retrieved for this chunk, for later quality inspection.
 */
async function retrieveChunkLessons(
  env: Env,
  articleId: string,
  chunk: ChunkRow,
  topN: number,
  onError: (message: string) => void,
): Promise<RetrievedLesson[]> {
  let lessons: RetrievedLesson[] = [];
  try {
    lessons = await retrieveLessons(env, chunk.english_text, topN);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Retrieval failed";
    onError(message);
    console.error(`QA retrieval failed for article ${articleId} chunk ${chunk.ord}:`, err);
  }

  console.log(
    `QA retrieval for article ${articleId} chunk ${chunk.ord}: topN=${topN}, retrieved=${lessons.length} ` +
      `[${lessons.map((l) => `${l.correctionId}@${l.score.toFixed(3)}`).join(", ")}]`,
  );

  return lessons;
}
