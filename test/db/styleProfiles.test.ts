import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  approveStyleProfile,
  createStyleProfile,
  getStyleProfile,
  listStyleProfiles,
} from "../../functions/lib/db/styleProfiles";
import { createTestDb, type TestDb } from "../helpers/d1";

let db: TestDb;
beforeEach(() => {
  db = createTestDb();
});
afterEach(() => db.close());

async function create(id: string, writerName: string, now: number, samples: string[] = ["sample"]) {
  await createStyleProfile(db.d1, {
    id,
    writerName,
    sampleArticles: JSON.stringify(samples),
    derivedGuidelines: "Short declarative sentences.",
    now,
  });
}

describe("createStyleProfile", () => {
  it("stores a profile unapproved — approval is a separate, deliberate step", async () => {
    await create("sty-1", "Almaz T.", 1_000);
    expect(await getStyleProfile(db.d1, "sty-1")).toMatchObject({
      writer_name: "Almaz T.",
      derived_guidelines: "Short declarative sentences.",
      approved: 0,
    });
  });

  it("round-trips the samples as a JSON array", async () => {
    await create("sty-1", "Almaz T.", 1_000, ["first sample", "ሁለተኛ ናሙና"]);
    const row = await getStyleProfile(db.d1, "sty-1");
    expect(JSON.parse(row?.sample_articles ?? "[]")).toEqual(["first sample", "ሁለተኛ ናሙና"]);
  });

  it("allows a profile whose guidelines could not be derived", async () => {
    await createStyleProfile(db.d1, {
      id: "sty-1",
      writerName: "Almaz T.",
      sampleArticles: "[]",
      derivedGuidelines: null,
      now: 1_000,
    });
    expect((await getStyleProfile(db.d1, "sty-1"))?.derived_guidelines).toBeNull();
  });
});

describe("getStyleProfile", () => {
  it("returns null for an unknown id", async () => {
    expect(await getStyleProfile(db.d1, "nope")).toBeNull();
  });
});

describe("listStyleProfiles", () => {
  it("returns newest first", async () => {
    await create("sty-1", "First", 1_000);
    await create("sty-2", "Second", 2_000);
    await create("sty-3", "Third", 3_000);

    expect((await listStyleProfiles(db.d1)).map((p) => p.writer_name)).toEqual([
      "Third",
      "Second",
      "First",
    ]);
  });

  it("includes unapproved profiles — the admin screen needs both", async () => {
    await create("sty-1", "Pending", 1_000);
    await create("sty-2", "Approved", 2_000);
    await approveStyleProfile(db.d1, "sty-2");

    expect((await listStyleProfiles(db.d1)).map((p) => p.approved)).toEqual([1, 0]);
  });

  it("is empty before any profile exists", async () => {
    expect(await listStyleProfiles(db.d1)).toEqual([]);
  });
});

describe("approveStyleProfile", () => {
  it("flips exactly one profile to approved", async () => {
    await create("sty-1", "One", 1_000);
    await create("sty-2", "Two", 2_000);

    await approveStyleProfile(db.d1, "sty-1");

    expect((await getStyleProfile(db.d1, "sty-1"))?.approved).toBe(1);
    expect((await getStyleProfile(db.d1, "sty-2"))?.approved).toBe(0);
  });

  it("is idempotent", async () => {
    await create("sty-1", "One", 1_000);
    await approveStyleProfile(db.d1, "sty-1");
    await approveStyleProfile(db.d1, "sty-1");
    expect((await getStyleProfile(db.d1, "sty-1"))?.approved).toBe(1);
  });
});
