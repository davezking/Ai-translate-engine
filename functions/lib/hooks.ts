import type { Env } from "./env";
import { db } from "./env";
import { getArticle, setCorrectionStatus } from "./db/articles";
import { listChunksByArticle } from "./db/chunks";
import { runCompareAndCapture } from "./correctionCapture";

/**
 * Called once an article has been finalized. Runs the Gemini finalize compare
 * (machine/QA Amharic vs human-final) and captures the correction into the
 * retrieval library via the shared runCompareAndCapture pipeline (also used
 * by the seed intake route — no fork).
 *
 * Finalize must never fail because of this: every failure path here is
 * caught and the article is left correction_status = 'pending' so capture
 * can be retried.
 */
export async function onArticleFinalized(env: Env, articleId: string): Promise<void> {
  const d1 = db(env);

  try {
    const article = await getArticle(d1, articleId);
    if (!article || !article.amharic_final) return;

    // Comparison source = the QA output (Sprint 3.2), read from amharic_qa —
    // never amharic_draft, which reviewer autosave overwrites and so no longer
    // holds the pre-edit machine output by finalize time. Falls back to
    // reassembling the raw chunk translations for an article finalized before
    // QA ran or when QA failed, so finalize never blocks on QA having succeeded.
    let machineAmharic = article.amharic_qa ?? "";
    if (!machineAmharic.trim()) {
      const chunks = await listChunksByArticle(d1, articleId);
      machineAmharic = chunks
        .map((c) => c.amharic_text ?? "")
        .filter((t) => t.trim())
        .join("\n\n");
    }

    if (!machineAmharic.trim()) {
      // No machine text to compare against — nothing to learn from.
      await setCorrectionStatus(d1, articleId, "skipped", Date.now());
      return;
    }

    const outcome = await runCompareAndCapture(env, articleId, {
      englishContext: article.source_english,
      machineAmharic,
      humanFinalAmharic: article.amharic_final,
    });
    if (outcome.status === "pending") {
      console.error(`Correction capture deferred for article ${articleId}:`, outcome.error);
    }
  } catch (err) {
    // Never break finalize. Leave fix_count as-is and mark capture retryable.
    await setCorrectionStatus(d1, articleId, "pending", Date.now()).catch(() => {});
    console.error(`Correction capture deferred for article ${articleId}:`, err);
  }
}
