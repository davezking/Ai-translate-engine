import type { Env } from "./env";
import { vectorize, db } from "./env";
import { embedText } from "./embeddings";
import { insertCorrection } from "./db/corrections";

export interface CaptureInput {
  articleId: string;
  changeSummary: string;
  topicTag: string | null;
}

export interface CaptureResult {
  correctionId: string;
  vectorId: string;
}

/**
 * Stores one correction so it becomes retrievable: embeds the change summary,
 * upserts the vector into Vectorize, and writes the matching D1 corrections row
 * pointing at it via vector_id.
 *
 * Keeps D1 <-> Vectorize 1:1 (Hard rule 3 — no orphans in either direction).
 * The vector is upserted first; if the D1 write then fails, the vector is
 * deleted so no orphan vector survives. If the embedding or upsert fails,
 * nothing is persisted at all. Either way the caller can retry cleanly.
 */
export async function captureCorrection(env: Env, input: CaptureInput): Promise<CaptureResult> {
  const values = await embedText(env, input.changeSummary);

  const vectorId = crypto.randomUUID();
  const correctionId = crypto.randomUUID();
  const now = Date.now();

  // Vector first: if this throws, nothing was persisted.
  await vectorize(env).upsert([
    {
      id: vectorId,
      values,
      metadata: {
        article_id: input.articleId,
        ...(input.topicTag ? { topic_tag: input.topicTag } : {}),
      },
    },
  ]);

  // Then the D1 row. If it fails, roll back the vector so no orphan remains.
  try {
    await insertCorrection(db(env), {
      id: correctionId,
      articleId: input.articleId,
      changeSummary: input.changeSummary,
      topicTag: input.topicTag,
      vectorId,
      now,
    });
  } catch (err) {
    await vectorize(env)
      .deleteByIds([vectorId])
      .catch(() => {
        /* best-effort rollback; surface the original D1 error below */
      });
    throw err;
  }

  return { correctionId, vectorId };
}
