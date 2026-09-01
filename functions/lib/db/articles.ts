import type { ArticleRow } from "./types";

export async function createArticle(
  d1: D1Database,
  input: { id: string; sourceEnglish: string; now: number },
): Promise<void> {
  await d1
    .prepare(
      "INSERT INTO articles (id, source_english, status, created_at, updated_at) VALUES (?, ?, 'ingested', ?, ?)",
    )
    .bind(input.id, input.sourceEnglish, input.now, input.now)
    .run();
}

export async function getArticle(d1: D1Database, id: string): Promise<ArticleRow | null> {
  const row = await d1.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first<ArticleRow>();
  return row ?? null;
}

export async function updateArticleStatus(
  d1: D1Database,
  id: string,
  status: string,
  now: number,
): Promise<void> {
  await d1
    .prepare("UPDATE articles SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, now, id)
    .run();
}

export async function setArticleDraft(
  d1: D1Database,
  id: string,
  amharicDraft: string,
  now: number,
): Promise<void> {
  await d1
    .prepare(
      "UPDATE articles SET amharic_draft = ?, status = 'drafted', updated_at = ? WHERE id = ?",
    )
    .bind(amharicDraft, now, id)
    .run();
}

/** Reviewer autosave: patches the working draft without touching status. */
export async function patchArticleDraft(
  d1: D1Database,
  id: string,
  amharicDraft: string,
  now: number,
): Promise<void> {
  await d1
    .prepare("UPDATE articles SET amharic_draft = ?, updated_at = ? WHERE id = ?")
    .bind(amharicDraft, now, id)
    .run();
}

/** Flushes the given text into both amharic_draft and amharic_final and marks the article final. */
export async function finalizeArticle(
  d1: D1Database,
  id: string,
  amharicFinal: string,
  now: number,
): Promise<void> {
  await d1
    .prepare(
      "UPDATE articles SET amharic_draft = ?, amharic_final = ?, status = 'final', updated_at = ? WHERE id = ?",
    )
    .bind(amharicFinal, amharicFinal, now, id)
    .run();
}
