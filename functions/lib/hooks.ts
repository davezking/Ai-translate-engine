import type { Env } from "./env";

/**
 * Called once an article has been finalized. Phase 3 attaches the Gemini
 * QA-vs-final compare and correction-library capture here. No-op today.
 */
export async function onArticleFinalized(_env: Env, _articleId: string): Promise<void> {
  // Intentionally empty — extension point for Phase 3.
}
