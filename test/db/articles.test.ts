import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createArticle,
  createSeedArticle,
  finalizeArticle,
  getArticle,
  listFinalizedArticleFixCounts,
  patchArticleDraft,
  recordCompareResult,
  setArticleDraft,
  setArticleQaDraft,
  setArticleStyle,
  setCorrectionStatus,
  updateArticleStatus,
} from "../../functions/lib/db/articles";
import { createStyleProfile } from "../../functions/lib/db/styleProfiles";
import { createTestDb, type TestDb } from "../helpers/d1";

let db: TestDb;
beforeEach(() => {
  db = createTestDb();
});
afterEach(() => db.close());

async function seedArticle(id = "art-1") {
  await createArticle(db.d1, { id, sourceEnglish: "English source.", now: 1_000 });
  return id;
}

describe("createArticle / getArticle", () => {
  it("starts an article in the ingested state with no Amharic yet", async () => {
    const id = await seedArticle();
    expect(await getArticle(db.d1, id)).toMatchObject({
      id,
      source_english: "English source.",
      status: "ingested",
      amharic_draft: null,
      amharic_qa: null,
      amharic_final: null,
      writer_style_id: null,
      fix_count: null,
      correction_status: null,
      source: null,
    });
  });

  it("returns null for an unknown id", async () => {
    expect(await getArticle(db.d1, "nope")).toBeNull();
  });

  it("round-trips Ge'ez text without mangling it", async () => {
    const id = await seedArticle();
    const amharic = "ሚኒስትሩ ፖሊሲውን ይፋ አደረጉ። ጤና ይስጥልኝ፣ እንኳን ደህና መጡ።";
    await setArticleDraft(db.d1, id, amharic, 2_000);
    const row = await getArticle(db.d1, id);
    expect(row?.amharic_draft).toBe(amharic);
    expect([...(row?.amharic_draft ?? "")].length).toBe([...amharic].length);
  });
});

describe("the QA snapshot", () => {
  it("writes both the working draft and the immutable snapshot, and moves to qad", async () => {
    const id = await seedArticle();
    await setArticleQaDraft(db.d1, id, "QA output", 2_000);

    expect(await getArticle(db.d1, id)).toMatchObject({
      amharic_draft: "QA output",
      amharic_qa: "QA output",
      status: "qad",
    });
  });

  it("survives reviewer autosave overwriting the working draft", async () => {
    // This is what gives finalize-compare a faithful pre-edit machine side.
    const id = await seedArticle();
    await setArticleQaDraft(db.d1, id, "QA output", 2_000);
    await patchArticleDraft(db.d1, id, "reviewer edit", 3_000);

    expect(await getArticle(db.d1, id)).toMatchObject({
      amharic_draft: "reviewer edit",
      amharic_qa: "QA output",
    });
  });

  it("survives finalize too", async () => {
    const id = await seedArticle();
    await setArticleQaDraft(db.d1, id, "QA output", 2_000);
    await finalizeArticle(db.d1, id, "human final", 4_000);

    expect(await getArticle(db.d1, id)).toMatchObject({
      amharic_qa: "QA output",
      amharic_draft: "human final",
      amharic_final: "human final",
      status: "final",
    });
  });
});

describe("autosave", () => {
  it("patches the draft without touching pipeline status", async () => {
    const id = await seedArticle();
    await updateArticleStatus(db.d1, id, "qad", 2_000);
    await patchArticleDraft(db.d1, id, "edit", 3_000);

    const row = await getArticle(db.d1, id);
    expect(row?.status).toBe("qad");
    expect(row?.updated_at).toBe(3_000);
  });
});

describe("writer style selection", () => {
  it("points the article at a style profile and clears it again", async () => {
    const id = await seedArticle();
    await createStyleProfile(db.d1, {
      id: "sty-1",
      writerName: "Almaz T.",
      sampleArticles: "[]",
      derivedGuidelines: "Short sentences.",
      now: 1_000,
    });

    await setArticleStyle(db.d1, id, "sty-1", 2_000);
    expect((await getArticle(db.d1, id))?.writer_style_id).toBe("sty-1");

    await setArticleStyle(db.d1, id, null, 3_000);
    expect((await getArticle(db.d1, id))?.writer_style_id).toBeNull();
  });

  it("refuses a style id with no profile behind it", async () => {
    const id = await seedArticle();
    await expect(setArticleStyle(db.d1, id, "ghost-style", 2_000)).rejects.toThrow();
  });
});

describe("compare bookkeeping", () => {
  it("records the fix count and capture state without changing status", async () => {
    const id = await seedArticle();
    await finalizeArticle(db.d1, id, "final", 4_000);
    await recordCompareResult(db.d1, id, 3, "pending", 5_000);

    expect(await getArticle(db.d1, id)).toMatchObject({
      status: "final",
      fix_count: 3,
      correction_status: "pending",
    });

    await setCorrectionStatus(db.d1, id, "captured", 6_000);
    expect(await getArticle(db.d1, id)).toMatchObject({
      fix_count: 3,
      correction_status: "captured",
    });
  });
});

describe("listFinalizedArticleFixCounts", () => {
  it("returns only finalized articles, oldest finalize first", async () => {
    await createArticle(db.d1, { id: "a", sourceEnglish: "a", now: 1_000 });
    await createArticle(db.d1, { id: "b", sourceEnglish: "b", now: 1_000 });
    await createArticle(db.d1, { id: "c", sourceEnglish: "c", now: 1_000 });

    await finalizeArticle(db.d1, "b", "final b", 5_000);
    await recordCompareResult(db.d1, "b", 2, "captured", 5_000);
    await finalizeArticle(db.d1, "a", "final a", 9_000);
    await recordCompareResult(db.d1, "a", 7, "captured", 9_000);

    const rows = await listFinalizedArticleFixCounts(db.d1);
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
    expect(rows.map((r) => r.fix_count)).toEqual([2, 7]);
  });

  it("keeps a null fix count distinct from a zero one", async () => {
    await createArticle(db.d1, { id: "a", sourceEnglish: "a", now: 1_000 });
    await createArticle(db.d1, { id: "b", sourceEnglish: "b", now: 1_000 });
    await finalizeArticle(db.d1, "a", "final a", 5_000);
    await finalizeArticle(db.d1, "b", "final b", 6_000);
    await recordCompareResult(db.d1, "b", 0, "skipped", 6_000);

    const rows = await listFinalizedArticleFixCounts(db.d1);
    expect(rows.map((r) => r.fix_count)).toEqual([null, 0]);
  });
});

describe("createSeedArticle", () => {
  it("inserts an already-finalized article tagged as seed", async () => {
    await createSeedArticle(db.d1, {
      id: "seed-1",
      sourceEnglish: "English",
      amharicDraft: "machine",
      amharicFinal: "human",
      now: 1_000,
    });

    expect(await getArticle(db.d1, "seed-1")).toMatchObject({
      status: "final",
      source: "seed",
      amharic_draft: "machine",
      amharic_final: "human",
    });
  });

  it("is distinguishable from a live-pipeline article", async () => {
    await createSeedArticle(db.d1, {
      id: "seed-1",
      sourceEnglish: "e",
      amharicDraft: "m",
      amharicFinal: "h",
      now: 1_000,
    });
    await seedArticle("live-1");

    expect((await getArticle(db.d1, "seed-1"))?.source).toBe("seed");
    expect((await getArticle(db.d1, "live-1"))?.source).toBeNull();
  });
});
