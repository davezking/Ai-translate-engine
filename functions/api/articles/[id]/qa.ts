import type { Env } from "../../../lib/env";
import { db } from "../../../lib/env";
import { getArticle } from "../../../lib/db/articles";
import { runQaPipeline } from "../../../lib/qaPipeline";
import type { AuthedData } from "../../_middleware";

/**
 * Standalone QA pass trigger (Requirements 6 + 8): thin wrapper over the
 * shared runQaPipeline (also invoked automatically by reassemble) — no fork.
 * Useful for re-running QA on demand; reassemble is what drives it in the
 * normal pipeline flow (Sprint 3.2 task 2).
 *
 * Server-side only — Gemini, Vectorize, Workers AI and D1 are all reached via
 * bindings here, never the browser. Fails gracefully: a QA (Gemini) failure
 * leaves the pre-QA draft intact and returns 502.
 */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (context) => {
  const articleId = context.params.id as string;
  const article = await getArticle(db(context.env), articleId);
  if (!article) return Response.json({ error: "Article not found" }, { status: 404 });
  if (article.status === "final") {
    return Response.json({ error: "Article is finalized; QA can no longer run" }, { status: 409 });
  }

  const outcome = await runQaPipeline(context.env, articleId);
  if (outcome.status === "failed") {
    return Response.json(
      { error: outcome.error instanceof Error ? outcome.error.message : "QA failed" },
      { status: 502 },
    );
  }

  return Response.json({
    amharicDraft: outcome.amharicDraft,
    topN: outcome.topN,
    retrievedCorrectionIds: outcome.lessons.map((l) => l.correctionId),
    lessons: outcome.lessons.map((l) => ({
      correctionId: l.correctionId,
      topicTag: l.topicTag,
      score: l.score,
    })),
    styleApplied: outcome.styleApplied,
    ...(outcome.retrievalError ? { retrievalError: outcome.retrievalError } : {}),
  });
};
