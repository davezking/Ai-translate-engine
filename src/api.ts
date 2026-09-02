export interface ArticleDTO {
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

export interface ApprovedStyleProfileDTO {
  id: string;
  writerName: string;
}

/** Lists approved style profiles (id + name only) for the operator's style-selection dropdown. */
export function listApprovedStyleProfiles(): Promise<{ profiles: ApprovedStyleProfileDTO[] }> {
  return fetch("/api/styles/approved").then((res) => asJson(res));
}

/** Selects (or clears, with null) the writer style applied at QA for this article. */
export function setArticleStyle(
  articleId: string,
  writerStyleId: string | null,
): Promise<{ writerStyleId: string | null; updatedAt: number }> {
  return fetch(`/api/articles/${articleId}/style`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ writerStyleId }),
  }).then((res) => asJson(res));
}

export interface ChunkDTO {
  id: string;
  article_id: string;
  ord: number;
  english_text: string;
  amharic_text: string | null;
  status: string;
  english_hash: string | null;
  wordCount: number;
}

async function asJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export function createArticle(sourceEnglish: string): Promise<{ id: string }> {
  return fetch("/api/articles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceEnglish }),
  }).then((res) => asJson(res));
}

export function getArticle(id: string): Promise<{ article: ArticleDTO }> {
  return fetch(`/api/articles/${id}`).then((res) => asJson(res));
}

export function listChunks(articleId: string): Promise<{ chunks: ChunkDTO[] }> {
  return fetch(`/api/articles/${articleId}/chunks`).then((res) => asJson(res));
}

export function splitArticle(
  articleId: string,
): Promise<{ chunks: { ord: number; englishText: string; wordCount: number }[] }> {
  return fetch(`/api/articles/${articleId}/split`, { method: "POST" }).then((res) => asJson(res));
}

export function saveChunkBoundaries(
  articleId: string,
  chunks: { id: string | null; englishText: string }[],
): Promise<{ chunks: ChunkDTO[] }> {
  return fetch(`/api/articles/${articleId}/chunks`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chunks }),
  }).then((res) => asJson(res));
}

export function translateChunk(
  articleId: string,
  ord: number,
): Promise<{ chunk: ChunkDTO; skipped: boolean }> {
  return fetch(`/api/articles/${articleId}/chunks/${ord}/translate`, { method: "POST" }).then(
    (res) => asJson(res),
  );
}

export interface ReassembleResultDTO {
  amharicDraft: string;
  /** true if the QA pass ran and amharicDraft is its output; false if QA failed and this is the raw reassembled draft. */
  qa: boolean;
  qaError?: string;
}

export function reassemble(articleId: string): Promise<ReassembleResultDTO> {
  return fetch(`/api/articles/${articleId}/reassemble`, { method: "POST" }).then((res) =>
    asJson(res),
  );
}

export interface QaResultDTO {
  amharicDraft: string;
  topN: number;
  retrievedCorrectionIds: string[];
  lessons: { correctionId: string; topicTag: string | null; score: number }[];
  styleApplied: string | null;
  retrievalError?: string;
}

/** Runs the QA pass (retrieve lessons + Gemini) and returns the QA'd draft. */
export function qaArticle(articleId: string): Promise<QaResultDTO> {
  return fetch(`/api/articles/${articleId}/qa`, { method: "POST" }).then((res) => asJson(res));
}

export function patchDraft(
  articleId: string,
  amharicText: string,
): Promise<{ amharicDraft: string; updatedAt: number }> {
  return fetch(`/api/articles/${articleId}/draft`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amharicText }),
  }).then((res) => asJson(res));
}

export function finalizeArticle(
  articleId: string,
  amharicText: string,
): Promise<{ article: ArticleDTO }> {
  return fetch(`/api/articles/${articleId}/finalize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amharicText }),
  }).then((res) => asJson(res));
}

export interface WhoAmIDTO {
  user: { id: string; email: string; role: "admin" | "reviewer" };
}

/** 403s for a non-admin — used to gate the seed-intake nav entry client-side. */
export function whoami(): Promise<WhoAmIDTO> {
  return fetch("/api/admin/whoami").then((res) => asJson(res));
}

export interface AuthStatus {
  authenticated: boolean;
  isAdmin: boolean;
}

/**
 * Distinguishes "not logged in" (401, from the /api/* middleware) from
 * "logged in but not admin" (403, from requireAdmin) — whoami() alone
 * collapses both into a thrown Error, which App needs to tell apart to
 * decide whether to show the login screen at all.
 */
export async function checkAuth(): Promise<AuthStatus> {
  const res = await fetch("/api/admin/whoami");
  if (res.status === 401) return { authenticated: false, isAdmin: false };
  if (!res.ok) return { authenticated: true, isAdmin: false };
  return { authenticated: true, isAdmin: true };
}

export interface LoginResultDTO {
  email: string;
  role: "admin" | "reviewer";
}

/** Password login (interim alternative to Cloudflare Access) — sets the session cookie on success. */
export function login(email: string, password: string): Promise<LoginResultDTO> {
  return fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((res) => asJson(res));
}

export function logout(): Promise<void> {
  return fetch("/api/auth/logout", { method: "POST" }).then(() => undefined);
}

export interface SeedTriple {
  englishSource: string;
  aiTranslation: string;
  humanFinal: string;
}

export interface SeedResultDTO {
  ok: boolean;
  articleId?: string;
  status?: "captured" | "skipped" | "pending";
  fixCount?: number;
  error?: string;
}

/**
 * Never throws — a request or server failure resolves as { ok: false, error },
 * so the batch-mode loop in SeedIntake can log per-item failures and continue
 * without a try/catch around every call.
 */
export async function submitSeed(triple: SeedTriple): Promise<SeedResultDTO> {
  try {
    const res = await fetch("/api/seed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(triple),
    });
    const data = (await res.json()) as {
      articleId?: string;
      status?: SeedResultDTO["status"];
      fixCount?: number;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        articleId: data.articleId,
        error: data.error ?? `Request failed (${res.status})`,
      };
    }
    return { ok: true, articleId: data.articleId, status: data.status, fixCount: data.fixCount };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export function getSeedCount(): Promise<{ count: number }> {
  return fetch("/api/seed").then((res) => asJson(res));
}

export interface FixMetricPoint {
  articleId: string;
  /** null = compare hasn't run yet or the article predates the correction library; distinct from 0 ("no fixes"). */
  fixCount: number | null;
  correctionStatus: string | null;
  finalizedAt: number;
}

export interface FixMetricsDTO {
  points: FixMetricPoint[];
  baselineDays: number;
  baselineEndsAt: number | null;
}

export function getFixMetrics(): Promise<FixMetricsDTO> {
  return fetch("/api/metrics/fixes").then((res) => asJson(res));
}

export type FixCategory = "punctuation" | "grammar-suffix" | "wording" | "tone" | "clause" | "other";

export interface FixDetailDTO {
  category: FixCategory;
  detail: string;
}

export interface CorrectionDTO {
  id: string;
  changeSummary: string;
  topicTag: string | null;
  fixCategories: FixDetailDTO[];
  createdAt: number;
}

export function getArticleCorrections(articleId: string): Promise<{ corrections: CorrectionDTO[] }> {
  return fetch(`/api/articles/${articleId}/corrections`).then((res) => asJson(res));
}

export interface StyleProfileDTO {
  id: string;
  writerName: string;
  sampleArticles: string[];
  derivedGuidelines: string | null;
  approved: boolean;
  createdAt: number;
}

/** Admin-only: derives a style profile from one or more pasted writing samples. */
export function createStyleProfile(
  writerName: string,
  sampleArticles: string[],
): Promise<StyleProfileDTO> {
  return fetch("/api/styles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ writerName, sampleArticles }),
  }).then((res) => asJson(res));
}

/** Admin-only: lists all style profiles, approved and unapproved. */
export function listStyleProfiles(): Promise<{ profiles: StyleProfileDTO[] }> {
  return fetch("/api/styles").then((res) => asJson(res));
}

/** Admin-only: flips a style profile to approved = ready for general use. */
export function approveStyleProfile(id: string): Promise<{ id: string; approved: boolean }> {
  return fetch(`/api/styles/${id}/approve`, { method: "PATCH" }).then((res) => asJson(res));
}

export interface StyleTestResultDTO {
  withoutStyle: string;
  withStyle: string;
}

/** Admin-only: runs the live QA prompt over a short test text with vs. without this profile's guidelines. */
export function testStyleProfile(id: string, testText: string): Promise<StyleTestResultDTO> {
  return fetch(`/api/styles/${id}/test`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ testText }),
  }).then((res) => asJson(res));
}

export type PromptKey = "split" | "translate" | "qa";

export const PROMPT_KEYS: PromptKey[] = ["split", "translate", "qa"];

export interface CurrentPromptDTO {
  key: PromptKey;
  currentVersionId: string;
  version: number;
  body: string;
  createdAt: number;
}

/** Admin-only: the prompt body the pipeline is currently running for this key. */
export function getPrompt(key: PromptKey): Promise<CurrentPromptDTO> {
  return fetch(`/api/prompts/${key}`).then((res) => asJson(res));
}

/** Admin-only: publishes a new immutable version and makes it current. */
export function publishPrompt(key: PromptKey, body: string): Promise<CurrentPromptDTO> {
  return fetch(`/api/prompts/${key}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body }),
  }).then((res) => asJson(res));
}

export interface PromptVersionDTO {
  id: string;
  version: number;
  body: string;
  /** Publishing user's email, falling back to their id if the user row is gone. */
  author: string;
  createdAt: number;
}

export interface PromptHistoryDTO {
  key: PromptKey;
  currentVersionId: string | null;
  versions: PromptVersionDTO[];
}

/** Admin-only: full version history for a prompt, newest-first. */
export function listPromptVersions(key: PromptKey): Promise<PromptHistoryDTO> {
  return fetch(`/api/prompts/${key}/versions`).then((res) => asJson(res));
}

/**
 * Admin-only: repoints the prompt at an existing version. Never deletes
 * history — rolling forward again is the same call with a newer version id.
 */
export function rollbackPrompt(key: PromptKey, versionId: string): Promise<CurrentPromptDTO> {
  return fetch(`/api/prompts/${key}/rollback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ versionId }),
  }).then((res) => asJson(res));
}
