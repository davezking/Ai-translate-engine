import { useEffect, useState } from "react";
import Icon from "./Icon";
import Login from "./Login";
import MetricsView from "./MetricsView";
import PasteForm from "./PasteForm";
import PromptsAdmin from "./PromptsAdmin";
import SeedIntake from "./SeedIntake";
import StylesAdmin from "./StylesAdmin";
import { Toasts } from "./toast";
import Workspace from "./Workspace";
import { checkAuth, logout } from "./api";

function getArticleIdFromHash(): string | null {
  const match = window.location.hash.match(/^#\/articles\/([^/]+)/);
  return match ? match[1] : null;
}

function isSeedRoute(): boolean {
  return window.location.hash === "#/seed";
}

function isMetricsRoute(): boolean {
  return window.location.hash === "#/metrics";
}

function isStylesRoute(): boolean {
  return window.location.hash === "#/styles";
}

function isPromptsRoute(): boolean {
  return window.location.hash === "#/prompts";
}

export default function App() {
  const [articleId, setArticleId] = useState<string | null>(() => getArticleIdFromHash());
  const [onSeedRoute, setOnSeedRoute] = useState(() => isSeedRoute());
  const [onMetricsRoute, setOnMetricsRoute] = useState(() => isMetricsRoute());
  const [onStylesRoute, setOnStylesRoute] = useState(() => isStylesRoute());
  const [onPromptsRoute, setOnPromptsRoute] = useState(() => isPromptsRoute());
  const [isAdmin, setIsAdmin] = useState(false);
  const [authState, setAuthState] = useState<"checking" | "in" | "out">("checking");

  useEffect(() => {
    const onHashChange = () => {
      setArticleId(getArticleIdFromHash());
      setOnSeedRoute(isSeedRoute());
      setOnMetricsRoute(isMetricsRoute());
      setOnStylesRoute(isStylesRoute());
      setOnPromptsRoute(isPromptsRoute());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function refreshAuth() {
    checkAuth()
      .then((status) => {
        setIsAdmin(status.isAdmin);
        setAuthState(status.authenticated ? "in" : "out");
      })
      .catch(() => setAuthState("out"));
  }

  useEffect(refreshAuth, []);

  async function handleLogout() {
    await logout();
    setIsAdmin(false);
    setAuthState("out");
  }

  function handleCreated(id: string) {
    window.location.hash = `#/articles/${id}`;
    setArticleId(id);
  }

  function handleBack() {
    window.location.hash = "";
    setArticleId(null);
    setOnSeedRoute(false);
    setOnMetricsRoute(false);
    setOnStylesRoute(false);
    setOnPromptsRoute(false);
  }

  function handleSeedNav() {
    window.location.hash = "#/seed";
    setOnSeedRoute(true);
  }

  function handleMetricsNav() {
    window.location.hash = "#/metrics";
    setOnMetricsRoute(true);
  }

  function handleStylesNav() {
    window.location.hash = "#/styles";
    setOnStylesRoute(true);
  }

  function handlePromptsNav() {
    window.location.hash = "#/prompts";
    setOnPromptsRoute(true);
  }

  if (authState === "checking") {
    return <div className="app" />;
  }

  if (authState === "out") {
    return <Login onLoggedIn={refreshAuth} />;
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

        <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={handleMetricsNav}>
          <Icon name="trend" />
          Fixes trend
        </button>

        {isAdmin && (
          <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={handleStylesNav}>
            <Icon name="voice" />
            Writer styles
          </button>
        )}

        {isAdmin && (
          <button
            className="btn"
            style={{ width: "100%", marginTop: 8 }}
            onClick={handlePromptsNav}
          >
            <Icon name="tune" />
            Prompt engine
          </button>
        )}

        {isAdmin && (
          <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={handleSeedNav}>
            <Icon name="doc" />
            Seed intake
          </button>
        )}

        <button
          className="btn"
          style={{ width: "100%", marginTop: 8 }}
          onClick={() => void handleLogout()}
        >
          Sign out
        </button>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            <span className="crumb-link" onClick={handleBack}>
              Articles
            </span>
            <span className="sep">/</span>
            <b>
              {onSeedRoute
                ? "Seed intake"
                : onMetricsRoute
                  ? "Fixes trend"
                  : onStylesRoute
                    ? "Writer styles"
                    : onPromptsRoute
                      ? "Prompt engine"
                      : articleId
                        ? "Workspace"
                        : "New article"}
            </b>
          </div>
        </header>
        <div className="scroll">
          {onSeedRoute ? (
            <SeedIntake />
          ) : onMetricsRoute ? (
            <MetricsView />
          ) : onStylesRoute ? (
            <StylesAdmin />
          ) : onPromptsRoute ? (
            <PromptsAdmin />
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
