import { describe, expect, it } from "vitest";
import { enforceChunkGuards, naiveSplit, wordCount } from "../../functions/lib/split";

/** Builds a paragraph of `words` words ending on a sentence boundary. */
function paragraph(words: number, marker = "word"): string {
  return `${new Array(words - 1).fill(marker).join(" ")} end.`;
}

function article(paragraphs: number, wordsEach: number): string {
  return new Array(paragraphs)
    .fill(null)
    .map((_, i) => paragraph(wordsEach, `p${i}`))
    .join("\n\n");
}

describe("wordCount", () => {
  it("counts whitespace-separated words", () => {
    expect(wordCount("one two three")).toBe(3);
  });

  it("treats empty and whitespace-only text as zero", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("   \n\t ")).toBe(0);
  });

  it("collapses runs of whitespace rather than counting them", () => {
    expect(wordCount("one   two\n\nthree")).toBe(3);
  });
});

describe("naiveSplit", () => {
  it("returns nothing for empty input", () => {
    expect(naiveSplit("")).toEqual([]);
  });

  it("keeps a short article whole", () => {
    const short = article(2, 100);
    expect(naiveSplit(short)).toHaveLength(1);
  });

  it("splits a long article and preserves every word in order", () => {
    const long = article(20, 200);
    const chunks = naiveSplit(long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ").split(/\s+/)).toEqual(long.split(/\s+/));
  });

  it("never cuts mid-paragraph", () => {
    const long = article(20, 200);
    for (const chunk of naiveSplit(long)) {
      expect(chunk.trimEnd().endsWith("end.")).toBe(true);
    }
  });
});

describe("enforceChunkGuards", () => {
  it("ignores the proposal entirely for a short article", () => {
    const short = article(2, 100);
    // A deliberately nonsensical proposal must not survive.
    expect(enforceChunkGuards(["garbage"], short)).toEqual(naiveSplit(short));
  });

  it("falls back to naiveSplit when the proposal drops content", () => {
    const long = article(20, 200);
    const lossy = naiveSplit(long).slice(0, 2);
    expect(enforceChunkGuards(lossy, long)).toEqual(naiveSplit(long));
  });

  it("falls back to naiveSplit when the proposal alters content", () => {
    const long = article(20, 200);
    const tampered = naiveSplit(long).map((c, i) => (i === 0 ? `${c} EXTRA` : c));
    expect(enforceChunkGuards(tampered, long)).toEqual(naiveSplit(long));
  });

  it("falls back to naiveSplit when the proposal is empty", () => {
    const long = article(20, 200);
    expect(enforceChunkGuards([], long)).toEqual(naiveSplit(long));
    expect(enforceChunkGuards(["", "   "], long)).toEqual(naiveSplit(long));
  });

  it("accepts a faithful proposal unchanged", () => {
    const long = article(20, 200);
    const proposal = naiveSplit(long);
    expect(enforceChunkGuards(proposal, long)).toEqual(proposal);
  });

  it("merges a chunk that does not end on a sentence boundary into the next one", () => {
    const long = article(20, 200);
    const proposal = naiveSplit(long);
    // Move the first chunk's final word into the next chunk, so chunk 1 no
    // longer ends on sentence punctuation. Every word is preserved in order,
    // so the reconstruction check still passes and the sentence-boundary guard
    // is what has to react.
    const words = proposal[0].split(/\s+/);
    const moved = words.pop() as string;
    const tampered = [words.join(" "), `${moved} ${proposal[1]}`, ...proposal.slice(2)];
    const guarded = enforceChunkGuards(tampered, long);

    expect(guarded.length).toBe(proposal.length - 1);
    expect(guarded[0]).toContain(proposal[1].slice(0, 20));
  });

  it("folds an undersized trailing fragment into its predecessor", () => {
    const long = article(20, 200);
    const proposal = naiveSplit(long);
    const last = proposal[proposal.length - 1];
    const words = last.split(" ");
    // Split the tail into a large part and a <150-word remainder.
    const head = words.slice(0, words.length - 20).join(" ");
    const tail = words.slice(words.length - 20).join(" ");
    const tampered = [...proposal.slice(0, -1), head, tail];

    const guarded = enforceChunkGuards(tampered, long);
    expect(guarded).toHaveLength(proposal.length);
    expect(guarded[guarded.length - 1].endsWith(tail)).toBe(true);
  });
});
