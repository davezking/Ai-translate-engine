import type { Env } from "../../lib/env";
import { db } from "../../lib/env";
import { requireAdmin } from "../../lib/requireAdmin";
import { createStyleProfile, listStyleProfiles } from "../../lib/db/styleProfiles";
import { deriveStyleGuidelines } from "../../lib/style";
import { enforceMaxLength, MAX_STYLE_SAMPLE_CHARS, MAX_STYLE_SAMPLES } from "../../lib/limits";
import type { AuthedData } from "../_middleware";

/**
 * Admin-only writer style profiles (Requirement 14). POST accepts one or more
 * pasted writing samples for a writer, derives reusable tone/voice guidelines
 * via Gemini, and stores the profile unapproved (approved = 0) — the Task 2
 * review screen is what flips it to approved.
 */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (context) => {
  const forbidden = requireAdmin(context.data.user);
  if (forbidden) return forbidden;

  const body = (await context.request.json().catch(() => null)) as {
    writerName?: unknown;
    sampleArticles?: unknown;
  } | null;

  const writerName = typeof body?.writerName === "string" ? body.writerName.trim() : "";
  const rawSamples = Array.isArray(body?.sampleArticles) ? body.sampleArticles : [];
  const sampleArticles = rawSamples
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!writerName || sampleArticles.length === 0) {
    return Response.json(
      { error: "writerName and at least one non-empty sampleArticles entry are required" },
      { status: 400 },
    );
  }
  if (sampleArticles.length > MAX_STYLE_SAMPLES) {
    return Response.json(
      { error: `Too many sample articles: ${sampleArticles.length}, limit ${MAX_STYLE_SAMPLES}` },
      { status: 413 },
    );
  }
  for (const [i, sample] of sampleArticles.entries()) {
    const tooLong = enforceMaxLength(`sampleArticles[${i}]`, sample, MAX_STYLE_SAMPLE_CHARS);
    if (tooLong) return tooLong;
  }

  let derivedGuidelines: string;
  try {
    derivedGuidelines = await deriveStyleGuidelines(context.env, sampleArticles);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Style extraction failed";
    return Response.json({ error: message }, { status: 502 });
  }

  const d1 = db(context.env);
  const id = crypto.randomUUID();
  const now = Date.now();
  await createStyleProfile(d1, {
    id,
    writerName,
    sampleArticles: JSON.stringify(sampleArticles),
    derivedGuidelines,
    now,
  });

  return Response.json(
    { id, writerName, sampleArticles, derivedGuidelines, approved: false, createdAt: now },
    { status: 201 },
  );
};

/** Lists all style profiles (any approval state) for the admin management screen. */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (context) => {
  const forbidden = requireAdmin(context.data.user);
  if (forbidden) return forbidden;

  const profiles = await listStyleProfiles(db(context.env));
  return Response.json({
    profiles: profiles.map((p) => ({
      id: p.id,
      writerName: p.writer_name,
      sampleArticles: JSON.parse(p.sample_articles) as string[],
      derivedGuidelines: p.derived_guidelines,
      approved: p.approved === 1,
      createdAt: p.created_at,
    })),
  });
};
