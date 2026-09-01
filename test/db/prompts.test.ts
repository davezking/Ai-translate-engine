import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getCurrentPrompt,
  getPromptVersion,
  listPromptVersions,
  publishPromptVersion,
  rollbackPrompt,
} from "../../functions/lib/db/prompts";
import { createTestDb, type TestDb } from "../helpers/d1";

let db: TestDb;
beforeEach(() => {
  db = createTestDb();
});
afterEach(() => db.close());

async function publish(body: string, author = "usr_admin", id = crypto.randomUUID()) {
  await publishPromptVersion(db.d1, { id, key: "qa", body, author, now: Date.now() });
  return id;
}

async function rawVersions() {
  const { results } = await db.d1
    .prepare(
      "SELECT id, version, body, author FROM promptVersions WHERE prompt_key = 'qa' ORDER BY version",
    )
    .all<{ id: string; version: number; body: string; author: string }>();
  return results;
}

async function currentVersionId(key = "qa") {
  const row = await db.d1
    .prepare("SELECT current_version_id FROM prompts WHERE key = ?")
    .bind(key)
    .first<{ current_version_id: string | null }>();
  return row?.current_version_id ?? null;
}

describe("getCurrentPrompt", () => {
  it("returns the seeded version for each key", async () => {
    for (const key of ["split", "translate", "qa"] as const) {
      const entry = await getCurrentPrompt(db.d1, key);
      expect(entry?.version.version).toBe(1);
      expect(entry?.version.body.length).toBeGreaterThan(0);
    }
  });

  it("returns null when the prompt has no current version", async () => {
    db.raw.exec("UPDATE prompts SET current_version_id = NULL WHERE key = 'qa'");
    expect(await getCurrentPrompt(db.d1, "qa")).toBeNull();
  });
});

describe("publishPromptVersion", () => {
  it("appends a new version and repoints the prompt at it", async () => {
    const id = await publish("v2 body");

    expect(await currentVersionId()).toBe(id);
    const entry = await getCurrentPrompt(db.d1, "qa");
    expect(entry?.version.version).toBe(2);
    expect(entry?.version.body).toBe("v2 body");
  });

  it("retains every version across repeated publishes, unmutated", async () => {
    const seeded = (await rawVersions())[0];

    await publish("second body");
    await publish("third body");
    await publish("fourth body");

    const versions = await rawVersions();
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3, 4]);
    expect(versions.map((v) => v.body)).toEqual([
      seeded.body,
      "second body",
      "third body",
      "fourth body",
    ]);
    // The original row is byte-for-byte what it was before three publishes.
    expect(versions[0]).toEqual(seeded);
  });

  it("numbers versions per key, so publishing one prompt never shifts another", async () => {
    await publish("qa v2");
    await publishPromptVersion(db.d1, {
      id: crypto.randomUUID(),
      key: "split",
      body: "split v2",
      author: "usr_admin",
      now: Date.now(),
    });

    expect((await getCurrentPrompt(db.d1, "qa"))?.version.version).toBe(2);
    expect((await getCurrentPrompt(db.d1, "split"))?.version.version).toBe(2);
    expect((await getCurrentPrompt(db.d1, "translate"))?.version.version).toBe(1);
  });

  it("records the publishing author", async () => {
    await publish("reviewer edit", "usr_reviewer");
    const entry = await getCurrentPrompt(db.d1, "qa");
    expect(entry?.version.author).toBe("usr_reviewer");
  });

  it("rejects an author that is not a real user", async () => {
    await expect(publish("body", "usr_ghost")).rejects.toThrow();
    expect(await rawVersions()).toHaveLength(1);
  });

  it("rolls back whole when a concurrent publish already took the version number", async () => {
    // Reproduces the race publishPromptVersion is built to lose safely: two
    // publishers computed the same next version, one got there first.
    const winner = await publish("winner body");
    const loserId = crypto.randomUUID();

    await expect(
      db.d1.batch([
        db.d1
          .prepare(
            "INSERT INTO promptVersions (id, prompt_key, version, body, author, created_at) VALUES (?, 'qa', 2, ?, 'usr_admin', ?)",
          )
          .bind(loserId, "loser body", Date.now()),
        db.d1.prepare("UPDATE prompts SET current_version_id = ? WHERE key = 'qa'").bind(loserId),
      ]),
    ).rejects.toThrow();

    // Neither half of the losing transaction survived.
    expect(await currentVersionId()).toBe(winner);
    expect(await getPromptVersion(db.d1, loserId)).toBeNull();
    expect(await rawVersions()).toHaveLength(2);
  });
});

describe("listPromptVersions", () => {
  it("lists newest-first with the author's email resolved", async () => {
    await publish("second body", "usr_reviewer");

    const versions = await listPromptVersions(db.d1, "qa");
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions[0].author_email).toBe("REPLACE_WITH_SECOND_USER_EMAIL");
    expect(versions[1].author_email).toBe("yegnatop10@gmail.com");
  });

  it("scopes history to one key", async () => {
    await publish("qa v2");
    expect(await listPromptVersions(db.d1, "split")).toHaveLength(1);
    expect(await listPromptVersions(db.d1, "qa")).toHaveLength(2);
  });

  it("carries a timestamp on every version", async () => {
    await publish("second body");
    for (const v of await listPromptVersions(db.d1, "qa")) {
      expect(v.created_at).toBeGreaterThan(0);
    }
  });
});

describe("rollbackPrompt", () => {
  it("repoints at an older version without deleting anything newer", async () => {
    const v1 = (await rawVersions())[0];
    await publish("v2 body");
    const v3 = await publish("v3 body");

    await rollbackPrompt(db.d1, "qa", v1.id);

    expect((await getCurrentPrompt(db.d1, "qa"))?.version.body).toBe(v1.body);
    expect(await rawVersions()).toHaveLength(3);
    expect(await getPromptVersion(db.d1, v3)).not.toBeNull();
  });

  it("rolls forward again with the same call", async () => {
    const v1 = (await rawVersions())[0];
    const v2 = await publish("v2 body");

    await rollbackPrompt(db.d1, "qa", v1.id);
    await rollbackPrompt(db.d1, "qa", v2);

    expect((await getCurrentPrompt(db.d1, "qa"))?.version.body).toBe("v2 body");
    expect(await rawVersions()).toHaveLength(2);
  });

  it("leaves other prompts alone", async () => {
    const splitCurrent = await currentVersionId("split");
    const v1 = (await rawVersions())[0];
    await publish("v2 body");

    await rollbackPrompt(db.d1, "qa", v1.id);
    expect(await currentVersionId("split")).toBe(splitCurrent);
  });

  it("cannot point a prompt at a version id that does not exist", async () => {
    await expect(rollbackPrompt(db.d1, "qa", "no-such-version")).rejects.toThrow();
  });
});

describe("getPromptVersion", () => {
  it("returns the row, including which key it belongs to", async () => {
    const id = await publish("v2 body");
    const row = await getPromptVersion(db.d1, id);
    expect(row).toMatchObject({ id, prompt_key: "qa", version: 2, body: "v2 body" });
  });

  it("returns null for an unknown id", async () => {
    expect(await getPromptVersion(db.d1, "nope")).toBeNull();
  });
});
