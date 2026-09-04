import type { ChunkRow } from "./types";

export async function replaceChunks(
  d1: D1Database,
  articleId: string,
  chunks: { id: string; ord: number; englishText: string }[],
): Promise<void> {
  const statements = [
    d1.prepare("DELETE FROM chunks WHERE article_id = ?").bind(articleId),
    ...chunks.map((c) =>
      d1
        .prepare(
          "INSERT INTO chunks (id, article_id, ord, english_text, status) VALUES (?, ?, ?, ?, 'proposed')",
        )
        .bind(c.id, articleId, c.ord, c.englishText),
    ),
  ];
  await d1.batch(statements);
}

export async function listChunksByArticle(d1: D1Database, articleId: string): Promise<ChunkRow[]> {
  const { results } = await d1
    .prepare("SELECT * FROM chunks WHERE article_id = ? ORDER BY ord")
    .bind(articleId)
    .all<ChunkRow>();
  return results;
}

export async function getChunk(
  d1: D1Database,
  articleId: string,
  ord: number,
): Promise<ChunkRow | null> {
  const row = await d1
    .prepare("SELECT * FROM chunks WHERE article_id = ? AND ord = ?")
    .bind(articleId, ord)
    .first<ChunkRow>();
  return row ?? null;
}

/**
 * A fresh translation invalidates any prior per-chunk QA output (it QA'd the
 * old amharic_text, not this one), so amharic_qa is cleared back to NULL here
 * rather than left stale.
 */
export async function setChunkTranslation(
  d1: D1Database,
  id: string,
  amharicText: string,
  englishHash: string,
): Promise<void> {
  await d1
    .prepare(
      "UPDATE chunks SET amharic_text = ?, status = 'translated', english_hash = ?, amharic_qa = NULL WHERE id = ?",
    )
    .bind(amharicText, englishHash, id)
    .run();
}

/** Stores this chunk's per-chunk QA output (migration 0009). */
export async function setChunkQa(d1: D1Database, id: string, amharicQa: string): Promise<void> {
  await d1.prepare("UPDATE chunks SET amharic_qa = ? WHERE id = ?").bind(amharicQa, id).run();
}

export async function setChunkStatus(d1: D1Database, id: string, status: string): Promise<void> {
  await d1.prepare("UPDATE chunks SET status = ? WHERE id = ?").bind(status, id).run();
}

/**
 * Persists a user-adjusted set of chunk boundaries (merge / move split point) in order.
 * A chunk whose id matches an existing row AND whose text is unchanged keeps its prior
 * amharic_text/status/english_hash; anything new or edited resets to an untranslated
 * 'proposed' chunk so it gets picked up by the translate step.
 */
export async function saveChunkBoundaries(
  d1: D1Database,
  articleId: string,
  chunks: { id: string | null; englishText: string }[],
): Promise<void> {
  const existing = await listChunksByArticle(d1, articleId);
  const existingById = new Map(existing.map((c) => [c.id, c]));

  const rows = chunks.map((c, i) => {
    const text = c.englishText.trim();
    const prior = c.id ? existingById.get(c.id) : undefined;
    const unchanged = Boolean(prior && prior.english_text.trim() === text);
    return {
      id: unchanged && prior ? prior.id : crypto.randomUUID(),
      ord: i,
      englishText: text,
      amharicText: unchanged && prior ? prior.amharic_text : null,
      status: unchanged && prior ? prior.status : "proposed",
      englishHash: unchanged && prior ? prior.english_hash : null,
      // Same "unchanged carries forward, changed resets" rule as amharic_text:
      // a chunk's prior QA output is only valid for its prior text.
      amharicQa: unchanged && prior ? prior.amharic_qa : null,
    };
  });

  const statements = [
    d1.prepare("DELETE FROM chunks WHERE article_id = ?").bind(articleId),
    ...rows.map((r) =>
      d1
        .prepare(
          "INSERT INTO chunks (id, article_id, ord, english_text, amharic_text, status, english_hash, amharic_qa) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          r.id,
          articleId,
          r.ord,
          r.englishText,
          r.amharicText,
          r.status,
          r.englishHash,
          r.amharicQa,
        ),
    ),
  ];
  await d1.batch(statements);
}
