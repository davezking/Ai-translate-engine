import type { Env } from "../lib/env";
import { bindingStatus } from "../lib/env";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return Response.json({ ok: true, bindings: bindingStatus(env) });
};
