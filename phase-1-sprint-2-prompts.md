# Phase 1 · Sprint 1.2 — Ingest, Split, Translate, Reassemble

> Set model + effort per task. This sprint delivers the usable core: paste English → get an Amharic draft.

---

## Task: Paste-text ingestion + create-article endpoint

**Model:** haiku · `claude-haiku-4-5` · **effort: low** — simple create-and-store.

**Context:** D1 schema and data-access layer exist. Input is pasted plain text only — no file upload.

**Do this:**
- Build a paste box in the SPA (large textarea) and a "Start" action.
- `POST /api/articles` stores `source_english`, sets `status = 'ingested'`, returns the new id.
- Navigate the UI to a per-article workspace keyed by that id.

**Before moving on, check:**
- Pasting text and starting creates one `articles` row and lands on the workspace.
- Empty/whitespace-only input is rejected with a clear message.

---

## Task: AI-assisted chunk splitting

**Model:** opus · `claude-opus-4-8` · **effort: high** — chunking strategy drives translation quality and token cost; the prompt + boundary logic is the tricky part.

**Context:** Article exists with `source_english`. Target chunks 500–800+ words, never cut mid-sentence, respect paragraph/sentence boundaries. Splitting may use Gemini to find natural break points. The Gemini prompt text comes from the `prompts` table (`split` key, current version).

**Do this:**
- `POST /api/articles/:id/split`: load the current `split` prompt, ask Gemini to propose boundary points over the English text, and return an ordered list of proposed chunks (each with char offsets or the text).
- Enforce hard guards in code around the AI result: no chunk cuts mid-sentence; merge undersized trailing fragments; keep original order.
- Persist proposed chunks as `chunks` rows (`ord`, `english_text`, `status = 'proposed'`).
- Keep Gemini calls server-side; never expose the key.

**Before moving on, check:**
- A multi-paragraph article returns chunks in the target size band, in order, none cut mid-sentence.
- A short article returns a single chunk rather than being force-split.
- Re-running split for an article replaces prior proposed chunks cleanly (no duplicates).

---

## Task: Editable chunk-boundary UI

**Model:** sonnet · `claude-sonnet-5` · **effort: medium** — interactive UI with state, but a known pattern.

**Context:** Proposed chunks exist for an article. Requirement 3: the user reviews and adjusts boundaries before translation.

**Do this:**
- Render chunks with visible boundaries; allow merging adjacent chunks and moving a boundary (split point) between them.
- `PUT /api/articles/:id/chunks` persists the adjusted set, re-normalizing `ord`.
- Show each chunk's approximate word count so the user can keep them in-band.

**Before moving on, check:**
- Merging two chunks and saving yields correct `ord` and text with no lost characters.
- Reload shows the saved boundaries, not the original AI proposal.

---

## Task: Per-chunk Gemini translation with retry

**Model:** sonnet · `claude-sonnet-5` · **effort: medium** — core feature logic plus resilience; not architecturally novel.

**Context:** Chunks are finalized with `english_text`. Translate each to Amharic using the current `translate` prompt. Requirement: one chunk failing must not fail the article; chunks are individually retryable. Apply cost-saving — don't re-translate an unchanged chunk that already has `amharic_text`.

**Do this:**
- `POST /api/articles/:id/chunks/:ord/translate`: translate one chunk with Gemini, store `amharic_text`, set `status = 'translated'`.
- On failure, set `status = 'failed'` and return an error the UI can surface per chunk; leave siblings untouched.
- Skip re-translation if `amharic_text` exists and English is unchanged (hash the source to detect change).
- UI: a per-chunk status/translate/retry control and a "translate all remaining" action that calls chunks sequentially.

**Before moving on, check:**
- Forcing one chunk to fail leaves the others translated and the failed one retryable.
- Re-running "translate all" does not re-translate already-translated, unchanged chunks.
- Amharic text stores and displays correctly (Ge'ez renders, no mojibake).

---

## Task: Reassemble chunks into ordered Amharic draft

**Model:** haiku · `claude-haiku-4-5` · **effort: low** — deterministic concatenation.

**Context:** All chunks translated. Produce one Amharic draft in original order.

**Do this:**
- `POST /api/articles/:id/reassemble`: concatenate `amharic_text` by `ord` with correct paragraph spacing into `articles.amharic_draft`; set `status = 'drafted'`.
- Block reassembly (clear message) if any chunk is missing/failed.
- Show the assembled draft read-only in the workspace as the hand-off point to Phase 2's editor.

**Before moving on, check:**
- Draft equals the chunks joined in `ord` order with clean paragraph breaks.
- Reassembly refuses to run while any chunk is unfinished.
