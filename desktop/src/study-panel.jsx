import React, { useEffect, useState } from "react";
import { BIOLOGY_FIELDS, PROTOCOL_SECTIONS } from "../../shared/study-plan.ts";

export function StudyPanel({ records, sources, running, onAction, onDirty, onError }) {
  const [selected, setSelected] = useState(records[0]?.id ?? ""), [dirty, setDirty] = useState(false);
  const [question, setQuestion] = useState(""), [included, setIncluded] = useState([]), [working, setWorking] = useState(false);
  const record = records.find((item) => item.id === selected) ?? records[0];
  const disabled = running || working;
  function changeDirty(value) { setDirty(value); onDirty(value); }
  function mayLeave() { if (dirty) { onError("Save your study draft or discard its unsaved edits before switching work."); return false; } return true; }
  async function action(name, args) {
    setWorking(true);
    try { return await onAction(name, args); }
    finally { setWorking(false); }
  }
  async function pick() {
    if (!mayLeave()) return;
    const result = await action("study.pick");
    if (result?.id) setSelected(result.id);
  }
  async function create(event) {
    event.preventDefault(); if (!mayLeave()) return;
    const result = await action("study.create", { question, sourceIds: included });
    if (result?.id) { setSelected(result.id); setQuestion(""); setIncluded([]); }
  }
  return <section className="study-panel" aria-label="Study drafts">
    <div className="inspector-heading"><h3>Study drafts</h3><span className="tag">{records.length}/12</span></div>
    <p className="dim-note">Bring a source-linked protocol from the public workspace, or start with public sources from this investigation. Edits stay on your Mac until you export them.</p>
    <button className="small-button" disabled={disabled} onClick={() => void pick()}>Import study draft JSON</button>
    <p className="dim-note">On nutritiscan.com/research, use Export draft for Mac. Imports keep a separate local copy and reset previous review marks.</p>
    {records.length > 0 && <label className="study-field">Saved draft<select aria-label="Saved study draft" value={record?.id ?? ""} disabled={disabled} onChange={(event) => { if (mayLeave()) setSelected(event.target.value); }}>{records.map((item) => <option key={item.id} value={item.id}>{item.document.protocol.title}</option>)}</select></label>}
    {record && <StudyEditor key={record.id} record={record} disabled={disabled} dirty={dirty} onDirty={changeDirty} onSave={(edit) => action("study.save", { id: record.id, revision: record.revision, edit })} onExport={(type) => { if (mayLeave()) return action("study.export", { id: record.id, type }); }} />}
    <details className="study-new"><summary>Start a draft from current evidence</summary><form onSubmit={(event) => void create(event)}>
      <label className="study-field">Research question<textarea aria-label="New study question" value={question} maxLength={2000} rows={3} disabled={disabled} onChange={(event) => setQuestion(event.target.value)} /></label>
      <p className="dim-note">Choose 1–10 PubMed or trial records for the bibliography. Inclusion does not verify the methods.</p>
      <div className="study-sources">{sources.filter((source) => /^(pubmed:\d{1,12}|trials:NCT\d{8})$/.test(source.id)).map((source) => <label key={source.id}><input type="checkbox" disabled={disabled || (!included.includes(source.id) && included.length >= 10)} checked={included.includes(source.id)} onChange={(event) => setIncluded(event.target.checked ? [...included, source.id] : included.filter((id) => id !== source.id))} /><span>{source.title}<small>{source.id}</small></span></label>)}</div>
      {!sources.length && <p className="dim-note">Ask the agent to search literature first, or import a draft from the public workspace.</p>}
      <button className="small-button" disabled={disabled || dirty || question.trim().length < 3 || !included.length || records.length >= 12}>Create study draft</button>
    </form></details>
  </section>;
}

function StudyEditor({ record, disabled, dirty, onDirty, onSave, onExport }) {
  const protocol = record.document.protocol;
  const [edit, setEdit] = useState({ title: protocol.title, fields: { ...protocol.fields } });
  function patch(value) { setEdit((current) => ({ ...current, ...value })); onDirty(true); }
  const missing = PROTOCOL_SECTIONS.filter(({ id }) => !edit.fields[id].trim());
  async function save(event) { event.preventDefault(); if (await onSave(edit)) onDirty(false); }
  useEffect(() => { const guard = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard); }, [dirty]);
  return <form onSubmit={(event) => void save(event)} className="study-editor">
    <div className="study-status" role="status">{dirty ? "Unsaved changes — save before switching or exporting" : `Saved revision ${record.revision} · review required`}<span>{PROTOCOL_SECTIONS.length - missing.length}/{PROTOCOL_SECTIONS.length} sections filled</span></div>
    {record.importedAt && <p className="dim-note">Imported copy. Source content and authorship have not been revalidated. Previous review marks were reset. Original import SHA-256: <code className="study-digest">{record.importSha256}</code></p>}
    <label className="study-field">Protocol title<input aria-label="Study protocol title" value={edit.title} disabled={disabled} maxLength={160} onChange={(event) => patch({ title: event.target.value })} /></label>
    {protocol.biologyContext && <details className="study-bibliography"><summary>Biology context snapshot</summary><p className="dim-note">Researcher-supplied scope attached when this draft was created. Compare it with the current project before combining results.</p>{BIOLOGY_FIELDS.map(({ id, label }) => <p className="dim-note" key={id}><b>{label}</b><br />{protocol.biologyContext[id] || "Not specified"}</p>)}</details>}
    {PROTOCOL_SECTIONS.map(({ id, label, help }) => <label key={id} className="study-field">{label}<textarea aria-label={label} rows={3} value={edit.fields[id]} maxLength={2000} disabled={disabled} onChange={(event) => patch({ fields: { ...edit.fields, [id]: event.target.value } })} /><small>{help}</small></label>)}
    <div className="study-actions"><button className="small-button" disabled={disabled || !dirty || !edit.title.trim()}>Save study changes</button><button type="button" className="text-button" disabled={disabled || !dirty} onClick={() => { setEdit({ title: protocol.title, fields: { ...protocol.fields } }); onDirty(false); }}>Discard unsaved edits</button></div>
    <details className="study-bibliography"><summary>Preserved bibliography · {record.document.bibliography.length}</summary><p className="dim-note">{record.document.sourceTimestampKind === "saved" ? "Snapshot saved; original retrieval time unavailable" : "Source snapshot retrieved"}: {record.document.retrievedAt}</p>{record.document.bibliography.map((source) => <article key={source.id}><b>{source.title}</b><code>{source.id}</code><button type="button" className="text-button" onClick={() => void window.biology.call("external", { url: source.url })}>Open original source ↗</button><details><summary>Saved source text</summary><p className="study-source-text">{source.detail || "No source text was available."}</p></details></article>)}</details>
    <p className="dim-note">A working draft for investigator and supervisor review. No analysis runs, participants are enrolled or approvals are granted by this document.</p>
    <div className="study-actions"><button type="button" className="small-button" disabled={disabled || dirty} onClick={() => void onExport("json")}>Export draft for web</button><button type="button" className="text-button" disabled={disabled || dirty} onClick={() => void onExport("txt")}>Export protocol TXT</button></div>
    <p className="dim-note">Import the JSON in the public workspace’s conversation history. It opens as a separate conversation; existing browser work is preserved.</p>
  </form>;
}
