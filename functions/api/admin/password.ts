import type { Env } from "../../lib/env";
import { db } from "../../lib/env";
import { getUserByEmail, setPasswordHash } from "../../lib/db/users";
import { hashPassword } from "../../lib/session";
import { requireAdmin } from "../../lib/requireAdmin";
import type { AuthedData } from "../_middleware";

interface SetPasswordBody {
  email?: unknown;
  password?: unknown;
}

/** Admin-only: sets or changes the password-login password for any known user (bootstrap covers the very first one — see scripts/hash-password.mjs). */
export const onRequestPut: PagesFunction<Env, string, AuthedData> = async (context) => {
  const forbidden = requireAdmin(context.data.user);
  if (forbidden) return forbidden;

  let body: SetPasswordBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || password.length < 8) {
    return Response.json(
      { error: "email and a password of at least 8 characters are required" },
      { status: 400 },
    );
  }

  const d1 = db(context.env);
  const target = await getUserByEmail(d1, email);
  if (!target) {
    return Response.json({ error: "No such user" }, { status: 404 });
  }

  await setPasswordHash(d1, email, await hashPassword(password));
  return Response.json({ email, ok: true });
};
