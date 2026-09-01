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

/**
 * Stores the QA pass output as the working draft and moves the article to the
 * 'qad' state (pipeline: drafted -> qad -> review -> final). This is the draft
 * the Phase 2 reviewer then edits. QA runs before human review, so no reviewer
 * edits exist to lose here (Hard rule 5).
 */
export async function setArticleQaDraft(
  d1: D1Database,
  id: string,
  amharicDraft: string,
  now: number,
): Promise<void> {
  await d1
    .prepare("UPDATE articles SET amharic_draft = ?, status = 'qad', updated_at = ? WHERE id = ?")
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

/**
 * Records the finalize-compare outcome: the fix count and the correction-capture
 * state (see migration 0004). Does not touch pipeline `status`.
 */
export async function recordCompareResult(
  d1: D1Database,
  id: string,
  fixCount: number,
  correctionStatus: string,
  now: number,
): Promise<void> {
  await d1
    .prepare(
      "UPDATE articles SET fix_count = ?, correction_status = ?, updated_at = ? WHERE id = ?",
    )
    .bind(fixCount, correctionStatus, now, id)
    .run();
}

/** Sets only the correction-capture state (e.g. mark 'pending' after a compare failure). */
export async function setCorrectionStatus(
  d1: D1Database,
  id: string,
  correctionStatus: string,
  now: number,
): Promise<void> {
  await d1
    .prepare("UPDATE articles SET correction_status = ?, updated_at = ? WHERE id = ?")
    .bind(correctionStatus, now, id)
    .run();
}

/**
 * Seed intake (POST /api/seed): inserts an already-finalized article in one
 * shot from an (English, AI-translation, human-final) triple, tagged
 * source = 'seed' (migration 0005) so it's distinguishable from articles that
 * went through the live pipeline. This gives the shared compare+capture path
 * an article row to attach fix_count/correction_status/corrections to.
 */
export async function createSeedArticle(
  d1: D1Database,
  input: {
    id: string;
    sourceEnglish: string;
    amharicDraft: string;
    amharicFinal: string;
    now: number;
  },
): Promise<void> {
  await d1
    .prepare(
      "INSERT INTO articles (id, source_english, amharic_draft, amharic_final, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, 'final', 'seed', ?, ?)",
    )
    .bind(
      input.id,
      input.sourceEnglish,
      input.amharicDraft,
      input.amharicFinal,
      input.now,
      input.now,
    )
    .run();
}
