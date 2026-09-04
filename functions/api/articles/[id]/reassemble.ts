import type { Env } from "../../../lib/env";
import { db } from "../../../lib/env";
import { setArticleDraft } from "../../../lib/db/articles";
import { listChunksByArticle } from "../../../lib/db/chunks";
import { runQaPipeline } from "../../../lib/qaPipeline";
import type { AuthedData } from "../../_middleware";

/**
 * Concatenates translated chunks in order into articles.amharic_draft, refuses
 * if any chunk is unfinished, then automatically triggers the QA pass
 * (Sprint 3.2: reassemble -> QA -> review, no manual step in between). QA
 * failure is non-blocking — the reassembled draft stands and the reviewer can
 * still proceed; the response flags the failure via qaError instead of losing
 * pipeline progress.
 */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (context) => {
  const articleId = context.params.id as string;
  const chunks = await listChunksByArticle(db(context.env), articleId);

  if (chunks.length === 0) {
    return Response.json({ error: "No chunks to reassemble; run split first" }, { status: 400 });
  }

  const unfinished = chunks.filter((c) => c.status !== "translated" || !c.amharic_text);
  if (unfinished.length > 0) {
    return Response.json(
      {
        error: "Cannot reassemble: some chunks are not translated yet",
        pendingOrds: unfinished.map((c) => c.ord),
      },
      { status: 400 },
    );
  }

  const draft = chunks.map((c) => c.amharic_text as string).join("\n\n");
  await setArticleDraft(db(context.env), articleId, draft, Date.now());

  const qaOutcome = await runQaPipeline(context.env, articleId);
  if (qaOutcome.status === "qad") {
    return Response.json({
      amharicDraft: qaOutcome.amharicDraft,
      qa: true,
      // Chunks whose own QA pass failed and fell back to their plain
      // translation (pipeline order: one chunk failing never fails the pass).
      failedOrds: qaOutcome.failedOrds,
    });
  }

  return Response.json({
    amharicDraft: draft,
    qa: false,
    qaError: qaOutcome.error instanceof Error ? qaOutcome.error.message : "QA failed",
  });
};
