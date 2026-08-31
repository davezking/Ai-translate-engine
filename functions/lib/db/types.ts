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
  status: string;
  writer_style_id: string | null;
  fix_count: number | null;
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
}

export interface CorrectionRow {
  id: string;
  article_id: string;
  change_summary: string;
  topic_tag: string | null;
  vector_id: string;
  created_at: number;
}
