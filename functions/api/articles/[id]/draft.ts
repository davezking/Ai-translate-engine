import type { Env } from "../../../lib/env";
import { db } from "../../../lib/env";
import { getArticle, patchArticleDraft } from "../../../lib/db/articles";
import type { AuthedData } from "../../_middleware";

/** Reviewer autosave: writes the working Amharic draft. Skips the write if unchanged. */
export const onRequestPatch: PagesFunction<Env, string, AuthedData> = async (context) => {
  const articleId = context.params.id as string;
  const body = (await context.request.json().catch(() => null)) as { amharicText?: unknown } | null;
  if (typeof body?.amharicText !== "string") {
    return Response.json({ error: "amharicText is required" }, { status: 400 });
  }

  const article = await getArticle(db(context.env), articleId);
  if (!article) return Response.json({ error: "Article not found" }, { status: 404 });
  // A finalized article is immutable, same as for /qa and /style. The editor
  // disables itself once finalized, but that is client-side only.
  if (article.status === "final") {
    return Response.json(
      { error: "Article is finalized; the draft can no longer be edited" },
      { status: 409 },
    );
  }

  if (article.amharic_draft === body.amharicText) {
    return Response.json({ amharicDraft: article.amharic_draft, updatedAt: article.updated_at });
  }

  const now = Date.now();
  await patchArticleDraft(db(context.env), articleId, body.amharicText, now);

  return Response.json({ amharicDraft: body.amharicText, updatedAt: now });
};
