-- Adds correction-capture state to articles so a finalize whose Gemini compare
-- (or, in the store+embed step) fails can be retried instead of silently lost.
-- Never edit this file after it has been applied anywhere — add a new migration instead.
--
-- correction_status values:
--   NULL       never finalized (default for existing/unfinalized rows)
--   'pending'  finalized; compare/store not yet complete — retryable
--   'captured' correction row + Vectorize vector written (set in the store+embed step)
--   'skipped'  finalized but nothing to capture (no machine text / no meaningful change)
ALTER TABLE articles ADD COLUMN correction_status TEXT;
