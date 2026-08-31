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

export async function setChunkTranslation(
  d1: D1Database,
  id: string,
  amharicText: string,
): Promise<void> {
  await d1
    .prepare("UPDATE chunks SET amharic_text = ?, status = 'translated' WHERE id = ?")
    .bind(amharicText, id)
    .run();
}

export async function setChunkStatus(d1: D1Database, id: string, status: string): Promise<void> {
  await d1.prepare("UPDATE chunks SET status = ? WHERE id = ?").bind(status, id).run();
}
