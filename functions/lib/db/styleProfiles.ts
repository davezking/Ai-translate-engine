import type { StyleProfileRow } from "./types";

export async function listStyleProfiles(d1: D1Database): Promise<StyleProfileRow[]> {
  const { results } = await d1
    .prepare("SELECT * FROM styleProfiles ORDER BY created_at DESC")
    .all<StyleProfileRow>();
  return results;
}

export async function getStyleProfile(d1: D1Database, id: string): Promise<StyleProfileRow | null> {
  const row = await d1
    .prepare("SELECT * FROM styleProfiles WHERE id = ?")
    .bind(id)
    .first<StyleProfileRow>();
  return row ?? null;
}

export async function createStyleProfile(
  d1: D1Database,
  input: {
    id: string;
    writerName: string;
    sampleArticles: string;
    derivedGuidelines: string | null;
    now: number;
  },
): Promise<void> {
  await d1
    .prepare(
      "INSERT INTO styleProfiles (id, writer_name, sample_articles, derived_guidelines, approved, created_at) VALUES (?, ?, ?, ?, 0, ?)",
    )
    .bind(input.id, input.writerName, input.sampleArticles, input.derivedGuidelines, input.now)
    .run();
}

export async function approveStyleProfile(d1: D1Database, id: string): Promise<void> {
  await d1.prepare("UPDATE styleProfiles SET approved = 1 WHERE id = ?").bind(id).run();
}
