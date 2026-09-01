import type { Env } from "../../../lib/env";
import { db } from "../../../lib/env";
import { requireAdmin } from "../../../lib/requireAdmin";
import { isPromptKey } from "../../../lib/promptKey";
import { enforceMaxLength, MAX_PROMPT_BODY_CHARS } from "../../../lib/limits";
import { getCurrentPrompt, publishPromptVersion } from "../../../lib/db/prompts";
import type { AuthedData } from "../../_middleware";

/**
 * Admin-only prompt engine (Requirements 16 + 18). The split/translate/QA
 * pipelines already read their prompt body from the `prompts` table via
 * getCurrentPrompt, so publishing here changes live AI behaviour on the next
 * run with no redeploy.
 *
 * GET returns the currently active version for the key.
 */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (context) => {
  const forbidden = requireAdmin(context.data.user);
  if (forbidden) return forbidden;

  const key = context.params.key;
  if (!isPromptKey(key)) return Response.json({ error: "Unknown prompt key" }, { status: 404 });

  const entry = await getCurrentPrompt(db(context.env), key);
  if (!entry) {
    return Response.json({ error: "No current version for this prompt" }, { status: 404 });
  }

  return Response.json({
    key,
    currentVersionId: entry.version.id,
    version: entry.version.version,
    body: entry.version.body,
    createdAt: entry.version.created_at,
  });
};

/**
 * Publishes a new version (Requirement 17): inserts an immutable promptVersions
 * row and repoints prompts.current_version_id. Existing version bodies are
 * never updated — see publishPromptVersion.
 */
export const onRequestPut: PagesFunction<Env, string, AuthedData> = async (context) => {
  const forbidden = requireAdmin(context.data.user);
  if (forbidden) return forbidden;

  const key = context.params.key;
  if (!isPromptKey(key)) return Response.json({ error: "Unknown prompt key" }, { status: 404 });

  const payload = (await context.request.json().catch(() => null)) as { body?: unknown } | null;
  const promptBody = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!promptBody) {
    return Response.json({ error: "A non-empty prompt body is required" }, { status: 400 });
  }
  const tooLong = enforceMaxLength("body", promptBody, MAX_PROMPT_BODY_CHARS);
  if (tooLong) return tooLong;

  const d1 = db(context.env);
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await publishPromptVersion(d1, {
      id,
      key,
      body: promptBody,
      author: context.data.user.id,
      now,
    });
  } catch (err) {
    // The UNIQUE (prompt_key, version) constraint is what makes a concurrent
    // publish fail instead of overwriting history; surface it as a retryable
    // conflict rather than an opaque 500. Nothing was written — d1.batch is
    // one transaction.
    console.error(`Publishing ${key} prompt failed:`, err);
    return Response.json(
      { error: "Could not publish: another version was published concurrently. Retry." },
      { status: 409 },
    );
  }

  const entry = await getCurrentPrompt(d1, key);
  return Response.json(
    {
      key,
      currentVersionId: id,
      version: entry?.version.version ?? null,
      body: promptBody,
      createdAt: now,
    },
    { status: 201 },
  );
};
