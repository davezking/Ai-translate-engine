import type { CorrectionRow } from "./types";

export async function insertCorrection(
  d1: D1Database,
  input: {
    id: string;
    articleId: string;
    changeSummary: string;
    topicTag: string | null;
    vectorId: string;
    now: number;
  },
): Promise<void> {
  await d1
    .prepare(
      "INSERT INTO corrections (id, article_id, change_summary, topic_tag, vector_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(input.id, input.articleId, input.changeSummary, input.topicTag, input.vectorId, input.now)
    .run();
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
