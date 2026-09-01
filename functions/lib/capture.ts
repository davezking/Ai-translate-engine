import type { Env } from "./env";
import { ai, vectorize, db, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "./env";
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

interface EmbeddingResponse {
  data?: number[][];
}

/**
 * Embeds text with Workers AI and returns the vector, failing loudly if its
 * dimension doesn't match the Vectorize index. A mismatch is never silently
 * inserted — Vectorize would reject or corrupt the index, so we stop here.
 */
async function embedSummary(env: Env, text: string): Promise<number[]> {
  const res = (await ai(env).run(EMBEDDING_MODEL, { text })) as EmbeddingResponse;
  const values = res?.data?.[0];
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Workers AI returned no embedding vector");
  }
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimension mismatch: model ${EMBEDDING_MODEL} returned ${values.length}, ` +
        `but the Vectorize index expects ${EMBEDDING_DIMENSIONS}. Refusing to insert.`,
    );
  }
  return values;
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
  const values = await embedSummary(env, input.changeSummary);

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
