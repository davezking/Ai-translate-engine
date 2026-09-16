import type { Env } from "../../lib/env";
import { db } from "../../lib/env";
import { createArticle, listFinalizedArticles } from "../../lib/db/articles";
import { enforceMaxLength, MAX_ARTICLE_CHARS } from "../../lib/limits";
import type { AuthedData } from "../_middleware";

/**
 * GET /api/articles: finalized articles for the history view, newest finalize
 * first. Read-only; returns a source preview per article, not full text.
 */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (context) => {
  const rows = await listFinalizedArticles(db(context.env));
  const articles = rows.map((r) => ({
    id: r.id,
    sourcePreview: r.source_preview,
    fixCount: r.fix_count,
    correctionStatus: r.correction_status,
    source: r.source,
    createdAt: r.created_at,
    finalizedAt: r.updated_at,
  }));
  return Response.json({ articles });
};

/** Paste-text ingestion: stores the pasted English and hands back the new article's id. */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (context) => {
  const body = (await context.request.json().catch(() => null)) as {
    sourceEnglish?: unknown;
  } | null;
  const sourceEnglish = typeof body?.sourceEnglish === "string" ? body.sourceEnglish.trim() : "";
  if (!sourceEnglish) {
    return Response.json(
      { error: "sourceEnglish is required and cannot be empty" },
      { status: 400 },
    );
  }
  const tooLong = enforceMaxLength("sourceEnglish", sourceEnglish, MAX_ARTICLE_CHARS);
  if (tooLong) return tooLong;

  const id = crypto.randomUUID();
  await createArticle(db(context.env), { id, sourceEnglish, now: Date.now() });

  return Response.json({ id }, { status: 201 });
};
