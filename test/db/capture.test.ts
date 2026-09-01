import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureCorrection } from "../../functions/lib/capture";
import { createArticle } from "../../functions/lib/db/articles";
import { countCorrections, listCorrections } from "../../functions/lib/db/corrections";
import { createTestDb, type TestDb } from "../helpers/d1";
import { fakeAi, fakeVectorize, testEnv } from "../helpers/env";

let db: TestDb;
beforeEach(async () => {
  db = createTestDb();
  await createArticle(db.d1, { id: "art-1", sourceEnglish: "English.", now: 1_000 });
});
afterEach(() => db.close());

const input = {
  articleId: "art-1",
  changeSummary: "Reviewer replaced the literal verb with the idiomatic one.",
  topicTag: "verb-choice",
};

describe("captureCorrection", () => {
  it("writes exactly one vector and one row that point at each other", async () => {
    const vec = fakeVectorize();
    const result = await captureCorrection(testEnv({ DB: db.d1, VECTORIZE: vec }), input);

    expect(vec.upserted).toHaveLength(1);
    expect(vec.upserted[0].id).toBe(result.vectorId);

    const rows = await listCorrections(db.d1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: result.correctionId,
      vector_id: result.vectorId,
      article_id: "art-1",
      change_summary: input.changeSummary,
      topic_tag: "verb-choice",
    });
  });

  it("tags the vector with its article so a match can be traced back", async () => {
    const vec = fakeVectorize();
    await captureCorrection(testEnv({ DB: db.d1, VECTORIZE: vec }), input);
    expect(vec.upserted[0].metadata).toEqual({ article_id: "art-1", topic_tag: "verb-choice" });
  });

  it("omits the topic tag from metadata when there is none", async () => {
    const vec = fakeVectorize();
    await captureCorrection(testEnv({ DB: db.d1, VECTORIZE: vec }), { ...input, topicTag: null });
    expect(vec.upserted[0].metadata).toEqual({ article_id: "art-1" });
  });

  it("persists nothing at all when the embedding fails", async () => {
    const vec = fakeVectorize();
    const env = testEnv({ DB: db.d1, VECTORIZE: vec, AI: fakeAi(384) });

    await expect(captureCorrection(env, input)).rejects.toThrow(/dimension mismatch/i);
    expect(vec.upserted).toHaveLength(0);
    expect(await countCorrections(db.d1)).toBe(0);
  });

  it("persists no row when the vector upsert fails", async () => {
    const vec = fakeVectorize();
    vec.upsertError = new Error("vectorize unavailable");

    await expect(captureCorrection(testEnv({ DB: db.d1, VECTORIZE: vec }), input)).rejects.toThrow(
      /vectorize unavailable/,
    );
    expect(await countCorrections(db.d1)).toBe(0);
  });

  it("deletes the vector when the D1 write fails, leaving no orphan", async () => {
    // The article FK is what fails here; any D1 failure takes the same path.
    const vec = fakeVectorize();
    const env = testEnv({ DB: db.d1, VECTORIZE: vec });

    await expect(captureCorrection(env, { ...input, articleId: "ghost" })).rejects.toThrow();

    expect(await countCorrections(db.d1)).toBe(0);
    expect(vec.deleted).toEqual([vec.upserted[0].id]);
  });

  it("surfaces the original D1 error even if the rollback delete also fails", async () => {
    const vec = fakeVectorize();
    vec.deleteByIds = async () => {
      throw new Error("delete failed too");
    };
    const env = testEnv({ DB: db.d1, VECTORIZE: vec });

    await expect(captureCorrection(env, { ...input, articleId: "ghost" })).rejects.not.toThrow(
      /delete failed too/,
    );
    expect(await countCorrections(db.d1)).toBe(0);
  });

  it("gives every capture distinct ids", async () => {
    const env = testEnv({ DB: db.d1, VECTORIZE: fakeVectorize() });
    const a = await captureCorrection(env, input);
    const b = await captureCorrection(env, input);

    expect(a.correctionId).not.toBe(b.correctionId);
    expect(a.vectorId).not.toBe(b.vectorId);
    expect(await countCorrections(db.d1)).toBe(2);
  });
});
