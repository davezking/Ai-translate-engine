# Phase 5 · Sprint 5.1 — QA robustness at length

> Set model + effort per task. Goal: QA and retrieval hold up as well on a ~3000-word article as they do on a short one, with no silent data loss along the way. Post-launch phase — see `architecture.md` §10 Risks and Roadmap Phase 5 for why.

---

## Task: Truncation guard on every Gemini call

**Model:** sonnet · `claude-sonnet-5` · **effort: medium** — small and self-contained, but it's a correctness fix with a real data-loss failure mode behind it, so verify the response-shape assumption carefully.

**Context:** `functions/lib/gemini.ts` `generateText()` reads `data.candidates[0].content.parts[...].text` and returns it once it's non-empty. It never checks `candidates[0].finishReason`. If Gemini hits its output-token ceiling on a large response, it returns `finishReason: "MAX_TOKENS"` with whatever text it managed to produce — non-empty, so today's check passes it straight through. This is more likely on long articles: Amharic/Ge'ez script costs more output tokens per word than English, and the QA and translate prompts both produce full-article-length Amharic. A caller like `runQaPipeline` would then save that partial text as `amharic_qa` via `setArticleQaDraft`, silently replacing the working draft with half an article — the reviewer would only discover it by noticing the text stops mid-paragraph.

Every caller of `generateText` (QA in `qa.ts`, translate, the finalize compare in `compare.ts`) already has a "leave state untouched, report the failure" path for a thrown error — `runQaPipeline` returns `{status: "failed"}` without touching the draft; the per-chunk translate route is independently retryable per Hard rule/pipeline order. So the fix is entirely inside `generateText`: no caller changes needed.

**Do this:**
- Add `finishReason?: string` to the per-candidate shape in the `GeminiResponse` interface.
- After extracting `text`, check `data.candidates?.[0]?.finishReason`. If it's `"MAX_TOKENS"`, throw a plain `Error` (not `AdvanceableGeminiError`) naming the model and that the response was truncated — before the existing empty-text check.
- Keep this a plain `Error`, deliberately not advanceable: a fallback model in the chain has an equal or smaller output budget than the primary, so retrying the same request or advancing the chain doesn't fix a token-ceiling truncation and could waste the retry budget on a request that will truncate again.
- Leave the empty-text check and the rest of `callModel`/`generateText` untouched.

**Before moving on, check:**
- A mocked Gemini response with `finishReason: "MAX_TOKENS"` and non-empty text causes `generateText` to throw, not return the partial text.
- The throw happens on the first model tried — it does *not* advance to the next model in the chain, and does *not* consume the final model's retry-with-backoff budget.
- A normal response (`finishReason: "STOP"`, or the field absent — existing tests mock responses without it) is unaffected.
- `runQaPipeline` on a truncation error still returns `{status: "failed"}` and leaves the existing `amharic_draft`/`amharic_qa` untouched, same as any other `generateText` failure.
- `npm run test`, `npm run typecheck`, `npm run lint` all pass.

---

## Task: Per-chunk QA

**Model:** opus · `claude-opus-4-8` · **effort: high** — reshapes where QA sits in the pipeline; touches the QA route, reassemble, and how finalize's compare sources its "before" text. Get this one reviewed carefully — a mistake here changes the shape of every article going through the system, not just an edge case.

**Context:** Today `runQaPipeline` (`functions/lib/qaPipeline.ts`) runs one QA pass over the entire reassembled article: one retrieval query embedding the whole English source, one Gemini call, one `amharic_qa` write. On a long article this dilutes retrieval (the query is a blurry average across sub-topics), dilutes the lessons' influence (4 short notes against thousands of words of context), and is more exposed to attention weakening toward the end of a long generation — plus the truncation risk the guard above protects against. See architecture.md §10 for the full reasoning.

The chunk boundaries this needs already exist — `chunks` (500–800 words each per `functions/lib/split.ts`) are exactly the unit to QA independently. This is the pipeline-shape decision Hard rule "when unsure, ask" calls out explicitly (schema, retrieval wiring) — confirm the schema approach with the user before writing migrations: does each chunk get its own QA'd text (a new nullable column on `chunks`, migration-driven, allowing independent re-QA of one weak chunk) or does QA run per-chunk but still glue results into the single `articles.amharic_qa` field (no schema change, simpler, but loses the ability to re-QA one chunk)? architecture.md's Phase 5 entry assumes the former; confirm before implementing.

**Do this:**
- Retrieval and the Gemini QA call move to run once per chunk (its own `english_text`/`amharic_text` as context, its own retrieval query) instead of once over the reassembled article.
- Preserve the existing failure posture from Hard rule "one chunk failing must never fail the article": a chunk whose QA pass fails keeps its plain (pre-QA) translation and is flagged, rather than failing the whole QA step.
- Update `runQaPipeline`'s outcome shape and the `/api/articles/:id/qa` response to reflect per-chunk results (which chunks were QA'd, which fell back, combined `lessons` across chunks for the existing UI fields).
- `finalize`'s compare (`functions/lib/hooks.ts`) currently reads `article.amharic_qa` as its machine-side comparison text — confirm what it should read once QA is per-chunk (likely: reassemble the per-chunk QA output, same shape as today's `amharic_qa`, so `hooks.ts` doesn't need to change).
- Respect the Workers Free plan's 50-subrequest-per-request ceiling: a ~3000-word article is ~5 chunks, each up to ~6 Gemini attempts in the worst case (~30 calls) — safely under the limit, but don't parallelize QA calls in a way that could push a very long article over it without a plan for that case.

**Before moving on, check:**
- A multi-chunk article's QA output reads the same as before from the reviewer's side (one coherent Amharic draft in the workspace).
- One chunk's QA pass failing (mock a `generateText` throw for one chunk) leaves that chunk's plain translation in place and doesn't fail the others.
- Retrieval is now scoped per chunk — verify with a test that two chunks on different topics retrieve different lessons.
- Finalize's compare and correction capture still work end-to-end against whatever the chosen "machine Amharic" source is.
- `npm run test`, `npm run typecheck`, `npm run lint` all pass.

---

## Task: Retrieval relevance floor

**Model:** sonnet · `claude-sonnet-5` · **effort: medium** — one function, additive, but tune the threshold conservatively since it directly affects what QA sees.

**Context:** `retrieveLessons` (`functions/lib/retrieval.ts`) always returns the top-N nearest vectors from Vectorize's `query()`, regardless of how similar they actually are. With a thin or off-topic correction library, QA still receives N lessons — just weakly relevant ones — with only prompt-level wording ("ignore any that do not apply") to filter them. Do this after the seed library (50+ examples) is loaded, so a real threshold can be tuned against real score distributions rather than guessed.

**Do this:**
- Add a minimum-score threshold to `retrieveLessons`, dropping matches below it before resolving them to D1 rows (cheaper too — fewer `getCorrectionsByVectorIds` lookups).
- Make the threshold tunable the same way `QA_RETRIEVAL_TOP_N` is (env var with a sane default, per `functions/lib/env.ts`'s `qaRetrievalTopN` pattern) rather than hardcoded, since the right value depends on the corpus and will need tuning against real seed data.
- Keep the existing "retrieval failure ≠ QA failure" posture: fewer or zero lessons surviving the floor is not an error, same as an empty library today.

**Before moving on, check:**
- A match below the threshold is excluded from the returned lessons and never reaches the D1 lookup.
- All matches at or above the threshold still come back in similarity order, same as today.
- An empty result (everything below the floor) still lets QA proceed with the existing "(No past lessons retrieved...)" fallback wording.
- `npm run test`, `npm run typecheck`, `npm run lint` all pass.
