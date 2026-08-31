# Phase 2 · Sprint 2.1 — Reviewer Editor + Autosave

> Set model + effort per task. Goal: a human reviews and edits the draft with zero risk of lost work.

---

## Task: Side-by-side English/Amharic editor

**Model:** sonnet · `claude-sonnet-5` · **effort: medium** — layout + editable state + Ge'ez rendering.

**Context:** Article has `amharic_draft` and per-chunk `english_text`. Requirement 10: English on one side, editable Amharic on the other.

**Do this:**
- Two-pane view: left = English (read-only, aligned by chunk or scroll-synced), right = editable Amharic seeded from `amharic_draft`.
- Ensure correct Ge'ez font rendering and input; keep editing responsive on long articles.
- Hold the working Amharic text in local component state (source of truth for the next task's autosave).

**Before moving on, check:**
- Both panes render correctly incl. Amharic; editing the right pane updates local state.
- Long articles stay responsive while typing.

---

## Task: Local draft buffer + debounced minutes-order autosave

**Model:** opus · `claude-opus-4-8` · **effort: high** — the "never lose work" guarantee plus free-tier quota constraint; correctness here is the point of the sprint.

**Context:** Editor holds working Amharic in local state. Requirement 11 + §7 risk: autosave to D1 on a minutes-order interval, debounced after edits pause, with unsaved edits buffered in the browser so nothing is lost even at a long interval, and it must tolerate offline/reconnect.

**Do this:**
- Buffer edits continuously in browser storage (in-memory + a resilient local store) so a crash/disconnect loses nothing.
- `PATCH /api/articles/:id/draft` writes the current Amharic text; fire it debounced, on a minutes-order cadence, only after editing pauses — not on every keystroke.
- Handle offline: queue the pending save and flush on reconnect; show a subtle "saved / unsaved / offline" status.
- Guard against redundant writes (skip if unchanged since last save) to respect D1 free-tier write limits.

**Before moving on, check:**
- Rapid typing produces at most one write per debounce window, not per keystroke.
- Killing the tab mid-edit and reopening restores the unsaved buffer.
- Going offline, editing, then reconnecting flushes exactly one save.

---

## Task: Restore-on-reload from latest saved draft

**Model:** sonnet · `claude-sonnet-5` · **effort: medium** — load/merge logic with an ordering rule.

**Context:** Autosave writes drafts to D1; the browser also holds a local buffer that may be newer.

**Do this:**
- `GET /api/articles/:id` returns the article incl. latest saved Amharic.
- On load, compare server draft vs. local buffer by timestamp and restore the newer; if the local buffer is newer, flush it to the server.
- Make the restore explicit enough that the reviewer trusts what they see (e.g., a brief "restored your latest edits" note).

**Before moving on, check:**
- Reload after a save shows the saved text.
- Reload after edits that were only in the local buffer (never synced) still shows those edits and then syncs them.

---

## Task: Finalize action

**Model:** sonnet · `claude-sonnet-5` · **effort: medium** — straightforward state transition; the heavy compare logic is Phase 3.

**Context:** Reviewer has edited the Amharic. Finalizing marks the human-final version and sets status; the learning capture that compares QA-vs-final is built in Phase 3 and will hook onto this action.

**Do this:**
- `POST /api/articles/:id/finalize`: flush any pending draft, copy the current Amharic into `amharic_final`, set `status = 'final'`.
- Leave a clearly-marked extension point (function call / event) where Phase 3 will attach the Gemini compare + correction capture.
- UI: a Finalize button with confirm, disabled until a draft exists.

**Before moving on, check:**
- Finalizing stores `amharic_final` and flips status; the article shows as final.
- The extension hook exists and is called on finalize (no-op for now).
