import type { Env } from "../../../lib/env";
import { db } from "../../../lib/env";
import { finalizeArticle, getArticle } from "../../../lib/db/articles";
import { onArticleFinalized } from "../../../lib/hooks";
import type { AuthedData } from "../../_middleware";

/**
 * Flushes any pending draft text and marks the article final. The Phase 3
 * QA-vs-final compare + correction capture attaches via onArticleFinalized.
 */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (context) => {
  const articleId = context.params.id as string;
  const body = (await context.request.json().catch(() => null)) as { amharicText?: unknown } | null;

  const article = await getArticle(db(context.env), articleId);
  if (!article) return Response.json({ error: "Article not found" }, { status: 404 });

  const finalText = typeof body?.amharicText === "string" ? body.amharicText : article.amharic_draft;
  if (!finalText || !finalText.trim()) {
    return Response.json({ error: "No draft to finalize" }, { status: 400 });
  }

  const now = Date.now();
  await finalizeArticle(db(context.env), articleId, finalText, now);
  await onArticleFinalized(context.env, articleId);

  const updated = await getArticle(db(context.env), articleId);
  return Response.json({ article: updated });
};
