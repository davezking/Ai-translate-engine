import type { Env } from "../lib/env";
import { db } from "../lib/env";
import { getUserByEmail } from "../lib/db/users";
import { resolveAccessEmail } from "../lib/auth";
import type { UserRow } from "../lib/db/types";

export interface AuthedData extends Record<string, unknown> {
  user: UserRow;
}

/**
 * Applies to every route under /api/*: reads the Cloudflare Access identity,
 * rejects requests without a valid one, looks the email up in D1, and attaches
 * { email, role } to the request context. Role comes from D1, never from a
 * hardcoded email list. Admin-only routes additionally call requireAdmin.
 */
export const onRequest: PagesFunction<Env, string, AuthedData> = async (context) => {
  const email = await resolveAccessEmail(context.request, context.env);
  if (!email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserByEmail(db(context.env), email);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  context.data.user = user;
  return context.next();
};
