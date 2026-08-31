import type { Env } from "../../lib/env";
import { requireAdmin } from "../../lib/requireAdmin";
import type { AuthedData } from "../_middleware";

/**
 * Admin-only diagnostic route: confirms the requireAdmin guard end-to-end.
 * Future admin-gated routes (prompt engine, style management) follow the
 * same pattern: requireAdmin(context.data.user) before doing any work.
 */
export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (context) => {
  const forbidden = requireAdmin(context.data.user);
  if (forbidden) return forbidden;
  return Response.json({ user: context.data.user });
};
