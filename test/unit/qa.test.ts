import { afterEach, describe, expect, it, vi } from "vitest";
import { runQaPass } from "../../functions/lib/qa";
import type { RetrievedLesson } from "../../functions/lib/retrieval";
import { stubGemini, stubGeminiError, testEnv } from "../helpers/env";

afterEach(() => vi.unstubAllGlobals());

const lesson = (over: Partial<RetrievedLesson> = {}): RetrievedLesson => ({
  correctionId: "corr-1",
  vectorId: "vec-1",
  changeSummary: "Reviewer replaced the literal rendering with the idiomatic Amharic phrase.",
  topicTag: "idiom",
  score: 0.9,
  ...over,
});

const baseInput = {
  qaPromptBody: "PROMPT FROM THE PROMPTS TABLE",
  englishContext: "The minister announced the policy.",
  machineAmharic: "ሚኒስትሩ ፖሊሲውን አስታወቁ።",
  lessons: [],
};

describe("runQaPass", () => {
  it("sends the caller-supplied prompt body as the system instruction", async () => {
    const gemini = stubGemini(["QA'd Amharic"]);
    await runQaPass(testEnv(), baseInput);

    expect(gemini.calls).toHaveLength(1);
    expect(gemini.calls[0].systemInstruction).toBe("PROMPT FROM THE PROMPTS TABLE");
  });

  it("never sends the API key to the client and always passes it as a header", async () => {
    const gemini = stubGemini(["QA'd Amharic"]);
    await runQaPass(testEnv(), baseInput);
    expect(gemini.calls[0].apiKey).toBe("test-key");
  });

  it("includes the English context and the machine Amharic to correct", async () => {
    const gemini = stubGemini(["QA'd Amharic"]);
    await runQaPass(testEnv(), baseInput);

    const { userContent } = gemini.calls[0];
    expect(userContent).toContain("The minister announced the policy.");
    expect(userContent).toContain("ሚኒስትሩ ፖሊሲውን አስታወቁ።");
  });

  it("notes an empty library rather than sending an empty lessons block", async () => {
    const gemini = stubGemini(["QA'd Amharic"]);
    await runQaPass(testEnv(), { ...baseInput, lessons: [] });
    expect(gemini.calls[0].userContent).toContain("No past lessons retrieved");
  });

  it("renders retrieved lessons numbered, with their topic tags", async () => {
    const gemini = stubGemini(["QA'd Amharic"]);
    await runQaPass(testEnv(), {
      ...baseInput,
      lessons: [lesson(), lesson({ changeSummary: "Second lesson.", topicTag: null })],
    });

    const { userContent } = gemini.calls[0];
    expect(userContent).toContain("1. [idiom] Reviewer replaced the literal");
    expect(userContent).toContain("2. Second lesson.");
    expect(userContent).not.toContain("No past lessons retrieved");
  });

  it("omits the style block entirely when no writer style is selected", async () => {
    const gemini = stubGemini(["QA'd Amharic"]);
    await runQaPass(testEnv(), baseInput);
    expect(gemini.calls[0].userContent).not.toContain("TONE/VOICE GUIDELINES");
  });

  it.each([null, undefined, "", "   "])(
    "treats %p style guidelines as no style selected",
    async (styleGuidelines) => {
      const gemini = stubGemini(["QA'd Amharic"]);
      await runQaPass(testEnv(), { ...baseInput, styleGuidelines });
      expect(gemini.calls[0].userContent).not.toContain("TONE/VOICE GUIDELINES");
    },
  );

  it("inserts the selected writer's guidelines ahead of the lessons block", async () => {
    const gemini = stubGemini(["QA'd Amharic"]);
    await runQaPass(testEnv(), {
      ...baseInput,
      styleGuidelines: "Short declarative sentences; avoids loanwords.",
    });

    const { userContent } = gemini.calls[0];
    expect(userContent).toContain("Short declarative sentences; avoids loanwords.");
    expect(userContent.indexOf("TONE/VOICE GUIDELINES")).toBeLessThan(
      userContent.indexOf("LESSONS FROM PAST HUMAN REVIEWS"),
    );
  });

  it("returns the trimmed model output", async () => {
    stubGemini(["  ጥሩ አማርኛ  \n"]);
    await expect(runQaPass(testEnv(), baseInput)).resolves.toBe("ጥሩ አማርኛ");
  });

  it("throws on empty output so the caller can keep the pre-QA draft", async () => {
    stubGemini(["   "]);
    await expect(runQaPass(testEnv(), baseInput)).rejects.toThrow(/empty/i);
  });

  it("surfaces a Gemini transport failure", async () => {
    stubGeminiError(503, "upstream unavailable");
    await expect(runQaPass(testEnv(), baseInput)).rejects.toThrow(/503/);
  });
});
