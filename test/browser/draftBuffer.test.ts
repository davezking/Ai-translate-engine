import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDraftBuffer, writeDraftBuffer } from "../../src/draftBuffer";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe("draft buffer", () => {
  it("round-trips a reviewer's edit", () => {
    writeDraftBuffer("art-1", "ጤና ይስጥልኝ", 1_700);
    expect(readDraftBuffer("art-1")).toEqual({ text: "ጤና ይስጥልኝ", updatedAt: 1_700 });
  });

  it("keeps each article's buffer separate", () => {
    writeDraftBuffer("art-1", "one", 1);
    writeDraftBuffer("art-2", "two", 2);

    expect(readDraftBuffer("art-1")?.text).toBe("one");
    expect(readDraftBuffer("art-2")?.text).toBe("two");
  });

  it("returns null when nothing has been buffered", () => {
    expect(readDraftBuffer("art-1")).toBeNull();
  });

  it("overwrites the previous buffer for the same article", () => {
    writeDraftBuffer("art-1", "first", 1);
    writeDraftBuffer("art-1", "second", 2);
    expect(readDraftBuffer("art-1")).toEqual({ text: "second", updatedAt: 2 });
  });

  it("buffers an empty edit rather than losing that the reviewer cleared it", () => {
    writeDraftBuffer("art-1", "", 5);
    expect(readDraftBuffer("art-1")).toEqual({ text: "", updatedAt: 5 });
  });

  it("ignores corrupt or partial stored data instead of throwing", () => {
    localStorage.setItem("draft-buffer:art-1", "not json");
    expect(readDraftBuffer("art-1")).toBeNull();

    localStorage.setItem("draft-buffer:art-1", JSON.stringify({ text: "only text" }));
    expect(readDraftBuffer("art-1")).toBeNull();

    localStorage.setItem("draft-buffer:art-1", JSON.stringify({ updatedAt: 1 }));
    expect(readDraftBuffer("art-1")).toBeNull();
  });

  it("does not throw when storage is unavailable — the in-memory edit still stands", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    } as unknown as Storage);

    expect(() => writeDraftBuffer("art-1", "text", 1)).not.toThrow();
    expect(readDraftBuffer("art-1")).toBeNull();
  });
});
