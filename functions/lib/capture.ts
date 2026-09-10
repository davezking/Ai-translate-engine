import type { Env } from "./env";
import { vectorize, db } from "./env";
import { embedTexts } from "./embeddings";
import { insertCorrections, type CorrectionInsert } from "./db/corrections";
import type { FixDetail } from "./compare";

export interface CaptureInput {
  articleId: string;
  changeSummary: string;
  topicTag: string | null;
  /** Per-fix breakdown from compare; each fix becomes its own retrievable lesson. */
  fixes: FixDetail[];
}

export interface CaptureResult {
  /** One id per stored lesson (one per fix, or one for the whole-article fallback). */
  correctionIds: string[];
  vectorIds: string[];
}

/** One lesson about to be embedded and stored: its own vector + its own corrections row. */
interface PlannedLesson {
  /** English-dominant text embedded into the vector, so it matches future English chunk queries. */
  embed: string;
  /** Stored in change_summary and shown to QA via renderLessons — the actionable lesson. */
  changeSummary: string;
  /** JSON-encoded FixDetail[] for this row (a single-element array), or null for the fallback. */
  fixCategories: string | null;
}

/**
 * Turns a compare result into the lessons to store. The normal path is one
 * lesson PER FIX (Option B): each fix gets a sharp, single-topic vector anchored
 * on the English concept it concerns, so per-chunk English retrieval finds
 * precise lessons instead of one blurry whole-article summary.
 *
 * Fallback: if the model reported fixes but omitted (or malformed) the per-fix
 * breakdown, `fixes` is empty even though fixCount > 0. Rather than lose the
 * lesson, we store the whole-article changeSummary as a single lesson — exactly
 * the pre-Option-B behaviour. Never called with no lesson to store (the caller
 * skips capture when fixCount is 0).
 */
function planLessons(input: CaptureInput): PlannedLesson[] {
  if (input.fixes.length === 0) {
    return [
      { embed: input.changeSummary, changeSummary: input.changeSummary, fixCategories: null },
    ];
  }
  return input.fixes.map((fix) => {
    const anchor = fix.englishAnchor.trim();
    return {
      // Anchor first so the English subject dominates the EMBEDDING; the detail
      // (which may contain Ge'ez) adds specificity without displacing it. The
      // Ge'ez before/after example is deliberately NOT embedded — bge-base-en is
      // an English model, so Ge'ez tokens would only blur the vector; it enriches
      // the stored/QA-facing lesson instead (see renderFixLesson).
      embed: anchor ? `${anchor}. ${fix.detail}` : fix.detail,
      changeSummary: renderFixLesson(fix, anchor),
      // Store just THIS fix's breakdown on its own row (a single-element array),
      // so the /corrections view and any consumer still reads a FixDetail[].
      fixCategories: JSON.stringify([fix] satisfies FixDetail[]),
    };
  });
}

/**
 * The lesson text stored in change_summary and injected into the QA prompt. When
 * the compare reported the actual Ge'ez spans, it appends the concrete before→after
 * example — a machine-invented proverb removed, a verb suffix corrected — which is
 * far more actionable for QA than an abstract English description alone. Falls back
 * cleanly to just the description when a span is missing (best-effort metadata).
 */
function renderFixLesson(fix: FixDetail, anchor: string): string {
  const base = anchor ? `When translating about "${anchor}": ${fix.detail}` : fix.detail;
  const before = fix.before.trim();
  const after = fix.after.trim();
  let example = "";
  if (before && after) example = ` (e.g. '${before}' → '${after}')`;
  else if (before) example = ` (removed: '${before}')`;
  else if (after) example = ` (added: '${after}')`;
  return `${base}${example}`;
}

/**
 * Stores the correction lessons for one finalized article so they become
 * retrievable. Embeds every lesson in one Workers AI call, upserts all vectors
 * in one Vectorize call, and writes all matching D1 rows in one transaction.
 *
 * Keeps D1 <-> Vectorize 1:1 (Hard rule 3 — no orphans in either direction) at
 * SET granularity: the vectors are upserted first; if the D1 batch then fails,
 * every upserted vector is deleted so no orphan survives. If the embedding or
 * upsert fails, nothing is persisted at all. Either way the caller can retry
 * cleanly. Doing both writes as single batched calls also keeps a fix-heavy
 * article well under the Workers 50-subrequest ceiling.
 */
export async function captureCorrection(env: Env, input: CaptureInput): Promise<CaptureResult> {
  const lessons = planLessons(input);

  const values = await embedTexts(
    env,
    lessons.map((l) => l.embed),
  );

  const now = Date.now();
  const prepared = lessons.map((lesson, i) => ({
    vectorId: crypto.randomUUID(),
    correctionId: crypto.randomUUID(),
    values: values[i],
    lesson,
  }));

  const vectorIds = prepared.map((p) => p.vectorId);
  const correctionIds = prepared.map((p) => p.correctionId);

  // Vectors first: if this throws, nothing was persisted.
  await vectorize(env).upsert(
    prepared.map((p) => ({
      id: p.vectorId,
      values: p.values,
      metadata: {
        article_id: input.articleId,
        ...(input.topicTag ? { topic_tag: input.topicTag } : {}),
      },
    })),
  );

  // Then the D1 rows, all-or-nothing. If the batch fails, roll back every
  // vector so no orphan remains.
  const inserts: CorrectionInsert[] = prepared.map((p) => ({
    id: p.correctionId,
    articleId: input.articleId,
    changeSummary: p.lesson.changeSummary,
    topicTag: input.topicTag,
    fixCategories: p.lesson.fixCategories,
    vectorId: p.vectorId,
    now,
  }));

  try {
    await insertCorrections(db(env), inserts);
  } catch (err) {
    await vectorize(env)
      .deleteByIds(vectorIds)
      .catch(() => {
        /* best-effort rollback; surface the original D1 error below */
      });
    throw err;
  }

  return { correctionIds, vectorIds };
}
