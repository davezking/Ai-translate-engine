import type { Env } from "./env";
import { ai, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "./env";

interface EmbeddingResponse {
  data?: number[][];
}

/**
 * Embeds text with Workers AI and returns the vector, failing loudly if its
 * dimension doesn't match the Vectorize index. A mismatch is never silently
 * used — writing it would corrupt the index and reading with it would return
 * garbage — so we stop here.
 *
 * Shared by correction capture (write side) and QA retrieval (read side) so the
 * embedding model and the dimension guard can never drift apart between them.
 */
export async function embedText(env: Env, text: string): Promise<number[]> {
  const res = (await ai(env).run(EMBEDDING_MODEL, { text })) as EmbeddingResponse;
  const values = res?.data?.[0];
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Workers AI returned no embedding vector");
  }
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimension mismatch: model ${EMBEDDING_MODEL} returned ${values.length}, ` +
        `but the Vectorize index expects ${EMBEDDING_DIMENSIONS}. Refusing to proceed.`,
    );
  }
  return values;
}
