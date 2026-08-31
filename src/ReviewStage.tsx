import { useEffect, useRef, useState } from "react";
import { type ArticleDTO, type ChunkDTO, finalizeArticle, listChunks, patchDraft } from "./api";
import ConfirmDialog from "./ConfirmDialog";
import { readDraftBuffer, writeDraftBuffer } from "./draftBuffer";
import Icon from "./Icon";
import { paragraphsOf } from "./text";
import { toast } from "./toast";

const AUTOSAVE_DEBOUNCE_MS = 120_000; // minutes-order, per CLAUDE.md — not per keystroke

type SaveState = "saved" | "dirty" | "saving" | "offline";

function minutesAgo(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins <= 0) return "less than a minute ago";
  if (mins === 1) return "1 minute ago";
  return `${mins} minutes ago`;
}

export default function ReviewStage({
  articleId,
  article,
  onArticleChange,
}: {
  articleId: string;
  article: ArticleDTO;
  onArticleChange: (a: ArticleDTO) => void;
}) {
  const [chunks, setChunks] = useState<ChunkDTO[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(true);
  const [text, setText] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [restoredNotice, setRestoredNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const textRef = useRef(text);
  textRef.current = text;
  const lastSavedText = useRef(article.amharic_draft ?? "");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingFlush = useRef(false);
  const initialized = useRef(false);

  useEffect(() => {
    let cancelled = false;
    listChunks(articleId).then((r) => {
      if (!cancelled) {
        setChunks(r.chunks.sort((a, b) => a.ord - b.ord));
        setLoadingChunks(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  // Restore-on-reload: the newer of the server draft and the local buffer wins.
  // Runs once on mount only — later prop updates (e.g. from finalizing) must not re-trigger it.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const buffer = readDraftBuffer(articleId);
    const serverText = article.amharic_draft ?? "";

    if (buffer && buffer.updatedAt > article.updated_at) {
      setText(buffer.text);
      lastSavedText.current = serverText;
      setRestoredNotice(`Restored your latest edits from ${minutesAgo(buffer.updatedAt)}.`);
      setSaveState("dirty");
      scheduleFlush(buffer.text, 0);
    } else {
      setText(serverText);
      lastSavedText.current = serverText;
      writeDraftBuffer(articleId, serverText, article.updated_at);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only, see comment above
  }, []);

  async function flush(value: string) {
    if (value === lastSavedText.current) {
      setSaveState("saved");
      pendingFlush.current = false;
      return;
    }
    if (!navigator.onLine) {
      setSaveState("offline");
      pendingFlush.current = true;
      return;
    }
    setSaveState("saving");
    try {
      const { amharicDraft, updatedAt } = await patchDraft(articleId, value);
      lastSavedText.current = amharicDraft;
      writeDraftBuffer(articleId, amharicDraft, updatedAt);
      pendingFlush.current = false;
      setSaveState(textRef.current === amharicDraft ? "saved" : "dirty");
    } catch {
      setSaveState("offline");
      pendingFlush.current = true;
    }
  }

  function scheduleFlush(value: string, delay = AUTOSAVE_DEBOUNCE_MS) {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => flush(value), delay);
  }

  function handleChange(value: string) {
    setText(value);
    const now = Date.now();
    writeDraftBuffer(articleId, value, now);
    setSaveState(value === lastSavedText.current ? "saved" : "dirty");
    if (value !== lastSavedText.current) scheduleFlush(value);
  }

  // Force-save (⌘S) and flush-on-reconnect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      clearTimeout(debounceTimer.current);
      void flush(textRef.current);
    };
    const onOnline = () => {
      if (pendingFlush.current) void flush(textRef.current);
    };
    const onOffline = () => setSaveState("offline");
    document.addEventListener("keydown", onKey);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  });

  useEffect(() => () => clearTimeout(debounceTimer.current), []);

  async function handleFinalize() {
    setConfirming(false);
    setFinalizing(true);
    clearTimeout(debounceTimer.current);
    try {
      const { article: updated } = await finalizeArticle(articleId, textRef.current);
      onArticleChange(updated);
      lastSavedText.current = updated.amharic_final ?? textRef.current;
      writeDraftBuffer(articleId, updated.amharic_draft ?? textRef.current, updated.updated_at);
      setSaveState("saved");
      toast("Article finalized.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Finalize failed", "err");
    } finally {
      setFinalizing(false);
    }
  }

  const englishParagraphs = chunks.flatMap((c) => paragraphsOf(c.english_text));
  const finalized = article.status === "final";

  return (
    <div className="editor-wrap" style={{ height: "auto" }}>
      <div className="editor-bar">
        {restoredNotice && (
          <div className="banner banner-info" style={{ padding: "5px 10px" }}>
            <Icon name="info" />
            <span>{restoredNotice}</span>
          </div>
        )}
        <span className="spacer" />
        <div className="actions">
          <span className={`save-state ${saveState}`}>
            <span className="dot" />
            {finalized
              ? "Finalized"
              : saveState === "saving"
                ? "Saving…"
                : saveState === "dirty"
                  ? "Unsaved changes"
                  : saveState === "offline"
                    ? "Offline — will save on reconnect"
                    : "Saved"}
          </span>
          {finalized ? (
            <span className="pill pill-ok">Final</span>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => setConfirming(true)}
              disabled={finalizing || !text.trim()}
            >
              {finalizing ? <span className="spin" /> : null} Finalize
            </button>
          )}
        </div>
      </div>

      <div className="panes" style={{ minHeight: 420 }}>
        <div className="pane">
          <div className="pane-head">English (read-only)</div>
          <div className="pane-body ro">
            {loadingChunks ? (
              <span className="muted small">Loading…</span>
            ) : (
              englishParagraphs.map((p, i) => <p key={i}>{p}</p>)
            )}
          </div>
        </div>
        <div className="pane">
          <div className="pane-head">
            Amharic
            <span className="actions">{finalized ? "read-only" : "⌘S to save now"}</span>
          </div>
          <div className="pane-body">
            <textarea
              className="amharic-input"
              value={text}
              readOnly={finalized}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="No draft yet."
            />
          </div>
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Finalize this article?"
          body="This copies the current Amharic into the final version and marks the article done. You can still see it here, but it's no longer editable in review."
          confirmLabel="Finalize"
          onConfirm={handleFinalize}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
