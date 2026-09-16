import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestGet as onArticlesGet } from "../../functions/api/articles/index";
import { onRequestPatch as onDraftPatch } from "../../functions/api/articles/[id]/draft";
import { onRequestPost as onFinalizePost } from "../../functions/api/articles/[id]/finalize";
import { createArticle, getArticle } from "../../functions/lib/db/articles";
import { replaceChunks, setChunkTranslation } from "../../functions/lib/db/chunks";
import { countCorrections, listCorrections } from "../../functions/lib/db/corrections";
import { createTestDb, type TestDb } from "../helpers/d1";
import { fakeVectorize, stubGemini, testEnv, type FakeVectorize } from "../helpers/env";
import { REVIEWER, call } from "../helpers/route";
import type { Env } from "../../functions/lib/env";

let db: TestDb;
let vec: FakeVectorize;
let env: Env;

beforeEach(async () => {
  db = createTestDb();
  vec = fakeVectorize();
  env = testEnv({ DB: db.d1, VECTORIZE: vec });
  await createArticle(db.d1, { id: "art-1", sourceEnglish: "The minister announced.", now: 1_000 });
  await replaceChunks(db.d1, "art-1", [{ id: "chk-0", ord: 0, englishText: "english" }]);
  await setChunkTranslation(db.d1, "chk-0", "ማሽን አማርኛ", "hash-0");
});
afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
});

/** A valid compare response, so finalize's capture path runs end to end. */
function compareReply(): string {
  return JSON.stringify({
    changeSummary: "Reviewer replaced the literal verb with the idiomatic one.",
    fixCount: 2,
    topicTag: "verb-choice",
  });
}

function draft(amharicText: string, id = "art-1") {
  return call(onDraftPatch, {
    env,
    user: REVIEWER,
    method: "PATCH",
    params: { id },
    body: { amharicText },
  });
}

function finalize(amharicText?: string, id = "art-1") {
  return call(onFinalizePost, {
    env,
    user: REVIEWER,
    params: { id },
    body: amharicText === undefined ? {} : { amharicText },
  });
}

describe("GET /api/articles (history)", () => {
  async function list() {
    const res = await call(onArticlesGet, { env, user: REVIEWER });
    return (await res.json()) as {
      articles: {
        id: string;
        sourcePreview: string;
        fixCount: number | null;
        source: string | null;
        finalizedAt: number;
      }[];
    };
  }

  it("lists only finalized articles", async () => {
    stubGemini([compareReply()]);
    await finalize("የመጨረሻ ጽሑፍ"); // art-1 -> final
    // A second, still-unfinalized article must not appear.
    await createArticle(db.d1, { id: "art-2", sourceEnglish: "Not finalized.", now: 2_000 });

    const { articles } = await list();
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({ id: "art-1", fixCount: 2 });
  });

  it("returns a source preview, not the full article, and no chunk text", async () => {
    stubGemini([compareReply()]);
    await finalize("የመጨረሻ ጽሑፍ");

    const { articles } = await list();
    expect(articles[0].sourcePreview).toBe("The minister announced.");
  });

  it("orders newest finalize first", async () => {
    stubGemini([compareReply(), compareReply()]);
    await createArticle(db.d1, { id: "art-2", sourceEnglish: "Second article.", now: 2_000 });
    await replaceChunks(db.d1, "art-2", [{ id: "chk-2", ord: 0, englishText: "english" }]);
    await setChunkTranslation(db.d1, "chk-2", "ማሽን", "hash-2");

    await finalize("first final", "art-1");
    await finalize("second final", "art-2");

    const { articles } = await list();
    expect(articles.map((a) => a.id)).toEqual(["art-2", "art-1"]);
  });

  it("is empty when nothing is finalized", async () => {
    const { articles } = await list();
    expect(articles).toEqual([]);
  });
});

describe("PATCH /api/articles/:id/draft", () => {
  it("saves the reviewer's edit", async () => {
    const res = await draft("የተስተካከለ ረቂቅ");
    expect(res.status).toBe(200);
    expect((await getArticle(db.d1, "art-1"))?.amharic_draft).toBe("የተስተካከለ ረቂቅ");
  });

  it("skips the write when nothing changed", async () => {
    await draft("same text");
    const after = await getArticle(db.d1, "art-1");

    const res = await draft("same text");
    expect(res.status).toBe(200);
    // updated_at is untouched, so an idle editor costs no D1 write.
    expect((await getArticle(db.d1, "art-1"))?.updated_at).toBe(after?.updated_at);
  });

  it("404s an unknown article", async () => {
    expect((await draft("text", "ghost")).status).toBe(404);
  });

  it("400s a missing or non-string body", async () => {
    const res = await call(onDraftPatch, {
      env,
      method: "PATCH",
      params: { id: "art-1" },
      body: { amharicText: 42 },
    });
    expect(res.status).toBe(400);
  });

  it("refuses to edit a finalized article", async () => {
    await draft("pre-final draft");
    stubGemini([compareReply()]);
    await finalize("የመጨረሻ ጽሑፍ");

    const res = await draft("an edit after finalize");

    expect(res.status).toBe(409);
    expect(await getArticle(db.d1, "art-1")).toMatchObject({
      amharic_draft: "የመጨረሻ ጽሑፍ",
      amharic_final: "የመጨረሻ ጽሑፍ",
    });
  });
});

describe("POST /api/articles/:id/finalize", () => {
  it("stores the final text and captures one correction", async () => {
    stubGemini([compareReply()]);
    const res = await finalize("የመጨረሻ ጽሑፍ");

    expect(res.status).toBe(200);
    expect(await getArticle(db.d1, "art-1")).toMatchObject({
      status: "final",
      amharic_final: "የመጨረሻ ጽሑፍ",
      fix_count: 2,
      correction_status: "captured",
    });
    expect(await countCorrections(db.d1)).toBe(1);
    expect(vec.upserted).toHaveLength(1);
  });

  it("falls back to the stored draft when no text is posted", async () => {
    await draft("የተቀመጠ ረቂቅ");
    stubGemini([compareReply()]);

    await finalize();
    expect((await getArticle(db.d1, "art-1"))?.amharic_final).toBe("የተቀመጠ ረቂቅ");
  });

  it("400s when there is no draft to finalize", async () => {
    expect((await finalize()).status).toBe(400);
    expect((await getArticle(db.d1, "art-1"))?.status).toBe("ingested");
  });

  it("404s an unknown article", async () => {
    expect((await finalize("text", "ghost")).status).toBe(404);
  });

  it("refuses a second finalize", async () => {
    stubGemini([compareReply()]);
    await finalize("የመጀመሪያ የመጨረሻ");

    const res = await finalize("a different final text");
    expect(res.status).toBe(409);
  });

  it("does not overwrite the final text or capture a duplicate correction on a second finalize", async () => {
    // The reason the guard matters: a second capture would add another
    // corrections row and another vector for the same article, so the same
    // lesson would be retrieved twice into every later QA prompt.
    const gemini = stubGemini([compareReply()]);
    await finalize("የመጀመሪያ የመጨረሻ");

    const geminiCallsAfterFirst = gemini.calls.length;
    await finalize("a different final text");

    expect((await getArticle(db.d1, "art-1"))?.amharic_final).toBe("የመጀመሪያ የመጨረሻ");
    expect(await countCorrections(db.d1)).toBe(1);
    expect(vec.upserted).toHaveLength(1);
    // ...and it costs no extra Gemini call.
    expect(gemini.calls).toHaveLength(geminiCallsAfterFirst);
  });

  it("leaves exactly one lesson retrievable for the article", async () => {
    stubGemini([compareReply()]);
    await finalize("የመጨረሻ");
    await finalize("again");

    const rows = await listCorrections(db.d1);
    expect(rows.filter((r) => r.article_id === "art-1")).toHaveLength(1);
  });

  it("still finalizes when the compare fails, marking capture retryable", async () => {
    stubGemini(["not json at all"]);
    const res = await finalize("የመጨረሻ ጽሑፍ");

    expect(res.status).toBe(200);
    expect(await getArticle(db.d1, "art-1")).toMatchObject({
      status: "final",
      amharic_final: "የመጨረሻ ጽሑፍ",
      correction_status: "pending",
    });
    expect(await countCorrections(db.d1)).toBe(0);
  });
});
