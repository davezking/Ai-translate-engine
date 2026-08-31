const MIN_WORDS = 500;
const TARGET_MAX_WORDS = 800;
const UNDERSIZED_THRESHOLD = 150;

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

const SENTENCE_END_RE = /[.!?"'”’)\]]\s*$/;

function endsAtSentenceBoundary(text: string): boolean {
  return SENTENCE_END_RE.test(text.trimEnd());
}

function normalizeForComparison(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Deterministic paragraph/sentence-packing splitter — the safety net when the AI proposal is missing or unusable. */
export function naiveSplit(sourceText: string): string[] {
  const paragraphs = sourceText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return [];

  if (wordCount(sourceText) <= TARGET_MAX_WORDS) {
    return [paragraphs.join("\n\n")];
  }

  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const para of paragraphs) {
    const paraWords = wordCount(para);
    if (currentWords > 0 && currentWords + paraWords > TARGET_MAX_WORDS) {
      chunks.push(current.join("\n\n"));
      current = [];
      currentWords = 0;
    }
    current.push(para);
    currentWords += paraWords;
    if (currentWords >= MIN_WORDS) {
      chunks.push(current.join("\n\n"));
      current = [];
      currentWords = 0;
    }
  }
  if (current.length > 0) chunks.push(current.join("\n\n"));

  return chunks;
}

/**
 * Validates AI-proposed chunk boundaries against the original text and repairs
 * violations deterministically: falls back to naiveSplit entirely if the proposal
 * doesn't reconstruct the source (content dropped/altered), collapses short
 * articles to a single chunk, merges any chunk that doesn't end on a sentence
 * boundary into the next one, and folds an undersized trailing fragment into
 * its predecessor.
 */
export function enforceChunkGuards(proposedChunks: string[], sourceText: string): string[] {
  if (wordCount(sourceText) <= TARGET_MAX_WORDS) {
    return naiveSplit(sourceText);
  }

  const cleaned = proposedChunks.map((c) => c.trim()).filter(Boolean);
  if (cleaned.length === 0) return naiveSplit(sourceText);

  const reconstructed = normalizeForComparison(cleaned.join(" "));
  const original = normalizeForComparison(sourceText);
  if (reconstructed !== original) {
    return naiveSplit(sourceText);
  }

  const sentenceSafe: string[] = [];
  let carry = "";
  for (let i = 0; i < cleaned.length; i++) {
    const chunk = carry ? `${carry} ${cleaned[i]}` : cleaned[i];
    const isLast = i === cleaned.length - 1;
    if (!isLast && !endsAtSentenceBoundary(chunk)) {
      carry = chunk;
      continue;
    }
    sentenceSafe.push(chunk);
    carry = "";
  }
  if (carry) sentenceSafe.push(carry);

  if (sentenceSafe.length > 1) {
    const last = sentenceSafe[sentenceSafe.length - 1];
    if (wordCount(last) < UNDERSIZED_THRESHOLD) {
      const secondToLast = sentenceSafe[sentenceSafe.length - 2];
      return [...sentenceSafe.slice(0, -2), `${secondToLast} ${last}`];
    }
  }

  return sentenceSafe;
}
