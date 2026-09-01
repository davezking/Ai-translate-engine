import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROMPT_KEYS } from "../../functions/lib/promptKey";
import { createTestDb, type TestDb } from "../helpers/d1";

let db: TestDb;
beforeEach(() => {
  db = createTestDb();
});
afterEach(() => db.close());

describe("prompts.key", () => {
  it("accepts exactly the keys the code knows about", async () => {
    const { results } = await db.d1
      .prepare("SELECT key FROM prompts ORDER BY key")
      .all<{ key: string }>();
    expect(results.map((r) => r.key).sort()).toEqual([...PROMPT_KEYS].sort());
  });

  it("rejects a key outside the CHECK constraint", async () => {
    // Why compare.ts and style.ts keep their prompts in code: there is no
    // 'compare' or 'style' key to publish them under.
    expect(() => db.raw.exec("INSERT INTO prompts (key) VALUES ('compare')")).toThrow();
  });
});

describe("promptVersions", () => {
  it("refuses a duplicate version number for one prompt", async () => {
    expect(() =>
      db.raw.exec(
        "INSERT INTO promptVersions (id, prompt_key, version, body, author) " +
          "VALUES ('dup', 'qa', 1, 'body', 'usr_admin')",
      ),
    ).toThrow();
  });

  it("allows the same version number under a different prompt", async () => {
    const { results } = await db.d1
      .prepare("SELECT prompt_key, version FROM promptVersions WHERE version = 1")
      .all<{ prompt_key: string; version: number }>();
    expect(results).toHaveLength(3);
  });

  it("refuses a version for a prompt key that does not exist", async () => {
    expect(() =>
      db.raw.exec(
        "INSERT INTO promptVersions (id, prompt_key, version, body, author) " +
          "VALUES ('x', 'nope', 1, 'body', 'usr_admin')",
      ),
    ).toThrow();
  });
});

describe("users", () => {
  it("seeds an admin and a reviewer", async () => {
    const { results } = await db.d1
      .prepare("SELECT id, role FROM users ORDER BY id")
      .all<{ id: string; role: string }>();
    expect(results).toEqual([
      { id: "usr_admin", role: "admin" },
      { id: "usr_reviewer", role: "reviewer" },
    ]);
  });

  it("still carries the placeholder reviewer email", async () => {
    // Guards the deploy footgun: migration 0002 must have a real second email
    // filled in before it is applied anywhere real, and it cannot be edited
    // afterwards. If this test ever fails, the placeholder was replaced —
    // update it here too.
    const row = await db.d1
      .prepare("SELECT email FROM users WHERE id = 'usr_reviewer'")
      .first<{ email: string }>();
    expect(row?.email).toBe("REPLACE_WITH_SECOND_USER_EMAIL");
  });

  it("rejects a role outside admin/reviewer", async () => {
    expect(() =>
      db.raw.exec("INSERT INTO users (id, email, role) VALUES ('u', 'e@x.com', 'superuser')"),
    ).toThrow();
  });
});

describe("corrections", () => {
  it("requires a vector_id — a row must always claim a vector", async () => {
    db.raw.exec(
      "INSERT INTO articles (id, source_english, status, created_at, updated_at) " +
        "VALUES ('a', 'e', 'final', 1, 1)",
    );
    expect(() =>
      db.raw.exec(
        "INSERT INTO corrections (id, article_id, change_summary, vector_id, created_at) " +
          "VALUES ('c', 'a', 's', NULL, 1)",
      ),
    ).toThrow();
  });

  it("requires the article it belongs to to exist", async () => {
    expect(() =>
      db.raw.exec(
        "INSERT INTO corrections (id, article_id, change_summary, vector_id, created_at) " +
          "VALUES ('c', 'ghost', 's', 'v', 1)",
      ),
    ).toThrow();
  });
});
