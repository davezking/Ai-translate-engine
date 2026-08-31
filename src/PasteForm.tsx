import { useState } from "react";
import { createArticle } from "./api";
import Icon from "./Icon";
import { toast } from "./toast";

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

const MIN_WORDS = 20;

export default function PasteForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const words = wordCount(text);
  const chunkEstimate = words > 0 ? Math.max(1, Math.round(words / 650)) : 0;

  async function handleStart() {
    if (!text.trim()) {
      setError("Paste some English text before starting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { id } = await createArticle(text);
      toast("Article created.");
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create article");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">New article</h1>
          <p className="page-sub">
            Paste the English source. Plain text only — there is no file upload by design.
          </p>
        </div>
      </div>

      <div className="card card-pad stack-lg">
        <div className="field">
          <div className="row">
            <label className="label" htmlFor="src">
              English source
            </label>
            <span className="spacer" />
            <span className="hint">
              {words.toLocaleString()} words · ~{chunkEstimate} chunk{chunkEstimate === 1 ? "" : "s"}
            </span>
          </div>
          <textarea
            id="src"
            className="textarea"
            style={{ minHeight: 300 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the full English article here…"
          />
          <span className="hint">
            The splitter targets 500–800 words per chunk and never breaks mid-sentence.
          </span>
        </div>

        <div className="row wrap small dim" style={{ gap: 6 }}>
          <span className="tag">split</span>→<span className="tag">translate</span>→
          <span className="tag">reassemble</span>
        </div>

        {error && (
          <p role="alert" className="banner banner-danger">
            <Icon name="warn" />
            <span>{error}</span>
          </p>
        )}

        <div className="row">
          <span className="hint">
            Creating the article runs <span className="mono">POST /api/articles</span>.
          </span>
          <span className="spacer" />
          <button
            className="btn btn-lg btn-primary"
            onClick={handleStart}
            disabled={submitting || words < MIN_WORDS}
          >
            {submitting ? (
              <>
                <span className="spin" /> Starting…
              </>
            ) : (
              <>
                <Icon name="play" /> Start
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
