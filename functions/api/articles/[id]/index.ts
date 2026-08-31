import type { Env } from "../../../lib/env";
import { db } from "../../../lib/env";
import { getArticle } from "../../../lib/db/articles";
import type { AuthedData } from "../../_middleware";

export const onRequestGet: PagesFunction<Env, string, AuthedData> = async (context) => {
  const article = await getArticle(db(context.env), context.params.id as string);
  if (!article) return Response.json({ error: "Article not found" }, { status: 404 });
  return Response.json({ article });
};
