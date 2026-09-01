import type { Env } from "../../../lib/env";
import { db } from "../../../lib/env";
import { getArticle, setArticleStyle } from "../../../lib/db/articles";
import { getStyleProfile } from "../../../lib/db/styleProfiles";
import type { AuthedData } from "../../_middleware";

/**
 * Operator-facing style selection (Requirements 7 + 15): any authenticated
 * user picks the writer style to apply at QA. This is selection, not the
 * admin-only style management surface (create/approve, Hard rule 8) — it only
 * points the article at an already-approved profile.
 */
export const onRequestPatch: PagesFunction<Env, string, AuthedData> = async (context) => {
  const articleId = context.params.id as string;
  const d1 = db(context.env);

  const article = await getArticle(d1, articleId);
  if (!article) return Response.json({ error: "Article not found" }, { status: 404 });
  if (article.status === "final") {
    return Response.json(
      { error: "Article is finalized; style can no longer be changed" },
      {
        status: 409,
      },
    );
  }

  const body = (await context.request.json().catch(() => null)) as {
    writerStyleId?: unknown;
  } | null;
  const raw = body?.writerStyleId;
  if (raw !== null && typeof raw !== "string") {
    return Response.json({ error: "writerStyleId must be a string or null" }, { status: 400 });
  }
  const writerStyleId = raw === null ? null : raw.trim() || null;

  if (writerStyleId !== null) {
    const profile = await getStyleProfile(d1, writerStyleId);
    if (!profile) return Response.json({ error: "Style profile not found" }, { status: 404 });
    if (profile.approved !== 1) {
      return Response.json({ error: "Style profile is not approved yet" }, { status: 400 });
    }
  }

  const now = Date.now();
  await setArticleStyle(d1, articleId, writerStyleId, now);
  return Response.json({ writerStyleId, updatedAt: now });
};
