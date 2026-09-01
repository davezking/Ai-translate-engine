import { useEffect, useState } from "react";
import Icon from "./Icon";
import { toast } from "./toast";
import { getSeedCount, submitSeed, type SeedResultDTO, type SeedTriple } from "./api";

type Mode = "single" | "batch";

interface LogEntry {
  id: number;
  label: string;
  status: "captured" | "skipped" | "pending" | "error";
  detail: string;
}

let nextLogId = 1;

function resultToLogEntry(label: string, result: SeedResultDTO): LogEntry {
  if (!result.ok) {
    return { id: nextLogId++, label, status: "error", detail: result.error ?? "Failed" };
  }
  if (result.status === "captured") {
    return {
      id: nextLogId++,
      label,
      status: "captured",
      detail: `${result.fixCount ?? 0} fix(es) captured`,
    };
  }
  if (result.status === "skipped") {
    return {
      id: nextLogId++,
      label,
      status: "skipped",
      detail: "No meaningful change — nothing stored",
    };
  }
  return {
    id: nextLogId++,
    label,
    status: "pending",
    detail: result.error ?? "Compare/capture failed — marked pending for retry",
  };
}

const PILL_CLASS: Record<LogEntry["status"], string> = {
  captured: "pill pill-ok",
  skipped: "pill pill-info",
  pending: "pill pill-warn",
  error: "pill pill-danger",
};

function parseBatch(raw: string): { triples: SeedTriple[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      error: "Not valid JSON. Paste an array of { englishSource, aiTranslation, humanFinal }.",
    };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: "Expected a non-empty JSON array of triples." };
  }
  const triples: SeedTriple[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i] as Record<string, unknown>;
    const englishSource = typeof item?.englishSource === "string" ? item.englishSource.trim() : "";
    const aiTranslation = typeof item?.aiTranslation === "string" ? item.aiTranslation.trim() : "";
    const humanFinal = typeof item?.humanFinal === "string" ? item.humanFinal.trim() : "";
    if (!englishSource || !aiTranslation || !humanFinal) {
      return { error: `Item ${i + 1} is missing englishSource, aiTranslation, or humanFinal.` };
    }
    triples.push({ englishSource, aiTranslation, humanFinal });
  }
  return { triples };
}

const BATCH_DELAY_MS = 350;
const BATCH_PLACEHOLDER = `[
  {
    "englishSource": "...",
    "aiTranslation": "...",
    "humanFinal": "..."
  }
]`;

export default function SeedIntake() {
  const [mode, setMode] = useState<Mode>("single");
  const [englishSource, setEnglishSource] = useState("");
  const [aiTranslation, setAiTranslation] = useState("");
  const [humanFinal, setHumanFinal] = useState("");
  const [batchText, setBatchText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [storedCount, setStoredCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  useEffect(() => {
    getSeedCount()
      .then((r) => setStoredCount(r.count))
      .catch(() => {});
  }, []);

  function recordResult(label: string, result: SeedResultDTO) {
    setLog((prev) => [resultToLogEntry(label, result), ...prev].slice(0, 200));
    if (result.ok && result.status === "captured") {
      setStoredCount((c) => (c ?? 0) + 1);
    }
  }

  async function handleSingleSubmit() {
    if (!englishSource.trim() || !aiTranslation.trim() || !humanFinal.trim()) {
      setError("All three fields are required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await submitSeed({ englishSource, aiTranslation, humanFinal });
      recordResult("Single triple", result);
      if (result.ok) {
        toast(
          result.status === "captured"
            ? `Correction captured (${result.fixCount ?? 0} fix(es)).`
            : result.status === "skipped"
              ? "No meaningful change — nothing stored."
              : "Article created; capture pending retry.",
          result.status === "captured" || result.status === "skipped" ? "ok" : "err",
        );
        if (result.status !== "pending") {
          setEnglishSource("");
          setAiTranslation("");
          setHumanFinal("");
        }
      } else {
        toast(result.error ?? "Failed to submit seed triple.", "err");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBatchSubmit() {
    const parsed = parseBatch(batchText);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setSubmitting(true);
    setProgress({ done: 0, total: parsed.triples.length });
    try {
      for (let i = 0; i < parsed.triples.length; i++) {
        const result = await submitSeed(parsed.triples[i]);
        recordResult(`Batch item ${i + 1}`, result);
        setProgress({ done: i + 1, total: parsed.triples.length });
        if (i < parsed.triples.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }
      toast(`Batch complete: ${parsed.triples.length} triple(s) processed.`);
      setBatchText("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 920 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Seed intake <span className="admin-note">admin only</span>
          </h1>
          <p className="page-sub">
            Bootstrap the correction library from existing (English, AI-translation, human-final)
            triples. Each one runs the same compare → summary → embed path as a live finalize.
          </p>
        </div>
        <span className="spacer" />
        <span className="hint">
          Stored corrections: <b>{storedCount === null ? "…" : storedCount.toLocaleString()}</b>
        </span>
      </div>

      <div className="row" style={{ marginBottom: 14, gap: 6 }}>
        <button
          className={`btn btn-sm ${mode === "single" ? "btn-primary" : ""}`}
          onClick={() => setMode("single")}
          disabled={submitting}
        >
          Single triple
        </button>
        <button
          className={`btn btn-sm ${mode === "batch" ? "btn-primary" : ""}`}
          onClick={() => setMode("batch")}
          disabled={submitting}
        >
          Batch (JSON)
        </button>
      </div>

      {mode === "single" ? (
        <div className="card card-pad stack-lg">
          <div className="field">
            <label className="label" htmlFor="seed-en">
              English source
            </label>
            <textarea
              id="seed-en"
              className="textarea"
              value={englishSource}
              onChange={(e) => setEnglishSource(e.target.value)}
              placeholder="The original English article text…"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="seed-ai">
              AI translation (machine Amharic, pre-review)
            </label>
            <textarea
              id="seed-ai"
              className="textarea"
              value={aiTranslation}
              onChange={(e) => setAiTranslation(e.target.value)}
              placeholder="The machine-translated Amharic before human review…"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="seed-final">
              Human-final (approved Amharic)
            </label>
            <textarea
              id="seed-final"
              className="textarea"
              value={humanFinal}
              onChange={(e) => setHumanFinal(e.target.value)}
              placeholder="The human-corrected, publication-ready Amharic…"
            />
          </div>

          {error && (
            <p role="alert" className="banner banner-danger">
              <Icon name="warn" />
              <span>{error}</span>
            </p>
          )}

          <div className="row">
            <span className="hint">
              Runs <span className="mono">POST /api/seed</span> — the same compare + capture
              pipeline as finalize.
            </span>
            <span className="spacer" />
            <button
              className="btn btn-lg btn-primary"
              onClick={handleSingleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="spin" /> Submitting…
                </>
              ) : (
                <>
                  <Icon name="check" /> Submit triple
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="card card-pad stack-lg">
          <div className="field">
            <div className="row">
              <label className="label" htmlFor="seed-batch">
                Triples (JSON array)
              </label>
              <span className="spacer" />
              <span className="hint">
                Submitted one at a time, throttled ~{BATCH_DELAY_MS}ms apart
              </span>
            </div>
            <textarea
              id="seed-batch"
              className="textarea mono"
              style={{ minHeight: 220 }}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder={BATCH_PLACEHOLDER}
            />
            <span className="hint">
              Each item needs <span className="mono">englishSource</span>,{" "}
              <span className="mono">aiTranslation</span>, and{" "}
              <span className="mono">humanFinal</span> as strings.
            </span>
          </div>

          {error && (
            <p role="alert" className="banner banner-danger">
              <Icon name="warn" />
              <span>{error}</span>
            </p>
          )}

          <div className="row">
            <span className="hint">
              {progress ? `Processing ${progress.done} / ${progress.total}…` : "Nothing running."}
            </span>
            <span className="spacer" />
            <button
              className="btn btn-lg btn-primary"
              onClick={handleBatchSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="spin" /> Running batch…
                </>
              ) : (
                <>
                  <Icon name="play" /> Run batch
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className="card card-pad stack-sm" style={{ marginTop: 16 }}>
          <div className="card-head">
            <h3>Recent submissions</h3>
          </div>
          <div className="stack-sm">
            {log.map((entry) => (
              <div key={entry.id} className="row small">
                <span className={PILL_CLASS[entry.status]}>{entry.status}</span>
                <span className="dim">{entry.label}</span>
                <span className="spacer" />
                <span className="hint">{entry.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
