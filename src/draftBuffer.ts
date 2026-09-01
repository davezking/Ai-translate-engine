interface DraftBuffer {
  text: string;
  updatedAt: number;
}

function storageKey(articleId: string): string {
  return `draft-buffer:${articleId}`;
}

/** Reads the reviewer's locally-buffered draft for an article, or null if none/unreadable. */
export function readDraftBuffer(articleId: string): DraftBuffer | null {
  try {
    const raw = localStorage.getItem(storageKey(articleId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraftBuffer>;
    if (typeof parsed.text !== "string" || typeof parsed.updatedAt !== "number") return null;
    return { text: parsed.text, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

/** Buffers the reviewer's current edit locally so a crash/disconnect/offline reload never loses it. */
export function writeDraftBuffer(articleId: string, text: string, updatedAt: number): void {
  try {
    localStorage.setItem(storageKey(articleId), JSON.stringify({ text, updatedAt }));
  } catch {
    // Storage unavailable (private mode, quota) — in-memory state still holds the edit this session.
  }
}
