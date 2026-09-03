import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText } from "../../functions/lib/gemini";
import { testEnv } from "../helpers/env";

afterEach(() => vi.unstubAllGlobals());

const PRIMARY_PATH = "/models/gemini-3.6-flash:generateContent";
const FALLBACK_PATH = "/models/gemini-3.6-flash-lite:generateContent";

function okResponse(text: string) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function modelOf(url: string): "primary" | "fallback" | "unknown" {
  if (url.includes(PRIMARY_PATH)) return "primary";
  if (url.includes(FALLBACK_PATH)) return "fallback";
  return "unknown";
}

async function runWithFakeTimers<T>(work: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  try {
    const settled = work().then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    );
    await vi.runAllTimersAsync();
    const result = await settled;
    if (!result.ok) throw result.error;
    return result.value;
  } finally {
    vi.useRealTimers();
  }
}

describe("generateText fallback model", () => {
  it("falls back to the lite model immediately on a retryable primary failure", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(modelOf(url));
      if (modelOf(url) === "primary") return new Response("high demand", { status: 503 });
      return okResponse("translated by fallback");
    });

    const text = await generateText(testEnv(), "system", "user content");

    expect(text).toBe("translated by fallback");
    expect(calls).toEqual(["primary", "fallback"]);
  });

  it("does not retry the primary model before falling back", async () => {
    let primaryCalls = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      if (modelOf(url) === "primary") {
        primaryCalls++;
        return new Response("high demand", { status: 503 });
      }
      return okResponse("ok");
    });

    await generateText(testEnv(), "system", "user content");
    expect(primaryCalls).toBe(1);
  });

  it("does not fall back on a non-retryable primary error", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(modelOf(url));
      return new Response("bad request", { status: 400 });
    });

    await expect(generateText(testEnv(), "system", "user content")).rejects.toThrow(/400/);
    expect(calls).toEqual(["primary"]);
  });

  it("retries the fallback model with backoff before succeeding", async () => {
    let fallbackCalls = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      if (modelOf(url) === "primary") return new Response("high demand", { status: 503 });
      fallbackCalls++;
      if (fallbackCalls < 3) return new Response("still unavailable", { status: 503 });
      return okResponse("recovered");
    });

    const text = await runWithFakeTimers(() => generateText(testEnv(), "system", "user content"));

    expect(text).toBe("recovered");
    expect(fallbackCalls).toBe(3);
  });

  it("gives up once the fallback also exhausts its retries", async () => {
    let fallbackCalls = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      if (modelOf(url) === "primary") return new Response("high demand", { status: 503 });
      fallbackCalls++;
      return new Response("still unavailable", { status: 503 });
    });

    await expect(
      runWithFakeTimers(() => generateText(testEnv(), "system", "user content")),
    ).rejects.toThrow(/503/);
    expect(fallbackCalls).toBe(4);
  });

  it("honors a Retry-After header while retrying the fallback", async () => {
    let fallbackCalls = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      if (modelOf(url) === "primary") return new Response("high demand", { status: 503 });
      fallbackCalls++;
      if (fallbackCalls === 1) {
        return new Response("rate limited", { status: 429, headers: { "retry-after": "5" } });
      }
      return okResponse("ok");
    });

    const text = await runWithFakeTimers(() => generateText(testEnv(), "system", "user content"));
    expect(text).toBe("ok");
    expect(fallbackCalls).toBe(2);
  });
});
