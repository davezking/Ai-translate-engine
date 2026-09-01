import type { Env } from "../lib/env";
import { db } from "../lib/env";
import { requireAdmin } from "../lib/requireAdmin";
import { enforceMaxLength, MAX_ARTICLE_CHARS } from "../lib/limits";
import { createSeedArticle } from "../lib/db/articles";
import { countCorrections } from "../lib/db/corrections";
import { runCompareAndCapture } from "../lib/correctionCapture";
import type { AuthedData } from "./_middleware";

/**
 * Admin-only seed intake for the 50+ bootstrap (English, AI-translation,
 * human-final) triples (Requirement 9). Each triple creates a lightweight
 * article row (tagged source = 'seed') purely to hold the corrections FK,
 * then runs the exact same compare -> capture pipeline as a live finalize
 * (lib/correctionCapture.ts) — no forked logic.
 */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (context) => {
  const forbidden = requireAdmin(context.data.user);
  if (forbidden) return forbidden;

  const body = (await context.request.json().catch(() => null)) as {
    englishSource?: unknown;
    aiTranslation?: unknown;
    humanFinal?: unknown;
  } | null;

  const englishSource = typeof body?.englishSource === "string" ? body.englishSource.trim() : "";
  const aiTranslation = typeof body?.aiTranslation === "string" ? body.aiTranslation.trim() : "";
  const humanFinal = typeof body?.humanFinal === "string" ? body.humanFinal.trim() : "";

  if (!englishSource || !aiTranslation || !humanFinal) {
    return Response.json(
      { error: "englishSource, aiTranslation, and humanFinal are all required" },
      { status: 400 },
    );
  }
  for (const [field, value] of [
    ["englishSource", englishSource],
    ["aiTranslation", aiTranslation],
    ["humanFinal", humanFinal],
  ] as const) {
    const tooLong = enforceMaxLength(field, value, MAX_ARTICLE_CHARS);
    if (tooLong) return tooLong;
  }

  const d1 = db(context.env);
  const articleId = crypto.randomUUID();
  const now = Date.now();
  await createSeedArticle(d1, {
    id: articleId,
    sourceEnglish: englishSource,
    amharicDraft: aiTranslation,
    amharicFinal: humanFinal,
    now,
  });

  const outcome = await runCompareAndCapture(context.env, articleId, {
    englishContext: englishSource,
    machineAmharic: aiTranslation,
    humanFinalAmharic: humanFinal,
  });

  if (outcome.status === "pending") {
    const message =
      outcome.error instanceof Error ? outcome.error.message : "Compare/capture failed";
    // The article row was still created; capture is retryable via correction_status.
    return Response.json({ articleId, status: "pending", error: message }, { status: 502 });
  }

  return Response.json(
    { articleId, status: outcome.status, fixCount: outcome.fixCount },
    { status: 201 },
  );
};

/** Running count of stored corrections, for the seed-intake batch UI. */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (context) => {
  const forbidden = requireAdmin(context.data.user);
  if (forbidden) return forbidden;

  const count = await countCorrections(db(context.env));
  return Response.json({ count });
};
