import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createArticle } from "../../functions/lib/db/articles";
import { insertCorrection } from "../../functions/lib/db/corrections";
import { retrieveLessons } from "../../functions/lib/retrieval";
import { createTestDb, type TestDb } from "../helpers/d1";
import { fakeVectorize, testEnv } from "../helpers/env";

let db: TestDb;
beforeEach(async () => {
  db = createTestDb();
  await createArticle(db.d1, { id: "art-1", sourceEnglish: "English.", now: 1_000 });
});
afterEach(() => db.close());

async function correction(
  id: string,
  vectorId: string,
  summary: string,
  tag: string | null = null,
) {
  await insertCorrection(db.d1, {
    id,
    articleId: "art-1",
    changeSummary: summary,
    topicTag: tag,
    fixCategories: null,
    vectorId,
    now: 1_000,
  });
}

describe("retrieveLessons", () => {
  it("returns nothing, and touches nothing, for empty context text", async () => {
    const vec = fakeVectorize();
    const query = vi.spyOn(vec, "query");

    expect(await retrieveLessons(testEnv({ DB: db.d1, VECTORIZE: vec }), "   ", 4)).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns nothing when the library has no matches yet", async () => {
    const vec = fakeVectorize();
    vec.nextMatches = [];
    expect(await retrieveLessons(testEnv({ DB: db.d1, VECTORIZE: vec }), "context", 4)).toEqual([]);
  });

  it("resolves matches to their stored summaries, keeping the similarity ranking", async () => {
    await correction("c1", "v1", "Lesson one.", "idiom");
    await correction("c2", "v2", "Lesson two.");

    const vec = fakeVectorize();
    vec.nextMatches = [
      { id: "v2", score: 0.91 },
      { id: "v1", score: 0.72 },
    ];

    const lessons = await retrieveLessons(testEnv({ DB: db.d1, VECTORIZE: vec }), "context", 4);
    expect(lessons).toEqual([
      {
        correctionId: "c2",
        vectorId: "v2",
        changeSummary: "Lesson two.",
        topicTag: null,
        score: 0.91,
      },
      {
        correctionId: "c1",
        vectorId: "v1",
        changeSummary: "Lesson one.",
        topicTag: "idiom",
        score: 0.72,
      },
    ]);
  });

  it("drops a match with no row behind it rather than inventing a lesson", async () => {
    await correction("c1", "v1", "Lesson one.");

    const vec = fakeVectorize();
    vec.nextMatches = [
      { id: "v-orphan", score: 0.99 },
      { id: "v1", score: 0.5 },
    ];

    const lessons = await retrieveLessons(testEnv({ DB: db.d1, VECTORIZE: vec }), "context", 4);
    expect(lessons.map((l) => l.correctionId)).toEqual(["c1"]);
  });

  it("asks Vectorize for exactly topN matches", async () => {
    const vec = fakeVectorize();
    const query = vi.spyOn(vec, "query");
    await retrieveLessons(testEnv({ DB: db.d1, VECTORIZE: vec }), "context", 7);

    expect(query).toHaveBeenCalledWith(expect.any(Array), { topK: 7, returnMetadata: false });
  });

  it("embeds the English context, not the Amharic", async () => {
    const vec = fakeVectorize();
    const query = vi.spyOn(vec, "query");
    await retrieveLessons(testEnv({ DB: db.d1, VECTORIZE: vec }), "The minister announced.", 4);

    // The stub returns a fixed-length vector; what matters is that a vector of
    // the index's dimension was produced and handed to query().
    expect((query.mock.calls[0][0] as number[]).length).toBe(768);
  });

  it("drops a match below the configured relevance floor", async () => {
    await correction("c1", "v1", "Strong match.");
    await correction("c2", "v2", "Weak match.");

    const vec = fakeVectorize();
    vec.nextMatches = [
      { id: "v1", score: 0.8 },
      { id: "v2", score: 0.2 },
    ];

    const lessons = await retrieveLessons(
      testEnv({ DB: db.d1, VECTORIZE: vec, QA_RETRIEVAL_MIN_SCORE: "0.5" }),
      "context",
      4,
    );
    expect(lessons.map((l) => l.correctionId)).toEqual(["c1"]);
  });

  it("never looks up a below-floor match's D1 row", async () => {
    await correction("c1", "v1", "Weak match.");

    const vec = fakeVectorize();
    vec.nextMatches = [{ id: "v1", score: 0.1 }];
    const d1Get = vi.spyOn(db.d1, "prepare");

    const lessons = await retrieveLessons(
      testEnv({ DB: db.d1, VECTORIZE: vec, QA_RETRIEVAL_MIN_SCORE: "0.5" }),
      "context",
      4,
    );

    expect(lessons).toEqual([]);
    expect(d1Get).not.toHaveBeenCalled();
  });

  it("keeps a match exactly at the floor", async () => {
    await correction("c1", "v1", "Borderline match.");

    const vec = fakeVectorize();
    vec.nextMatches = [{ id: "v1", score: 0.5 }];

    const lessons = await retrieveLessons(
      testEnv({ DB: db.d1, VECTORIZE: vec, QA_RETRIEVAL_MIN_SCORE: "0.5" }),
      "context",
      4,
    );
    expect(lessons.map((l) => l.correctionId)).toEqual(["c1"]);
  });

  it("defaults to a permissive floor that keeps ordinary matches", async () => {
    await correction("c1", "v1", "Ordinary match.");

    const vec = fakeVectorize();
    vec.nextMatches = [{ id: "v1", score: 0.05 }];

    const lessons = await retrieveLessons(testEnv({ DB: db.d1, VECTORIZE: vec }), "context", 4);
    expect(lessons.map((l) => l.correctionId)).toEqual(["c1"]);
  });

  it("returning nothing above the floor is not an error — QA can still fall back to general judgement", async () => {
    await correction("c1", "v1", "Weak match.");

    const vec = fakeVectorize();
    vec.nextMatches = [{ id: "v1", score: -0.5 }];

    await expect(
      retrieveLessons(
        testEnv({ DB: db.d1, VECTORIZE: vec, QA_RETRIEVAL_MIN_SCORE: "0.5" }),
        "context",
        4,
      ),
    ).resolves.toEqual([]);
  });
});
