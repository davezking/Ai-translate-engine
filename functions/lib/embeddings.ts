import type { Env } from "./env";
import { ai, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "./env";

interface EmbeddingResponse {
  data?: number[][];
}

/** The dimension guard shared by embedText and embedTexts — never insert a mismatched vector. */
function assertDimension(values: unknown): number[] {
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
  return assertDimension(res?.data?.[0]);
}

/**
 * Embeds several texts in ONE Workers AI call (bge accepts a string array),
 * returning one vector per input in the same order. Used by per-fix correction
 * capture so a fix-heavy article costs a single embedding subrequest instead of
 * one per fix — which keeps finalize well under the Workers 50-subrequest
 * ceiling and cuts neuron usage. Every returned vector is dimension-checked, so
 * a mismatch still fails loudly rather than corrupting the index.
 */
export async function embedTexts(env: Env, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = (await ai(env).run(EMBEDDING_MODEL, { text: texts })) as EmbeddingResponse;
  const data = res?.data;
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new Error(
      `Workers AI returned ${Array.isArray(data) ? data.length : "no"} embedding vectors ` +
        `for ${texts.length} inputs`,
    );
  }
  return data.map((values) => assertDimension(values));
}
