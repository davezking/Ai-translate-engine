import { useState } from "react";
import { createArticle } from "./api";

export default function PasteForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleStart() {
    if (!text.trim()) {
      setError("Paste some English text before starting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { id } = await createArticle(text);
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create article");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <p>Paste an English article to translate into Amharic.</p>
      <textarea
        rows={16}
        style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit" }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste English article text here…"
      />
      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}
      <button onClick={handleStart} disabled={submitting}>
        {submitting ? "Starting…" : "Start"}
      </button>
    </section>
  );
}
