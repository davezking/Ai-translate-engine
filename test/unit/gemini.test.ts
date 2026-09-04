import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText } from "../../functions/lib/gemini";
import { testEnv } from "../helpers/env";

afterEach(() => vi.unstubAllGlobals());

const PRIMARY_PATH = "/models/gemini-3.6-flash:generateContent";
const FALLBACK_1_PATH = "/models/gemini-3.5-flash-lite:generateContent";
const FALLBACK_2_PATH = "/models/gemini-3.1-flash-lite:generateContent";

function tierOf(url: string): "primary" | "fallback1" | "fallback2" | "unknown" {
  if (url.includes(PRIMARY_PATH)) return "primary";
  if (url.includes(FALLBACK_1_PATH)) return "fallback1";
  if (url.includes(FALLBACK_2_PATH)) return "fallback2";
  return "unknown";
}

function okResponse(text: string) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
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

describe("generateText model chain", () => {
  it("returns the primary model's result without touching the chain", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(tierOf(url));
      return okResponse("translated by primary");
    });

    const text = await generateText(testEnv(), "system", "user content");

    expect(text).toBe("translated by primary");
    expect(calls).toEqual(["primary"]);
  });

  it("advances to the first fallback on a retryable primary failure, without retrying primary", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(tierOf(url));
      if (tierOf(url) === "primary") return new Response("high demand", { status: 503 });
      return okResponse("translated by fallback1");
    });

    const text = await generateText(testEnv(), "system", "user content");

    expect(text).toBe("translated by fallback1");
    expect(calls).toEqual(["primary", "fallback1"]);
  });

  it("advances past a fallback whose model ID doesn't exist (404) to the next tier", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(tierOf(url));
      const tier = tierOf(url);
      if (tier === "primary") return new Response("high demand", { status: 503 });
      if (tier === "fallback1") return new Response("model not found", { status: 404 });
      return okResponse("translated by fallback2");
    });

    const text = await generateText(testEnv(), "system", "user content");

    expect(text).toBe("translated by fallback2");
    expect(calls).toEqual(["primary", "fallback1", "fallback2"]);
  });

  it("does not advance the chain on a non-retryable, non-404 primary error", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(tierOf(url));
      return new Response("bad request", { status: 400 });
    });

    await expect(generateText(testEnv(), "system", "user content")).rejects.toThrow(/400/);
    expect(calls).toEqual(["primary"]);
  });

  it("retries the final model in the chain with backoff before succeeding", async () => {
    let fallback2Calls = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      const tier = tierOf(url);
      if (tier === "primary") return new Response("high demand", { status: 503 });
      if (tier === "fallback1") return new Response("model not found", { status: 404 });
      fallback2Calls++;
      if (fallback2Calls < 3) return new Response("still unavailable", { status: 503 });
      return okResponse("recovered");
    });

    const text = await runWithFakeTimers(() => generateText(testEnv(), "system", "user content"));

    expect(text).toBe("recovered");
    expect(fallback2Calls).toBe(3);
  });

  it("gives up once the final model in the chain exhausts its retries", async () => {
    let fallback2Calls = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      const tier = tierOf(url);
      if (tier === "primary") return new Response("high demand", { status: 503 });
      if (tier === "fallback1") return new Response("model not found", { status: 404 });
      fallback2Calls++;
      return new Response("still unavailable", { status: 503 });
    });

    await expect(
      runWithFakeTimers(() => generateText(testEnv(), "system", "user content")),
    ).rejects.toThrow(/503/);
    expect(fallback2Calls).toBe(4);
  });

  it("honors a Retry-After header while retrying the final model", async () => {
    let fallback2Calls = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      const tier = tierOf(url);
      if (tier === "primary") return new Response("high demand", { status: 503 });
      if (tier === "fallback1") return new Response("model not found", { status: 404 });
      fallback2Calls++;
      if (fallback2Calls === 1) {
        return new Response("rate limited", { status: 429, headers: { "retry-after": "5" } });
      }
      return okResponse("ok");
    });

    const text = await runWithFakeTimers(() => generateText(testEnv(), "system", "user content"));
    expect(text).toBe("ok");
    expect(fallback2Calls).toBe(2);
  });
});
