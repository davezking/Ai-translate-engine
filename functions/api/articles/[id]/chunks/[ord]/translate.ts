import type { Env } from "../../../../../lib/env";
import { db } from "../../../../../lib/env";
import { getChunk, setChunkStatus, setChunkTranslation } from "../../../../../lib/db/chunks";
import { getCurrentPrompt } from "../../../../../lib/db/prompts";
import { generateText } from "../../../../../lib/gemini";
import { sha256Hex } from "../../../../../lib/hash";
import type { AuthedData } from "../../../../_middleware";

/**
 * Translates one chunk. A chunk failing never fails the article: on error this
 * route marks only that chunk 'failed' and returns 502 for the UI to surface and retry.
 */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (context) => {
  const articleId = context.params.id as string;
  const ord = Number(context.params.ord);
  if (!Number.isInteger(ord)) {
    return Response.json({ error: "Invalid chunk ordinal" }, { status: 400 });
  }

  const chunk = await getChunk(db(context.env), articleId, ord);
  if (!chunk) return Response.json({ error: "Chunk not found" }, { status: 404 });

  const currentHash = await sha256Hex(chunk.english_text);
  if (chunk.amharic_text && chunk.english_hash === currentHash) {
    return Response.json({ chunk, skipped: true });
  }

  const promptEntry = await getCurrentPrompt(db(context.env), "translate");
  if (!promptEntry) {
    return Response.json({ error: "No 'translate' prompt configured" }, { status: 500 });
  }

  try {
    const amharicText = await generateText(context.env, promptEntry.version.body, chunk.english_text);
    await setChunkTranslation(db(context.env), chunk.id, amharicText, currentHash);
    return Response.json({
      chunk: { ...chunk, amharic_text: amharicText, status: "translated", english_hash: currentHash },
      skipped: false,
    });
  } catch (err) {
    await setChunkStatus(db(context.env), chunk.id, "failed");
    return Response.json(
      { error: err instanceof Error ? err.message : "Translation failed", chunkId: chunk.id },
      { status: 502 },
    );
  }
};
