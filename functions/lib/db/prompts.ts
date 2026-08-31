import type { PromptKey, PromptRow, PromptVersionRow } from "./types";

export async function getCurrentPrompt(
  d1: D1Database,
  key: PromptKey,
): Promise<{ prompt: PromptRow; version: PromptVersionRow } | null> {
  const prompt = await d1.prepare("SELECT * FROM prompts WHERE key = ?").bind(key).first<PromptRow>();
  if (!prompt || !prompt.current_version_id) return null;
  const version = await d1
    .prepare("SELECT * FROM promptVersions WHERE id = ?")
    .bind(prompt.current_version_id)
    .first<PromptVersionRow>();
  if (!version) return null;
  return { prompt, version };
}

export async function listPromptVersions(
  d1: D1Database,
  key: PromptKey,
): Promise<PromptVersionRow[]> {
  const { results } = await d1
    .prepare("SELECT * FROM promptVersions WHERE prompt_key = ? ORDER BY version DESC")
    .bind(key)
    .all<PromptVersionRow>();
  return results;
}

/** Inserts a new promptVersions row and repoints prompts.current_version_id — history is never overwritten. */
export async function publishPromptVersion(
  d1: D1Database,
  input: { id: string; key: PromptKey; body: string; author: string; now: number },
): Promise<void> {
  const maxVersion = await d1
    .prepare("SELECT COALESCE(MAX(version), 0) AS maxVersion FROM promptVersions WHERE prompt_key = ?")
    .bind(input.key)
    .first<{ maxVersion: number }>();
  const nextVersion = (maxVersion?.maxVersion ?? 0) + 1;

  await d1.batch([
    d1
      .prepare(
        "INSERT INTO promptVersions (id, prompt_key, version, body, author, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(input.id, input.key, nextVersion, input.body, input.author, input.now),
    d1.prepare("UPDATE prompts SET current_version_id = ? WHERE key = ?").bind(input.id, input.key),
  ]);
}

/** Rollback = repoint current_version_id at an existing version. No history is deleted. */
export async function rollbackPrompt(
  d1: D1Database,
  key: PromptKey,
  versionId: string,
): Promise<void> {
  await d1.prepare("UPDATE prompts SET current_version_id = ? WHERE key = ?").bind(versionId, key).run();
}
