import { useEffect, useState } from "react";
import {
  type ArticleDTO,
  type ChunkDTO,
  getArticle,
  listChunks,
  reassemble,
  saveChunkBoundaries,
  splitArticle,
  translateChunk,
} from "./api";

interface EditableChunk {
  id: string | null;
  ord: number;
  englishText: string;
  amharicText: string | null;
  status: string;
  wordCount: number;
  translateError?: string;
}

function toEditable(chunks: ChunkDTO[]): EditableChunk[] {
  return chunks
    .slice()
    .sort((a, b) => a.ord - b.ord)
    .map((c) => ({
      id: c.id,
      ord: c.ord,
      englishText: c.english_text,
      amharicText: c.amharic_text,
      status: c.status,
      wordCount: c.wordCount,
    }));
}

function clientWordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export default function Workspace({ articleId, onBack }: { articleId: string; onBack: () => void }) {
  const [article, setArticle] = useState<ArticleDTO | null>(null);
  const [chunks, setChunks] = useState<EditableChunk[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getArticle(articleId), listChunks(articleId)])
      .then(([a, c]) => {
        if (cancelled) return;
        setArticle(a.article);
        setChunks(toEditable(c.chunks));
        setDirty(false);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  async function refreshChunks() {
    const { chunks: fresh } = await listChunks(articleId);
    setChunks(toEditable(fresh));
    setDirty(false);
  }

  async function handleSplit() {
    setBusy("splitting");
    setError(null);
    try {
      await splitArticle(articleId);
      await refreshChunks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Split failed");
    } finally {
      setBusy(null);
    }
  }

  function handleTextChange(ord: number, value: string) {
    setChunks((prev) =>
      prev.map((c) =>
        c.ord === ord ? { ...c, englishText: value, wordCount: clientWordCount(value) } : c,
      ),
    );
    setDirty(true);
  }

  function handleMergeWithNext(ord: number) {
    setChunks((prev) => {
      const index = prev.findIndex((c) => c.ord === ord);
      if (index === -1 || index === prev.length - 1) return prev;
      const mergedText = `${prev[index].englishText.trim()} ${prev[index + 1].englishText.trim()}`;
      const merged: EditableChunk = {
        id: null,
        ord,
        englishText: mergedText,
        amharicText: null,
        status: "proposed",
        wordCount: clientWordCount(mergedText),
      };
      const next = [...prev.slice(0, index), merged, ...prev.slice(index + 2)];
      return next.map((c, i) => ({ ...c, ord: i }));
    });
    setDirty(true);
  }

  async function handleSaveBoundaries() {
    setBusy("saving");
    setError(null);
    try {
      const { chunks: saved } = await saveChunkBoundaries(
        articleId,
        chunks.map((c) => ({ id: c.id, englishText: c.englishText })),
      );
      setChunks(toEditable(saved));
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saving boundaries failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleTranslateOne(ord: number) {
    setChunks((prev) => prev.map((c) => (c.ord === ord ? { ...c, translateError: undefined } : c)));
    try {
      const { chunk } = await translateChunk(articleId, ord);
      setChunks((prev) =>
        prev.map((c) =>
          c.ord === ord
            ? { ...c, id: chunk.id, amharicText: chunk.amharic_text, status: chunk.status }
            : c,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Translation failed";
      setChunks((prev) =>
        prev.map((c) => (c.ord === ord ? { ...c, status: "failed", translateError: message } : c)),
      );
    }
  }

  async function handleTranslateAll() {
    setBusy("translating-all");
    setError(null);
    for (const c of chunks) {
      await handleTranslateOne(c.ord);
    }
    setBusy(null);
  }

  async function handleReassemble() {
    setBusy("reassembling");
    setError(null);
    try {
      const { amharicDraft } = await reassemble(articleId);
      setArticle((prev) => (prev ? { ...prev, amharic_draft: amharicDraft, status: "drafted" } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reassemble failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p>Loading…</p>;
  if (!article) return <p role="alert">Article not found.</p>;

  const allTranslated =
    chunks.length > 0 && chunks.every((c) => c.status === "translated" && c.amharicText);

  return (
    <section>
      <button onClick={onBack}>&larr; New article</button>
      <p>Status: {article.status}</p>
      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}

      <h2>Source</h2>
      <details>
        <summary>English source ({clientWordCount(article.source_english)} words)</summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>{article.source_english}</pre>
      </details>

      <h2>Chunks</h2>
      {chunks.length === 0 ? (
        <button onClick={handleSplit} disabled={busy !== null}>
          {busy === "splitting" ? "Splitting…" : "Split into chunks"}
        </button>
      ) : (
        <>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            <button onClick={handleSplit} disabled={busy !== null}>
              {busy === "splitting" ? "Re-splitting…" : "Re-split"}
            </button>
            <button onClick={handleSaveBoundaries} disabled={busy !== null || !dirty}>
              {busy === "saving" ? "Saving…" : "Save boundaries"}
            </button>
            <button onClick={handleTranslateAll} disabled={busy !== null || dirty}>
              {busy === "translating-all" ? "Translating…" : "Translate all remaining"}
            </button>
            <button onClick={handleReassemble} disabled={busy !== null || dirty || !allTranslated}>
              {busy === "reassembling" ? "Reassembling…" : "Reassemble draft"}
            </button>
          </div>
          {dirty && <p>Unsaved boundary changes — save before translating.</p>}

          {chunks.map((chunk, i) => (
            <div
              key={chunk.id ?? `new-${chunk.ord}`}
              style={{ border: "1px solid #ccc", padding: "0.75rem", marginBottom: "0.75rem" }}
            >
              <div>
                Chunk {chunk.ord + 1} — {chunk.wordCount} words — status: {chunk.status}
              </div>
              <textarea
                rows={6}
                style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit" }}
                value={chunk.englishText}
                onChange={(e) => handleTextChange(chunk.ord, e.target.value)}
              />
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                {i < chunks.length - 1 && (
                  <button onClick={() => handleMergeWithNext(chunk.ord)} disabled={busy !== null}>
                    Merge with next
                  </button>
                )}
                <button onClick={() => handleTranslateOne(chunk.ord)} disabled={busy !== null || dirty}>
                  {chunk.status === "translated"
                    ? "Re-translate"
                    : chunk.status === "failed"
                      ? "Retry"
                      : "Translate"}
                </button>
              </div>
              {chunk.translateError && (
                <p role="alert" style={{ color: "crimson" }}>
                  {chunk.translateError}
                </p>
              )}
              {chunk.amharicText && (
                <div lang="am" style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap" }}>
                  {chunk.amharicText}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {article.amharic_draft && (
        <>
          <h2>Assembled Amharic draft</h2>
          <div lang="am" style={{ whiteSpace: "pre-wrap", border: "1px solid #ccc", padding: "0.75rem" }}>
            {article.amharic_draft}
          </div>
        </>
      )}
    </section>
  );
}
