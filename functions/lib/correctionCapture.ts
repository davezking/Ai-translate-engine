import type { Env } from "./env";
import { db } from "./env";
import { recordCompareResult, setCorrectionStatus } from "./db/articles";
import { compareTranslations, type CompareInput } from "./compare";
import { captureCorrection } from "./capture";

export type CaptureOutcome =
  | { status: "captured"; fixCount: number; correctionId: string; vectorId: string }
  | { status: "skipped"; fixCount: number }
  | { status: "pending"; error: unknown };

/**
 * Shared compare -> capture pipeline: runs the Gemini compare, stores fix_count,
 * and (if fixCount > 0) captures the correction into the retrieval library.
 * Used by both live finalize (lib/hooks.ts) and seed intake (api/seed.ts) so
 * they share one code path — no fork.
 *
 * Never throws: any failure (compare or capture) is reported in the returned
 * outcome instead, so callers decide how to surface it — finalize must still
 * succeed, while seed intake can report the failure straight to the admin.
 */
export async function runCompareAndCapture(
  env: Env,
  articleId: string,
  input: CompareInput,
): Promise<CaptureOutcome> {
  const d1 = db(env);
  try {
    const result = await compareTranslations(env, input);

    if (result.fixCount === 0) {
      // No meaningful change — no lesson to store or embed.
      await recordCompareResult(d1, articleId, result.fixCount, "skipped", Date.now());
      return { status: "skipped", fixCount: result.fixCount };
    }

    await recordCompareResult(d1, articleId, result.fixCount, "pending", Date.now());
    const captured = await captureCorrection(env, {
      articleId,
      changeSummary: result.changeSummary,
      topicTag: result.topicTag,
    });
    await setCorrectionStatus(d1, articleId, "captured", Date.now());
    return { status: "captured", fixCount: result.fixCount, ...captured };
  } catch (err) {
    await setCorrectionStatus(d1, articleId, "pending", Date.now()).catch(() => {});
    return { status: "pending", error: err };
  }
}
