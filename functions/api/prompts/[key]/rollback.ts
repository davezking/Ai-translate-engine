import type { Env } from "../../../lib/env";
import { db } from "../../../lib/env";
import { requireAdmin } from "../../../lib/requireAdmin";
import { isPromptKey } from "../../../lib/promptKey";
import { getPromptVersion, rollbackPrompt } from "../../../lib/db/prompts";
import type { AuthedData } from "../../_middleware";

/**
 * Admin-only rollback (Requirement 17 / architecture §4): repoints
 * prompts.current_version_id at an older promptVersions row. Nothing is
 * deleted — newer versions stay in history and rolling forward is the same
 * call with a newer version id. The pipeline picks the target up on its next
 * run, since split/translate/QA read the current version per run.
 */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (context) => {
  const forbidden = requireAdmin(context.data.user);
  if (forbidden) return forbidden;

  const key = context.params.key;
  if (!isPromptKey(key)) return Response.json({ error: "Unknown prompt key" }, { status: 404 });

  const payload = (await context.request.json().catch(() => null)) as {
    versionId?: unknown;
  } | null;
  const versionId = typeof payload?.versionId === "string" ? payload.versionId.trim() : "";
  if (!versionId) {
    return Response.json({ error: "versionId is required" }, { status: 400 });
  }

  const d1 = db(context.env);
  const target = await getPromptVersion(d1, versionId);
  if (!target) return Response.json({ error: "Version not found" }, { status: 404 });
  // A version id from another prompt would silently point e.g. the QA prompt
  // at translate text, so cross-key targets are rejected, not coerced.
  if (target.prompt_key !== key) {
    return Response.json(
      { error: `Version belongs to the '${target.prompt_key}' prompt, not '${key}'` },
      { status: 400 },
    );
  }

  await rollbackPrompt(d1, key, versionId);
  return Response.json({
    key,
    currentVersionId: target.id,
    version: target.version,
    body: target.body,
    createdAt: target.created_at,
  });
};
