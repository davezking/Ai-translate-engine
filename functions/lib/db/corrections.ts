import type { CorrectionRow } from "./types";

export interface CorrectionInsert {
  id: string;
  articleId: string;
  changeSummary: string;
  topicTag: string | null;
  fixCategories: string | null;
  vectorId: string;
  now: number;
}

const INSERT_SQL =
  "INSERT INTO corrections (id, article_id, change_summary, topic_tag, fix_categories, vector_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)";

function bindInsert(d1: D1Database, input: CorrectionInsert): D1PreparedStatement {
  return d1
    .prepare(INSERT_SQL)
    .bind(
      input.id,
      input.articleId,
      input.changeSummary,
      input.topicTag,
      input.fixCategories,
      input.vectorId,
      input.now,
    );
}

export async function insertCorrection(d1: D1Database, input: CorrectionInsert): Promise<void> {
  await bindInsert(d1, input).run();
}

/**
 * Inserts several correction rows in ONE D1 transaction (d1.batch): per-fix
 * capture writes N rows for one finalize, and this keeps them all-or-nothing so
 * the D1 side can never be left half-written relative to the Vectorize upsert
 * (Hard rule 3). A no-op for an empty list.
 */
export async function insertCorrections(d1: D1Database, inputs: CorrectionInsert[]): Promise<void> {
  if (inputs.length === 0) return;
  await d1.batch(inputs.map((input) => bindInsert(d1, input)));
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
