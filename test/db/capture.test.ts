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

/** No per-fix breakdown — exercises the whole-article fallback (one lesson). */
const input = {
  articleId: "art-1",
  changeSummary: "Reviewer replaced the literal verb with the idiomatic one.",
  topicTag: "verb-choice",
  fixes: [],
};

/** Two fixes — exercises the normal per-fix path (one lesson each). */
const twoFixes = {
  articleId: "art-1",
  changeSummary: "Two unrelated fixes across the article.",
  topicTag: "mixed",
  fixes: [
    {
      category: "wording" as const,
      detail: "Replaced literal verb with idiomatic one",
      englishAnchor: "announcing a policy",
    },
    {
      category: "grammar-suffix" as const,
      detail: "Fixed subject agreement suffix",
      englishAnchor: "the minister",
    },
  ],
};

describe("captureCorrection — per-fix", () => {
  it("writes one vector and one row per fix, each pointing at the other", async () => {
    const vec = fakeVectorize();
    const result = await captureCorrection(testEnv({ DB: db.d1, VECTORIZE: vec }), twoFixes);

    expect(result.vectorIds).toHaveLength(2);
    expect(result.correctionIds).toHaveLength(2);
    expect(vec.upserted).toHaveLength(2);
    expect(vec.upserted.map((v) => v.id).sort()).toEqual([...result.vectorIds].sort());

    const rows = await listCorrections(db.d1);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.vector_id).sort()).toEqual([...result.vectorIds].sort());
  });

  it("stores each fix's own breakdown and anchors its lesson on the english anchor", async () => {
    await captureCorrection(testEnv({ DB: db.d1, VECTORIZE: fakeVectorize() }), twoFixes);
    const rows = await listCorrections(db.d1);

    const wording = rows.find((r) => r.change_summary.includes("idiomatic"));
    expect(wording?.change_summary).toBe(
      'When translating about "announcing a policy": Replaced literal verb with idiomatic one',
    );
    // fix_categories on each row is that ONE fix, wrapped as a FixDetail[].
    expect(JSON.parse(wording?.fix_categories as string)).toEqual([twoFixes.fixes[0]]);
  });

  it("embeds every fix in a single Workers AI call", async () => {
    let runCalls = 0;
    let lastText: unknown;
    const ai = {
      async run(_model: string, opts: { text?: string | string[] }) {
        runCalls += 1;
        lastText = opts.text;
        const count = Array.isArray(opts.text) ? opts.text.length : 1;
        return { data: Array.from({ length: count }, () => new Array(768).fill(0.01)) };
      },
    };
    await captureCorrection(testEnv({ DB: db.d1, VECTORIZE: fakeVectorize(), AI: ai }), twoFixes);

    expect(runCalls).toBe(1);
    expect(Array.isArray(lastText)).toBe(true);
    expect(lastText).toHaveLength(2);
  });

  it("tags every vector with its article for traceability", async () => {
    const vec = fakeVectorize();
    await captureCorrection(testEnv({ DB: db.d1, VECTORIZE: vec }), twoFixes);
    for (const v of vec.upserted) {
      expect(v.metadata).toEqual({ article_id: "art-1", topic_tag: "mixed" });
    }
  });

  it("rolls back every vector when the D1 batch fails, leaving no orphan", async () => {
    const vec = fakeVectorize();
    await expect(
      captureCorrection(testEnv({ DB: db.d1, VECTORIZE: vec }), {
        ...twoFixes,
        articleId: "ghost",
      }),
    ).rejects.toThrow();

    expect(await countCorrections(db.d1)).toBe(0);
    expect(vec.deleted.sort()).toEqual(vec.upserted.map((v) => v.id).sort());
  });
});

describe("captureCorrection — whole-article fallback (no per-fix breakdown)", () => {
  it("writes exactly one vector and one row that point at each other", async () => {
    const vec = fakeVectorize();
    const result = await captureCorrection(testEnv({ DB: db.d1, VECTORIZE: vec }), input);

    expect(result.vectorIds).toHaveLength(1);
    expect(vec.upserted).toHaveLength(1);
    expect(vec.upserted[0].id).toBe(result.vectorIds[0]);

    const rows = await listCorrections(db.d1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: result.correctionIds[0],
      vector_id: result.vectorIds[0],
      article_id: "art-1",
      change_summary: input.changeSummary,
      topic_tag: "verb-choice",
    });
    // No structured breakdown was available, so the row stores null.
    expect(rows[0].fix_categories).toBeNull();
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

    expect(a.correctionIds[0]).not.toBe(b.correctionIds[0]);
    expect(a.vectorIds[0]).not.toBe(b.vectorIds[0]);
    expect(await countCorrections(db.d1)).toBe(2);
  });
});
