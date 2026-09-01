-- Adds the QA-output snapshot: the Gemini QA pass (Sprint 3.2) writes this once
-- and it is never touched afterward by reviewer autosave, which only patches
-- amharic_draft. Finalize-compare uses this as the "machine" side instead of
-- amharic_draft, for the same reason chunks.amharic_text (not amharic_draft)
-- was compare's source in migration 0004: the field it would otherwise read
-- gets overwritten during review, so a faithful pre-edit snapshot has to live
-- somewhere autosave never writes to.
--
-- NULL for an article that was never QA'd (finalized before Sprint 3.2, or QA
-- failed) — finalize-compare falls back to reassembling chunk translations.
--
-- Never edit an applied migration — add a new one.

ALTER TABLE articles ADD COLUMN amharic_qa TEXT;
