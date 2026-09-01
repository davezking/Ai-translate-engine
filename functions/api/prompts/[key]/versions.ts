import type { Env } from "../../../lib/env";
import { db } from "../../../lib/env";
import { requireAdmin } from "../../../lib/requireAdmin";
import { isPromptKey } from "../../../lib/promptKey";
import { getCurrentPrompt, listPromptVersions } from "../../../lib/db/prompts";
import type { AuthedData } from "../../_middleware";

/**
 * Admin-only version history for one prompt (Requirement 17), newest-first
 * with the publishing author and timestamp. Read-only: nothing here mutates
 * or deletes a version — publishing appends, rollback only repoints.
 */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (context) => {
  const forbidden = requireAdmin(context.data.user);
  if (forbidden) return forbidden;

  const key = context.params.key;
  if (!isPromptKey(key)) return Response.json({ error: "Unknown prompt key" }, { status: 404 });

  const d1 = db(context.env);
  const [versions, current] = await Promise.all([
    listPromptVersions(d1, key),
    getCurrentPrompt(d1, key),
  ]);

  return Response.json({
    key,
    currentVersionId: current?.version.id ?? null,
    versions: versions.map((v) => ({
      id: v.id,
      version: v.version,
      body: v.body,
      author: v.author_email ?? v.author,
      createdAt: v.created_at,
    })),
  });
};
