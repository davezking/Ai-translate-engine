import type { Env } from "../../lib/env";
import { db } from "../../lib/env";
import { getUserCredentialsByEmail } from "../../lib/db/users";
import { verifyPassword, createSessionToken, sessionCookieHeader } from "../../lib/session";

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

// A syntactically-valid pbkdf2 hash with no matching password, so a lookup
// miss still runs verifyPassword's full derivation — keeps a nonexistent
// email from returning measurably faster than a wrong password would.
const DUMMY_HASH =
  "pbkdf2:100000:AAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/** Public (excluded from the /api/* auth middleware): exchanges email+password for a session cookie. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!context.env.SESSION_SECRET) {
    // TEMP DIAGNOSTIC — remove after resolving the missing-secret issue.
    // Lists only env key NAMES (never values) actually visible to this
    // Function at request time, to compare against the dashboard's claim.
    return Response.json(
      { error: "Password login is not configured", debugEnvKeys: Object.keys(context.env).sort() },
      { status: 501 },
    );
  }

  let body: LoginBody;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return Response.json({ error: "Email and password are required" }, { status: 400 });
  }

  const user = await getUserCredentialsByEmail(db(context.env), email);
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !user.password_hash || !ok) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await createSessionToken(user.email, context.env.SESSION_SECRET);
  return new Response(JSON.stringify({ email: user.email, role: user.role }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "Set-Cookie": sessionCookieHeader(token),
    },
  });
};
