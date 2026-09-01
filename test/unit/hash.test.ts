import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../functions/lib/hash";

describe("sha256Hex", () => {
  it("matches the known SHA-256 digest of the empty string", () => {
    return expect(sha256Hex("")).resolves.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("returns 64 lowercase hex characters", async () => {
    expect(await sha256Hex("some english chunk")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same input", async () => {
    expect(await sha256Hex("chunk")).toBe(await sha256Hex("chunk"));
  });

  it("changes when the source changes — this is what skips re-translation", async () => {
    expect(await sha256Hex("chunk one")).not.toBe(await sha256Hex("chunk two"));
    expect(await sha256Hex("chunk")).not.toBe(await sha256Hex("chunk "));
  });

  it("handles Ge'ez text as UTF-8", async () => {
    expect(await sha256Hex("ሚኒስትሩ ፖሊሲውን አስታወቁ።")).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex("ሀ")).not.toBe(await sha256Hex("ሁ"));
  });
});
