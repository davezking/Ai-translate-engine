# Phase 4 · Sprint 4.2 — Admin Prompt Engine

> Set model + effort per task. Goal: the admin tunes split/translate/QA prompts with version history and rollback — no code deploy.

---

## Task: Edit split/translate/QA prompts (admin-only)

**Model:** sonnet · `claude-sonnet-5` · **effort: medium** — CRUD over prompts, but it drives live AI behavior so treat writes carefully.

**Context:** Requirements 16 + 18. The `prompts` table has three keys (`split`, `translate`, `qa`), each pointing at a current `promptVersions` row. Splitting, translation, and QA already read their prompt from here. Editing must be admin-only.

**Do this:**
- Admin UI to view and edit each of the three prompts (current body).
- `GET /api/prompts/:key` returns the current version; `PUT /api/prompts/:key` publishes a new version.
- Guard all prompt routes with `requireAdmin`.

**Before moving on, check:**
- Admin can view and edit all three prompts; a non-admin is 403'd.
- The pipeline picks up an edited prompt on the next run without a redeploy.

---

## Task: Version history on every publish

**Model:** opus · `claude-opus-4-8` · **effort: high** — the integrity of history/rollback is the requirement; a subtle bug that mutates or loses versions defeats the point.

**Context:** Requirement 17. Every publish creates a new immutable `promptVersions` row; `prompts.current_version_id` points at the active one. History must never be overwritten.

**Do this:**
- On `PUT /api/prompts/:key`, insert a new `promptVersions` row (incremented `version`, `body`, `author` from Access identity, `created_at`) and repoint `current_version_id` — never update an existing version body.
- `GET /api/prompts/:key/versions` lists history newest-first with author + timestamp.
- Show version history per prompt in the admin UI.

**Before moving on, check:**
- Publishing three times yields three retained versions; none are mutated.
- History shows correct authors and timestamps.

---

## Task: Rollback to a previous version

**Model:** sonnet · `claude-sonnet-5` · **effort: medium** — a single-pointer update, but must not destroy history.

**Context:** Requirement 17 + architecture §4: rollback = point `current_version_id` at an older `promptVersions` row. No versions are deleted.

**Do this:**
- `POST /api/prompts/:key/rollback` with a target version id: set `current_version_id` to it after validating it belongs to that key.
- Admin UI: a rollback control on each historical version.
- Confirm the pipeline uses the rolled-back version on the next run.

**Before moving on, check:**
- Rolling back changes which version the pipeline uses, immediately, without deleting newer versions.
- Rolling forward again (to the latest) works the same way.
- A rollback target from the wrong prompt key is rejected.
