import type { CorrectionRow } from "./types";

export async function insertCorrection(
  d1: D1Database,
  input: {
    id: string;
    articleId: string;
    changeSummary: string;
    topicTag: string | null;
    fixCategories: string | null;
    vectorId: string;
    now: number;
  },
): Promise<void> {
  await d1
    .prepare(
      "INSERT INTO corrections (id, article_id, change_summary, topic_tag, fix_categories, vector_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      input.id,
      input.articleId,
      input.changeSummary,
      input.topicTag,
      input.fixCategories,
      input.vectorId,
      input.now,
    )
    .run();
}

/**
 * Resolves Vectorize match ids back to their corrections rows. Returned in the
 * order given (the caller's similarity ranking), skipping any id with no row —
 * a vector without a matching row is a tolerated read-time miss (e.g. a row
 * deleted after the query), never fabricated. See Hard rule 3 for why the two
 * stores are kept 1:1 on the write side.
 */
export async function getCorrectionsByVectorIds(
  d1: D1Database,
  vectorIds: string[],
): Promise<CorrectionRow[]> {
  if (vectorIds.length === 0) return [];
  const placeholders = vectorIds.map(() => "?").join(", ");
  const { results } = await d1
    .prepare(`SELECT * FROM corrections WHERE vector_id IN (${placeholders})`)
    .bind(...vectorIds)
    .all<CorrectionRow>();
  const byVectorId = new Map(results.map((r) => [r.vector_id, r]));
  return vectorIds.map((id) => byVectorId.get(id)).filter((r): r is CorrectionRow => Boolean(r));
}

/** Corrections captured for one article — the "what was learned" view (newest first). */
export async function getCorrectionsByArticleId(
  d1: D1Database,
  articleId: string,
): Promise<CorrectionRow[]> {
  const { results } = await d1
    .prepare("SELECT * FROM corrections WHERE article_id = ? ORDER BY created_at DESC")
    .bind(articleId)
    .all<CorrectionRow>();
  return results;
}

export async function listCorrections(d1: D1Database): Promise<CorrectionRow[]> {
  const { results } = await d1
    .prepare("SELECT * FROM corrections ORDER BY created_at DESC")
    .all<CorrectionRow>();
  return results;
}

/** Running total of stored corrections, for the seed-intake batch UI. */
export async function countCorrections(d1: D1Database): Promise<number> {
  const row = await d1
    .prepare("SELECT COUNT(*) AS count FROM corrections")
    .first<{ count: number }>();
  return row?.count ?? 0;
}
