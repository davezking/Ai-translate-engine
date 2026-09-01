/**
 * Upper bounds on free text entering the system.
 *
 * Two reasons these exist. D1 has its own limits on how large a bound value
 * can be, and hitting them surfaces as an opaque driver error rather than a
 * useful 4xx. And article text is fanned out to Gemini per chunk, so an
 * oversized paste turns into a proportional bill against a free-tier budget
 * the design is explicit about respecting.
 *
 * The values are deliberately far above any real editorial input — a long
 * feature article runs to tens of thousands of characters, not hundreds of
 * thousands — so they bound the pathological case without ever being reached
 * in normal use. Raise them here if a real document is ever refused.
 */
export const MAX_ARTICLE_CHARS = 500_000;
export const MAX_PROMPT_BODY_CHARS = 20_000;
export const MAX_STYLE_SAMPLE_CHARS = 200_000;
export const MAX_STYLE_SAMPLES = 20;
export const MAX_TEST_TEXT_CHARS = 20_000;

/**
 * Returns a 413 Response if `value` is over `max`, else null — same
 * caller shape as requireAdmin, so a route guards with one line.
 */
export function enforceMaxLength(field: string, value: string, max: number): Response | null {
  if (value.length <= max) return null;
  return Response.json(
    { error: `${field} is too long: ${value.length} characters, limit ${max}` },
    { status: 413 },
  );
}
