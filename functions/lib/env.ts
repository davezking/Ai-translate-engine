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
  /**
   * Signing secret for password-login session cookies (functions/lib/session.ts) —
   * an interim identity source used only when ACCESS_TEAM_DOMAIN/ACCESS_AUD are
   * unset. Unset = password login is disabled. Rotating it logs everyone out.
   */
  SESSION_SECRET?: string;
  /**
   * How many past correction lessons the QA pass retrieves (top-N). Tunable
   * without a redeploy via the Pages env var; parsed by qaRetrievalTopN().
   */
  QA_RETRIEVAL_TOP_N?: string;
  /**
   * Minimum Vectorize similarity score a retrieved lesson must meet to be used
   * (the "relevance floor" — architecture.md §10). Tunable without a redeploy
   * via the Pages env var; parsed by qaRetrievalMinScore().
   */
  QA_RETRIEVAL_MIN_SCORE?: string;
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
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('"GEMINI_API_KEY" secret is not configured');
  return key;
}

/** Default number of correction lessons retrieved into the QA prompt. */
export const QA_RETRIEVAL_TOP_N_DEFAULT = 4;

/**
 * Resolves the QA retrieval top-N from env, defaulting to
 * QA_RETRIEVAL_TOP_N_DEFAULT and clamping to a sane 1..20 range so a bad env
 * value can neither disable retrieval nor blow up the prompt size.
 */
export function qaRetrievalTopN(env: Env): number {
  const raw = env.QA_RETRIEVAL_TOP_N;
  if (raw === undefined || raw.trim() === "") return QA_RETRIEVAL_TOP_N_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return QA_RETRIEVAL_TOP_N_DEFAULT;
  return Math.min(20, Math.round(n));
}

/**
 * Default minimum Vectorize similarity score ("cosine", per wrangler.toml) a
 * retrieved lesson must meet to be used. Deliberately permissive (near the
 * bottom of the metric's [-1, 1] range) rather than a guessed "reasonable"
 * cutoff: sentence-embedding cosine scores between genuinely unrelated text
 * are known to skew positive rather than cluster near 0, so a confident-
 * looking default risks silently dropping relevant lessons before anyone has
 * seen this corpus's real score distribution. Tune this up (via the
 * QA_RETRIEVAL_MIN_SCORE env var) once the seed library is loaded and the
 * per-chunk retrieval log (qaPipeline.ts) shows what real matches score.
 */
export const QA_RETRIEVAL_MIN_SCORE_DEFAULT = 0;

/**
 * Resolves the QA retrieval relevance floor from env, defaulting to
 * QA_RETRIEVAL_MIN_SCORE_DEFAULT and clamping to the metric's [-1, 1] range
 * so a bad env value can't be misread as an impossible cutoff.
 */
export function qaRetrievalMinScore(env: Env): number {
  const raw = env.QA_RETRIEVAL_MIN_SCORE;
  if (raw === undefined || raw.trim() === "") return QA_RETRIEVAL_MIN_SCORE_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return QA_RETRIEVAL_MIN_SCORE_DEFAULT;
  return Math.max(-1, Math.min(1, n));
}

/** Presence check only — never triggers a paid call. */
export function bindingStatus(
  env: Env,
): Record<"DB" | "VECTORIZE" | "AI" | "GEMINI_API_KEY", boolean> {
  return {
    DB: Boolean(env.DB),
    VECTORIZE: Boolean(env.VECTORIZE),
    AI: Boolean(env.AI),
    GEMINI_API_KEY: Boolean(env.GEMINI_API_KEY),
  };
}
