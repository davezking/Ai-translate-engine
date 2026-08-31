# Phase 1 · Sprint 1.1 — Project & Data Foundation

> Run these in order. Set the model and effort shown on each task before starting it: `/model <id>` and `/effort <level>` (or your client's equivalent). Effort levels: **low** = mechanical, **medium** = normal feature work, **high** = decisions costly to unwind.

---

## Task: Scaffold Cloudflare Pages + Functions app

**Model:** haiku · `claude-haiku-4-5` · **effort: low** — standard scaffolding with a known shape.

**Context:** Greenfield repo. Target stack is Cloudflare Pages (React SPA) + Pages Functions/Workers for the API. Nothing exists yet.

**Do this:**
- Initialize a Cloudflare Pages project with a React (Vite) frontend and a `/functions` (or Workers) API surface.
- Add `wrangler.toml` with placeholders for D1, Vectorize, Workers AI bindings and a `GEMINI_API_KEY` secret.
- Add a `/api/health` route returning `{ ok: true }`.
- Set up scripts: `dev` (`wrangler pages dev`), `deploy`, and a lint/format config.

**Before moving on, check:**
- `wrangler pages dev` serves the SPA and `/api/health` responds `{ ok: true }`.
- No secrets are hardcoded; the Gemini key is referenced as a binding/secret only.

---

## Task: Configure Wrangler bindings (D1, Vectorize, Workers AI, Gemini secret)

**Model:** sonnet · `claude-sonnet-5` · **effort: medium** — binding wiring has platform-specific gotchas.

**Context:** App scaffold and `wrangler.toml` exist from the previous task. This task makes the four external resources reachable from server routes.

**Do this:**
- Create a D1 database and a Vectorize index via wrangler; record their IDs in `wrangler.toml`.
- Bind D1, Vectorize, and Workers AI to the Functions/Worker; add `GEMINI_API_KEY` as a secret.
- Add a thin server-side accessor module exposing `env.DB`, `env.VECTORIZE`, `env.AI`, and a `geminiKey()` helper so routes never touch bindings directly.
- Extend `/api/health` to confirm each binding is present (not null) without making paid calls.

**Before moving on, check:**
- Health route reports all four bindings resolved in `wrangler dev`.
- Vectorize index dimension matches the Workers AI embedding model you'll use (note it in a comment).

---

## Task: Author D1 schema + first migration

**Model:** opus · `claude-opus-4-8` · **effort: high** — the schema underpins every later task; changing it after data exists is expensive.

**Context:** D1 is bound. Implement the data model from `architecture.md` §4. Entities: articles, chunks, corrections, styleProfiles, prompts, promptVersions, users.

**Do this:**
- Write a migration under a `migrations/` dir creating all tables with the fields and relationships from §4.
- Model correctly: `chunks` has `ord`, `english_text`, `amharic_text`, `status` and an FK to `articles`; `corrections` has `change_summary`, `topic_tag`, `vector_id`, FK to `articles`; `prompts.current_version_id` FKs a `promptVersions` row; `styleProfiles` has `approved` and JSON-text `sample_articles`.
- Add sensible indexes (article_id lookups, prompt_key+version).
- Seed the `prompts` table with three rows (`split`, `translate`, `qa`) each pointing at an initial `promptVersions` entry, and seed the two `users` (one `admin`).
- Provide a typed data-access layer (query helpers per table) so later tasks don't write raw SQL inline.

**Before moving on, check:**
- `wrangler d1 migrations apply` runs clean locally; re-running is idempotent/guarded.
- A quick script can insert an article + two chunks and read them back in order by `ord`.
- Rolling a prompt's `current_version_id` between two versions works with a single update.

---

## Task: Cloudflare Access + role-lookup middleware

**Model:** opus · `claude-opus-4-8` · **effort: high** — auth/permission boundary; a mistake here is a security bug.

**Context:** App runs behind Cloudflare Access (Google sign-in, two known emails). Admin is one of them. The `users` table holds emails + roles.

**Do this:**
- Read the Access-provided identity (verified header/JWT) in a server middleware; reject requests with no valid identity.
- Look the email up in `users`; attach `{ email, role }` to the request context.
- Add a `requireAdmin` guard for admin-only routes; return 403 for non-admins.
- Apply the base identity middleware to all `/api/*` routes; document which routes will later be admin-gated (prompts, styles).

**Before moving on, check:**
- A request without a valid Access identity is rejected.
- A non-admin identity is allowed on normal routes and 403'd on an admin-guarded test route.
- Role comes from D1, not a hardcoded email list in code.
