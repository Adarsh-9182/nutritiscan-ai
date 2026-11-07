import React, { useState } from "react";

const display = (value) => value === null || value === undefined ? "Not available" : typeof value === "number" ? Number(value.toPrecision(7)).toString() : String(value);
function operationLabel(op) {
  return op.type === "profile" ? "Profile schema, missingness and numeric columns" : op.type === "group-summary" ? `Summarize ${op.value} by ${op.group}` : `Pearson correlation: ${op.x} × ${op.y}`;
}
export function AnalysisPanel({ records, files, running, onPropose, onRun, onReject, onOpen }) {
  const datasets = files.filter((file) => /\.(csv|tsv)$/i.test(file.path));
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const path = datasets.some((file) => file.path === selected) ? selected : datasets[0]?.path ?? "";
  async function act(action) { if (busy) return; setBusy(true); try { await action(); } finally { setBusy(false); } }
  return <section aria-label="Reproducible analyses" className="analysis-panel">
    <div className="inspector-heading"><h3>Analysis workspace</h3><span className="count">{records.length}/12</span></div>
    <p className="dim-note">Ask the agent to propose grouped summaries or correlations using inspected columns. Review the plan here, run it locally, then ask the agent to inspect the recorded result. Start a new investigation to get newly added agent tools.</p>
    <div className="analysis-quick"><label>Dataset<select aria-label="Analysis dataset" value={path} disabled={busy || running} onChange={(event) => setSelected(event.target.value)}><option value="">Choose a CSV / TSV</option>{datasets.map((file) => <option key={file.path} value={file.path}>{file.path}</option>)}</select></label><button className="small-button" disabled={!path || busy || running || records.length >= 12} onClick={() => void act(() => onPropose({ title: `Profile ${path}`.slice(0, 160), question: "Inspect dataset quality before scientific interpretation.", path, missingValues: [], operations: [{ type: "profile" }] }))}>Propose dataset profile</button><p className="dim-note">A proposal runs no analysis. Blank cells are the only default missing values; the agent can propose additional explicit codes.</p></div>
    {!records.length && <div className="inspector-empty"><h4>Make every result reproducible.</h4><p>The plan, dataset hash, execution state and computed output stay together. Propose a profile above, or ask your agent for a specific comparison.</p></div>}
    {[...records].reverse().map((record) => <article key={record.id} className="analysis-card" aria-label={`Analysis: ${record.spec.title}`}>
      <header><h4>{record.spec.title}</h4><span className={`tag analysis-status-${record.status}`}>{record.status === "pending" ? "Review required" : record.status}</span></header>
      <p className="analysis-question">{record.spec.question}</p><p className="dim-note">Input: {record.spec.path} · {record.source.bytes.toLocaleString()} bytes</p>
      <ol className="analysis-operations">{record.spec.operations.map((op, index) => <li key={index}>{operationLabel(op)}</li>)}</ol>
      <p className="dim-note">Missing values: blank cells{record.spec.missingValues.length ? ` and ${JSON.stringify(record.spec.missingValues)}` : " only"}. No units, causal effects or clinical outcomes are inferred.</p>
      <details className="analysis-recipe"><summary>Exact recipe and input fingerprint</summary><pre>{JSON.stringify({ engine: record.engine, source: record.source, spec: record.spec }, null, 2)}</pre></details>
      {record.status === "pending" && <div className="analysis-actions"><button className="primary" disabled={busy || running} onClick={() => void act(() => onRun(record.id, record.source.sha256))}>Approve & run analysis</button><button className="small-button" disabled={busy || running} onClick={() => void act(() => onReject(record.id))}>Reject proposal</button></div>}
      {record.status === "running" && <p role="status" className="dim-note">Running the approved local calculation…</p>}
      {record.error && <p className="analysis-error" role="status">{record.error}</p>}
      {record.status === "completed" && record.result && <>
        <p className="dim-note">{record.result.rows} source rows · {record.result.duplicateRows} duplicate rows retained · {record.engine}</p>
        {record.result.results.map((result, index) => <AnalysisResult key={index} result={result} />)}
        <p className="dim-note">Completed {new Date(record.completedAt).toLocaleString()}. The receipt contains aggregate results and the original input hash. Reproduction requires the same source contents.</p>
        {record.artifact && <button className="text-button" onClick={() => onOpen(record.artifact)}>Open analysis receipt ↗</button>}
        <button className="small-button section-space" disabled={busy || running || records.length >= 12} onClick={() => void act(() => onPropose(record.spec))}>Propose another run</button>
      </>}
    </article>)}
    <p className="dim-note section-space">This version runs bounded descriptive operations, not arbitrary Python/R, hypothesis tests, survival models, biomarker validation or experiments. Computed results still require scientific interpretation.</p>
  </section>;
}
function AnalysisResult({ result }) {
  if (result.type === "profile") return <section className="analysis-result"><h5>Dataset profile</h5><div className="analysis-table"><table><thead><tr><th>Column</th><th>Missing</th><th>Numeric n</th><th>Mean</th></tr></thead><tbody>{result.columns.map((column) => <tr key={column.name}><td>{column.name}</td><td>{column.missing}</td><td>{column.numericCount}</td><td>{display(column.statistics?.mean)}</td></tr>)}</tbody></table></div><p className="dim-note">Mixed numeric/text columns have no numeric summary.</p></section>;
  if (result.type === "correlation") return <section className="analysis-result"><h5>{result.x} × {result.y}</h5><p className="analysis-number">r = {display(result.correlation)}</p><p className="dim-note">{result.count} complete pairs · {result.excludedMissing} rows excluded for missing values · {result.status}</p><p className="dim-note">{result.notice}</p></section>;
  const valid = result.groups.filter((group) => group.mean !== null), min = Math.min(0, ...valid.map((group) => group.mean)), max = Math.max(0, ...valid.map((group) => group.mean)), span = max - min;
  const plot = Number.isFinite(span) && span > 0;
  const x = (value) => 100 + (value - min) / span * 170;
  return <section className="analysis-result"><h5>{result.valueColumn} by {result.groupColumn}</h5>{plot && <svg role="img" aria-label={`Descriptive group means for ${result.valueColumn}; units are not inferred`} viewBox={`0 0 320 ${valid.length * 28 + 18}`} className="analysis-chart"><line x1={x(0)} x2={x(0)} y1="4" y2={valid.length * 28 + 10} stroke="currentColor" opacity=".25" />{valid.map((group, index) => <g key={group.label}><title>{group.label}: mean {group.mean}; n={group.count}</title><text x="2" y={index * 28 + 18} fontSize="10" fill="currentColor">{group.label.slice(0, 14)}</text><rect x={Math.min(x(0), x(group.mean))} y={index * 28 + 7} width={Math.max(1, Math.abs(x(group.mean) - x(0)))} height="14" rx="2" fill="var(--accent)" /><text x="278" y={index * 28 + 18} fontSize="9" fill="currentColor">{display(group.mean)}</text></g>)}</svg>}<div className="analysis-table"><table><thead><tr><th>Group</th><th>n</th><th>Missing</th><th>Mean</th><th>SD</th></tr></thead><tbody>{result.groups.map((group) => <tr key={group.label}><td>{group.label}</td><td>{group.count}</td><td>{group.missing}</td><td>{display(group.mean)}</td><td>{display(group.sampleStdDev)}</td></tr>)}</tbody></table></div><p className="dim-note">Excluded: {result.excluded.missingGroup} missing group labels; {result.excluded.missingValue} missing values within groups. Group differences do not establish significance or efficacy.</p></section>;
}
