import { describe, expect, it } from "vitest";
import { embedText } from "../../functions/lib/embeddings";
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
