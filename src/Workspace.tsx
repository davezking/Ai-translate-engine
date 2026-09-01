import { useEffect, useRef, useState } from "react";
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
import Icon from "./Icon";
import ReviewStage from "./ReviewStage";
import { paragraphsOf, wordCount } from "./text";
import { toast } from "./toast";

const MIN_WORDS = 500;
const MAX_WORDS = 800;
const HARD_CAP = 900;

interface WorkingChunk {
  id: string | null;
  englishText: string;
  amharicText: string | null;
  status: string;
}

function fromChunkDTOs(chunks: ChunkDTO[]): WorkingChunk[] {
  return chunks
    .slice()
    .sort((a, b) => a.ord - b.ord)
    .map((c) => ({
      id: c.id,
      englishText: c.english_text,
      amharicText: c.amharic_text,
      status: c.status,
    }));
}

function sameChunks(a: WorkingChunk[], b: WorkingChunk[]): boolean {
  return (
    a.length === b.length &&
    a.every((c, i) => c.id === b[i].id && c.englishText === b[i].englishText)
  );
}

const STAGES = [
  { key: "split", name: "Split", meta: "boundaries" },
  { key: "translate", name: "Translate", meta: "per chunk" },
  { key: "qa", name: "QA", meta: "tone + lessons" },
  { key: "review", name: "Review", meta: "human edit" },
  { key: "final", name: "Final", meta: "compare + store" },
] as const;
type StageKey = (typeof STAGES)[number]["key"];

export default function Workspace({
  articleId,
  onBack,
}: {
  articleId: string;
  onBack: () => void;
}) {
  const [article, setArticle] = useState<ArticleDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<StageKey>("split");
  const [chunks, setChunks] = useState<WorkingChunk[]>([]);
  const [savedChunks, setSavedChunks] = useState<WorkingChunk[]>([]);
  const [proposedChunks, setProposedChunks] = useState<WorkingChunk[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getArticle(articleId), listChunks(articleId)])
      .then(([a, c]) => {
        if (cancelled) return;
        setArticle(a.article);
        const working = fromChunkDTOs(c.chunks);
        setChunks(working);
        setSavedChunks(working);
        setProposedChunks(working);
        const started = working.some((w) => w.status === "translated" || w.status === "failed");
        setStage(started ? "translate" : "split");
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

  async function handleSplit() {
    setBusy("splitting");
    setError(null);
    try {
      await splitArticle(articleId);
      const { chunks: fresh } = await listChunks(articleId);
      const working = fromChunkDTOs(fresh);
      setChunks(working);
      setSavedChunks(working);
      setProposedChunks(working);
      setStage("split");
      toast(`Article split into ${working.length} chunk${working.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Split failed");
    } finally {
      setBusy(null);
    }
  }

  const splitDone = stage === "translate" || stage === "review";
  const translateDone =
    chunks.length > 0 && chunks.every((c) => c.status === "translated" && c.amharicText);
  const canReview = translateDone && Boolean(article?.amharic_draft);
  const finalized = article?.status === "final";

  if (loading) return <div className="page center dim">Loading…</div>;
  if (!article) {
    return (
      <div className="page">
        <p role="alert" className="banner banner-danger">
          <Icon name="warn" />
          <span>{error ?? "Article not found."}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title">Article {article.id.slice(0, 8)}</h1>
          <div className="row small dim" style={{ marginTop: 5, gap: 8 }}>
            <span className="mono">{article.id}</span>
            <span className="muted">·</span>
            <span className="pill">{article.status}</span>
            <span className="muted">·</span>
            <span>{wordCount(article.source_english).toLocaleString()} words</span>
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={onBack}>
            <Icon name="back" /> All articles
          </button>
        </div>
      </div>

      <div className="stepper" style={{ marginBottom: 20 }}>
        {STAGES.map((s, i) => {
          const done =
            (s.key === "split" && splitDone) ||
            (s.key === "translate" && translateDone) ||
            (s.key === "qa" && (article.status === "qad" || finalized)) ||
            (s.key === "review" && finalized) ||
            (s.key === "final" && finalized);
          const active = s.key === stage;
          const disabled =
            s.key === "qa" || (s.key === "review" && !canReview) || s.key === "final";
          const cls = [done ? "done" : "", active ? "active" : "", disabled ? "ahead" : ""].join(
            " ",
          );
          return (
            <button
              key={s.key}
              className={`step ${cls}`}
              aria-current={active ? "step" : undefined}
              disabled={disabled}
              onClick={() => !disabled && setStage(s.key)}
            >
              <span className="step-dot">{done ? <Icon name="check" /> : i + 1}</span>
              <span className="step-text">
                <span className="step-name">{s.name}</span>
                <span className="step-meta">{s.meta}</span>
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="banner banner-danger" style={{ marginBottom: 14 }}>
          <Icon name="warn" />
          <span>{error}</span>
        </p>
      )}

      {chunks.length === 0 ? (
        <div className="card empty">
          <Icon name="split" />
          <h3>No chunks yet</h3>
          <p>Run the AI split to break this article into translation-ready chunks.</p>
          <button className="btn btn-primary" onClick={handleSplit} disabled={busy !== null}>
            {busy === "splitting" ? (
              <>
                <span className="spin" /> Splitting…
              </>
            ) : (
              <>
                <Icon name="play" /> Split into chunks
              </>
            )}
          </button>
        </div>
      ) : stage === "split" ? (
        <SplitStage
          articleId={articleId}
          chunks={chunks}
          savedChunks={savedChunks}
          proposedChunks={proposedChunks}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          onChunksChange={setChunks}
          onSaved={(saved) => {
            setSavedChunks(saved);
            setChunks(saved);
          }}
          onResplit={handleSplit}
          onContinue={() => setStage("translate")}
        />
      ) : stage === "translate" ? (
        <TranslateStage
          articleId={articleId}
          article={article}
          onArticleChange={setArticle}
          onBackToSplit={() => setStage("split")}
          onContinueToReview={canReview ? () => setStage("review") : undefined}
        />
      ) : (
        <ReviewStage articleId={articleId} article={article} onArticleChange={setArticle} />
      )}
    </div>
  );
}

/* --- Split stage: paragraph-boundary editor ------------------------------ */
function SplitStage({
  articleId,
  chunks,
  savedChunks,
  proposedChunks,
  busy,
  setBusy,
  setError,
  onChunksChange,
  onSaved,
  onResplit,
  onContinue,
}: {
  articleId: string;
  chunks: WorkingChunk[];
  savedChunks: WorkingChunk[];
  proposedChunks: WorkingChunk[];
  busy: string | null;
  setBusy: (b: string | null) => void;
  setError: (e: string | null) => void;
  onChunksChange: (c: WorkingChunk[]) => void;
  onSaved: (c: WorkingChunk[]) => void;
  onResplit: () => void;
  onContinue: () => void;
}) {
  const past = useRef<WorkingChunk[][]>([]);
  const future = useRef<WorkingChunk[][]>([]);

  const commit = (next: WorkingChunk[]) => {
    past.current.push(chunks);
    future.current = [];
    onChunksChange(next);
  };
  const undo = () => {
    if (past.current.length === 0) return;
    future.current.push(chunks);
    onChunksChange(past.current.pop() as WorkingChunk[]);
  };
  const redo = () => {
    if (future.current.length === 0) return;
    past.current.push(chunks);
    onChunksChange(future.current.pop() as WorkingChunk[]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const dirty = !sameChunks(chunks, savedChunks);
  const keeps = chunks.filter((c) => c.amharicText).length;
  const needs = chunks.length - keeps;
  const savedKeeps = savedChunks.filter((c) => c.amharicText).length;
  const losing = savedKeeps - keeps;
  const onProposal = sameChunks(chunks, proposedChunks);

  function mergeWithPrevious(index: number) {
    const merged: WorkingChunk = {
      id: null,
      englishText: `${chunks[index - 1].englishText.trim()} ${chunks[index].englishText.trim()}`,
      amharicText: null,
      status: "proposed",
    };
    commit([...chunks.slice(0, index - 1), merged, ...chunks.slice(index + 1)]);
  }

  function splitHere(chunkIndex: number, paragraphIndex: number) {
    const paras = paragraphsOf(chunks[chunkIndex].englishText);
    const before = paras.slice(0, paragraphIndex).join("\n\n");
    const after = paras.slice(paragraphIndex).join("\n\n");
    const pieces: WorkingChunk[] = [
      { id: null, englishText: before, amharicText: null, status: "proposed" },
      { id: null, englishText: after, amharicText: null, status: "proposed" },
    ];
    commit([...chunks.slice(0, chunkIndex), ...pieces, ...chunks.slice(chunkIndex + 1)]);
  }

  async function handleSave() {
    if (!dirty) {
      onContinue();
      return;
    }
    setBusy("saving");
    setError(null);
    try {
      const { chunks: saved } = await saveChunkBoundaries(
        articleId,
        chunks.map((c) => ({ id: c.id, englishText: c.englishText })),
      );
      onSaved(fromChunkDTOs(saved));
      toast(
        needs
          ? `Boundaries saved. ${keeps} chunk${keeps === 1 ? "" : "s"} kept their translation, ${needs} to translate.`
          : "Boundaries saved. Every chunk kept its translation.",
      );
      onContinue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saving boundaries failed");
    } finally {
      setBusy(null);
    }
  }

  function sizeOf(c: WorkingChunk, count: number) {
    const w = wordCount(c.englishText);
    if (w > HARD_CAP) return { cls: "pill-danger", label: `${w} words · over the ${HARD_CAP} cap` };
    if (w > MAX_WORDS) return { cls: "pill-warn", label: `${w} words · long` };
    if (w < MIN_WORDS && count > 1) return { cls: "pill-info", label: `${w} words · short` };
    return { cls: "", label: `${w} words` };
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-pad row wrap" style={{ gap: 14 }}>
          <div>
            <div className="stat-label">Chunks</div>
            <div className="row" style={{ gap: 6, marginTop: 3 }}>
              <span style={{ fontSize: 19, fontWeight: 640, fontVariantNumeric: "tabular-nums" }}>
                {chunks.length}
              </span>
            </div>
          </div>
          <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 14 }}>
            <div className="stat-label">Target per chunk</div>
            <div className="small dim" style={{ marginTop: 5 }}>
              {MIN_WORDS}–{MAX_WORDS} words <span className="muted">· hard cap {HARD_CAP}</span>
            </div>
          </div>
          <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 14 }}>
            <div className="stat-label">Translations</div>
            <div className="small dim" style={{ marginTop: 5 }}>
              {keeps} kept · {needs} to translate
            </div>
          </div>
          <span className="spacer" />
          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn btn-sm btn-icon"
              title="Undo (⌘Z)"
              aria-label="Undo"
              disabled={past.current.length === 0}
              onClick={undo}
            >
              <Icon name="undo" />
            </button>
            <button
              className="btn btn-sm btn-icon"
              title="Redo (⌘⇧Z)"
              aria-label="Redo"
              disabled={future.current.length === 0}
              onClick={redo}
            >
              <span style={{ display: "flex", transform: "scaleX(-1)" }}>
                <Icon name="undo" />
              </span>
            </button>
            <button className="btn btn-sm" onClick={onResplit} disabled={busy !== null}>
              {busy === "splitting" ? <span className="spin" /> : <Icon name="retry" />} Re-split
            </button>
            <button
              className="btn btn-sm"
              disabled={onProposal}
              onClick={() => commit([...proposedChunks])}
            >
              <Icon name="retry" /> AI proposal
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={handleSave}
              disabled={busy !== null}
            >
              {busy === "saving" ? (
                <span className="spin" />
              ) : dirty ? (
                "Save boundaries & continue"
              ) : (
                "Continue to translate"
              )}
            </button>
          </div>
        </div>
      </div>

      {dirty && losing > 0 ? (
        <div className="banner banner-warn" style={{ marginBottom: 14 }}>
          <Icon name="warn" />
          <span>
            <b>
              {losing} chunk{losing === 1 ? "" : "s"} will need re-translating.
            </b>{" "}
            Changing a boundary changes a chunk's source text, so its existing Amharic no longer
            applies. Chunks you didn't touch keep theirs.
          </span>
        </div>
      ) : (
        <div className="banner banner-info" style={{ marginBottom: 14 }}>
          <Icon name="info" />
          <span>
            Hover a gap between paragraphs to split, or merge a chunk into the one above it.
          </span>
        </div>
      )}

      <div>
        {chunks.map((c, i) => {
          const size = sizeOf(c, chunks.length);
          const mergedWords = i
            ? wordCount(c.englishText) + wordCount(chunks[i - 1].englishText)
            : 0;
          const tooBig = mergedWords > HARD_CAP;
          const paras = paragraphsOf(c.englishText);
          return (
            <div key={c.id ?? `new-${i}`}>
              {i > 0 && (
                <div className="boundary">
                  <button
                    disabled={tooBig}
                    title={
                      tooBig
                        ? `Merging would make a ${mergedWords}-word chunk, over the ${HARD_CAP}-word cap`
                        : `Merge into chunk ${i} — ${mergedWords} words`
                    }
                    onClick={() => mergeWithPrevious(i)}
                  >
                    <Icon name="merge" /> merge with chunk {i}
                    <span className="b-count">{mergedWords}w</span>
                  </button>
                </div>
              )}
              <div className={`chunk${c.status === "failed" ? " failed" : ""}`}>
                <div className="chunk-head">
                  <span className="chunk-ord">{i + 1}</span>
                  <span className={`pill ${size.cls || "plain"}`}>{size.label}</span>
                  <span className="chunk-words">
                    {paras.length} paragraph{paras.length === 1 ? "" : "s"}
                  </span>
                  <div className="actions">
                    {c.amharicText ? (
                      <span className="pill pill-ok">translation kept</span>
                    ) : c.status === "failed" ? (
                      <span className="pill pill-danger">failed — will retry</span>
                    ) : (
                      <span className="pill">needs translation</span>
                    )}
                  </div>
                </div>
                <div className="chunk-body" style={{ padding: 0 }}>
                  {paras.map((p, j) => (
                    <div key={j}>
                      {j > 0 && (
                        <div className="para-split">
                          <button title="Break the chunk here" onClick={() => splitHere(i, j)}>
                            <Icon name="split" /> split here
                          </button>
                        </div>
                      )}
                      <p className="para">{p}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="hint" style={{ marginTop: 14 }}>
        A chunk whose source text is unchanged keeps its Amharic and is never re-translated.
      </p>
    </>
  );
}

/* --- Translate stage: per-chunk translate with retry ---------------------- */
function TranslateStage({
  articleId,
  article,
  onArticleChange,
  onBackToSplit,
  onContinueToReview,
}: {
  articleId: string;
  article: ArticleDTO;
  onArticleChange: (a: ArticleDTO) => void;
  onBackToSplit: () => void;
  onContinueToReview?: () => void;
}) {
  const [state, setState] = useState<(ChunkDTO & { translateError?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [reassembling, setReassembling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listChunks(articleId).then((r) => {
      if (!cancelled) {
        setState(r.chunks.sort((a, b) => a.ord - b.ord));
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  async function maybeReassemble(list: (ChunkDTO & { translateError?: string })[]) {
    if (list.length === 0 || !list.every((c) => c.status === "translated" && c.amharic_text))
      return;
    setReassembling(true);
    try {
      const { amharicDraft, qa, qaError } = await reassemble(articleId);
      onArticleChange({ ...article, amharic_draft: amharicDraft, status: qa ? "qad" : "drafted" });
      if (qa) {
        toast("All chunks translated, reassembled, and QA'd.");
      } else {
        toast(
          `Reassembled, but QA failed (${qaError ?? "unknown error"}). You can still continue to review with the raw translation.`,
          "err",
        );
      }
    } catch {
      // The reviewer can still see per-chunk translations; reassembly can be retried later.
    } finally {
      setReassembling(false);
    }
  }

  async function translateOne(ord: number, force = false) {
    const current = state.find((c) => c.ord === ord);
    if (!current || (current.status === "translated" && !force)) return;

    setState((prev) => prev.map((c) => (c.ord === ord ? { ...c, status: "translating" } : c)));
    try {
      const { chunk } = await translateChunk(articleId, ord);
      setState((prev) => {
        const next = prev.map((c) => (c.ord === ord ? { ...chunk, translateError: undefined } : c));
        void maybeReassemble(next);
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Translation failed";
      setState((prev) =>
        prev.map((c) => (c.ord === ord ? { ...c, status: "failed", translateError: message } : c)),
      );
    }
  }

  async function runAll() {
    setRunning(true);
    for (const c of state) {
      if (c.status !== "translated") await translateOne(c.ord);
    }
    setRunning(false);
  }

  async function retryFailed() {
    setRunning(true);
    for (const c of state) {
      if (c.status === "failed") await translateOne(c.ord, true);
    }
    setRunning(false);
  }

  if (loading)
    return (
      <div className="center dim" style={{ padding: 40 }}>
        Loading chunks…
      </div>
    );

  const done = state.filter((c) => c.status === "translated").length;
  const failed = state.filter((c) => c.status === "failed").length;
  const allDone = state.length > 0 && done === state.length;

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-pad row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ marginBottom: 7 }}>
              <span className="small" style={{ fontWeight: 560 }}>
                Translation progress
              </span>
              <span className="spacer" />
              <span className="small dim">
                {done} of {state.length} translated{failed ? ` · ${failed} failed` : ""}
                {reassembling ? " · reassembling…" : ""}
              </span>
            </div>
            <div className={`bar${allDone ? " ok" : ""}`}>
              <i
                style={{ width: `${state.length ? Math.round((done / state.length) * 100) : 0}%` }}
              />
            </div>
          </div>
          <div className="row" style={{ flex: "none", gap: 8 }}>
            <button className="btn" onClick={onBackToSplit}>
              <Icon name="back" /> Boundaries
            </button>
            <button className="btn" onClick={retryFailed} disabled={running || failed === 0}>
              <Icon name="retry" /> Retry failed
            </button>
            <button className="btn btn-primary" onClick={runAll} disabled={running || allDone}>
              {running ? <span className="spin" /> : <Icon name="play" />} Translate all remaining
            </button>
          </div>
        </div>
      </div>

      {failed > 0 && (
        <div className="banner banner-warn" style={{ marginBottom: 14 }}>
          <Icon name="warn" />
          <span>
            <b>
              {failed} chunk{failed === 1 ? "" : "s"} failed.
            </b>{" "}
            The rest of the article is untouched — a failed chunk never fails the article.
          </span>
          <span className="actions">
            <button className="btn btn-sm" onClick={retryFailed} disabled={running}>
              Retry
            </button>
          </span>
        </div>
      )}

      <div>
        {state.map((c) => (
          <div key={c.id} className={`chunk${c.status === "failed" ? " failed" : ""}`}>
            <div className="chunk-head">
              <span className="chunk-ord">{c.ord + 1}</span>
              <span className="chunk-words">{c.wordCount} words</span>
              {c.status === "translating" ? (
                <span className="pill plain pill-info">
                  <span className="spin" style={{ width: 9, height: 9 }} /> Translating
                </span>
              ) : (
                <span
                  className={`pill ${
                    c.status === "translated"
                      ? "pill-ok"
                      : c.status === "failed"
                        ? "pill-danger"
                        : ""
                  }`}
                >
                  {c.status}
                </span>
              )}
              <div className="actions">
                {c.status === "translated" ? (
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => translateOne(c.ord, true)}
                    disabled={running}
                  >
                    <Icon name="retry" /> Re-translate
                  </button>
                ) : (
                  <button
                    className={`btn btn-sm ${c.status === "failed" ? "btn-primary" : ""}`}
                    onClick={() => translateOne(c.ord)}
                    disabled={running || c.status === "translating"}
                  >
                    <Icon name={c.status === "failed" ? "retry" : "play"} />{" "}
                    {c.status === "failed" ? "Retry" : "Translate"}
                  </button>
                )}
              </div>
            </div>
            <div className="chunk-body two">
              <div>{c.english_text}</div>
              <div className="geez">
                {c.amharic_text ? (
                  c.amharic_text
                ) : c.status === "translating" ? (
                  <>
                    <div className="skeleton" style={{ height: 12, width: "96%" }} />
                    <div className="skeleton" style={{ height: 12, width: "88%", marginTop: 9 }} />
                  </>
                ) : (
                  <span className="muted small" style={{ fontFamily: "var(--ui)" }}>
                    Not translated yet
                  </span>
                )}
              </div>
            </div>
            {c.translateError && (
              <div className="chunk-error">
                <Icon name="warn" /> {c.translateError}
              </div>
            )}
          </div>
        ))}
      </div>

      {article.amharic_draft && (
        <div className="section">
          <div className="section-head">
            <div className="section-title">Assembled Amharic draft</div>
            {onContinueToReview && (
              <div className="actions">
                <button className="btn btn-primary" onClick={onContinueToReview}>
                  Continue to review
                </button>
              </div>
            )}
          </div>
          <div className="card card-pad geez">{article.amharic_draft}</div>
        </div>
      )}
    </>
  );
}
