import { useEffect, useState } from "react";
import Icon from "./Icon";
import PasteForm from "./PasteForm";
import SeedIntake from "./SeedIntake";
import { Toasts } from "./toast";
import Workspace from "./Workspace";
import { whoami } from "./api";

function getArticleIdFromHash(): string | null {
  const match = window.location.hash.match(/^#\/articles\/([^/]+)/);
  return match ? match[1] : null;
}

function isSeedRoute(): boolean {
  return window.location.hash === "#/seed";
}

export default function App() {
  const [articleId, setArticleId] = useState<string | null>(() => getArticleIdFromHash());
  const [onSeedRoute, setOnSeedRoute] = useState(() => isSeedRoute());
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const onHashChange = () => {
      setArticleId(getArticleIdFromHash());
      setOnSeedRoute(isSeedRoute());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    whoami()
      .then((r) => setIsAdmin(r.user.role === "admin"))
      .catch(() => setIsAdmin(false));
  }, []);

  function handleCreated(id: string) {
    window.location.hash = `#/articles/${id}`;
    setArticleId(id);
  }

  function handleBack() {
    window.location.hash = "";
    setArticleId(null);
    setOnSeedRoute(false);
  }

  function handleSeedNav() {
    window.location.hash = "#/seed";
    setOnSeedRoute(true);
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

        {isAdmin && (
          <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={handleSeedNav}>
            <Icon name="doc" />
            Seed intake
          </button>
        )}
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            <span className="crumb-link" onClick={handleBack}>
              Articles
            </span>
            <span className="sep">/</span>
            <b>{onSeedRoute ? "Seed intake" : articleId ? "Workspace" : "New article"}</b>
          </div>
        </header>
        <div className="scroll">
          {onSeedRoute ? (
            <SeedIntake />
          ) : articleId ? (
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
