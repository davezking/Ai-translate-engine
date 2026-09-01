import type { Env } from "../../functions/lib/env";
import type { AuthedData } from "../../functions/api/_middleware";
import type { UserRow } from "../../functions/lib/db/types";

export const ADMIN: UserRow = { id: "usr_admin", email: "admin@example.com", role: "admin" };
export const REVIEWER: UserRow = {
  id: "usr_reviewer",
  email: "reviewer@example.com",
  role: "reviewer",
};

type Handler = PagesFunction<Env, string, AuthedData>;
type HandlerContext = Parameters<Handler>[0];

export interface CallOptions {
  env: Env;
  user?: UserRow;
  params?: Record<string, string>;
  body?: unknown;
  method?: string;
}

/**
 * Invokes a Pages Function handler directly with the context the shared
 * /api/* middleware would have built: the resolved user on context.data, the
 * route params, and the request. Anything the middleware rejects (no Access
 * identity, no users row) never reaches a handler, so these tests start from
 * an authenticated user and cover what the handler itself decides.
 */
export function call(handler: Handler, opts: CallOptions): Promise<Response> {
  const method = opts.method ?? (opts.body === undefined ? "GET" : "POST");
  const request = new Request("https://test.local/api", {
    method,
    ...(opts.body === undefined
      ? {}
      : { body: JSON.stringify(opts.body), headers: { "content-type": "application/json" } }),
  });

  const context = {
    request,
    env: opts.env,
    params: opts.params ?? {},
    data: { user: opts.user ?? ADMIN },
    next: async () => new Response(null, { status: 404 }),
    waitUntil: () => {},
    passThroughOnException: () => {},
    functionPath: "/api",
  } as unknown as HandlerContext;

  return Promise.resolve(handler(context)) as Promise<Response>;
}

/** Sends a raw (unparseable) body, for malformed-payload tests. */
export function callRaw(
  handler: Handler,
  opts: CallOptions & { rawBody: string },
): Promise<Response> {
  const request = new Request("https://test.local/api", {
    method: opts.method ?? "POST",
    body: opts.rawBody,
    headers: { "content-type": "application/json" },
  });

  const context = {
    request,
    env: opts.env,
    params: opts.params ?? {},
    data: { user: opts.user ?? ADMIN },
    next: async () => new Response(null, { status: 404 }),
    waitUntil: () => {},
    passThroughOnException: () => {},
    functionPath: "/api",
  } as unknown as HandlerContext;

  return Promise.resolve(handler(context)) as Promise<Response>;
}
