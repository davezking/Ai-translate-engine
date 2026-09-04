import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createArticle } from "../../functions/lib/db/articles";
import {
  getChunk,
  listChunksByArticle,
  replaceChunks,
  saveChunkBoundaries,
  setChunkQa,
  setChunkTranslation,
} from "../../functions/lib/db/chunks";
import { createTestDb, type TestDb } from "../helpers/d1";

let db: TestDb;
beforeEach(async () => {
  db = createTestDb();
  await createArticle(db.d1, { id: "art-1", sourceEnglish: "English.", now: 1_000 });
});
afterEach(() => db.close());

describe("setChunkQa", () => {
  it("stores the chunk's own QA'd Amharic without touching its plain translation", async () => {
    await replaceChunks(db.d1, "art-1", [{ id: "chk-1", ord: 0, englishText: "English one." }]);
    await setChunkTranslation(db.d1, "chk-1", "plain amharic", "hash-1");

    await setChunkQa(db.d1, "chk-1", "QA'd amharic");

    expect(await getChunk(db.d1, "art-1", 0)).toMatchObject({
      amharic_text: "plain amharic",
      amharic_qa: "QA'd amharic",
    });
  });
});

describe("setChunkTranslation", () => {
  it("clears a prior QA result — it QA'd the old translation, not the new one", async () => {
    await replaceChunks(db.d1, "art-1", [{ id: "chk-1", ord: 0, englishText: "English one." }]);
    await setChunkTranslation(db.d1, "chk-1", "first pass", "hash-1");
    await setChunkQa(db.d1, "chk-1", "QA of first pass");

    await setChunkTranslation(db.d1, "chk-1", "retranslated", "hash-2");

    expect(await getChunk(db.d1, "art-1", 0)).toMatchObject({
      amharic_text: "retranslated",
      amharic_qa: null,
    });
  });
});

describe("saveChunkBoundaries", () => {
  it("carries forward the prior QA result for an unchanged chunk", async () => {
    await replaceChunks(db.d1, "art-1", [{ id: "chk-1", ord: 0, englishText: "English one." }]);
    await setChunkTranslation(db.d1, "chk-1", "plain amharic", "hash-1");
    await setChunkQa(db.d1, "chk-1", "QA'd amharic");

    await saveChunkBoundaries(db.d1, "art-1", [{ id: "chk-1", englishText: "English one." }]);

    const [chunk] = await listChunksByArticle(db.d1, "art-1");
    expect(chunk).toMatchObject({
      amharic_text: "plain amharic",
      amharic_qa: "QA'd amharic",
    });
  });

  it("drops the prior QA result for a chunk whose text changed", async () => {
    await replaceChunks(db.d1, "art-1", [{ id: "chk-1", ord: 0, englishText: "English one." }]);
    await setChunkTranslation(db.d1, "chk-1", "plain amharic", "hash-1");
    await setChunkQa(db.d1, "chk-1", "QA'd amharic");

    await saveChunkBoundaries(db.d1, "art-1", [{ id: "chk-1", englishText: "Edited English." }]);

    const [chunk] = await listChunksByArticle(db.d1, "art-1");
    expect(chunk).toMatchObject({
      english_text: "Edited English.",
      amharic_text: null,
      amharic_qa: null,
      status: "proposed",
    });
  });

  it("has no QA result for a brand-new chunk", async () => {
    await saveChunkBoundaries(db.d1, "art-1", [{ id: null, englishText: "New chunk." }]);

    const [chunk] = await listChunksByArticle(db.d1, "art-1");
    expect(chunk.amharic_qa).toBeNull();
  });
});
