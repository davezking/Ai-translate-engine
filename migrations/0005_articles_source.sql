-- Adds a source flag to articles so seed-intake entries (Sprint 3.1 seed
-- endpoint, POST /api/seed) are distinguishable from articles that went
-- through the live paste-to-finalize pipeline.
-- Never edit this file after it has been applied anywhere — add a new
-- migration instead.
--
-- source values: NULL (live pipeline, default) | 'seed' (loaded via POST /api/seed)
ALTER TABLE articles ADD COLUMN source TEXT;
