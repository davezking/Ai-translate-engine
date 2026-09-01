export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function paragraphsOf(text: string): string[] {
  return text.split(/\n\s*\n/).filter((p) => p.trim() !== "");
}
