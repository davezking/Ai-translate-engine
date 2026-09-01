import type { Env } from "../../../lib/env";
import { db } from "../../../lib/env";
import { requireAdmin } from "../../../lib/requireAdmin";
import { getStyleProfile } from "../../../lib/db/styleProfiles";
import { getCurrentPrompt } from "../../../lib/db/prompts";
import { runQaPass } from "../../../lib/qa";
import type { AuthedData } from "../../_middleware";

/**
 * Admin sandbox for the "validate one profile early" mitigation (§7): runs the
 * live `qa` prompt over a short admin-pasted test text twice — once without the
 * profile's guidelines, once with — so the admin can judge the tone shift
 * before approving. No lessons are retrieved and nothing is persisted; this is
 * a side check, not part of the live article pipeline.
 */
export const onRequestPost: PagesFunction<Env, string, AuthedData> = async (context) => {
  const forbidden = requireAdmin(context.data.user);
  if (forbidden) return forbidden;

  const id = context.params.id as string;
  const d1 = db(context.env);
  const profile = await getStyleProfile(d1, id);
  if (!profile) return Response.json({ error: "Style profile not found" }, { status: 404 });

  const body = (await context.request.json().catch(() => null)) as { testText?: unknown } | null;
  const testText = typeof body?.testText === "string" ? body.testText.trim() : "";
  if (!testText) {
    return Response.json({ error: "testText is required" }, { status: 400 });
  }

  const promptEntry = await getCurrentPrompt(d1, "qa");
  if (!promptEntry) {
    return Response.json({ error: "No 'qa' prompt configured" }, { status: 502 });
  }

  try {
    const [withoutStyle, withStyle] = await Promise.all([
      runQaPass(context.env, {
        qaPromptBody: promptEntry.version.body,
        englishContext: "",
        machineAmharic: testText,
        lessons: [],
        styleGuidelines: null,
      }),
      runQaPass(context.env, {
        qaPromptBody: promptEntry.version.body,
        englishContext: "",
        machineAmharic: testText,
        lessons: [],
        styleGuidelines: profile.derived_guidelines,
      }),
    ]);
    return Response.json({ withoutStyle, withStyle });
  } catch (err) {
    const message = err instanceof Error ? err.message : "QA test run failed";
    return Response.json({ error: message }, { status: 502 });
  }
};
