-- Seed data: initial prompt versions (split/translate/qa) and the two known users.
--
-- IMPORTANT: replace 'REPLACE_WITH_SECOND_USER_EMAIL' below with the second
-- known Cloudflare Access email before applying this migration anywhere real.
-- Never edit this file after it has been applied anywhere — add a new migration instead.

INSERT INTO users (id, email, role) VALUES
  ('usr_admin', 'yegnatop10@gmail.com', 'admin'),
  ('usr_reviewer', 'itzone04@gmail.com', 'reviewer');

INSERT INTO prompts (key, current_version_id) VALUES
  ('split', NULL),
  ('translate', NULL),
  ('qa', NULL);

INSERT INTO promptVersions (id, prompt_key, version, body, author) VALUES
  (
    'promptver_split_1',
    'split',
    1,
    'You split an English article into translation-ready chunks. Propose chunk boundaries so each chunk is roughly 500-800 words. Never cut mid-sentence; prefer paragraph breaks, then sentence breaks. Keep chunks in original order. Return the boundaries as an ordered list of chunk texts.',
    'usr_admin'
  ),
  (
    'promptver_translate_1',
    'translate',
    1,
    'Translate the following English text into Amharic. Preserve meaning, tone, and paragraph structure. Produce natural, publication-quality Amharic (Ge''ez script), not a literal word-for-word rendering. Return only the Amharic translation.',
    'usr_admin'
  ),
  (
    'promptver_qa_1',
    'qa',
    1,
    'You are a QA editor for Amharic translations. Given the source English and the machine-translated Amharic, fix grammar, wording, and machine-translation stiffness so the result reads as if written natively in Amharic. Apply the selected writer''s tone where provided. Return the corrected Amharic text.',
    'usr_admin'
  );

UPDATE prompts SET current_version_id = 'promptver_split_1' WHERE key = 'split';
UPDATE prompts SET current_version_id = 'promptver_translate_1' WHERE key = 'translate';
UPDATE prompts SET current_version_id = 'promptver_qa_1' WHERE key = 'qa';
