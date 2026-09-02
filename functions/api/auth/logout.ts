import type { Env } from "../../lib/env";
import { clearSessionCookieHeader } from "../../lib/session";

/** Public (excluded from the /api/* auth middleware): clears the session cookie. */
export const onRequestPost: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": clearSessionCookieHeader() },
  });
};
