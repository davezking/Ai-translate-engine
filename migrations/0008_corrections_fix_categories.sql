-- Adds a structured per-fix breakdown alongside the existing free-text
-- change_summary: a JSON array of {category, detail}, one entry per fix
-- counted in fix_count, tagged with a linguistic category (punctuation,
-- grammar-suffix, wording, tone, clause, other). Nullable so existing rows
-- (captured before this migration) aren't broken -- null means "no
-- structured breakdown available", distinct from an empty array.
--
-- Never edit an applied migration -- add a new one instead.

ALTER TABLE corrections ADD COLUMN fix_categories TEXT;
