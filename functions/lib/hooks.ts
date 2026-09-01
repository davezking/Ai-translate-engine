import type { Env } from "./env";
import { db } from "./env";
import { getArticle, recordCompareResult, setCorrectionStatus } from "./db/articles";
import { listChunksByArticle } from "./db/chunks";
import { compareTranslations } from "./compare";
import { captureCorrection } from "./capture";

/**
 * Called once an article has been finalized. Runs the Gemini finalize compare
 * (machine/QA Amharic vs human-final), stores the fix count, and captures the
 * correction into the retrieval library (embed + Vectorize + D1 corrections row).
 *
 * Finalize must never fail because of this: any Gemini/embed/store error is
 * caught and the article is left correction_status = 'pending' so capture can
 * be retried. A successful capture flips it to 'captured'; an article with no
 * meaningful change is marked 'skipped' and stores nothing.
 */
export async function onArticleFinalized(env: Env, articleId: string): Promise<void> {
  const d1 = db(env);

  try {
    const article = await getArticle(d1, articleId);
    if (!article || !article.amharic_final) return;

    // Comparison source = the pre-edit machine translation. amharic_draft is NOT
    // used: reviewer autosave overwrites it, so it no longer holds the machine
    // output by finalize time. The chunks' amharic_text is untouched by the
    // editor, so reassembling it reproduces the machine translation. Sprint 3.2
    // swaps in the true QA output via compareTranslations' machineAmharic param.
    const chunks = await listChunksByArticle(d1, articleId);
    const machineAmharic = chunks
      .map((c) => c.amharic_text ?? "")
      .filter((t) => t.trim())
      .join("\n\n");

    if (!machineAmharic.trim()) {
      // No machine text to compare against — nothing to learn from.
      await setCorrectionStatus(d1, articleId, "skipped", Date.now());
      return;
    }

    const result = await compareTranslations(env, {
      englishContext: article.source_english,
      machineAmharic,
      humanFinalAmharic: article.amharic_final,
    });

    if (result.fixCount === 0) {
      // The human made no meaningful change — no lesson to store or embed.
      await recordCompareResult(d1, articleId, result.fixCount, "skipped", Date.now());
      return;
    }

    // Store the fix count and mark pending, then capture. If capture throws,
    // the catch below leaves it 'pending' (fix_count already stored) for retry.
    await recordCompareResult(d1, articleId, result.fixCount, "pending", Date.now());
    await captureCorrection(env, {
      articleId,
      changeSummary: result.changeSummary,
      topicTag: result.topicTag,
    });
    await setCorrectionStatus(d1, articleId, "captured", Date.now());
  } catch (err) {
    // Never break finalize. Leave fix_count as-is and mark capture retryable.
    await setCorrectionStatus(d1, articleId, "pending", Date.now()).catch(() => {});
    console.error(`Correction capture deferred for article ${articleId}:`, err);
  }
}
