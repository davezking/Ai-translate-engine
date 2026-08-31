# Phase 3 · Sprint 3.2 — Retrieval into QA + Metrics

> Set model + effort per task. Goal: close the learning loop — QA uses retrieved lessons — and surface the fixes-per-article trend.

---

## Task: QA pass endpoint with retrieved lessons

**Model:** opus · `claude-opus-4-8` · **effort: high** — this is the RAG core: retrieval + prompt assembly is where the "self-improving" promise is delivered or lost.

**Context:** The correction library (D1 + Vectorize) is populated, incl. 50+ seeds. Requirements 6 + 8: after translation, QA fixes grammar/wording/MT-stiffness to natural Amharic, and retrieves the most relevant past change summaries into the QA prompt. Embed the current article's context, query Vectorize for top-N (tunable, 3–5), inject those summaries. QA prompt text comes from the `prompts` table (`qa` key).

**Do this:**
- `POST /api/articles/:id/qa`: embed the current article context (Workers AI), query Vectorize for top-N nearest correction summaries, resolve them to `corrections` rows.
- Assemble the QA prompt from the current `qa` prompt version + the retrieved lessons + the reassembled Amharic draft; call Gemini; store the QA'd Amharic as the new draft the reviewer will see.
- Make N a config value; log which correction ids were retrieved per run for later quality inspection.
- Server-side only; graceful failure that leaves the pre-QA draft intact if QA fails.

**Before moving on, check:**
- Running QA retrieves a sensible top-N (inspect the logged ids against the article's topic) and injects them.
- QA output is natural Amharic and visibly reflects at least some retrieved lessons on a crafted test.
- Changing N changes how many summaries are injected; QA failure preserves the prior draft.

---

## Task: Wire QA into the pipeline after reassemble

**Model:** sonnet · `claude-sonnet-5` · **effort: medium** — sequencing an existing step into the flow.

**Context:** Phase 1 ends at reassemble → `amharic_draft`. QA should run after reassembly and before human review; its output becomes what the reviewer edits. The finalize compare (3.1) should now compare against the **QA output** (swap out the `amharic_draft` stand-in).

**Do this:**
- After reassemble, offer/trigger the QA pass; store QA output as the draft the Phase 2 editor loads.
- Update the finalize compare source to use the QA output as the "machine" side (the parameter left in 3.1).
- Ensure status transitions read cleanly: drafted → qa'd → (review) → final.

**Before moving on, check:**
- A fresh article flows paste → split → translate → reassemble → QA → editor without manual DB pokes.
- Finalize now compares human-final against QA output, not the raw reassembled draft.

---

## Task: Fixes-per-article trend view

**Model:** haiku · `claude-haiku-4-5` · **effort: low** — read stored counts, render a simple chart.

**Context:** Each finalized article stores `fix_count` (3.1). Requirement 13 + primary metric: expose the trend over time, incl. a baseline from the first weeks.

**Do this:**
- `GET /api/metrics/fixes`: return `fix_count` per finalized article ordered by finalize time.
- Render a simple line/bar trend in the UI; mark the early baseline period.
- Keep it read-only and cheap (no heavy aggregation).

**Before moving on, check:**
- The view lists finalized articles with their fix counts in time order.
- With a few finalized articles, the trend renders and the baseline is visible.
