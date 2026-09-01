import type { Env } from "../../../lib/env";
import { db, qaRetrievalTopN } from "../../../lib/env";
import { getArticle, setArticleQaDraft } from "../../../lib/db/articles";
import { listChunksByArticle } from "../../../lib/db/chunks";
import { getCurrentPrompt } from "../../../lib/db/prompts";
import { retrieveLessons, type RetrievedLesson } from "../../../lib/retrieval";
import { runQaPass } from "../../../lib/qa";
import type { AuthedData } from "../../_middleware";

/**
 * QA pass (Requirements 6 + 8): retrieves the most relevant past correction
 * lessons from the library and feeds them, with the reassembled machine Amharic,
 * into the tunable `qa` prompt. The QA output becomes the draft the reviewer
 * edits.
 *
 * Server-side only — Gemini, Vectorize, Workers AI and D1 are all reached via
 * bindings here, never the browser. Fails gracefully: retrieval trouble degrades
 * to a no-lessons QA, and a QA (Gemini) failure leaves the pre-QA draft intact.
 */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (context) => {
  const articleId = context.params.id as string;
  const d1 = db(context.env);

  const article = await getArticle(d1, articleId);
  if (!article) return Response.json({ error: "Article not found" }, { status: 404 });
  if (article.status === "final") {
    return Response.json({ error: "Article is finalized; QA can no longer run" }, { status: 409 });
  }

  // Machine side = the reassembled chunk translations (the same untouched
  // machine output the finalize compare uses), not amharic_draft — which a
  // prior QA run or reviewer edits may have replaced. Re-running QA therefore
  // always corrects the raw translation, not an already-QA'd draft.
  const chunks = await listChunksByArticle(d1, articleId);
  const machineAmharic = chunks
    .map((c) => c.amharic_text ?? "")
    .filter((t) => t.trim())
    .join("\n\n");
  if (!machineAmharic.trim()) {
    return Response.json(
      { error: "No translated chunks to QA; run translate + reassemble first" },
      { status: 400 },
    );
  }

  const promptEntry = await getCurrentPrompt(d1, "qa");
  if (!promptEntry) {
    return Response.json({ error: "No 'qa' prompt configured" }, { status: 500 });
  }

  const topN = qaRetrievalTopN(context.env);

  // Retrieval is best-effort: if Vectorize/embedding is unavailable, QA still
  // runs (with general judgement) rather than failing the whole pass.
  let lessons: RetrievedLesson[] = [];
  let retrievalError: string | undefined;
  try {
    lessons = await retrieveLessons(context.env, article.source_english, topN);
  } catch (err) {
    retrievalError = err instanceof Error ? err.message : "Retrieval failed";
    console.error(`QA retrieval failed for article ${articleId}:`, err);
  }

  // Log which corrections were retrieved, for later quality inspection.
  const retrievedCorrectionIds = lessons.map((l) => l.correctionId);
  console.log(
    `QA retrieval for article ${articleId}: topN=${topN}, retrieved=${
      retrievedCorrectionIds.length
    } [${lessons.map((l) => `${l.correctionId}@${l.score.toFixed(3)}`).join(", ")}]`,
  );

  let qaText: string;
  try {
    qaText = await runQaPass(context.env, {
      qaPromptBody: promptEntry.version.body,
      englishContext: article.source_english,
      machineAmharic,
      lessons,
    });
  } catch (err) {
    // Leave the pre-QA draft intact so nothing is lost; the UI can retry.
    return Response.json(
      { error: err instanceof Error ? err.message : "QA failed", retrievedCorrectionIds },
      { status: 502 },
    );
  }

  await setArticleQaDraft(d1, articleId, qaText, Date.now());

  return Response.json({
    amharicDraft: qaText,
    topN,
    retrievedCorrectionIds,
    lessons: lessons.map((l) => ({
      correctionId: l.correctionId,
      topicTag: l.topicTag,
      score: l.score,
    })),
    ...(retrievalError ? { retrievalError } : {}),
  });
};
