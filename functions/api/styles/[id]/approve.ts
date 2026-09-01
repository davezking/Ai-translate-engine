import type { Env } from "../../../lib/env";
import { db } from "../../../lib/env";
import { requireAdmin } from "../../../lib/requireAdmin";
import { approveStyleProfile, getStyleProfile } from "../../../lib/db/styleProfiles";
import type { AuthedData } from "../../_middleware";

/** Admin-only: flips a style profile to approved (Requirement 14, Task 2 gate). */
export const onRequestPatch: PagesFunction<Env, string, AuthedData> = async (context) => {
  const forbidden = requireAdmin(context.data.user);
  if (forbidden) return forbidden;

  const id = context.params.id as string;
  const d1 = db(context.env);
  const profile = await getStyleProfile(d1, id);
  if (!profile) return Response.json({ error: "Style profile not found" }, { status: 404 });

  await approveStyleProfile(d1, id);
  return Response.json({ id, approved: true });
};
