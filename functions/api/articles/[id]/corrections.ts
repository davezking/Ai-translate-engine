import type { Env } from "../../../lib/env";
import { db } from "../../../lib/env";
import { getCorrectionsByArticleId } from "../../../lib/db/corrections";
import type { AuthedData } from "../../_middleware";

/**
 * GET /api/articles/:id/corrections: the correction(s) captured for this
 * article — the "what was learned" view for the fixes-per-article trend
 * table. Read-only, same auth surface as GET /api/metrics/fixes (not
 * admin-gated: both reviewers can see what QA learned from an article).
 */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (context) => {
  const rows = await getCorrectionsByArticleId(db(context.env), context.params.id as string);
  const corrections = rows.map((r) => ({
    id: r.id,
    changeSummary: r.change_summary,
    topicTag: r.topic_tag,
    createdAt: r.created_at,
  }));
  return Response.json({ corrections });
};
