import { describe, expect, it } from "vitest";
import { paragraphsOf, wordCount } from "../../src/text";

describe("wordCount", () => {
  it("counts words and ignores surrounding whitespace", () => {
    expect(wordCount("  one two  three ")).toBe(3);
  });

  it("is zero for empty or whitespace-only text", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount(" \n\t")).toBe(0);
  });

  it("counts Ge'ez words the same way", () => {
    expect(wordCount("ሚኒስትሩ ፖሊሲውን አስታወቁ።")).toBe(3);
  });
});

describe("paragraphsOf", () => {
  it("splits on blank lines", () => {
    expect(paragraphsOf("one\n\ntwo\n\nthree")).toEqual(["one", "two", "three"]);
  });

  it("tolerates blank lines that contain whitespace", () => {
    expect(paragraphsOf("one\n   \ntwo")).toEqual(["one", "two"]);
  });

  it("keeps single newlines inside a paragraph", () => {
    expect(paragraphsOf("line one\nline two")).toEqual(["line one\nline two"]);
  });

  it("drops empty paragraphs", () => {
    expect(paragraphsOf("\n\n\n\none\n\n\n\n")).toEqual(["one"]);
    expect(paragraphsOf("")).toEqual([]);
  });
});
