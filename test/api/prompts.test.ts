import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { onRequestGet, onRequestPut } from "../../functions/api/prompts/[key]/index";
import { onRequestGet as onVersionsGet } from "../../functions/api/prompts/[key]/versions";
import { onRequestPost as onRollbackPost } from "../../functions/api/prompts/[key]/rollback";
import { getCurrentPrompt } from "../../functions/lib/db/prompts";
import { createTestDb, type TestDb } from "../helpers/d1";
import { testEnv } from "../helpers/env";
import { ADMIN, REVIEWER, call, callRaw } from "../helpers/route";
import type { Env } from "../../functions/lib/env";

let db: TestDb;
let env: Env;
beforeEach(() => {
  db = createTestDb();
  env = testEnv({ DB: db.d1 });
});
afterEach(() => db.close());

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

describe("admin gating", () => {
  const cases = [
    ["GET /api/prompts/:key", onRequestGet, undefined],
    ["PUT /api/prompts/:key", onRequestPut, { body: "new" }],
    ["GET /api/prompts/:key/versions", onVersionsGet, undefined],
    ["POST /api/prompts/:key/rollback", onRollbackPost, { versionId: "x" }],
  ] as const;

  it.each(cases)("403s a non-admin on %s", async (_name, handler, body) => {
    const res = await call(handler, { env, user: REVIEWER, params: { key: "qa" }, body });
    expect(res.status).toBe(403);
    expect(await json<{ error: string }>(res)).toEqual({ error: "Forbidden: admin only" });
  });

  it.each(cases)(
    "does not touch the database before rejecting on %s",
    async (_n, handler, body) => {
      const before = (await getCurrentPrompt(db.d1, "qa"))?.version.id;
      await call(handler, { env, user: REVIEWER, params: { key: "qa" }, body });
      expect((await getCurrentPrompt(db.d1, "qa"))?.version.id).toBe(before);
    },
  );
});

describe("GET /api/prompts/:key", () => {
  it("returns the current version for each key", async () => {
    for (const key of ["split", "translate", "qa"]) {
      const res = await call(onRequestGet, { env, params: { key } });
      expect(res.status).toBe(200);
      expect(await json(res)).toMatchObject({ key, version: 1 });
    }
  });

  it("404s an unknown key rather than querying for it", async () => {
    const res = await call(onRequestGet, { env, params: { key: "compare" } });
    expect(res.status).toBe(404);
  });

  it("404s when the prompt has no current version", async () => {
    db.raw.exec("UPDATE prompts SET current_version_id = NULL WHERE key = 'qa'");
    const res = await call(onRequestGet, { env, params: { key: "qa" } });
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/prompts/:key", () => {
  it("publishes a new version and makes it current", async () => {
    const res = await call(onRequestPut, {
      env,
      method: "PUT",
      params: { key: "qa" },
      body: { body: "  a tuned QA prompt  " },
    });

    expect(res.status).toBe(201);
    expect(await json(res)).toMatchObject({ key: "qa", version: 2, body: "a tuned QA prompt" });
    expect((await getCurrentPrompt(db.d1, "qa"))?.version.body).toBe("a tuned QA prompt");
  });

  it("attributes the version to the publishing admin", async () => {
    await call(onRequestPut, {
      env,
      method: "PUT",
      params: { key: "qa" },
      body: { body: "tuned" },
    });
    expect((await getCurrentPrompt(db.d1, "qa"))?.version.author).toBe(ADMIN.id);
  });

  it.each([{ body: "" }, { body: "   " }, { body: 42 }, {}])(
    "400s an empty or non-string body (%p)",
    async (payload) => {
      const res = await call(onRequestPut, {
        env,
        method: "PUT",
        params: { key: "qa" },
        body: payload,
      });
      expect(res.status).toBe(400);
      expect((await getCurrentPrompt(db.d1, "qa"))?.version.version).toBe(1);
    },
  );

  it("400s a malformed JSON payload instead of throwing", async () => {
    const res = await callRaw(onRequestPut, {
      env,
      method: "PUT",
      params: { key: "qa" },
      rawBody: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("404s an unknown key without writing anything", async () => {
    const res = await call(onRequestPut, {
      env,
      method: "PUT",
      params: { key: "nope" },
      body: { body: "x" },
    });
    expect(res.status).toBe(404);
  });

  it("leaves earlier versions intact across repeated publishes", async () => {
    for (const body of ["second", "third"]) {
      await call(onRequestPut, { env, method: "PUT", params: { key: "qa" }, body: { body } });
    }

    const res = await call(onVersionsGet, { env, params: { key: "qa" } });
    const { versions } = await json<{ versions: { version: number; body: string }[] }>(res);
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(versions.map((v) => v.body).slice(0, 2)).toEqual(["third", "second"]);
  });
});

describe("GET /api/prompts/:key/versions", () => {
  it("lists history newest-first with author emails and timestamps", async () => {
    await call(onRequestPut, {
      env,
      method: "PUT",
      params: { key: "qa" },
      body: { body: "second" },
    });

    const res = await call(onVersionsGet, { env, params: { key: "qa" } });
    const data = await json<{
      currentVersionId: string;
      versions: { id: string; version: number; author: string; createdAt: number }[];
    }>(res);

    expect(data.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(data.currentVersionId).toBe(data.versions[0].id);
    for (const v of data.versions) {
      expect(v.author).toContain("@");
      expect(v.createdAt).toBeGreaterThan(0);
    }
  });

  it("404s an unknown key", async () => {
    const res = await call(onVersionsGet, { env, params: { key: "style" } });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/prompts/:key/rollback", () => {
  async function publish(key: string, body: string): Promise<string> {
    const res = await call(onRequestPut, { env, method: "PUT", params: { key }, body: { body } });
    return (await json<{ currentVersionId: string }>(res)).currentVersionId;
  }

  it("repoints the prompt at an older version without deleting the newer one", async () => {
    const seeded = (await getCurrentPrompt(db.d1, "qa"))!.version.id;
    const v2 = await publish("qa", "second");

    const res = await call(onRollbackPost, {
      env,
      params: { key: "qa" },
      body: { versionId: seeded },
    });

    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ key: "qa", currentVersionId: seeded, version: 1 });
    expect((await getCurrentPrompt(db.d1, "qa"))?.version.id).toBe(seeded);

    // ...and rolling forward again works the same way.
    await call(onRollbackPost, { env, params: { key: "qa" }, body: { versionId: v2 } });
    expect((await getCurrentPrompt(db.d1, "qa"))?.version.id).toBe(v2);
  });

  it("rejects a version belonging to a different prompt", async () => {
    const splitVersion = (await getCurrentPrompt(db.d1, "split"))!.version.id;
    const qaBefore = (await getCurrentPrompt(db.d1, "qa"))!.version.id;

    const res = await call(onRollbackPost, {
      env,
      params: { key: "qa" },
      body: { versionId: splitVersion },
    });

    expect(res.status).toBe(400);
    expect((await json<{ error: string }>(res)).error).toMatch(/'split'.*'qa'/);
    expect((await getCurrentPrompt(db.d1, "qa"))?.version.id).toBe(qaBefore);
  });

  it("404s an unknown version id", async () => {
    const res = await call(onRollbackPost, {
      env,
      params: { key: "qa" },
      body: { versionId: "no-such-version" },
    });
    expect(res.status).toBe(404);
  });

  it.each([{}, { versionId: "" }, { versionId: 7 }])(
    "400s a missing versionId (%p)",
    async (body) => {
      const res = await call(onRollbackPost, { env, params: { key: "qa" }, body });
      expect(res.status).toBe(400);
    },
  );

  it("404s an unknown key", async () => {
    const res = await call(onRollbackPost, {
      env,
      params: { key: "nope" },
      body: { versionId: "x" },
    });
    expect(res.status).toBe(404);
  });
});
