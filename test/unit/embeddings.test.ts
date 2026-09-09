import { describe, expect, it } from "vitest";
import { embedText, embedTexts } from "../../functions/lib/embeddings";
import { EMBEDDING_DIMENSIONS } from "../../functions/lib/env";
import { fakeAi, testEnv } from "../helpers/env";

describe("embedText", () => {
  it("returns the model's vector when the dimension matches the index", async () => {
    const values = await embedText(testEnv(), "a change summary");
    expect(values).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("refuses a vector whose dimension does not match the Vectorize index", async () => {
    // Writing a mismatched vector would corrupt the index — it must fail loudly,
    // never silently insert.
    const env = testEnv({ AI: fakeAi(384) });
    await expect(embedText(env, "a change summary")).rejects.toThrow(/dimension mismatch/i);
  });

  it("names both dimensions in the error so the mismatch is diagnosable", async () => {
    const env = testEnv({ AI: fakeAi(384) });
    await expect(embedText(env, "x")).rejects.toThrow(/384.*768|768.*384/s);
  });

  it("throws when Workers AI returns no vector at all", async () => {
    const env = testEnv({ AI: { run: async () => ({ data: [] }) } });
    await expect(embedText(env, "x")).rejects.toThrow(/no embedding vector/i);
  });

  it("throws when Workers AI returns an empty vector", async () => {
    const env = testEnv({ AI: { run: async () => ({ data: [[]] }) } });
    await expect(embedText(env, "x")).rejects.toThrow(/no embedding vector/i);
  });
});

describe("embedTexts", () => {
  it("returns one dimension-correct vector per input, in order", async () => {
    const vectors = await embedTexts(testEnv(), ["one", "two", "three"]);
    expect(vectors).toHaveLength(3);
    for (const v of vectors) expect(v).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("embeds everything in a single Workers AI call", async () => {
    let runCalls = 0;
    const env = testEnv({
      AI: {
        async run(_model: string, opts: { text?: string | string[] }) {
          runCalls += 1;
          const count = Array.isArray(opts.text) ? opts.text.length : 1;
          return { data: Array.from({ length: count }, () => new Array(768).fill(0.01)) };
        },
      },
    });
    await embedTexts(env, ["a", "b", "c", "d"]);
    expect(runCalls).toBe(1);
  });

  it("does not call the model for an empty list", async () => {
    let runCalls = 0;
    const env = testEnv({
      AI: {
        async run() {
          runCalls += 1;
          return { data: [] };
        },
      },
    });
    expect(await embedTexts(env, [])).toEqual([]);
    expect(runCalls).toBe(0);
  });

  it("refuses when a returned vector's dimension does not match the index", async () => {
    const env = testEnv({ AI: fakeAi(384) });
    await expect(embedTexts(env, ["x", "y"])).rejects.toThrow(/dimension mismatch/i);
  });

  it("throws when the model returns the wrong number of vectors", async () => {
    const env = testEnv({
      AI: { run: async () => ({ data: [new Array(EMBEDDING_DIMENSIONS).fill(0.01)] }) },
    });
    await expect(embedTexts(env, ["x", "y"])).rejects.toThrow(/1 embedding vectors for 2 inputs/i);
  });
});
