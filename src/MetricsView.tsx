import { Fragment, useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import { getArticleCorrections, getFixMetrics, type CorrectionDTO, type FixMetricPoint } from "./api";

const CHART_W = 720;
const CHART_H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 32 };

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Simple least-squares trendline over (index, fixCount) — shows direction, not a forecast. */
function linearTrend(values: number[]): { start: number; end: number } | null {
  const n = values.length;
  if (n < 2) return null;
  const xs = values.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((sum, x, i) => sum + (x - meanX) * (values[i] - meanY), 0);
  const den = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  if (den === 0) return { start: meanY, end: meanY };
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  return { start: intercept, end: slope * (n - 1) + intercept };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export default function MetricsView() {
  const [points, setPoints] = useState<FixMetricPoint[] | null>(null);
  const [baselineEndsAt, setBaselineEndsAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [correctionsByArticle, setCorrectionsByArticle] = useState<
    Record<string, CorrectionDTO[] | "loading" | "error">
  >({});

  useEffect(() => {
    let cancelled = false;
    getFixMetrics()
      .then((r) => {
        if (cancelled) return;
        setPoints(r.points);
        setBaselineEndsAt(r.baselineEndsAt);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const scored = useMemo(() => (points ?? []).filter((p) => p.fixCount !== null), [points]);
  const baselinePoints = useMemo(
    () => scored.filter((p) => baselineEndsAt !== null && p.finalizedAt < baselineEndsAt),
    [scored, baselineEndsAt],
  );
  const recentPoints = useMemo(
    () => scored.filter((p) => baselineEndsAt === null || p.finalizedAt >= baselineEndsAt),
    [scored, baselineEndsAt],
  );
  const baselineAvg = average(baselinePoints.map((p) => p.fixCount as number));
  const recentAvg = average(recentPoints.map((p) => p.fixCount as number));

  function toggleRow(articleId: string) {
    if (expandedId === articleId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(articleId);
    if (correctionsByArticle[articleId] !== undefined) return;
    setCorrectionsByArticle((prev) => ({ ...prev, [articleId]: "loading" }));
    getArticleCorrections(articleId)
      .then((r) =>
        setCorrectionsByArticle((prev) => ({ ...prev, [articleId]: r.corrections })),
      )
      .catch(() => setCorrectionsByArticle((prev) => ({ ...prev, [articleId]: "error" })));
  }

  const chart = useMemo(() => {
    if (scored.length === 0) return null;
    const counts = scored.map((p) => p.fixCount as number);
    const maxCount = Math.max(1, ...counts);
    const innerW = CHART_W - PAD.left - PAD.right;
    const innerH = CHART_H - PAD.top - PAD.bottom;
    const xAt = (i: number) =>
      (scored.length === 1 ? innerW / 2 : (i / (scored.length - 1)) * innerW) + PAD.left;
    const yAt = (v: number) => PAD.top + innerH - (v / maxCount) * innerH;

    const linePath = scored
      .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(p.fixCount as number)}`)
      .join(" ");
    const areaPath = `${linePath} L${xAt(scored.length - 1)},${PAD.top + innerH} L${xAt(0)},${PAD.top + innerH} Z`;

    const baselineEndIndex = baselinePoints.length > 0 ? baselinePoints.length - 1 : -1;
    const baselineBandEnd =
      baselineEndIndex >= 0
        ? xAt(baselineEndIndex) +
          (scored.length > 1 ? innerW / (scored.length - 1) / 2 : innerW / 2)
        : 0;

    const trend = linearTrend(counts);
    const yTicks = [0, 0.5, 1].map((f) => Math.round(maxCount * f));

    return {
      innerW,
      innerH,
      xAt,
      yAt,
      linePath,
      areaPath,
      baselineBandEnd,
      trend,
      yTicks,
      maxCount,
    };
  }, [scored, baselinePoints.length]);

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

  if (points === null) {
    return <div className="page center dim">Loading…</div>;
  }

  return (
    <div className="page" style={{ maxWidth: 920 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Fixes per article</h1>
          <p className="page-sub">
            Human corrections made at finalize, per article, in the order articles were finalized —
            the primary signal for whether QA is learning from the correction library over time.
          </p>
        </div>
      </div>

      {points.length === 0 ? (
        <div className="card empty">
          <Icon name="doc" />
          <h3>No finalized articles yet</h3>
          <p>Once articles are finalized, their fix counts appear here as a trend.</p>
        </div>
      ) : (
        <>
          <div className="row wrap" style={{ gap: 12, marginBottom: 14 }}>
            <div className="card stat" style={{ flex: 1, minWidth: 160 }}>
              <div className="stat-label">Finalized articles</div>
              <div className="stat-value">{points.length}</div>
            </div>
            <div className="card stat" style={{ flex: 1, minWidth: 160 }}>
              <div className="stat-label">Baseline avg fixes (first 14 days)</div>
              <div className="stat-value">
                {baselineAvg === null ? "—" : baselineAvg.toFixed(1)}
              </div>
            </div>
            <div className="card stat" style={{ flex: 1, minWidth: 160 }}>
              <div className="stat-label">Recent avg fixes</div>
              <div className="stat-value">{recentAvg === null ? "—" : recentAvg.toFixed(1)}</div>
            </div>
          </div>

          <div className="card card-pad" style={{ marginBottom: 14 }}>
            {chart && scored.length > 0 ? (
              <>
                <svg
                  className="chart"
                  viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="fadeAccent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {chart.yTicks.map((t, i) => (
                    <g key={i}>
                      <line
                        className="grid-line"
                        x1={PAD.left}
                        x2={CHART_W - PAD.right}
                        y1={chart.yAt(t)}
                        y2={chart.yAt(t)}
                      />
                      <text className="axis-text" x={4} y={chart.yAt(t) + 3}>
                        {t}
                      </text>
                    </g>
                  ))}

                  {chart.baselineBandEnd > 0 && (
                    <>
                      <rect
                        className="baseline-band"
                        x={PAD.left}
                        y={PAD.top}
                        width={chart.baselineBandEnd - PAD.left}
                        height={chart.innerH}
                      />
                      <text className="baseline-text" x={PAD.left + 4} y={PAD.top + 12}>
                        baseline
                      </text>
                    </>
                  )}

                  <path className="area" d={chart.areaPath} />
                  <path className="series" d={chart.linePath} />

                  {chart.trend && (
                    <line
                      className="trendline"
                      x1={chart.xAt(0)}
                      y1={chart.yAt(chart.trend.start)}
                      x2={chart.xAt(scored.length - 1)}
                      y2={chart.yAt(chart.trend.end)}
                    />
                  )}

                  {scored.map((p, i) => (
                    <circle
                      key={p.articleId}
                      className="pt"
                      cx={chart.xAt(i)}
                      cy={chart.yAt(p.fixCount as number)}
                      r={4}
                    >
                      <title>
                        {formatDate(p.finalizedAt)} · {p.fixCount} fix{p.fixCount === 1 ? "" : "es"}
                      </title>
                    </circle>
                  ))}

                  <text className="axis-text" x={PAD.left} y={CHART_H - 6}>
                    {formatDate(scored[0].finalizedAt)}
                  </text>
                  <text
                    className="axis-text"
                    x={CHART_W - PAD.right}
                    y={CHART_H - 6}
                    textAnchor="end"
                  >
                    {formatDate(scored[scored.length - 1].finalizedAt)}
                  </text>
                </svg>
                <div className="legend">
                  <span>
                    <i style={{ background: "var(--accent)" }} /> Fix count
                  </span>
                  {chart.baselineBandEnd > 0 && (
                    <span>
                      <i style={{ background: "var(--warn)" }} /> Baseline (first 14 days)
                    </span>
                  )}
                  <span>
                    <i style={{ background: "var(--ok)" }} /> Trend
                  </span>
                </div>
              </>
            ) : (
              <p className="hint">
                No compared articles yet — correction capture is still pending for all of them.
              </p>
            )}
          </div>

          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Article</th>
                  <th>Finalized</th>
                  <th>Fixes</th>
                  <th>Correction status</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => {
                  const expanded = expandedId === p.articleId;
                  const canExpand = p.correctionStatus === "captured";
                  const entry = correctionsByArticle[p.articleId];
                  return (
                    <Fragment key={p.articleId}>
                      <tr
                        onClick={canExpand ? () => toggleRow(p.articleId) : undefined}
                        style={canExpand ? undefined : { cursor: "default" }}
                      >
                        <td className="mono">
                          {canExpand && <span className="dim">{expanded ? "▾" : "▸"} </span>}
                          {p.articleId.slice(0, 8)}
                        </td>
                        <td>{formatDate(p.finalizedAt)}</td>
                        <td className="num">{p.fixCount ?? "—"}</td>
                        <td>
                          <span
                            className={`pill ${
                              p.correctionStatus === "captured"
                                ? "pill-ok"
                                : p.correctionStatus === "skipped"
                                  ? "pill-info"
                                  : p.correctionStatus === "pending"
                                    ? "pill-warn"
                                    : ""
                            }`}
                          >
                            {p.correctionStatus ?? "unknown"}
                          </span>
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={`${p.articleId}-detail`}>
                          <td colSpan={4} className="detail-cell">
                            {entry === undefined || entry === "loading" ? (
                              <span className="hint">Loading what was learned…</span>
                            ) : entry === "error" ? (
                              <span className="hint">Failed to load corrections.</span>
                            ) : entry.length === 0 ? (
                              <span className="hint">
                                No correction stored for this article.
                              </span>
                            ) : (
                              <div className="stack-sm">
                                {entry.map((c) => (
                                  <div key={c.id}>
                                    {c.topicTag && (
                                      <span className="pill pill-info" style={{ marginRight: 8 }}>
                                        {c.topicTag}
                                      </span>
                                    )}
                                    <span>{c.changeSummary}</span>
                                    {c.fixCategories.length > 0 && (
                                      <ul className="fix-breakdown">
                                        {c.fixCategories.map((f, i) => (
                                          <li key={i}>
                                            <span className="pill pill-warn">{f.category}</span>{" "}
                                            <span>{f.detail}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
