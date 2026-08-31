-- Initial schema. See architecture.md §4 for the entity-relationship diagram.
-- Never edit this file after it has been applied anywhere — add a new migration instead.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'reviewer'))
);

CREATE TABLE styleProfiles (
  id TEXT PRIMARY KEY,
  writer_name TEXT NOT NULL,
  sample_articles TEXT NOT NULL DEFAULT '[]', -- JSON array, stored as text (SQLite)
  derived_guidelines TEXT,
  approved INTEGER NOT NULL DEFAULT 0, -- 0/1
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- prompts.current_version_id forward-references promptVersions, created next below.
-- SQLite permits a REFERENCES clause naming a table that doesn't exist yet.
CREATE TABLE prompts (
  key TEXT PRIMARY KEY CHECK (key IN ('split', 'translate', 'qa')),
  current_version_id TEXT REFERENCES promptVersions(id)
);

CREATE TABLE promptVersions (
  id TEXT PRIMARY KEY,
  prompt_key TEXT NOT NULL REFERENCES prompts(key),
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  author TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  UNIQUE (prompt_key, version)
);

CREATE INDEX idx_promptVersions_prompt_key_version ON promptVersions(prompt_key, version);

CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  source_english TEXT NOT NULL,
  amharic_draft TEXT,
  amharic_final TEXT,
  status TEXT NOT NULL DEFAULT 'ingested',
  writer_style_id TEXT REFERENCES styleProfiles(id),
  fix_count INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL,
  english_text TEXT NOT NULL,
  amharic_text TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  UNIQUE (article_id, ord)
);

CREATE INDEX idx_chunks_article_id ON chunks(article_id);

CREATE TABLE corrections (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  change_summary TEXT NOT NULL,
  topic_tag TEXT,
  vector_id TEXT NOT NULL UNIQUE, -- handle into Vectorize; D1<->Vectorize must stay 1:1
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX idx_corrections_article_id ON corrections(article_id);
