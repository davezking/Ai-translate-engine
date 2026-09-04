import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText } from "../../functions/lib/gemini";
import { testEnv } from "../helpers/env";

afterEach(() => vi.unstubAllGlobals());

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

describe("generateText retry behavior", () => {
  it("retries a 503 and succeeds once Gemini recovers", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      if (calls < 3) return new Response("high demand", { status: 503 });
      return okResponse("translated text");
    });

    const text = await runWithFakeTimers(() => generateText(testEnv(), "system", "user content"));

    expect(text).toBe("translated text");
    expect(calls).toBe(3);
  });

  it("gives up after exhausting retries on persistent 503s", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return new Response("still unavailable", { status: 503 });
    });

    await expect(
      runWithFakeTimers(() => generateText(testEnv(), "system", "user content")),
    ).rejects.toThrow(/503/);
    expect(calls).toBe(4);
  });

  it("does not retry a non-retryable error like 400", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return new Response("bad request", { status: 400 });
    });

    await expect(generateText(testEnv(), "system", "user content")).rejects.toThrow(/400/);
    expect(calls).toBe(1);
  });

  it("honors a Retry-After header on a 429", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      if (calls === 1) {
        return new Response("rate limited", { status: 429, headers: { "retry-after": "5" } });
      }
      return okResponse("ok");
    });

    const text = await runWithFakeTimers(() => generateText(testEnv(), "system", "user content"));
    expect(text).toBe("ok");
    expect(calls).toBe(2);
  });
});
