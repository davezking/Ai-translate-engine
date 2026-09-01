import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost as onArticlePost } from "../../functions/api/articles/index";
import { onRequestPatch as onDraftPatch } from "../../functions/api/articles/[id]/draft";
import { onRequestPost as onFinalizePost } from "../../functions/api/articles/[id]/finalize";
import { onRequestPut as onChunksPut } from "../../functions/api/articles/[id]/chunks/index";
import { onRequestPost as onSeedPost } from "../../functions/api/seed";
import { onRequestPut as onPromptPut } from "../../functions/api/prompts/[key]/index";
import { onRequestPost as onStylesPost } from "../../functions/api/styles/index";
import { onRequestPost as onStyleTestPost } from "../../functions/api/styles/[id]/test";
import { createArticle } from "../../functions/lib/db/articles";
import { createStyleProfile } from "../../functions/lib/db/styleProfiles";
import { getCurrentPrompt } from "../../functions/lib/db/prompts";
import {
  MAX_ARTICLE_CHARS,
  MAX_PROMPT_BODY_CHARS,
  MAX_STYLE_SAMPLES,
  MAX_STYLE_SAMPLE_CHARS,
  MAX_TEST_TEXT_CHARS,
} from "../../functions/lib/limits";
import { createTestDb, type TestDb } from "../helpers/d1";
import { fakeVectorize, stubGemini, testEnv, type GeminiStub } from "../helpers/env";
import { call } from "../helpers/route";
import type { Env } from "../../functions/lib/env";

let db: TestDb;
let env: Env;
let gemini: GeminiStub;

beforeEach(async () => {
  db = createTestDb();
  env = testEnv({ DB: db.d1, VECTORIZE: fakeVectorize() });
  // Stubbed so a rejected oversized payload can be shown never to reach it.
  gemini = stubGemini(["should not be called"]);
  await createArticle(db.d1, { id: "art-1", sourceEnglish: "English.", now: 1_000 });
  await createStyleProfile(db.d1, {
    id: "sty-1",
    writerName: "Almaz T.",
    sampleArticles: "[]",
    derivedGuidelines: "Short sentences.",
    now: 1_000,
  });
});
afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
});

const over = (max: number) => "a".repeat(max + 1);
const atLimit = (max: number) => "a".repeat(max);

describe("oversized payloads are refused with 413", () => {
  it("rejects an oversized article on ingest, storing nothing", async () => {
    const res = await call(onArticlePost, {
      env,
      body: { sourceEnglish: over(MAX_ARTICLE_CHARS) },
    });

    expect(res.status).toBe(413);
    const { results } = await db.d1.prepare("SELECT id FROM articles").all();
    expect(results).toHaveLength(1); // just the fixture
  });

  it("rejects an oversized autosave", async () => {
    const res = await call(onDraftPatch, {
      env,
      method: "PATCH",
      params: { id: "art-1" },
      body: { amharicText: over(MAX_ARTICLE_CHARS) },
    });
    expect(res.status).toBe(413);
  });

  it("rejects an oversized finalize before any Gemini call", async () => {
    const res = await call(onFinalizePost, {
      env,
      params: { id: "art-1" },
      body: { amharicText: over(MAX_ARTICLE_CHARS) },
    });

    expect(res.status).toBe(413);
    expect(gemini.calls).toHaveLength(0);
  });

  it("rejects chunk boundaries whose combined text is oversized", async () => {
    // Each chunk is small; the total is what matters, since the whole set is
    // what gets translated.
    const half = "a".repeat(Math.ceil(MAX_ARTICLE_CHARS / 2) + 1);
    const res = await call(onChunksPut, {
      env,
      method: "PUT",
      params: { id: "art-1" },
      body: {
        chunks: [
          { id: null, englishText: half },
          { id: null, englishText: half },
        ],
      },
    });
    expect(res.status).toBe(413);
  });

  it.each(["englishSource", "aiTranslation", "humanFinal"])(
    "rejects an oversized %s on seed intake, naming the field",
    async (field) => {
      const body: Record<string, string> = {
        englishSource: "english",
        aiTranslation: "machine",
        humanFinal: "human",
      };
      body[field] = over(MAX_ARTICLE_CHARS);

      const res = await call(onSeedPost, { env, body });
      expect(res.status).toBe(413);
      expect(((await res.json()) as { error: string }).error).toContain(field);
      expect(gemini.calls).toHaveLength(0);
    },
  );

  it("rejects an oversized prompt body without publishing a version", async () => {
    const res = await call(onPromptPut, {
      env,
      method: "PUT",
      params: { key: "qa" },
      body: { body: over(MAX_PROMPT_BODY_CHARS) },
    });

    expect(res.status).toBe(413);
    expect((await getCurrentPrompt(db.d1, "qa"))?.version.version).toBe(1);
  });

  it("rejects an oversized style sample before calling Gemini, naming its index", async () => {
    const res = await call(onStylesPost, {
      env,
      body: { writerName: "Almaz T.", sampleArticles: ["ok", over(MAX_STYLE_SAMPLE_CHARS)] },
    });

    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toContain("sampleArticles[1]");
    expect(gemini.calls).toHaveLength(0);
  });

  it("rejects too many style samples", async () => {
    const res = await call(onStylesPost, {
      env,
      body: {
        writerName: "Almaz T.",
        sampleArticles: new Array(MAX_STYLE_SAMPLES + 1).fill("sample"),
      },
    });

    expect(res.status).toBe(413);
    expect(gemini.calls).toHaveLength(0);
  });

  it("rejects oversized sandbox test text before calling Gemini", async () => {
    const res = await call(onStyleTestPost, {
      env,
      params: { id: "sty-1" },
      body: { testText: over(MAX_TEST_TEXT_CHARS) },
    });

    expect(res.status).toBe(413);
    expect(gemini.calls).toHaveLength(0);
  });
});

describe("input exactly at the limit is accepted", () => {
  it("accepts an article of exactly the maximum length", async () => {
    const res = await call(onArticlePost, {
      env,
      body: { sourceEnglish: atLimit(MAX_ARTICLE_CHARS) },
    });
    expect(res.status).toBe(201);
  });

  it("accepts a prompt body of exactly the maximum length", async () => {
    const res = await call(onPromptPut, {
      env,
      method: "PUT",
      params: { key: "qa" },
      body: { body: atLimit(MAX_PROMPT_BODY_CHARS) },
    });
    expect(res.status).toBe(201);
  });
});
