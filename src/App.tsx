import { useEffect, useState } from "react";
import Icon from "./Icon";
import PasteForm from "./PasteForm";
import { Toasts } from "./toast";
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
    <div className="app">
      <aside className="rail">
        <div className="brand">
          <div className="brand-mark">አ</div>
          <div>
            <div className="brand-name">Translation Engine</div>
            <div className="brand-sub">EN → አማርኛ · self-improving QA</div>
          </div>
        </div>

        <button className="btn btn-primary" style={{ width: "100%" }} onClick={handleBack}>
          <Icon name="plus" />
          New article
        </button>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            <span className="crumb-link" onClick={handleBack}>
              Articles
            </span>
            <span className="sep">/</span>
            <b>{articleId ? "Workspace" : "New article"}</b>
          </div>
        </header>
        <div className="scroll">
          {articleId ? (
            <Workspace articleId={articleId} onBack={handleBack} />
          ) : (
            <PasteForm onCreated={handleCreated} />
          )}
        </div>
      </div>

      <Toasts />
    </div>
  );
}
