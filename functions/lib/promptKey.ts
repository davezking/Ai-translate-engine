import type { PromptKey } from "./db/types";

/** The three tunable prompts — mirrors the CHECK constraint on prompts.key (migration 0001). */
export const PROMPT_KEYS = ["split", "translate", "qa"] as const;

export function isPromptKey(value: unknown): value is PromptKey {
  return typeof value === "string" && (PROMPT_KEYS as readonly string[]).includes(value);
}
