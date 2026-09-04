export type Role = "admin" | "reviewer";
export type PromptKey = "split" | "translate" | "qa";

export interface UserRow {
  id: string;
  email: string;
  role: Role;
}

export interface StyleProfileRow {
  id: string;
  writer_name: string;
  sample_articles: string; // JSON array, stored as text
  derived_guidelines: string | null;
  approved: 0 | 1;
  created_at: number;
}

export interface PromptRow {
  key: PromptKey;
  current_version_id: string | null;
}

export interface PromptVersionRow {
  id: string;
  prompt_key: PromptKey;
  version: number;
  body: string;
  author: string;
  created_at: number;
}

export interface ArticleRow {
  id: string;
  source_english: string;
  amharic_draft: string | null;
  amharic_final: string | null;
  /** Immutable QA-pass output, set once per QA run; never touched by reviewer autosave (migration 0006). */
  amharic_qa: string | null;
  status: string;
  writer_style_id: string | null;
  fix_count: number | null;
  /** Correction-capture state: null | 'pending' | 'captured' | 'skipped' (migration 0004). */
  correction_status: string | null;
  /** null (live pipeline) | 'seed' (loaded via POST /api/seed) (migration 0005). */
  source: string | null;
  created_at: number;
  updated_at: number;
}

export interface ChunkRow {
  id: string;
  article_id: string;
  ord: number;
  english_text: string;
  amharic_text: string | null;
  status: string;
  /** Hash of english_text as of the last successful translation; NULL if never translated. */
  english_hash: string | null;
  /**
   * Per-chunk QA'd Amharic (migration 0009), independent of sibling chunks.
   * NULL = not yet QA'd, or this chunk's QA pass failed and it still carries
   * only its plain translation — never touched by reviewer autosave.
   */
  amharic_qa: string | null;
}

export interface CorrectionRow {
  id: string;
  article_id: string;
  change_summary: string;
  topic_tag: string | null;
  /** JSON-encoded FixDetail[] (see lib/compare.ts), or null (migration 0008). */
  fix_categories: string | null;
  vector_id: string;
  created_at: number;
}
