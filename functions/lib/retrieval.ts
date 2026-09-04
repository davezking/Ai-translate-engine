import type { Env } from "./env";
import { vectorize, db, qaRetrievalMinScore } from "./env";
import { embedText } from "./embeddings";
import { getCorrectionsByVectorIds } from "./db/corrections";

/** One retrieved past lesson, resolved from a Vectorize match back to its D1 row. */
export interface RetrievedLesson {
  correctionId: string;
  vectorId: string;
  changeSummary: string;
  topicTag: string | null;
  /** Vectorize similarity score for this match (higher = closer, cosine). */
  score: number;
}

/**
 * The retrieval half of the RAG loop: embed the current article's context,
 * find the nearest correction summaries in Vectorize, and resolve them to their
 * D1 rows (so the caller gets the real stored summary text, not just an id).
 *
 * The English source is what gets embedded because the embedding model is
 * English (bge-base-en) and the stored vectors were built from English change
 * summaries — both live in the same space, so topical similarity lines up.
 *
 * Vectorize's topK is a nearest-K search, not a relevance filter — it always
 * returns up to `topN` matches regardless of how weak the closest ones are.
 * qaRetrievalMinScore (the "relevance floor") drops matches below a tunable
 * score before they're even resolved against D1, so a cold or off-topic
 * library returns fewer (or zero) lessons instead of `topN` mediocre ones.
 * Matches whose D1 row is missing are also dropped (see
 * getCorrectionsByVectorIds), so the result is at most `topN` and preserves
 * the similarity ranking either way.
 */
export async function retrieveLessons(
  env: Env,
  contextText: string,
  topN: number,
): Promise<RetrievedLesson[]> {
  const trimmed = contextText.trim();
  if (!trimmed) return [];

  const queryVector = await embedText(env, trimmed);
  const { matches: allMatches } = await vectorize(env).query(queryVector, {
    topK: topN,
    returnMetadata: false,
  });

  const minScore = qaRetrievalMinScore(env);
  const matches = allMatches.filter((m) => m.score >= minScore);
  if (matches.length === 0) return [];

  const scoreByVectorId = new Map(matches.map((m) => [m.id, m.score]));
  const rows = await getCorrectionsByVectorIds(
    db(env),
    matches.map((m) => m.id),
  );

  return rows.map((row) => ({
    correctionId: row.id,
    vectorId: row.vector_id,
    changeSummary: row.change_summary,
    topicTag: row.topic_tag,
    score: scoreByVectorId.get(row.vector_id) ?? 0,
  }));
}
