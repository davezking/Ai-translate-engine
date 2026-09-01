import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  onRequestGet as onStylesGet,
  onRequestPost as onStylesPost,
} from "../../functions/api/styles/index";
import { onRequestGet as onApprovedGet } from "../../functions/api/styles/approved";
import { onRequestPatch as onApprovePatch } from "../../functions/api/styles/[id]/approve";
import { onRequestPost as onTestPost } from "../../functions/api/styles/[id]/test";
import { onRequestPatch as onArticleStylePatch } from "../../functions/api/articles/[id]/style";
import { createArticle, finalizeArticle, getArticle } from "../../functions/lib/db/articles";
import {
  approveStyleProfile,
  createStyleProfile,
  getStyleProfile,
} from "../../functions/lib/db/styleProfiles";
import { createTestDb, type TestDb } from "../helpers/d1";
import { stubGemini, testEnv } from "../helpers/env";
import { REVIEWER, call } from "../helpers/route";
import type { Env } from "../../functions/lib/env";

let db: TestDb;
let env: Env;
beforeEach(async () => {
  db = createTestDb();
  env = testEnv({ DB: db.d1 });
  await createArticle(db.d1, { id: "art-1", sourceEnglish: "English.", now: 1_000 });
});
afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
});

async function profile(id: string, approved: boolean) {
  await createStyleProfile(db.d1, {
    id,
    writerName: `Writer ${id}`,
    sampleArticles: JSON.stringify(["sample"]),
    derivedGuidelines: "Short declarative sentences.",
    now: 1_000,
  });
  if (approved) await approveStyleProfile(db.d1, id);
}

describe("style management is admin-only", () => {
  it("403s a non-admin creating a profile, and derives nothing", async () => {
    const gemini = stubGemini(["guidelines"]);
    const res = await call(onStylesPost, {
      env,
      user: REVIEWER,
      body: { writerName: "X", sampleArticles: ["s"] },
    });

    expect(res.status).toBe(403);
    expect(gemini.calls).toHaveLength(0);
  });

  it("403s a non-admin listing profiles with their guidelines", async () => {
    const res = await call(onStylesGet, { env, user: REVIEWER });
    expect(res.status).toBe(403);
  });

  it("403s a non-admin approving a profile, and leaves it unapproved", async () => {
    await profile("sty-1", false);
    const res = await call(onApprovePatch, { env, user: REVIEWER, params: { id: "sty-1" } });

    expect(res.status).toBe(403);
    expect((await getStyleProfile(db.d1, "sty-1"))?.approved).toBe(0);
  });

  it("403s a non-admin running the QA sandbox, without calling Gemini", async () => {
    await profile("sty-1", false);
    const gemini = stubGemini(["out"]);
    const res = await call(onTestPost, {
      env,
      user: REVIEWER,
      params: { id: "sty-1" },
      body: { testText: "text" },
    });

    expect(res.status).toBe(403);
    expect(gemini.calls).toHaveLength(0);
  });
});

describe("POST /api/styles", () => {
  it("stores a derived profile unapproved", async () => {
    stubGemini(["Short sentences; avoids loanwords."]);
    const res = await call(onStylesPost, {
      env,
      body: { writerName: "Almaz T.", sampleArticles: ["sample one", "  ", "sample two"] },
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      writerName: "Almaz T.",
      sampleArticles: ["sample one", "sample two"],
      derivedGuidelines: "Short sentences; avoids loanwords.",
      approved: false,
    });
  });

  it.each([
    { writerName: "", sampleArticles: ["s"] },
    { writerName: "X", sampleArticles: [] },
    { writerName: "X", sampleArticles: ["  "] },
    { writerName: "X" },
    {},
  ])("400s incomplete input (%p) before calling Gemini", async (body) => {
    const gemini = stubGemini(["guidelines"]);
    const res = await call(onStylesPost, { env, body });

    expect(res.status).toBe(400);
    expect(gemini.calls).toHaveLength(0);
  });

  it("502s and stores nothing when extraction fails", async () => {
    stubGemini(["   "]);
    const res = await call(onStylesPost, {
      env,
      body: { writerName: "Almaz T.", sampleArticles: ["sample"] },
    });

    expect(res.status).toBe(502);
    const list = await call(onStylesGet, { env });
    expect(await list.json()).toEqual({ profiles: [] });
  });
});

describe("GET /api/styles/approved", () => {
  it("is available to any authenticated user", async () => {
    await profile("sty-1", true);
    const res = await call(onApprovedGet, { env, user: REVIEWER });
    expect(res.status).toBe(200);
  });

  it("lists only approved profiles", async () => {
    await profile("sty-1", true);
    await profile("sty-2", false);

    const res = await call(onApprovedGet, { env, user: REVIEWER });
    const { profiles } = (await res.json()) as { profiles: { id: string }[] };
    expect(profiles.map((p) => p.id)).toEqual(["sty-1"]);
  });

  it("exposes only id and name — never the guidelines or samples", async () => {
    await profile("sty-1", true);
    const res = await call(onApprovedGet, { env, user: REVIEWER });
    const { profiles } = (await res.json()) as { profiles: Record<string, unknown>[] };

    expect(Object.keys(profiles[0]).sort()).toEqual(["id", "writerName"]);
    expect(JSON.stringify(profiles)).not.toContain("Short declarative sentences.");
  });
});

describe("PATCH /api/articles/:id/style", () => {
  it("lets a non-admin select an approved profile", async () => {
    await profile("sty-1", true);
    const res = await call(onArticleStylePatch, {
      env,
      user: REVIEWER,
      method: "PATCH",
      params: { id: "art-1" },
      body: { writerStyleId: "sty-1" },
    });

    expect(res.status).toBe(200);
    expect((await getArticle(db.d1, "art-1"))?.writer_style_id).toBe("sty-1");
  });

  it("clears the selection with null", async () => {
    await profile("sty-1", true);
    await call(onArticleStylePatch, {
      env,
      method: "PATCH",
      params: { id: "art-1" },
      body: { writerStyleId: "sty-1" },
    });

    const res = await call(onArticleStylePatch, {
      env,
      method: "PATCH",
      params: { id: "art-1" },
      body: { writerStyleId: null },
    });

    expect(res.status).toBe(200);
    expect((await getArticle(db.d1, "art-1"))?.writer_style_id).toBeNull();
  });

  it("refuses an unapproved profile — selection cannot bypass the approval gate", async () => {
    await profile("sty-1", false);
    const res = await call(onArticleStylePatch, {
      env,
      method: "PATCH",
      params: { id: "art-1" },
      body: { writerStyleId: "sty-1" },
    });

    expect(res.status).toBe(400);
    expect((await getArticle(db.d1, "art-1"))?.writer_style_id).toBeNull();
  });

  it("404s an unknown profile", async () => {
    const res = await call(onArticleStylePatch, {
      env,
      method: "PATCH",
      params: { id: "art-1" },
      body: { writerStyleId: "ghost" },
    });
    expect(res.status).toBe(404);
  });

  it("404s an unknown article", async () => {
    const res = await call(onArticleStylePatch, {
      env,
      method: "PATCH",
      params: { id: "ghost" },
      body: { writerStyleId: null },
    });
    expect(res.status).toBe(404);
  });

  it("409s a finalized article", async () => {
    await profile("sty-1", true);
    await finalizeArticle(db.d1, "art-1", "final", 2_000);

    const res = await call(onArticleStylePatch, {
      env,
      method: "PATCH",
      params: { id: "art-1" },
      body: { writerStyleId: "sty-1" },
    });

    expect(res.status).toBe(409);
    expect((await getArticle(db.d1, "art-1"))?.writer_style_id).toBeNull();
  });

  it("400s a non-string, non-null writerStyleId", async () => {
    const res = await call(onArticleStylePatch, {
      env,
      method: "PATCH",
      params: { id: "art-1" },
      body: { writerStyleId: 7 },
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/styles/:id/test", () => {
  it("runs the live QA prompt twice — once without the style, once with", async () => {
    await profile("sty-1", false);
    const gemini = stubGemini(["plain output", "styled output"]);

    const res = await call(onTestPost, {
      env,
      params: { id: "sty-1" },
      body: { testText: "ሚኒስትሩ ፖሊሲውን አስታወቁ።" },
    });

    expect(res.status).toBe(200);
    expect(gemini.calls).toHaveLength(2);

    const withStyle = gemini.calls.filter((c) => c.userContent.includes("TONE/VOICE GUIDELINES"));
    expect(withStyle).toHaveLength(1);
    expect(withStyle[0].userContent).toContain("Short declarative sentences.");
  });

  it("persists nothing", async () => {
    await profile("sty-1", false);
    stubGemini(["a", "b"]);
    await call(onTestPost, { env, params: { id: "sty-1" }, body: { testText: "text" } });

    expect((await getStyleProfile(db.d1, "sty-1"))?.approved).toBe(0);
    expect((await getArticle(db.d1, "art-1"))?.amharic_draft).toBeNull();
  });

  it("404s an unknown profile", async () => {
    const res = await call(onTestPost, { env, params: { id: "ghost" }, body: { testText: "t" } });
    expect(res.status).toBe(404);
  });

  it("400s empty test text", async () => {
    await profile("sty-1", false);
    const res = await call(onTestPost, { env, params: { id: "sty-1" }, body: { testText: "  " } });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/styles/:id/approve", () => {
  it("approves a profile, making it selectable", async () => {
    await profile("sty-1", false);
    const res = await call(onApprovePatch, { env, method: "PATCH", params: { id: "sty-1" } });

    expect(res.status).toBe(200);
    expect((await getStyleProfile(db.d1, "sty-1"))?.approved).toBe(1);
  });

  it("404s an unknown profile", async () => {
    const res = await call(onApprovePatch, { env, method: "PATCH", params: { id: "ghost" } });
    expect(res.status).toBe(404);
  });
});
