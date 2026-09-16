import { useEffect, useState } from "react";
import Icon from "./Icon";
import { listArticles, type FinalizedArticleDTO } from "./api";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * History view: finalized articles, newest first, each a link back into its
 * workspace (#/articles/:id) — the way to reopen a translated article once
 * its URL is no longer at hand.
 */
export default function HistoryView({ onOpen }: { onOpen: (id: string) => void }) {
  const [articles, setArticles] = useState<FinalizedArticleDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listArticles()
      .then((r) => {
        if (!cancelled) setArticles(r.articles);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="page">
        <p role="alert" className="banner banner-danger">
          <Icon name="warn" />
          <span>{error}</span>
        </p>
      </div>
    );
  }

  if (articles === null) {
    return <div className="page center dim">Loading…</div>;
  }

  return (
    <div className="page" style={{ maxWidth: 920 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">History</h1>
          <p className="page-sub">
            Finalized articles, most recently finalized first. Open one to review its translation
            again.
          </p>
        </div>
      </div>

      {articles.length === 0 ? (
        <div className="card empty">
          <Icon name="doc" />
          <h3>No finalized articles yet</h3>
          <p>Once an article is finalized, it appears here.</p>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Article</th>
                <th>Finalized</th>
                <th>Fixes</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id} onClick={() => onOpen(a.id)}>
                  <td>
                    <span className="crumb-link">{a.sourcePreview || a.id.slice(0, 8)}</span>
                  </td>
                  <td>{formatDate(a.finalizedAt)}</td>
                  <td className="num">{a.fixCount ?? "—"}</td>
                  <td>{a.source === "seed" && <span className="pill pill-info">seed</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
