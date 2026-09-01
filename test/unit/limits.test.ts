import { describe, expect, it } from "vitest";
import {
  enforceMaxLength,
  MAX_ARTICLE_CHARS,
  MAX_PROMPT_BODY_CHARS,
  MAX_STYLE_SAMPLES,
  MAX_STYLE_SAMPLE_CHARS,
  MAX_TEST_TEXT_CHARS,
} from "../../functions/lib/limits";

describe("enforceMaxLength", () => {
  it("passes a value at the limit", () => {
    expect(enforceMaxLength("field", "a".repeat(10), 10)).toBeNull();
  });

  it("rejects a value one character over", async () => {
    const res = enforceMaxLength("field", "a".repeat(11), 10);
    expect(res?.status).toBe(413);
    expect((await res?.json()) as { error: string }).toEqual({
      error: "field is too long: 11 characters, limit 10",
    });
  });

  it("names the field, so a multi-field payload says which one was rejected", async () => {
    const res = enforceMaxLength("sampleArticles[3]", "a".repeat(5), 1);
    expect(((await res?.json()) as { error: string }).error).toContain("sampleArticles[3]");
  });

  it("counts characters, so Ge'ez text is not penalised for its byte length", () => {
    // 10 Ge'ez characters are 30 UTF-8 bytes; the limit is on characters.
    expect(enforceMaxLength("field", "ሀ".repeat(10), 10)).toBeNull();
  });
});

describe("the limits themselves", () => {
  it("leaves room for any real editorial input", () => {
    // A long feature article runs to tens of thousands of characters. If one of
    // these is ever hit by real content, raise it in limits.ts rather than
    // working around it at a call site.
    expect(MAX_ARTICLE_CHARS).toBeGreaterThanOrEqual(100_000);
    expect(MAX_STYLE_SAMPLE_CHARS).toBeGreaterThanOrEqual(100_000);
    expect(MAX_PROMPT_BODY_CHARS).toBeGreaterThanOrEqual(10_000);
    expect(MAX_TEST_TEXT_CHARS).toBeGreaterThanOrEqual(10_000);
    expect(MAX_STYLE_SAMPLES).toBeGreaterThanOrEqual(5);
  });
});
