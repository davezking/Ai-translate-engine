import { afterEach, describe, expect, it, vi } from "vitest";
import { compareTranslations } from "../../functions/lib/compare";
import { stubGemini, testEnv } from "../helpers/env";

afterEach(() => vi.unstubAllGlobals());

const input = {
  englishContext: "The minister announced the policy.",
  machineAmharic: "ሚኒስትሩ ፖሊሲውን አስታወቁ።",
  humanFinalAmharic: "ሚኒስትሩ ፖሊሲውን ይፋ አደረጉ።",
};

const fixes = [
  { category: "wording", detail: "Replaced literal verb with idiomatic one" },
  { category: "grammar-suffix", detail: "Fixed subject agreement suffix" },
];

function reply(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    changeSummary: "Reviewer replaced the literal verb with the idiomatic one.",
    fixCount: 2,
    topicTag: "verb-choice",
    fixes,
    ...over,
  });
}

describe("compareTranslations", () => {
  it("parses a well-formed response", async () => {
    stubGemini([reply()]);
    await expect(compareTranslations(testEnv(), input)).resolves.toEqual({
      changeSummary: "Reviewer replaced the literal verb with the idiomatic one.",
      fixCount: 2,
      topicTag: "verb-choice",
      fixes,
    });
  });

  it("keeps a well-formed per-fix category and drops an unrecognised one to 'other'", async () => {
    stubGemini([
      reply({
        fixes: [
          { category: "punctuation", detail: "Added missing question mark" },
          { category: "not-a-real-category", detail: "Something else" },
        ],
      }),
    ]);
    await expect(compareTranslations(testEnv(), input)).resolves.toMatchObject({
      fixes: [
        { category: "punctuation", detail: "Added missing question mark" },
        { category: "other", detail: "Something else" },
      ],
    });
  });

  it("drops a malformed fixes field to an empty array rather than throwing", async () => {
    stubGemini([reply({ fixes: "not-an-array" })]);
    await expect(compareTranslations(testEnv(), input)).resolves.toMatchObject({ fixes: [] });

    stubGemini([reply({ fixes: undefined })]);
    await expect(compareTranslations(testEnv(), input)).resolves.toMatchObject({ fixes: [] });

    stubGemini([reply({ fixes: [{ category: "wording" }, { detail: "" }, "oops"] })]);
    await expect(compareTranslations(testEnv(), input)).resolves.toMatchObject({ fixes: [] });
  });

  it("asks Gemini for deterministic JSON", async () => {
    const gemini = stubGemini([reply()]);
    await compareTranslations(testEnv(), input);
    expect(gemini.calls[0].responseMimeType).toBe("application/json");
    expect(gemini.calls[0].temperature).toBe(0);
  });

  it("sends all three texts, labelled", async () => {
    const gemini = stubGemini([reply()]);
    await compareTranslations(testEnv(), input);

    const { userContent } = gemini.calls[0];
    expect(userContent).toContain(input.englishContext);
    expect(userContent).toContain(input.machineAmharic);
    expect(userContent).toContain(input.humanFinalAmharic);
    expect(userContent).toContain("MACHINE AMHARIC");
    expect(userContent).toContain("HUMAN-FINAL AMHARIC");
  });

  it("instructs the model never to diff Ge'ez character-by-character", async () => {
    const gemini = stubGemini([reply()]);
    await compareTranslations(testEnv(), input);
    // Hard rule: fix counts come from the model's comparison, never a text diff.
    expect(gemini.calls[0].systemInstruction).toMatch(/never character-by-character/i);
  });

  it("accepts a zero fix count as a real answer", async () => {
    stubGemini([reply({ fixCount: 0, changeSummary: "No meaningful change." })]);
    await expect(compareTranslations(testEnv(), input)).resolves.toMatchObject({ fixCount: 0 });
  });

  it("coerces a numeric string and rounds a fractional count", async () => {
    stubGemini([reply({ fixCount: "3" })]);
    await expect(compareTranslations(testEnv(), input)).resolves.toMatchObject({ fixCount: 3 });

    stubGemini([reply({ fixCount: 2.6 })]);
    await expect(compareTranslations(testEnv(), input)).resolves.toMatchObject({ fixCount: 3 });
  });

  it("normalises a missing or blank topicTag to null", async () => {
    stubGemini([reply({ topicTag: "  " })]);
    await expect(compareTranslations(testEnv(), input)).resolves.toMatchObject({ topicTag: null });

    stubGemini([reply({ topicTag: undefined })]);
    await expect(compareTranslations(testEnv(), input)).resolves.toMatchObject({ topicTag: null });
  });

  it("rejects a non-JSON response", async () => {
    stubGemini(["Sure! Here is the comparison:"]);
    await expect(compareTranslations(testEnv(), input)).rejects.toThrow(/non-JSON/);
  });

  it("rejects a JSON array, which carries none of the fields we need", async () => {
    stubGemini(["[1, 2, 3]"]);
    await expect(compareTranslations(testEnv(), input)).rejects.toThrow(/empty changeSummary/);
  });

  it("rejects a bare JSON scalar", async () => {
    stubGemini(["42"]);
    await expect(compareTranslations(testEnv(), input)).rejects.toThrow(/non-object/);
  });

  it("rejects an empty changeSummary — there would be no lesson to store", async () => {
    stubGemini([reply({ changeSummary: "   " })]);
    await expect(compareTranslations(testEnv(), input)).rejects.toThrow(/empty changeSummary/);
  });

  it.each([-1, "abc", {}])("rejects an invalid fixCount (%p)", async (fixCount) => {
    stubGemini([reply({ fixCount })]);
    await expect(compareTranslations(testEnv(), input)).rejects.toThrow(/invalid fixCount/);
  });

  it.each([null, ""])(
    "currently reads a %p fixCount as zero rather than rejecting it",
    async (fixCount) => {
      // Documents present behaviour, not an endorsement: Number(null) and
      // Number("") are both 0, so such a count is indistinguishable from an
      // honest "no changes" answer and the correction is skipped instead of
      // being marked retryable. Worth tightening if a real response ever
      // arrives with one.
      stubGemini([reply({ fixCount })]);
      await expect(compareTranslations(testEnv(), input)).resolves.toMatchObject({ fixCount: 0 });
    },
  );
});
