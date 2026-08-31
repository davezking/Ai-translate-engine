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
  return fetch(`/api/articles/${articleId}/chunks/${ord}/translate`, { method: "POST" }).then((res) =>
    asJson(res),
  );
}

export function reassemble(articleId: string): Promise<{ amharicDraft: string }> {
  return fetch(`/api/articles/${articleId}/reassemble`, { method: "POST" }).then((res) => asJson(res));
}
