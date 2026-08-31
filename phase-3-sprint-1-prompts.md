# Phase 3 · Sprint 3.1 — Compare, Store, Embed

> Set model + effort per task. Goal: capture what humans changed and build the retrievable correction library. Load the 50+ seeds here so retrieval can be validated on real data before Phase 3.2.

---

## Task: Finalize-time Gemini compare → change summary + fix count

**Model:** opus · `claude-opus-4-8` · **effort: high** — this defines the learning signal and the primary metric; the prompt design and "what counts as one fix" decision are load-bearing.

**Context:** Finalize (Phase 2) exposes a hook. Requirements 12–13 + §7: compare QA output vs. human-final with Gemini (not a text diff — Ge'ez-safe), returning a structured change summary ("what changed, why, what to check next time") and a fix count. Fix count may vary run-to-run, so pin down the definition of one fix in the prompt.

**Context note:** the QA output to compare against arrives in Phase 3.2. For now, compare against the article's `amharic_draft` (pre-edit) as the stand-in; 3.2 will swap in the true QA output. Keep the comparison source a parameter, not hardcoded.

**Do this:**
- Implement a compare function: inputs (english context, machine/QA Amharic, human-final Amharic), output a JSON `{ changeSummary, fixCount, topicTag }`.
- Write the compare prompt with an explicit, spot-checkable definition of "one fix"; request strict JSON.
- Call it from the finalize hook; store `fix_count` on the article.
- Handle Gemini failure gracefully — finalize must still succeed; mark the correction capture as pending/retryable.

**Before moving on, check:**
- Finalizing an edited article yields a coherent summary + an integer fix count stored on the article.
- The "one fix" definition is written in the prompt and produces stable-ish counts on a repeat run (spot-check).
- A forced Gemini failure doesn't break finalize; capture is retryable.

---

## Task: Store correction + embed to Vectorize

**Model:** opus · `claude-opus-4-8` · **effort: high** — the D1↔Vectorize consistency and embedding wiring is the heart of retrieval; getting IDs/dimensions wrong breaks the whole loop.

**Context:** Compare produces a change summary. Store it and make it retrievable. Embeddings via Workers AI; vectors in Vectorize; metadata in D1 `corrections` with a `vector_id` handle. Embed the **summary text** (optionally + topic tag), per architecture §3.

**Do this:**
- Generate an embedding of the change summary with Workers AI.
- Upsert the vector into Vectorize with an id; write a `corrections` row (`article_id`, `change_summary`, `topic_tag`, `vector_id`, `created_at`) pointing at it.
- Ensure the Vectorize index dimension matches the embedding model; fail loudly on mismatch.
- Make store+embed atomic-ish: if the vector upsert fails, don't leave an orphan D1 row claiming a vector exists (and vice versa) — reconcile or mark pending.

**Before moving on, check:**
- Finalizing writes one `corrections` row and one Vectorize vector whose id matches `vector_id`.
- A Vectorize query for the summary returns that vector.
- Dimension mismatch is caught with a clear error, not a silent bad insert.

---

## Task: Seed intake endpoint + UI for 50+ triples

**Model:** sonnet · `claude-sonnet-5` · **effort: medium** — reuses the compare/embed pipeline; mostly plumbing and batch UX.

**Context:** Requirement 9 + §7: 50+ existing (English, AI-translation, human-final) triples bootstrap the library. Each runs the same compare → summary → embed path as a live finalize. Loading these now lets retrieval quality be tested on real data before 3.2.

**Do this:**
- `POST /api/seed`: accept one triple (three text fields), run the compare function against the AI-translation vs. human-final, store the correction + embed — reusing the same code path as finalize (no fork).
- Build a simple admin-only intake UI: three fields + submit, plus a lightweight batch mode (paste/submit many in sequence) and a running count of stored corrections.
- Tag/track that these are seed entries (e.g., a topic tag or source flag) so they're distinguishable if needed.

**Before moving on, check:**
- Submitting a triple creates a correction + vector identical in shape to a live finalize.
- 50+ can be loaded without hitting free-tier limits in one session (throttle if needed).
- The stored library is queryable in Vectorize and ready for retrieval testing.
