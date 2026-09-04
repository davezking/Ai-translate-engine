-- Per-chunk QA output (Phase 5.1): the QA pass now runs once per chunk instead
-- of once over the whole reassembled article (see architecture.md §10 Risks —
-- a single article-wide QA/retrieval pass dilutes on long articles). Each
-- chunk's own QA'd Amharic is stored here, independent of its neighbours, so
-- one weak chunk can be re-QA'd without re-running the rest.
--
-- NULL means "not yet QA'd" — either QA hasn't run for this chunk, or its QA
-- pass failed and it still carries only its plain (pre-QA) translation, same
-- "one chunk failing must never fail the article" posture already used for
-- amharic_text (CLAUDE.md pipeline order).
--
-- Never touched by reviewer autosave, which only patches articles.amharic_draft
-- (Hard rule 5) — same reasoning as articles.amharic_qa in migration 0006.
--
-- Never edit an applied migration -- add a new one.

ALTER TABLE chunks ADD COLUMN amharic_qa TEXT;
