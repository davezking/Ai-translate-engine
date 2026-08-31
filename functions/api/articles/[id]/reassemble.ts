import type { Env } from "../../../lib/env";
import { db } from "../../../lib/env";
import { setArticleDraft } from "../../../lib/db/articles";
import { listChunksByArticle } from "../../../lib/db/chunks";
import type { AuthedData } from "../../_middleware";

/** Concatenates translated chunks in order into articles.amharic_draft; refuses if any chunk is unfinished. */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (context) => {
  const articleId = context.params.id as string;
  const chunks = await listChunksByArticle(db(context.env), articleId);

  if (chunks.length === 0) {
    return Response.json({ error: "No chunks to reassemble; run split first" }, { status: 400 });
  }

  const unfinished = chunks.filter((c) => c.status !== "translated" || !c.amharic_text);
  if (unfinished.length > 0) {
    return Response.json(
      {
        error: "Cannot reassemble: some chunks are not translated yet",
        pendingOrds: unfinished.map((c) => c.ord),
      },
      { status: 400 },
    );
  }

  const draft = chunks.map((c) => c.amharic_text as string).join("\n\n");
  await setArticleDraft(db(context.env), articleId, draft, Date.now());

  return Response.json({ amharicDraft: draft });
};
