import type { Env } from "../../lib/env";
import { db } from "../../lib/env";
import { listStyleProfiles } from "../../lib/db/styleProfiles";
import type { AuthedData } from "../_middleware";

/**
 * Lightweight, non-admin-gated listing for the operator's style-selection
 * dropdown (Requirements 7 + 15): id + name only for approved profiles — the
 * derived guidelines and sample text stay behind the admin-only
 * GET /api/styles (Hard rule 8, style management).
 */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (context) => {
  const profiles = await listStyleProfiles(db(context.env));
  return Response.json({
    profiles: profiles
      .filter((p) => p.approved === 1)
      .map((p) => ({ id: p.id, writerName: p.writer_name })),
  });
};
