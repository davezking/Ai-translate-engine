import type { Env } from "../../../lib/env";
import { db } from "../../../lib/env";
import { getArticle, updateArticleStatus } from "../../../lib/db/articles";
import { replaceChunks } from "../../../lib/db/chunks";
import { getCurrentPrompt } from "../../../lib/db/prompts";
import { generateText } from "../../../lib/gemini";
import { enforceChunkGuards, wordCount } from "../../../lib/split";
import type { AuthedData } from "../../_middleware";

const OUTPUT_FORMAT_INSTRUCTION =
  "\n\nRespond with ONLY a JSON array of strings (no surrounding prose). Each string is one " +
  "chunk's exact text, in original order; concatenating all strings with a single space must " +
  "reproduce the source text.";

export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (context) => {
  const articleId = context.params.id as string;
  const article = await getArticle(db(context.env), articleId);
  if (!article) return Response.json({ error: "Article not found" }, { status: 404 });

  const promptEntry = await getCurrentPrompt(db(context.env), "split");
  if (!promptEntry) {
    return Response.json({ error: "No 'split' prompt configured" }, { status: 500 });
  }

  let proposed: string[] = [];
  try {
    const raw = await generateText(
      context.env,
      promptEntry.version.body + OUTPUT_FORMAT_INSTRUCTION,
      article.source_english,
      { responseMimeType: "application/json" },
    );
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      proposed = parsed.filter((x): x is string => typeof x === "string");
    }
  } catch {
    proposed = [];
  }

  const finalChunks = enforceChunkGuards(proposed, article.source_english);

  await replaceChunks(
    db(context.env),
    articleId,
    finalChunks.map((text, i) => ({ id: crypto.randomUUID(), ord: i, englishText: text })),
  );
  await updateArticleStatus(db(context.env), articleId, "split", Date.now());

  return Response.json({
    chunks: finalChunks.map((text, i) => ({ ord: i, englishText: text, wordCount: wordCount(text) })),
  });
};
