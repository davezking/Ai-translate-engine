-- Adds english_hash to chunks: a hash of english_text as of the chunk's last
-- successful translation. NULL means never translated. The translate endpoint
-- compares this against a fresh hash of the current english_text to decide
-- whether a chunk needs re-translating, since CLAUDE.md forbids using a naive
-- text diff on Amharic/Ge'ez output for this kind of comparison.
-- Never edit this file after it has been applied anywhere — add a new migration instead.

ALTER TABLE chunks ADD COLUMN english_hash TEXT;
