import type { Env } from "../../../../lib/env";
import { db } from "../../../../lib/env";
import { listChunksByArticle, saveChunkBoundaries } from "../../../../lib/db/chunks";
import type { ChunkRow } from "../../../../lib/db/types";
import { wordCount } from "../../../../lib/split";
import { enforceMaxLength, MAX_ARTICLE_CHARS } from "../../../../lib/limits";
import type { AuthedData } from "../../../_middleware";

function withWordCount(chunk: ChunkRow) {
  return { ...chunk, wordCount: wordCount(chunk.english_text) };
}

export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (context) => {
  const chunks = await listChunksByArticle(db(context.env), context.params.id as string);
  return Response.json({ chunks: chunks.map(withWordCount) });
};

/** Persists user-adjusted chunk boundaries (merge / move split point), re-normalizing ord. */
export const onRequestPut: PagesFunction<Env, string, AuthedData> = async (context) => {
  const articleId = context.params.id as string;
  const body = (await context.request.json().catch(() => null)) as {
    chunks?: { id?: unknown; englishText?: unknown }[];
  } | null;

  if (!body || !Array.isArray(body.chunks) || body.chunks.length === 0) {
    return Response.json(
      { error: "chunks array is required and cannot be empty" },
      { status: 400 },
    );
  }

  const parsed = body.chunks.map((c) => ({
    id: typeof c.id === "string" ? c.id : null,
    englishText: typeof c.englishText === "string" ? c.englishText : "",
  }));

  if (parsed.some((c) => c.englishText.trim() === "")) {
    return Response.json({ error: "Chunk text cannot be empty" }, { status: 400 });
  }
  const tooLong = enforceMaxLength(
    "chunks",
    parsed.map((c) => c.englishText).join(""),
    MAX_ARTICLE_CHARS,
  );
  if (tooLong) return tooLong;

  await saveChunkBoundaries(db(context.env), articleId, parsed);
  const chunks = await listChunksByArticle(db(context.env), articleId);
  return Response.json({ chunks: chunks.map(withWordCount) });
};
