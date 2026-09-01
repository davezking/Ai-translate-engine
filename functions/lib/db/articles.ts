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
 * Stores the QA pass output as the working draft AND as the immutable
 * amharic_qa snapshot, and moves the article to the 'qad' state (pipeline:
 * drafted -> qad -> review -> final). amharic_draft is what the Phase 2
 * reviewer edits (and autosave overwrites); amharic_qa is never touched again,
 * so finalize-compare has a faithful pre-edit machine side to compare against
 * (migration 0006). QA runs before human review, so no reviewer edits exist to
 * lose here (Hard rule 5).
 */
export async function setArticleQaDraft(
  d1: D1Database,
  id: string,
  amharicText: string,
  now: number,
): Promise<void> {
  await d1
    .prepare(
      "UPDATE articles SET amharic_draft = ?, amharic_qa = ?, status = 'qad', updated_at = ? WHERE id = ?",
    )
    .bind(amharicText, amharicText, now, id)
    .run();
}

/** Sets (or clears, with null) the selected writer style profile for QA (Sprint 4.1 Task 3). */
export async function setArticleStyle(
  d1: D1Database,
  id: string,
  writerStyleId: string | null,
  now: number,
): Promise<void> {
  await d1
    .prepare("UPDATE articles SET writer_style_id = ?, updated_at = ? WHERE id = ?")
    .bind(writerStyleId, now, id)
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

export interface FinalizedArticleFixRow {
  id: string;
  fix_count: number | null;
  correction_status: string | null;
  updated_at: number;
}

/**
 * Finalized articles with their fix_count, ordered by finalize time, for the
 * fixes-per-article trend view (Requirement 13). Ordered by updated_at: once
 * an article is 'final' nothing touches it again (review edits and QA both
 * refuse on a finalized article), except the finalize-compare's own
 * recordCompareResult/setCorrectionStatus calls that immediately follow
 * finalizeArticle in the same request — so updated_at still lands at
 * finalize time, not later. Cheap: one indexed-order SELECT, no aggregation.
 */
export async function listFinalizedArticleFixCounts(
  d1: D1Database,
): Promise<FinalizedArticleFixRow[]> {
  const { results } = await d1
    .prepare(
      "SELECT id, fix_count, correction_status, updated_at FROM articles WHERE status = 'final' ORDER BY updated_at ASC",
    )
    .all<FinalizedArticleFixRow>();
  return results;
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
