# Phase 4 · Sprint 4.1 — Writer Style Profiles

> Set model + effort per task. Goal: QA output matches a chosen writer's voice — and the approach is validated on a real profile early.

---

## Task: Derive style profile from pasted samples

**Model:** opus · `claude-opus-4-8` · **effort: high** — whether a derived profile actually shifts tone is the unproven bet (§7); the extraction prompt is where it's won or lost.

**Context:** Requirement 14: Admin provides one or more sample articles per writer (pasted text — no upload); the system derives reusable tone/voice guidelines. Stored in `styleProfiles`.

**Do this:**
- `POST /api/styles`: accept writer name + pasted sample article(s); ask Gemini to extract concrete, reusable tone/voice guidelines (not a summary of content) as structured text.
- Store `writer_name`, `sample_articles` (JSON text), `derived_guidelines`, `approved = 0`, `created_at`.
- Admin-only (reuse `requireAdmin`).
- Design the extraction prompt to produce guidelines specific enough to change QA output (register, sentence rhythm, vocabulary, formality) rather than vague adjectives.

**Before moving on, check:**
- Submitting samples for a writer stores a profile with non-trivial, specific guidelines.
- Non-admins are 403'd.

---

## Task: Early single-profile quality check + approve flow

**Model:** sonnet · `claude-sonnet-5` · **effort: medium** — a review/approve gate; simple state plus a side-by-side check.

**Context:** §7 mitigation: build and approve one profile early, before the feature is "done," judged against real writer samples. This validates fidelity up front.

**Do this:**
- Add a review screen: show the derived guidelines and let the admin run a sample QA with vs. without the profile on a short test text to judge the tone shift.
- `PATCH /api/styles/:id/approve` sets `approved = 1`.
- Surface approval status in the styles list.

**Before moving on, check:**
- Admin can see the with/without comparison and approve a profile.
- Only approved profiles are flagged as ready for general use.

---

## Task: Apply selected style in the QA prompt

**Model:** sonnet · `claude-sonnet-5` · **effort: medium** — thread a selection through existing QA assembly.

**Context:** Requirements 7 + 15: the user selects a writer style before/at QA; QA applies it. The QA endpoint (3.2) assembles its prompt from the `qa` prompt + retrieved lessons + draft — now also add the selected profile's guidelines.

**Do this:**
- Add style selection in the operator UI (list approved profiles); persist `writer_style_id` on the article.
- In the QA endpoint, load the selected profile's `derived_guidelines` and include them in the QA prompt alongside the retrieved lessons.
- Handle "no style selected" (QA still runs, no tone layer).

**Before moving on, check:**
- Selecting a profile and running QA visibly applies that tone on a test article.
- No selection still runs QA cleanly.
