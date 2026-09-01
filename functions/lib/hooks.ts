import type { Env } from "./env";
import { db } from "./env";
import { getArticle, recordCompareResult, setCorrectionStatus } from "./db/articles";
import { listChunksByArticle } from "./db/chunks";
import { compareTranslations } from "./compare";

/**
 * Called once an article has been finalized. Runs the Gemini finalize compare
 * (machine/QA Amharic vs human-final) and stores the fix count on the article.
 *
 * Finalize must never fail because of this: any Gemini/compare error is caught
 * and the article is marked correction_status = 'pending' so capture can be
 * retried. The correction row + Vectorize embedding are written by the
 * store+embed step, which flips 'pending' -> 'captured'.
 */
export async function onArticleFinalized(env: Env, articleId: string): Promise<void> {
  const d1 = db(env);
  const now = Date.now();

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
      await setCorrectionStatus(d1, articleId, "skipped", now);
      return;
    }

    const result = await compareTranslations(env, {
      englishContext: article.source_english,
      machineAmharic,
      humanFinalAmharic: article.amharic_final,
    });

    // Store the fix count now; store+embed (next task) writes the correction
    // row + vector and flips this to 'captured', so capture stays 'pending'.
    await recordCompareResult(d1, articleId, result.fixCount, "pending", now);
  } catch (err) {
    // Never break finalize. Leave fix_count as-is and mark capture retryable.
    await setCorrectionStatus(d1, articleId, "pending", now).catch(() => {});
    console.error(`Correction capture deferred for article ${articleId}:`, err);
  }
}
