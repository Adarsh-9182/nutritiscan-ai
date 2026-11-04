import React, { useEffect, useRef, useState } from "react";

export function SavedWorkRow({ kind, name, selected, disabled, onSelect, onManage, Icon }) {
  return <div className={`saved-work-row ${selected ? "selected" : ""}`}>
    <button className={kind === "project" ? "project-button" : "session-button"} disabled={disabled} onClick={onSelect} title={name}>
      <Icon name={kind === "project" ? "folder" : "file"} size={kind === "project" ? 17 : 13} /><span>{name}</span>
    </button>
    <button className="saved-work-menu icon-button" disabled={disabled} aria-label={`Manage ${kind === "project" ? "project" : "investigation"} ${name}`} onClick={onManage}><Icon name="settings" size={14} /></button>
  </div>;
}

function Dialog({ title, onClose, busy, children, Icon }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    (ref.current.querySelector("[data-autofocus]") ?? ref.current.querySelector("button"))?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [title]);
  function keyboard(event) {
    if (event.key === "Escape" && !busy) { event.preventDefault(); onClose(); }
    if (event.key !== "Tab") return;
    const nodes = [...ref.current.querySelectorAll("button:not(:disabled),input:not(:disabled),a[href],[tabindex='0']")];
    if (!nodes.length) { event.preventDefault(); return; }
    const first = nodes[0], last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={ref} role="dialog" aria-modal="true" aria-label={title} className="connection-modal library-modal" onKeyDown={keyboard}>
      <button className="modal-close" aria-label={`Close ${title.toLowerCase()}`} disabled={busy} onClick={onClose}><Icon name="x" /></button>
      <p className="eyebrow">YOUR RESEARCH, ORGANIZED</p><h2>{title}</h2>{children}
    </section>
  </div>;
}

export function ManageWorkDialog({ kind, item, onAction, onClose, error, Icon }) {
  const [name, setName] = useState(item.name ?? item.title), [busy, setBusy] = useState(false);
  const original = item.name ?? item.title;
  async function change(action, args) {
    if (busy) return;
    setBusy(true);
    try { if (await onAction(action, args)) onClose(); } finally { setBusy(false); }
  }
  return <Dialog title={kind === "project" ? "Manage project" : "Manage investigation"} busy={busy} onClose={onClose} Icon={Icon}>
    <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) void change(`${kind}.rename`, { id: item.id, name: name.trim() }); }}>
      <label className="field-label" htmlFor="saved-work-name">{kind === "project" ? "Project name" : "Investigation name"}</label>
      <input id="saved-work-name" data-autofocus value={name} maxLength={160} disabled={busy} onChange={(event) => setName(event.target.value)} />
      <p className="dim-note">{kind === "project" ? "Changes the name in NutritiScan. The folder keeps its original name." : "Keep a short name that describes the research question."}</p>
      <button className="primary" disabled={busy || !name.trim() || name.trim() === original}>Save name</button>
    </form>
    <div className="library-archive-action"><div><b>Archive {kind === "project" ? "project" : "investigation"}</b><p>Hide it from the sidebar. Its saved work stays available in Archived work.</p></div><button className="secondary" disabled={busy} onClick={() => void change(`${kind}.archive`, { id: item.id })}><Icon name="archive" size={15} />Archive</button></div>
    {error && <p className="dialog-error" role="alert">{error}</p>}
  </Dialog>;
}

export function WorkspaceLibrary({ projects, project, onAction, onClose, error, Icon }) {
  const [busy, setBusy] = useState(false);
  async function change(action, id) {
    if (busy) return;
    setBusy(true);
    try { const result = await onAction(action, { id }); if (result && action.endsWith(".restore")) onClose(); } finally { setBusy(false); }
  }
  function rows(items, kind) {
    return items.length ? items.map((item) => <div className="archive-row" key={item.id}>
      <Icon name={kind === "project" ? "folder" : "file"} size={17} /><div><b>{item.name ?? item.title}</b><span>{kind === "project" ? `${item.sessionCount} saved investigations` : "Conversation, sources and checks retained"}</span></div>
      <button className="small-button" disabled={busy} aria-label={`Restore ${kind === "project" ? "project" : "investigation"} ${item.name ?? item.title}`} onClick={() => void change(`${kind}.restore`, item.id)}>Restore</button>
      <button className="icon-button" disabled={busy} aria-label={`Remove archived ${kind === "project" ? "project" : "investigation"} ${item.name ?? item.title}`} onClick={() => void change(`${kind}.remove`, item.id)}><Icon name="trash" size={15} /></button>
    </div>) : <p className="dim-note">Nothing archived here.</p>;
  }
  return <Dialog title="Archived work" busy={busy} onClose={onClose} Icon={Icon}>
    <p>Restore work to continue it. Removing an archived item asks you to confirm before its app history is erased; project files and saved reports stay on disk.</p>
    <div className="library-section"><h3>Projects</h3>{rows(projects, "project")}</div>
    {project && <div className="library-section"><h3>Investigations in {project.name}</h3>{rows(project.archivedSessions ?? [], "session")}</div>}
    <p className="dim-note">Archived work counts toward the limit of 12 projects and 20 investigations per project. Restore and export a conversation before removing it if you need a copy. Original Codex history is managed separately.</p>
    {error && <p className="dialog-error" role="alert">{error}</p>}
  </Dialog>;
}
