import type { Env } from "../../lib/env";
import { db } from "../../lib/env";
import { listFinalizedArticleFixCounts } from "../../lib/db/articles";
import type { AuthedData } from "../_middleware";

/** Window used to mark the early "baseline" period in the trend view. */
const BASELINE_DAYS = 14;
const BASELINE_MS = BASELINE_DAYS * 24 * 60 * 60 * 1000;

/**
 * GET /api/metrics/fixes: fix_count per finalized article, ordered by finalize
 * time, for the fixes-per-article trend view (Requirement 13 / primary
 * metric). Read-only and cheap — a single indexed-order SELECT, no
 * aggregation; baselineEndsAt is computed in-memory from the first row.
 */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (context) => {
  const rows = await listFinalizedArticleFixCounts(db(context.env));

  const points = rows.map((r) => ({
    articleId: r.id,
    // null = compare hasn't run yet (correction_status 'pending') or the
    // article predates Sprint 3.1; distinct from 0, which means "no fixes".
    fixCount: r.fix_count,
    correctionStatus: r.correction_status,
    finalizedAt: r.updated_at,
  }));

  const baselineEndsAt = points.length > 0 ? points[0].finalizedAt + BASELINE_MS : null;

  return Response.json({ points, baselineDays: BASELINE_DAYS, baselineEndsAt });
};
