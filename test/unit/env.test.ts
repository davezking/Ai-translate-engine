import { describe, expect, it } from "vitest";
import {
  ai,
  bindingStatus,
  db,
  geminiKey,
  qaRetrievalMinScore,
  qaRetrievalTopN,
  vectorize,
  QA_RETRIEVAL_MIN_SCORE_DEFAULT,
  QA_RETRIEVAL_TOP_N_DEFAULT,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from "../../functions/lib/env";
import { testEnv } from "../helpers/env";

describe("binding accessors", () => {
  it("returns each configured binding", () => {
    const env = testEnv({ DB: { tag: "d1" } });
    expect(db(env)).toEqual({ tag: "d1" });
    expect(vectorize(env)).toBeDefined();
    expect(ai(env)).toBeDefined();
    expect(geminiKey(env)).toBe("test-key");
  });

  it("throws a named error rather than returning undefined when a binding is missing", () => {
    expect(() => db(testEnv())).toThrow(/"DB"/);
    expect(() => vectorize(testEnv({ VECTORIZE: undefined }))).toThrow(/"VECTORIZE"/);
    expect(() => ai(testEnv({ AI: undefined }))).toThrow(/"AI"/);
    expect(() => geminiKey(testEnv({ GEMINI_API_KEY: "" }))).toThrow(/GEMINI_API_KEY/);
  });

  it("trims stray whitespace from the Gemini key so a pasted-in newline can't malform the request header", () => {
    expect(geminiKey(testEnv({ GEMINI_API_KEY: "test-key\n" }))).toBe("test-key");
    expect(geminiKey(testEnv({ GEMINI_API_KEY: "  test-key  " }))).toBe("test-key");
    expect(() => geminiKey(testEnv({ GEMINI_API_KEY: "   " }))).toThrow(/GEMINI_API_KEY/);
  });
});

describe("qaRetrievalTopN", () => {
  it("defaults when unset or blank", () => {
    expect(qaRetrievalTopN(testEnv())).toBe(QA_RETRIEVAL_TOP_N_DEFAULT);
    expect(qaRetrievalTopN(testEnv({ QA_RETRIEVAL_TOP_N: "   " }))).toBe(
      QA_RETRIEVAL_TOP_N_DEFAULT,
    );
  });

  it("reads a valid value", () => {
    expect(qaRetrievalTopN(testEnv({ QA_RETRIEVAL_TOP_N: "7" }))).toBe(7);
  });

  it("never lets a bad value disable retrieval", () => {
    for (const bad of ["0", "-3", "abc", "NaN"]) {
      expect(qaRetrievalTopN(testEnv({ QA_RETRIEVAL_TOP_N: bad }))).toBe(
        QA_RETRIEVAL_TOP_N_DEFAULT,
      );
    }
  });

  it("clamps an oversized value so the prompt cannot blow up", () => {
    expect(qaRetrievalTopN(testEnv({ QA_RETRIEVAL_TOP_N: "500" }))).toBe(20);
  });

  it("rounds a fractional value", () => {
    expect(qaRetrievalTopN(testEnv({ QA_RETRIEVAL_TOP_N: "3.6" }))).toBe(4);
  });
});

describe("qaRetrievalMinScore", () => {
  it("defaults when unset or blank", () => {
    expect(qaRetrievalMinScore(testEnv())).toBe(QA_RETRIEVAL_MIN_SCORE_DEFAULT);
    expect(qaRetrievalMinScore(testEnv({ QA_RETRIEVAL_MIN_SCORE: "   " }))).toBe(
      QA_RETRIEVAL_MIN_SCORE_DEFAULT,
    );
  });

  it("reads a valid value, including negative ones", () => {
    expect(qaRetrievalMinScore(testEnv({ QA_RETRIEVAL_MIN_SCORE: "0.6" }))).toBe(0.6);
    expect(qaRetrievalMinScore(testEnv({ QA_RETRIEVAL_MIN_SCORE: "-0.2" }))).toBe(-0.2);
  });

  it("falls back to the default on an unparseable value", () => {
    expect(qaRetrievalMinScore(testEnv({ QA_RETRIEVAL_MIN_SCORE: "abc" }))).toBe(
      QA_RETRIEVAL_MIN_SCORE_DEFAULT,
    );
  });

  it("clamps to the cosine metric's [-1, 1] range", () => {
    expect(qaRetrievalMinScore(testEnv({ QA_RETRIEVAL_MIN_SCORE: "5" }))).toBe(1);
    expect(qaRetrievalMinScore(testEnv({ QA_RETRIEVAL_MIN_SCORE: "-5" }))).toBe(-1);
  });
});

describe("bindingStatus", () => {
  it("reports presence only, without touching the bindings", () => {
    expect(bindingStatus(testEnv({ DB: {} }))).toEqual({
      DB: true,
      VECTORIZE: true,
      AI: true,
      GEMINI_API_KEY: true,
    });
    expect(bindingStatus(testEnv({ GEMINI_API_KEY: "" }))).toMatchObject({
      DB: false,
      GEMINI_API_KEY: false,
    });
  });
});

describe("embedding constants", () => {
  it("pins the model and the dimension the Vectorize index is created with", () => {
    // Changing either requires recreating the index — see wrangler.toml.
    expect(EMBEDDING_MODEL).toBe("@cf/baai/bge-base-en-v1.5");
    expect(EMBEDDING_DIMENSIONS).toBe(768);
  });
});
