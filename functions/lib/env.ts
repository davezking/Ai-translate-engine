export interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  GEMINI_API_KEY: string;
  /** Cloudflare Access team domain, e.g. "my-team.cloudflareaccess.com". Required in any deployed env. */
  ACCESS_TEAM_DOMAIN?: string;
  /** AUD tag of the Access application protecting this app. Required in any deployed env. */
  ACCESS_AUD?: string;
  /** Local-dev-only bypass: an email treated as authenticated when Access isn't configured. Never set outside .dev.vars. */
  DEV_BYPASS_EMAIL?: string;
}

/**
 * Workers AI embedding model used for correction-summary vectors.
 * Its output dimension MUST match the Vectorize index dimension
 * (see the `wrangler vectorize create` command in wrangler.toml).
 * Changing this model requires recreating the Vectorize index.
 */
export const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
export const EMBEDDING_DIMENSIONS = 768;

export function db(env: Env): D1Database {
  if (!env.DB) throw new Error('D1 binding "DB" is not configured');
  return env.DB;
}

export function vectorize(env: Env): VectorizeIndex {
  if (!env.VECTORIZE) throw new Error('Vectorize binding "VECTORIZE" is not configured');
  return env.VECTORIZE;
}

export function ai(env: Env): Ai {
  if (!env.AI) throw new Error('Workers AI binding "AI" is not configured');
  return env.AI;
}

export function geminiKey(env: Env): string {
  if (!env.GEMINI_API_KEY) throw new Error('"GEMINI_API_KEY" secret is not configured');
  return env.GEMINI_API_KEY;
}

/** Presence check only — never triggers a paid call. */
export function bindingStatus(env: Env): Record<"DB" | "VECTORIZE" | "AI" | "GEMINI_API_KEY", boolean> {
  return {
    DB: Boolean(env.DB),
    VECTORIZE: Boolean(env.VECTORIZE),
    AI: Boolean(env.AI),
    GEMINI_API_KEY: Boolean(env.GEMINI_API_KEY),
  };
}
