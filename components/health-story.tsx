"use client";

import { useState } from "react";
import { Activity, ArrowDownToLine, ArrowUpRight, Check, FileText, Plus, ShieldCheck } from "lucide-react";
import { markerHistory, visitQuestions, type HistoryPoint } from "@/lib/workspace/longitudinal";
import { rangeStatus, statusLabel, summaryText, type Workspace } from "@/lib/workspace/types";

const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function HistoryChart({ points, connected }: { points: HistoryPoint[]; connected: boolean }) {
  const values = points.map(p => p.value);
  const min = Math.min(...values), max = Math.max(...values);
  const pad = Math.max((max - min) * .25, Math.abs(max) * .05, 1);
  const floor = Math.max(0, min - pad), ceiling = max + pad;
  const dates = points.map(p => Date.parse(p.date));
  const first = Math.min(...dates), last = Math.max(...dates);
  const x = (i: number) => first === last ? 310 : 64 + ((dates[i] - first) / (last - first)) * 516;
  const y = (v: number) => 190 - ((v - floor) / (ceiling - floor)) * 152;
  return (
    <svg className="ns-history-chart" viewBox="0 0 620 238" role="img" aria-label={`Recorded ${points[0].name} values over time. Exact values and source reports are in the table below.`}>
      {[0, 1, 2, 3].map(i => {
        const value = floor + (ceiling - floor) * i / 3;
        return <g key={i}><line x1="64" y1={y(value)} x2="580" y2={y(value)} stroke="#e8ebe6" strokeDasharray="4 5" /><text x="52" y={y(value) + 4} textAnchor="end" className="ns-chart-label">{Number(value.toPrecision(3))}</text></g>;
      })}
      {connected && points.length > 1 && <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke="#236954" strokeWidth="2.5" />}
      {points.map((p, i) => <g key={`${p.reportId}:${i}`}><circle cx={x(i)} cy={y(p.value)} r="6" fill="#236954" stroke="white" strokeWidth="3"><title>{dateLabel(p.date)}: {p.value} {p.unit} · {p.title}</title></circle></g>)}
      <text x="64" y="223" className="ns-chart-label">{dateLabel(points[0].date)}</text>
      {first !== last && <text x="580" y="223" textAnchor="end" className="ns-chart-label">{dateLabel(points.at(-1)!.date)}</text>}
    </svg>
  );
}

export function HealthTrends({ workspace, openReport, addReport }: { workspace: Workspace; openReport: (id: string) => void; addReport: () => void }) {
  const histories = markerHistory(workspace.reports);
  const [key, setKey] = useState("");
  const selected = histories.find(h => h.key === key) ?? histories[0];
  const latest = selected?.points.at(-1);
  return <>
    <div className="ns-page-heading"><div><span className="ns-eyebrow">YOUR STORY, OVER TIME</span><h1>A little more perspective.</h1><p>Follow the numbers. Keep the context. Bring better questions.</p></div><button className="ns-button ns-dark" onClick={addReport}><Plus size={17} /> Add a report</button></div>
    {!selected || !latest ? <section className="ns-empty"><span className="ns-empty-icon"><Activity /></span><h3>Every story starts with a first reading.</h3><p>Add a report and confirm its values to start your history.</p><button className="ns-button ns-dark" onClick={addReport}>Add my first report</button></section> : <div className="ns-story-layout">
      <aside className="ns-marker-list" aria-label="Choose a test"><div className="ns-story-caption">YOUR RECORDED TESTS <span>{histories.length}</span></div>{histories.map(h => <button key={h.key} aria-pressed={h.key === selected.key} onClick={() => setKey(h.key)}><span><b>{h.name}</b><small>{h.points.length} readings · {h.unit}</small></span><span>{h.points.at(-1)!.value}<ArrowUpRight size={14} /></span></button>)}</aside>
      <section className="ns-story-panel">
        <div className="ns-story-caption"><span>CONFIRMED BY YOU</span><span>{selected.points.length} READINGS</span></div>
        <div className="ns-story-value"><div><h2>{selected.name}</h2><strong>{latest.value}<small>{selected.unit}</small></strong><span className={`ns-badge ${rangeStatus(latest)}`}>{statusLabel[rangeStatus(latest)]}</span></div><div className="ns-story-delta"><span>RECORDED CHANGE</span><b>{selected.comparison ? `${selected.comparison.delta > 0 ? "+" : ""}${selected.comparison.delta} ${selected.unit}` : "Not calculated"}</b><small>{selected.comparison ? `Since ${dateLabel(selected.comparison.previous.date)}` : "More comparable dates needed"}</small></div></div>
        <HistoryChart points={selected.points} connected={!selected.caution} />
        <p className="ns-story-context"><ShieldCheck size={16} />{selected.caution || "A change is a difference between recorded numbers, not a measure of better or worse health. Testing methods can differ even within the same lab."}</p>
        <div className="ns-table-wrap"><table className="ns-results-table"><caption className="ns-story-table-caption">Every reading, with its source</caption><thead><tr><th>Date</th><th>Result</th><th>Report range</th><th>Source</th></tr></thead><tbody>{[...selected.points].reverse().map((point, i) => <tr key={`${point.reportId}:${i}`}><td>{dateLabel(point.date)}</td><td><b>{point.value}</b> {point.unit}</td><td>{point.low ?? "?"}–{point.high ?? "?"}</td><td><button className="ns-source-report" onClick={() => openReport(point.reportId)}>{point.title}<ArrowUpRight size={12} /><small>{point.lab || "Lab not recorded"}</small></button></td></tr>)}</tbody></table></div>
      </section>
    </div>}
  </>;
}

export function VisitPreparation({ workspace, download, demo }: { workspace: Workspace; download: (name: string, text: string) => void; demo: boolean }) {
  const questions = visitQuestions(workspace);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const selected = questions.filter(q => !excluded.includes(q.id));
  const text = summaryText(workspace, {
    notes,
    questions: selected.map((q, i) => `${i + 1}. ${q.text}\n   Context: ${q.reason}`),
  });
  return <>
    <div className="ns-page-heading"><div><span className="ns-eyebrow">MAKE SPACE FOR THE CONVERSATION</span><h1>Walk in prepared.</h1><p>Your records, your questions, your voice.</p></div><button className="ns-button ns-dark" onClick={() => download("nutritiscan-visit-summary.txt", text)}><ArrowDownToLine size={17} /> Download visit brief</button></div>
    <div className="ns-visit-layout"><div>
      <section className="ns-card ns-visit-section"><span className="ns-story-caption">01 / WHAT MATTERS TO YOU</span><h2>What would you like to discuss?</h2><label className="ns-visit-notes">Changes you noticed, when they started, or something on your mind.<textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={3000} rows={5} placeholder="I’d like to understand…" /></label><p className="ns-small-note">Notes stay in this page until you leave or reload. Download your brief to keep them.</p></section>
      <section className="ns-card ns-visit-section"><span className="ns-story-caption">02 / QUESTIONS WORTH BRINGING</span><h2>Choose your conversation starters.</h2><p className="ns-small-note">Suggested from your confirmed records. Your clinician decides what needs attention.</p><div className="ns-visit-questions">{questions.map(q => <label key={q.id}><input type="checkbox" checked={!excluded.includes(q.id)} onChange={e => setExcluded(previous => e.target.checked ? previous.filter(id => id !== q.id) : [...previous, q.id])} /><span><b>{q.text}</b><small>{q.reason}</small></span></label>)}</div></section>
    </div><aside className="ns-brief-card"><span className="ns-icon soft"><FileText size={23} /></span><span className="ns-story-caption">YOUR VISIT BRIEF</span><h2>{workspace.profile.name}’s<br /><em>health story.</em></h2><p>A clear summary you can take to your clinician.</p><dl><div><dt>Confirmed reports</dt><dd>{workspace.reports.length}</dd></div><div><dt>Selected questions</dt><dd>{selected.length}</dd></div><div><dt>Open follow-ups</dt><dd>{workspace.tasks.filter(t => !t.done).length}</dd></div></dl><button className="ns-button ns-dark" onClick={() => download("nutritiscan-visit-summary.txt", text)}><ArrowDownToLine size={16} /> Download brief</button><button className="ns-text-button" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setCopyError(""); } catch { setCopyError("Copy is unavailable in this browser. Download your brief instead."); } }}>{copied ? <><Check size={15} /> Copied to clipboard</> : "Copy summary text"}</button>{copyError && <p role="alert">{copyError}</p>}<p className="ns-small-note">{demo ? "Fictional demo records." : "Patient-entered information."} Review before sharing. Your brief includes your recorded medicines, conditions and allergies.</p></aside></div>
  </>;
}
