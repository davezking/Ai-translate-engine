import type { Env } from "../../../lib/env";
import { db } from "../../../lib/env";
import { getCorrectionsByArticleId } from "../../../lib/db/corrections";
import type { FixDetail } from "../../../lib/compare";
import type { AuthedData } from "../../_middleware";

function safeParseFixCategories(raw: string): FixDetail[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FixDetail[]) : [];
  } catch {
    return [];
  }
}

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
    // Best-effort parse: a row written before migration 0008, or with a
    // corrupted value, just yields no breakdown rather than a 500.
    fixCategories: r.fix_categories ? safeParseFixCategories(r.fix_categories) : [],
    createdAt: r.created_at,
  }));
  return Response.json({ corrections });
};
