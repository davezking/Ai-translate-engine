import { useEffect, useState } from "react";
import PasteForm from "./PasteForm";
import Workspace from "./Workspace";

function getArticleIdFromHash(): string | null {
  const match = window.location.hash.match(/^#\/articles\/([^/]+)/);
  return match ? match[1] : null;
}

export default function App() {
  const [articleId, setArticleId] = useState<string | null>(() => getArticleIdFromHash());

  useEffect(() => {
    const onHashChange = () => setArticleId(getArticleIdFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function handleCreated(id: string) {
    window.location.hash = `#/articles/${id}`;
    setArticleId(id);
  }

  function handleBack() {
    window.location.hash = "";
    setArticleId(null);
  }

  return (
    <main>
      <h1>AI Translate Engine</h1>
      <p>English in, publication-ready Amharic out.</p>
      {articleId ? (
        <Workspace articleId={articleId} onBack={handleBack} />
      ) : (
        <PasteForm onCreated={handleCreated} />
      )}
    </main>
  );
}
