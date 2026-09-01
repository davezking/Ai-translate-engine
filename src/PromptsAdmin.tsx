import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";
import { toast } from "./toast";
import {
  getPrompt,
  listPromptVersions,
  publishPrompt,
  PROMPT_KEYS,
  type CurrentPromptDTO,
  type PromptHistoryDTO,
  type PromptKey,
} from "./api";

const LABELS: Record<PromptKey, { title: string; blurb: string }> = {
  split: {
    title: "Split",
    blurb: "Proposes chunk boundaries on an ingested English article.",
  },
  translate: {
    title: "Translate",
    blurb: "Translates a single chunk from English into Amharic.",
  },
  qa: {
    title: "QA",
    blurb:
      "Corrects the reassembled Amharic, with retrieved lessons and the selected writer style.",
  },
};

function formatStamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PromptsAdmin() {
  const [key, setKey] = useState<PromptKey>("qa");
  const [current, setCurrent] = useState<CurrentPromptDTO | null>(null);
  const [history, setHistory] = useState<PromptHistoryDTO | null>(null);
  const [draft, setDraft] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshHistory = useCallback((k: PromptKey) => {
    return listPromptVersions(k)
      .then(setHistory)
      .catch(() => setHistory(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreviewId(null);
    setHistory(null);
    getPrompt(key)
      .then((prompt) => {
        if (cancelled) return;
        setCurrent(prompt);
        setDraft(prompt.body);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCurrent(null);
        setDraft("");
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    void refreshHistory(key);
    return () => {
      cancelled = true;
    };
  }, [key, refreshHistory]);

  const dirty = current !== null && draft.trim() !== current.body.trim();
  const preview = history?.versions.find((v) => v.id === previewId) ?? null;

  async function handlePublish() {
    if (!draft.trim()) {
      toast("A prompt body cannot be empty.", "err");
      return;
    }
    setPublishing(true);
    try {
      const published = await publishPrompt(key, draft.trim());
      setCurrent(published);
      setDraft(published.body);
      setPreviewId(null);
      await refreshHistory(key);
      toast(`Published ${LABELS[key].title} prompt v${published.version}.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to publish prompt", "err");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 1180 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Prompt engine <span className="admin-note">admin only</span>
          </h1>
          <p className="page-sub">
            Tune the split, translate and QA prompts. The pipeline reads the current version on
            every run — no redeploy needed. Publishing appends a version; nothing is ever
            overwritten.
          </p>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 14, gap: 8 }}>
        {PROMPT_KEYS.map((k) => (
          <button
            key={k}
            className={`btn btn-sm ${k === key ? "btn-primary" : ""}`}
            onClick={() => setKey(k)}
          >
            {LABELS[k].title}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="banner banner-danger">
          <Icon name="warn" />
          <span>{error}</span>
        </p>
      )}

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card card-pad stack-lg">
          <div className="row">
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 640 }}>{LABELS[key].title} prompt</h3>
              <p className="hint">{LABELS[key].blurb}</p>
            </div>
            <span className="spacer" />
            {current && <span className="pill">current: v{current.version}</span>}
          </div>

          <div className="field">
            <label className="label" htmlFor="prompt-body">
              Prompt body
            </label>
            <textarea
              id="prompt-body"
              className="textarea"
              style={{ minHeight: 300 }}
              value={draft}
              disabled={loading}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={loading ? "Loading…" : "Prompt text sent to Gemini for this stage…"}
            />
          </div>

          <div className="row">
            <span className="hint">
              {dirty
                ? "Publishing keeps the old version — history is never overwritten."
                : "No unpublished changes."}
            </span>
            <span className="spacer" />
            {dirty && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setDraft(current?.body ?? "")}
                disabled={publishing}
              >
                <Icon name="undo" /> Discard
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={handlePublish}
              disabled={publishing || loading || !dirty}
            >
              {publishing ? (
                <>
                  <span className="spin" /> Publishing…
                </>
              ) : (
                <>
                  <Icon name="check" /> Publish new version
                </>
              )}
            </button>
          </div>
        </div>

        <div className="stack-lg">
          <div className="card">
            <div className="card-head">
              <h3>
                <Icon name="doc" /> Version history
              </h3>
            </div>
            {history === null ? (
              <p className="hint" style={{ padding: 12 }}>
                Loading…
              </p>
            ) : history.versions.length === 0 ? (
              <p className="hint" style={{ padding: 12 }}>
                No versions recorded for this prompt.
              </p>
            ) : (
              <div className="stack-sm" style={{ padding: 10 }}>
                {history.versions.map((v) => (
                  <div
                    key={v.id}
                    className="row small"
                    style={{
                      cursor: "pointer",
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: v.id === previewId ? "var(--surface-2)" : "transparent",
                    }}
                    onClick={() => setPreviewId((prev) => (prev === v.id ? null : v.id))}
                  >
                    <span>v{v.version}</span>
                    <span className="hint">{v.author}</span>
                    <span className="spacer" />
                    <span className="hint">{formatStamp(v.createdAt)}</span>
                    {v.id === history.currentVersionId && (
                      <span className="pill pill-ok">live</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {preview && (
            <div className="card card-pad stack-lg">
              <div className="row">
                <h3 style={{ fontSize: 15, fontWeight: 640 }}>v{preview.version}</h3>
                <span className="spacer" />
                <span className="hint">
                  {preview.author} · {formatStamp(preview.createdAt)}
                </span>
              </div>
              <p className="hint" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {preview.body}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
