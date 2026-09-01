import { useEffect, useState } from "react";
import Icon from "./Icon";
import { toast } from "./toast";
import {
  approveStyleProfile,
  createStyleProfile,
  listStyleProfiles,
  testStyleProfile,
  type StyleProfileDTO,
} from "./api";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function StylesAdmin() {
  const [profiles, setProfiles] = useState<StyleProfileDTO[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [writerName, setWriterName] = useState("");
  const [samples, setSamples] = useState<string[]>([""]);
  const [creating, setCreating] = useState(false);

  const [testText, setTestText] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ withoutStyle: string; withStyle: string } | null>(
    null,
  );
  const [approving, setApproving] = useState(false);

  function refresh() {
    listStyleProfiles()
      .then((r) => setProfiles(r.profiles))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(refresh, []);

  const selected = profiles?.find((p) => p.id === selectedId) ?? null;

  function selectProfile(id: string) {
    setSelectedId(id);
    setShowCreate(false);
    setTestText("");
    setTestResult(null);
  }

  async function handleCreate() {
    const name = writerName.trim();
    const nonEmptySamples = samples.map((s) => s.trim()).filter(Boolean);
    if (!name || nonEmptySamples.length === 0) {
      setError("Writer name and at least one sample article are required.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const profile = await createStyleProfile(name, nonEmptySamples);
      toast(`Style profile derived for "${name}".`);
      setWriterName("");
      setSamples([""]);
      setShowCreate(false);
      refresh();
      setSelectedId(profile.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to derive style profile", "err");
    } finally {
      setCreating(false);
    }
  }

  async function handleApprove() {
    if (!selected) return;
    setApproving(true);
    try {
      await approveStyleProfile(selected.id);
      toast(`"${selected.writerName}" approved for use.`);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to approve profile", "err");
    } finally {
      setApproving(false);
    }
  }

  async function handleTest() {
    if (!selected || !testText.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testStyleProfile(selected.id, testText.trim());
      setTestResult(result);
    } catch (err) {
      toast(err instanceof Error ? err.message : "QA test run failed", "err");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Writer style profiles <span className="admin-note">admin only</span>
          </h1>
          <p className="page-sub">
            Derive reusable tone/voice guidelines from sample articles, validate the tone shift on a
            test text, then approve for use in QA.
          </p>
        </div>
        <span className="spacer" />
        <button
          className="btn btn-primary"
          onClick={() => {
            setShowCreate((v) => !v);
            setSelectedId(null);
          }}
        >
          <Icon name="plus" />
          New profile
        </button>
      </div>

      {error && (
        <p role="alert" className="banner banner-danger">
          <Icon name="warn" />
          <span>{error}</span>
        </p>
      )}

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-head">
            <h3>
              <Icon name="voice" /> Profiles
            </h3>
          </div>
          {profiles === null ? (
            <p className="hint" style={{ padding: 12 }}>
              Loading…
            </p>
          ) : profiles.length === 0 ? (
            <p className="hint" style={{ padding: 12 }}>
              No style profiles yet. Create one from a writer's sample articles.
            </p>
          ) : (
            <div className="stack-sm" style={{ padding: 10 }}>
              {profiles.map((p) => (
                <div
                  key={p.id}
                  className="row small"
                  style={{
                    cursor: "pointer",
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: p.id === selectedId ? "var(--surface-2)" : "transparent",
                  }}
                  onClick={() => selectProfile(p.id)}
                >
                  <span>{p.writerName}</span>
                  <span className="spacer" />
                  <span className="hint">{formatDate(p.createdAt)}</span>
                  <span className={`pill ${p.approved ? "pill-ok" : "pill-warn"}`}>
                    {p.approved ? "approved" : "pending review"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {showCreate ? (
          <div className="card card-pad stack-lg">
            <div className="field">
              <label className="label" htmlFor="style-writer">
                Writer name
              </label>
              <input
                id="style-writer"
                className="input"
                value={writerName}
                onChange={(e) => setWriterName(e.target.value)}
                placeholder="e.g. Almaz T."
              />
            </div>

            {samples.map((sample, i) => (
              <div className="field" key={i}>
                <div className="row">
                  <label className="label" htmlFor={`style-sample-${i}`}>
                    Sample article {i + 1}
                  </label>
                  <span className="spacer" />
                  {samples.length > 1 && (
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => setSamples((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Icon name="x" /> Remove
                    </button>
                  )}
                </div>
                <textarea
                  id={`style-sample-${i}`}
                  className="textarea"
                  value={sample}
                  onChange={(e) =>
                    setSamples((prev) => prev.map((s, idx) => (idx === i ? e.target.value : s)))
                  }
                  placeholder="Paste a sample article written by this writer…"
                />
              </div>
            ))}

            <button
              className="btn btn-sm"
              style={{ alignSelf: "flex-start" }}
              onClick={() => setSamples((prev) => [...prev, ""])}
            >
              <Icon name="plus" /> Add another sample
            </button>

            <div className="row">
              <span className="hint">
                Gemini extracts concrete tone/voice guidelines from these.
              </span>
              <span className="spacer" />
              <button className="btn btn-lg btn-primary" onClick={handleCreate} disabled={creating}>
                {creating ? (
                  <>
                    <span className="spin" /> Deriving…
                  </>
                ) : (
                  <>
                    <Icon name="check" /> Derive profile
                  </>
                )}
              </button>
            </div>
          </div>
        ) : selected ? (
          <div className="card card-pad stack-lg">
            <div className="row">
              <h3 style={{ fontSize: 15, fontWeight: 640 }}>{selected.writerName}</h3>
              <span className="spacer" />
              <span className={`pill ${selected.approved ? "pill-ok" : "pill-warn"}`}>
                {selected.approved ? "approved" : "pending review"}
              </span>
            </div>

            <div className="field">
              <span className="label">Derived guidelines</span>
              <p className="hint" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {selected.derivedGuidelines || "(none)"}
              </p>
            </div>

            <div className="field">
              <label className="label" htmlFor="style-test">
                Test text (short passage of typical machine Amharic output)
              </label>
              <textarea
                id="style-test"
                className="textarea"
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                placeholder="Paste a short machine-translated passage to compare QA with vs. without this profile…"
              />
            </div>

            <div className="row">
              <span className="hint">Runs the live QA prompt twice — no article is touched.</span>
              <span className="spacer" />
              <button className="btn" onClick={handleTest} disabled={testing || !testText.trim()}>
                {testing ? (
                  <>
                    <span className="spin" /> Running…
                  </>
                ) : (
                  <>
                    <Icon name="play" /> Run comparison
                  </>
                )}
              </button>
              {!selected.approved && (
                <button className="btn btn-primary" onClick={handleApprove} disabled={approving}>
                  {approving ? (
                    <>
                      <span className="spin" /> Approving…
                    </>
                  ) : (
                    <>
                      <Icon name="check" /> Approve for use
                    </>
                  )}
                </button>
              )}
            </div>

            {testResult && (
              <div className="grid grid-2">
                <div className="field">
                  <span className="label">Without style</span>
                  <p className="hint" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                    {testResult.withoutStyle}
                  </p>
                </div>
                <div className="field">
                  <span className="label">With "{selected.writerName}" style</span>
                  <p className="hint" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                    {testResult.withStyle}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="card empty">
            <Icon name="voice" />
            <h3>Select a profile</h3>
            <p>Pick a profile from the list, or create a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
}
