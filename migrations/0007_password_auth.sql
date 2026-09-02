-- Adds password-based session login as an interim alternative identity
-- source to Cloudflare Access (Access/Zero Trust requires a payment method
-- on file to activate; this unblocks deployment without one). Nullable so
-- existing rows aren't broken by the migration — a user with no
-- password_hash simply cannot log in via this path until one is set
-- (bootstrap: scripts/hash-password.mjs + a direct UPDATE, or an admin who
-- already has a password using PUT /api/admin/password).
--
-- Never edit an applied migration — add a new one instead.

ALTER TABLE users ADD COLUMN password_hash TEXT;
