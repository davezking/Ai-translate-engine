# CLAUDE.md

Standing rules for every Claude Code session in this repo. Read this before touching code. Task-specific instructions live in the `phase-*-sprint-*-prompts.md` files; this file is the context that applies to *all* of them.

## What this project is

An internal tool (2 users, one also Admin) that turns English articles into publication-ready Amharic: paste English → AI split → Gemini translate → automated QA → human review with autosave → finalize. Finalizing captures what the human changed into a **correction library** (RAG), which is retrieved into future QA prompts so QA improves over time. **No model training/fine-tuning — retrieval only.** Full detail in `architecture.md`.

## Stack (do not substitute without being asked)

- **Hosting/API:** Cloudflare Pages (React SPA) + Pages Functions / Workers.
- **DB:** Cloudflare D1 (SQLite).
- **Vectors:** Cloudflare Vectorize. **Embeddings:** Cloudflare Workers AI.
- **Language AI:** Google Gemini API (translate, QA, split assist, finalize compare, style extraction).
- **Auth:** Cloudflare Access (Google sign-in, two known emails). Admin role checked in D1 `users`.

If a task seems to need a different service (a second DB, a different vector store, Firebase — which was deliberately removed), stop and ask rather than adding it.

## Hard rules

1. **Secrets are server-side only.** The Gemini API key is a Worker secret. It, D1, Vectorize, and Workers AI are reachable *only* from server routes via bindings — never from the browser, never in client bundles. Every Gemini call originates server-side.
2. **Workers runtime, not Node.** Prefer Web-standard APIs and Cloudflare bindings. Don't reach for Node-only libraries; if one seems necessary, flag it instead of shimming around it.
3. **D1 ↔ Vectorize must stay consistent.** A `corrections` row claims a vector via `vector_id`; a Vectorize vector must have a matching row. Never create one without the other — on failure, reconcile or mark pending. No orphans in either direction.
4. **Respect free-tier write limits.** Autosave is debounced, minutes-order, and skips unchanged writes. Don't add per-keystroke or per-second writes anywhere.
5. **Never lose reviewer work.** Edits are buffered locally (survives crash/disconnect/offline) and restored on reload. Don't weaken this guarantee for convenience.
6. **Prompt history is immutable.** Publishing a prompt inserts a new `promptVersions` row and repoints `prompts.current_version_id`. Never overwrite or delete a version. Rollback = repoint only.
7. **Input is pasted plain text only.** No file upload, no `.docx`/`.txt`, no Google Docs API. Don't add upload handling.
8. **Admin-gated routes stay gated.** Prompt engine and style management require `role = 'admin'` (via `requireAdmin`), on top of Access.
9. **Gemini calls are resilient by design.** `functions/lib/gemini.ts` walks a model chain — `gemini-3.6-flash` → `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` — on transient failures (429/5xx, including the "high demand" 503) or a 404 (model ID not valid for this API). Every model but the last gets one attempt before advancing; the last gets the full retry-with-backoff budget (4 attempts). A 404 advancing the chain (rather than failing outright) is deliberate: `gemini-3.6-flash-lite`, an earlier fallback guess, turned out not to exist for this API (confirmed via a live 404), so a wrong ID degrades to "skip that tier" instead of breaking resilience. The two lite fallback IDs are user-provided, not yet confirmed against a live `ListModels` call — if you add or change a model in the chain, confirm its exact ID that way first rather than guessing again.
10. **A truncated Gemini response is a failure, never a result.** `generateText()` checks each candidate's `finishReason`; `MAX_TOKENS` (the response was cut off mid-output — more likely on long articles, since Amharic/Ge'ez costs more output tokens per word than English) throws immediately instead of returning the partial text. This is deliberately *not* an `AdvanceableGeminiError` — a smaller fallback model has an equal or smaller output budget, so advancing the chain wouldn't help and could make it worse. Every caller (QA, translate, compare) already treats a `generateText` throw as "leave the existing draft/state untouched, report the failure" — never weaken that by swallowing a truncation or saving partial output as if it were complete.

## Amharic / Ge'ez

- Store and handle everything as UTF-8; verify Ge'ez renders (no mojibake) in editor and stored fields.
- **Never** count edits with a character/word text diff — use the Gemini comparison for both the change summary and the fix count. Ge'ez makes naive diffs unreliable.

## Pipeline order (canonical)

`ingest → split (editable) → translate per-chunk (retryable) → reassemble → QA (tone + retrieved lessons) → human review (autosave) → finalize → compare → store correction + embed`

- One chunk failing must never fail the article; chunks retry individually.
- Don't re-translate an unchanged chunk that already has Amharic text (hash the source to detect change).
- QA reads its prompt from the `prompts` table (`qa` key, current version) — never hardcode prompt text. Same for `split` and `translate`.

## Data model

Source of truth is `architecture.md` §4. Tables: `articles`, `chunks`, `corrections`, `styleProfiles`, `prompts`, `promptVersions`, `users`. Change the schema only via a migration in `migrations/`; never edit an applied migration — add a new one.

## Conventions

- Server routes under `/api/*`; all behind Access, admin ones behind `requireAdmin`.
- Bindings are accessed through the shared accessor module, not referenced ad hoc in each route.
- Vectorize index dimension must match the Workers AI embedding model — fail loudly on mismatch, never silently insert.
- Keep changes scoped to the current task; don't refactor unrelated areas mid-task.

## Model tiers (for the human running sessions)

Per-task tags in the prompt files: **haiku** `claude-haiku-4-5` (mechanical), **sonnet** `claude-sonnet-5` (default feature work), **opus** `claude-opus-4-8` (schema, auth, RAG/retrieval, compare logic, prompt-history integrity). Set with `/model <id>` and `/effort <low|medium|high>` before each task.

## When unsure

Ask rather than invent. The choices most expensive to unwind — schema, the D1/Vectorize consistency contract, auth, and the prompt-versioning model — are the ones to confirm before coding, not after.
