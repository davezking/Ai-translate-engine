import { vi } from "vitest";
import type { Env } from "../../functions/lib/env";
import { EMBEDDING_DIMENSIONS } from "../../functions/lib/env";

export interface FakeVectorize {
  upserted: { id: string; values: number[]; metadata?: Record<string, unknown> }[];
  deleted: string[];
  /** Matches the next query() call returns, newest configuration wins. */
  nextMatches: { id: string; score: number }[];
  /** When set, upsert() rejects with this error — for testing failure paths. */
  upsertError: Error | null;
  upsert(
    vectors: { id: string; values: number[]; metadata?: Record<string, unknown> }[],
  ): Promise<unknown>;
  deleteByIds(ids: string[]): Promise<unknown>;
  query(vector: number[], options: unknown): Promise<{ matches: { id: string; score: number }[] }>;
}

export function fakeVectorize(): FakeVectorize {
  const v: FakeVectorize = {
    upserted: [],
    deleted: [],
    nextMatches: [],
    upsertError: null,
    async upsert(vectors) {
      if (v.upsertError) throw v.upsertError;
      v.upserted.push(...vectors);
      return { mutationId: "test" };
    },
    async deleteByIds(ids) {
      v.deleted.push(...ids);
      return { mutationId: "test" };
    },
    async query() {
      return { matches: v.nextMatches };
    },
  };
  return v;
}

/** Workers AI stub returning a vector of `dimensions` length (default: the real one). */
export function fakeAi(dimensions: number = EMBEDDING_DIMENSIONS) {
  return {
    async run() {
      return { data: [new Array(dimensions).fill(0.01)] };
    },
  };
}

export interface TestEnvParts {
  DB?: unknown;
  VECTORIZE?: unknown;
  AI?: unknown;
  GEMINI_API_KEY?: string;
  QA_RETRIEVAL_TOP_N?: string;
}

/** An Env with every binding stubbed; pass overrides (or undefined) per test. */
export function testEnv(parts: TestEnvParts = {}): Env {
  return {
    DB: parts.DB,
    VECTORIZE: "VECTORIZE" in parts ? parts.VECTORIZE : fakeVectorize(),
    AI: "AI" in parts ? parts.AI : fakeAi(),
    GEMINI_API_KEY: "GEMINI_API_KEY" in parts ? parts.GEMINI_API_KEY : "test-key",
    QA_RETRIEVAL_TOP_N: parts.QA_RETRIEVAL_TOP_N,
  } as unknown as Env;
}

export interface GeminiCall {
  systemInstruction: string;
  userContent: string;
  temperature?: number;
  responseMimeType?: string;
  apiKey: string | null;
}

export interface GeminiStub {
  calls: GeminiCall[];
}

/**
 * Stubs global fetch with a Gemini-shaped responder so prompt assembly can be
 * asserted without a network call — and so no test can accidentally spend a
 * real API call. Each queued reply is returned in order; the last one repeats.
 * Call vi.unstubAllGlobals() in afterEach.
 */
export function stubGemini(replies: string[]): GeminiStub {
  const calls: GeminiCall[] = [];
  let i = 0;

  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as {
      system_instruction: { parts: { text: string }[] };
      contents: { parts: { text: string }[] }[];
      generationConfig?: { temperature?: number; responseMimeType?: string };
    };
    const headers = init.headers as Record<string, string>;
    calls.push({
      systemInstruction: body.system_instruction.parts[0].text,
      userContent: body.contents[0].parts[0].text,
      temperature: body.generationConfig?.temperature,
      responseMimeType: body.generationConfig?.responseMimeType,
      apiKey: headers["x-goog-api-key"] ?? null,
    });
    const text = replies[Math.min(i++, replies.length - 1)];
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  return { calls };
}

/** Stubs fetch with a non-OK Gemini response, for error-path tests. */
export function stubGeminiError(status: number, message: string): void {
  vi.stubGlobal("fetch", async () => new Response(message, { status }));
}
