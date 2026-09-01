import { useEffect, useState } from "react";
import Icon from "./Icon";
import { toast } from "./toast";
import {
  getPrompt,
  publishPrompt,
  PROMPT_KEYS,
  type CurrentPromptDTO,
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

export default function PromptsAdmin() {
  const [key, setKey] = useState<PromptKey>("qa");
  const [current, setCurrent] = useState<CurrentPromptDTO | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
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
    return () => {
      cancelled = true;
    };
  }, [key]);

  const dirty = current !== null && draft.trim() !== current.body.trim();

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
      toast(`Published ${LABELS[key].title} prompt v${published.version}.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to publish prompt", "err");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Prompt engine <span className="admin-note">admin only</span>
          </h1>
          <p className="page-sub">
            Tune the split, translate and QA prompts. The pipeline reads the current version on
            every run — no redeploy needed.
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
            style={{ minHeight: 280 }}
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
    </div>
  );
}
