import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runQaPipeline } from "../../functions/lib/qaPipeline";
import {
  createArticle,
  getArticle,
  setArticleDraft,
  setArticleStyle,
} from "../../functions/lib/db/articles";
import {
  listChunksByArticle,
  replaceChunks,
  setChunkTranslation,
} from "../../functions/lib/db/chunks";
import { insertCorrection } from "../../functions/lib/db/corrections";
import { approveStyleProfile, createStyleProfile } from "../../functions/lib/db/styleProfiles";
import { createTestDb, type TestDb } from "../helpers/d1";
import {
  fakeVectorize,
  stubGemini,
  stubGeminiError,
  testEnv,
  type FakeVectorize,
} from "../helpers/env";

let db: TestDb;
let vec: FakeVectorize;
beforeEach(async () => {
  db = createTestDb();
  vec = fakeVectorize();
  await createArticle(db.d1, { id: "art-1", sourceEnglish: "The minister announced.", now: 1_000 });
});
afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
});

function env(overrides: Record<string, unknown> = {}) {
  return testEnv({ DB: db.d1, VECTORIZE: vec, ...overrides });
}

async function translatedChunks(...texts: string[]) {
  await replaceChunks(
    db.d1,
    "art-1",
    texts.map((_, i) => ({ id: `chk-${i}`, ord: i, englishText: `english ${i}` })),
  );
  for (const [i, text] of texts.entries()) {
    await setChunkTranslation(db.d1, `chk-${i}`, text, `hash-${i}`);
  }
}

async function approvedStyle(id = "sty-1", guidelines = "Short declarative sentences.") {
  await createStyleProfile(db.d1, {
    id,
    writerName: "Almaz T.",
    sampleArticles: "[]",
    derivedGuidelines: guidelines,
    now: 1_000,
  });
  await approveStyleProfile(db.d1, id);
  await setArticleStyle(db.d1, "art-1", id, 1_500);
}

describe("runQaPipeline", () => {
  it("QAs each chunk independently and joins the results into the working draft", async () => {
    await translatedChunks("ክፍል አንድ።", "ክፍል ሁለት።");
    const gemini = stubGemini(["QA one", "QA two"]);

    const outcome = await runQaPipeline(env(), "art-1");

    expect(outcome).toMatchObject({
      status: "qad",
      amharicDraft: "QA one\n\nQA two",
      failedOrds: [],
    });
    expect(gemini.calls).toHaveLength(2);
    expect(gemini.calls[0].userContent).toContain("ክፍል አንድ።");
    expect(gemini.calls[0].userContent).not.toContain("ክፍል ሁለት።");
    expect(gemini.calls[1].userContent).toContain("ክፍል ሁለት።");
    expect(gemini.calls[1].userContent).not.toContain("ክፍል አንድ።");
    expect(await getArticle(db.d1, "art-1")).toMatchObject({
      amharic_draft: "QA one\n\nQA two",
      amharic_qa: "QA one\n\nQA two",
      status: "qad",
    });
    const chunks = await listChunksByArticle(db.d1, "art-1");
    expect(chunks.map((c) => c.amharic_qa)).toEqual(["QA one", "QA two"]);
  });

  it("QAs the chunk text, not a draft a reviewer may already have edited", async () => {
    await translatedChunks("machine amharic");
    await setArticleDraft(db.d1, "art-1", "an edited draft", 2_000);
    const gemini = stubGemini(["QA'd"]);

    await runQaPipeline(env(), "art-1");

    expect(gemini.calls[0].userContent).toContain("machine amharic");
    expect(gemini.calls[0].userContent).not.toContain("an edited draft");
  });

  it("uses the current qa prompt version as the system instruction for every chunk", async () => {
    await translatedChunks("machine 0", "machine 1");
    const gemini = stubGemini(["QA0", "QA1"]);

    await runQaPipeline(env(), "art-1");

    expect(gemini.calls).toHaveLength(2);
    for (const call of gemini.calls) {
      expect(call.systemInstruction).toContain("QA editor for Amharic translations");
    }
  });

  it("picks up a republished qa prompt without any redeploy", async () => {
    await translatedChunks("machine");
    db.raw.exec(
      "INSERT INTO promptVersions (id, prompt_key, version, body, author, created_at) " +
        "VALUES ('v2', 'qa', 2, 'A COMPLETELY NEW QA PROMPT', 'usr_admin', 2000)",
    );
    db.raw.exec("UPDATE prompts SET current_version_id = 'v2' WHERE key = 'qa'");

    const gemini = stubGemini(["QA'd"]);
    await runQaPipeline(env(), "art-1");

    expect(gemini.calls[0].systemInstruction).toBe("A COMPLETELY NEW QA PROMPT");
  });

  it("applies the selected writer style to every chunk", async () => {
    await translatedChunks("machine 0", "machine 1");
    await approvedStyle();
    const gemini = stubGemini(["QA0", "QA1"]);

    const outcome = await runQaPipeline(env(), "art-1");

    expect(outcome).toMatchObject({ status: "qad", styleApplied: "Almaz T." });
    expect(gemini.calls).toHaveLength(2);
    for (const call of gemini.calls) {
      expect(call.userContent).toContain("Short declarative sentences.");
    }
  });

  it("runs with general judgement when no style is selected", async () => {
    await translatedChunks("machine");
    const gemini = stubGemini(["QA'd"]);

    const outcome = await runQaPipeline(env(), "art-1");

    expect(outcome).toMatchObject({ status: "qad", styleApplied: null });
    expect(gemini.calls[0].userContent).not.toContain("TONE/VOICE GUIDELINES");
  });

  it("injects a chunk's own retrieved lessons into that chunk's prompt", async () => {
    await translatedChunks("machine");
    await insertCorrection(db.d1, {
      id: "c1",
      articleId: "art-1",
      changeSummary: "Prefer the idiomatic verb.",
      topicTag: "verb-choice",
      fixCategories: null,
      vectorId: "v1",
      now: 1_000,
    });
    vec.nextMatches = [{ id: "v1", score: 0.9 }];
    const gemini = stubGemini(["QA'd"]);

    const outcome = await runQaPipeline(env(), "art-1");

    expect(outcome).toMatchObject({ status: "qad", topN: 4 });
    expect(gemini.calls[0].userContent).toContain("Prefer the idiomatic verb.");
  });

  it("retrieves separately per chunk and combines the results, deduping by correction", async () => {
    await translatedChunks("machine 0", "machine 1");
    await insertCorrection(db.d1, {
      id: "c1",
      articleId: "art-1",
      changeSummary: "Lesson for chunk 0.",
      topicTag: null,
      fixCategories: null,
      vectorId: "v1",
      now: 1_000,
    });
    await insertCorrection(db.d1, {
      id: "c2",
      articleId: "art-1",
      changeSummary: "Lesson for chunk 1.",
      topicTag: null,
      fixCategories: null,
      vectorId: "v2",
      now: 1_000,
    });
    const query = vi
      .spyOn(vec, "query")
      .mockImplementationOnce(async () => ({ matches: [{ id: "v1", score: 0.9 }] }))
      .mockImplementationOnce(async () => ({ matches: [{ id: "v2", score: 0.8 }] }));
    const gemini = stubGemini(["QA0", "QA1"]);

    const outcome = await runQaPipeline(env(), "art-1");

    expect(query).toHaveBeenCalledTimes(2);
    expect(gemini.calls[0].userContent).toContain("Lesson for chunk 0.");
    expect(gemini.calls[0].userContent).not.toContain("Lesson for chunk 1.");
    expect(gemini.calls[1].userContent).toContain("Lesson for chunk 1.");
    expect(gemini.calls[1].userContent).not.toContain("Lesson for chunk 0.");
    expect(outcome.status).toBe("qad");
    if (outcome.status === "qad") {
      expect(outcome.lessons.map((l) => l.correctionId).sort()).toEqual(["c1", "c2"]);
    }
  });

  it("dedupes a lesson retrieved for more than one chunk, keeping its best score", async () => {
    await translatedChunks("machine 0", "machine 1");
    await insertCorrection(db.d1, {
      id: "c1",
      articleId: "art-1",
      changeSummary: "Shared lesson.",
      topicTag: null,
      fixCategories: null,
      vectorId: "v1",
      now: 1_000,
    });
    vi.spyOn(vec, "query")
      .mockImplementationOnce(async () => ({ matches: [{ id: "v1", score: 0.5 }] }))
      .mockImplementationOnce(async () => ({ matches: [{ id: "v1", score: 0.9 }] }));
    stubGemini(["QA0", "QA1"]);

    const outcome = await runQaPipeline(env(), "art-1");

    expect(outcome.status).toBe("qad");
    if (outcome.status === "qad") {
      expect(outcome.lessons).toEqual([
        expect.objectContaining({ correctionId: "c1", score: 0.9 }),
      ]);
    }
  });

  it("honours a configured retrieval top-N", async () => {
    await translatedChunks("machine");
    const query = vi.spyOn(vec, "query");
    stubGemini(["QA'd"]);

    await runQaPipeline(env({ QA_RETRIEVAL_TOP_N: "9" }), "art-1");
    expect(query).toHaveBeenCalledWith(expect.any(Array), { topK: 9, returnMetadata: false });
  });

  it("still QAs when retrieval fails for every chunk, and reports the degradation", async () => {
    await translatedChunks("machine 0", "machine 1");
    vec.query = async () => {
      throw new Error("vectorize down");
    };
    const gemini = stubGemini(["QA0", "QA1"]);

    const outcome = await runQaPipeline(env(), "art-1");

    expect(outcome).toMatchObject({
      status: "qad",
      retrievalError: "vectorize down",
      failedOrds: [],
      lessons: [],
    });
    expect(gemini.calls).toHaveLength(2);
    expect((await getArticle(db.d1, "art-1"))?.status).toBe("qad");
  });

  it("a chunk whose QA pass fails keeps its plain translation; the rest still QA", async () => {
    await translatedChunks("machine 0", "machine 1");
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      if (calls === 1) return new Response("bad request", { status: 400 });
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "QA1" }] } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const outcome = await runQaPipeline(env(), "art-1");

    expect(outcome).toMatchObject({ status: "qad", failedOrds: [0] });
    if (outcome.status === "qad") {
      expect(outcome.amharicDraft).toBe("machine 0\n\nQA1");
    }
    const chunks = await listChunksByArticle(db.d1, "art-1");
    expect(chunks[0].amharic_qa).toBeNull();
    expect(chunks[1].amharic_qa).toBe("QA1");
    expect((await getArticle(db.d1, "art-1"))?.status).toBe("qad");
  });

  it("fails without touching the draft when Gemini fails for the only chunk", async () => {
    await translatedChunks("machine");
    await setArticleDraft(db.d1, "art-1", "pre-QA draft", 2_000);
    stubGeminiError(503, "upstream unavailable");

    vi.useFakeTimers();
    let outcome: Awaited<ReturnType<typeof runQaPipeline>>;
    try {
      const result = runQaPipeline(env(), "art-1");
      await vi.runAllTimersAsync();
      outcome = await result;
    } finally {
      vi.useRealTimers();
    }

    expect(outcome.status).toBe("failed");
    expect(await getArticle(db.d1, "art-1")).toMatchObject({
      amharic_draft: "pre-QA draft",
      amharic_qa: null,
      status: "drafted",
    });
  });

  it("fails cleanly when there is nothing translated to QA", async () => {
    const outcome = await runQaPipeline(env(), "art-1");
    expect(outcome.status).toBe("failed");
  });

  it("fails cleanly for an unknown article", async () => {
    const outcome = await runQaPipeline(env(), "ghost");
    expect(outcome.status).toBe("failed");
  });

  it("never throws — every failure comes back as an outcome", async () => {
    await translatedChunks("machine");
    db.raw.exec("UPDATE prompts SET current_version_id = NULL WHERE key = 'qa'");

    await expect(runQaPipeline(env(), "art-1")).resolves.toMatchObject({ status: "failed" });
  });
});
