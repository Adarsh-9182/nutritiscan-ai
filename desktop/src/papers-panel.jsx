/* eslint-disable @next/next/no-img-element -- Electron displays local PDF previews as data URLs. */
import React, { useEffect, useRef, useState } from "react";

export function PapersPanel({ papers, files, checks, running, onImport, onPmc, onImportProject, onOpen, onStop }) {
  const [pmcid, setPmcid] = useState(""), [path, setPath] = useState("");
  const pdfs = files.filter((file) => file.kind === "pdf" && !file.path.startsWith("papers/"));
  return <div className="papers-panel">
    <div className="inspector-heading"><h3>Project papers</h3><span className="count">{papers.length}/30</span></div>
    <p className="dim-note">Read a paper with its original source, exact pages or passages, and extraction limits beside it.</p>
    <button className="small-button paper-import" disabled={running} onClick={onImport}>Import a PDF from this Mac</button>
    <p className="dim-note">A copy is saved in this project. Local parsing; up to 20 MB and 80 pages. Import documents you have permission to use.</p>
    {pdfs.length > 0 && <form className="paper-input" onSubmit={(e) => { e.preventDefault(); if (path) void onImportProject(path); }}><label>PDF already in project<select aria-label="Project PDF" value={path} onChange={(e) => setPath(e.target.value)} disabled={running}><option value="">Choose a PDF</option>{pdfs.map((f) => <option value={f.path} key={f.path}>{f.path}</option>)}</select></label><button className="small-button" disabled={running || !path}>Import project PDF</button></form>}
    <form className="paper-input" onSubmit={(e) => { e.preventDefault(); if (/^PMC[1-9]\d{0,8}$/i.test(pmcid.trim())) void onPmc(pmcid.trim()); }}><label>PMC open-access article<input aria-label="PMC identifier" value={pmcid} onChange={(e) => setPmcid(e.target.value)} placeholder="PMC1790863" maxLength={12} disabled={running} /></label><button className="small-button" disabled={running || !/^PMC[1-9]\d{0,8}$/i.test(pmcid.trim())}>Fetch open full text</button><p className="dim-note">Official BioC service · recorded CC BY/CC0 licence. PMC passages use section locators, not PDF page numbers.</p></form>
    {running && <button className="text-button" onClick={onStop}>Stop current task</button>}
    <div className="paper-list">{papers.map((paper) => <article className="paper-card" key={paper.id}><span className="source-kind">{paper.kind === "local-pdf" ? "LOCAL PDF" : "PMC FULL TEXT"}</span><h4>{paper.title}</h4><p>{paper.sectionCount} {paper.kind === "local-pdf" ? "pages" : "passages"} · {paper.readableCount} with text</p>{paper.readableCount < paper.sectionCount && <p className="paper-warning">{paper.sectionCount - paper.readableCount} without a readable text layer</p>}{paper.license && <span className="tag">{paper.license}</span>}<button className="text-button" onClick={() => onOpen(paper.id)}>Open paper →</button></article>)}</div>
    {!papers.length && <div className="inspector-empty"><h4>Keep the paper behind the finding.</h4><p>Import the fictional sample PDF or fetch a permitted open-access paper. No model connection is needed to read it.</p></div>}
    {checks.length > 0 && <section className="paper-checks"><h4>Recorded passage checks</h4><p className="dim-note">Text membership at the recorded time. Open a passage to inspect the current source; these are not scientific approvals.</p>{checks.map((check, index) => <article key={`${check.checkedAt}-${index}`}><span className="tag">{check.status === "quote-found" ? "Passage found" : "Withheld"}</span><p>{check.claim}</p><blockquote>{check.quote}</blockquote><small>{check.reason}<br />{new Date(check.checkedAt).toLocaleString()}</small><button className="text-button" onClick={() => onOpen(check.paperId, check.sectionId, check.quote)}>Open cited passage →</button></article>)}</section>}
  </div>;
}

function Highlight({ text, quote }) {
  if (!quote?.trim()) return text;
  const pattern = quote.trim().split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const match = new RegExp(pattern, "i").exec(text);
  if (!match) return <>{text}<span className="paper-highlight-missing">The selected phrase was not found in this extracted section.</span></>;
  return <>{text.slice(0, match.index)}<mark>{match[0]}</mark>{text.slice(match.index + match[0].length)}</>;
}

export function PaperReader({ paper, initialSection, initialQuote, request, onVerify, onClose }) {
  const [info, setInfo] = useState(null), [section, setSection] = useState(initialSection || (paper.kind === "local-pdf" ? "p1" : "s1")), [passage, setPassage] = useState(null), [preview, setPreview] = useState(null), [error, setError] = useState(""), [previewError, setPreviewError] = useState("");
  const [query, setQuery] = useState(""), [results, setResults] = useState(null), [highlight, setHighlight] = useState(initialQuote || ""), [claim, setClaim] = useState(""), [quote, setQuote] = useState(initialQuote || ""), [check, setCheck] = useState(null), [checking, setChecking] = useState(false), [zoom, setZoom] = useState(0);
  const dialog = useRef(null), close = useRef(null), extracted = useRef(null);
  useEffect(() => { const previous = document.activeElement; close.current?.focus(); return () => { if (previous?.isConnected) previous.focus(); }; }, []);
  useEffect(() => { let active = true; void request("paper.inspect", { id: paper.id }).then((value) => { if (active) setInfo(value); }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; }; }, [paper.id, request]);
  useEffect(() => {
    let active = true;
    void request("paper.section", { id: paper.id, sectionId: section }).then((value) => {
      if (!active) return; setPassage(value);
      if (value.page) void request("paper.preview", { id: paper.id, page: value.page }).then((image) => { if (active) setPreview(image); }).catch((e) => { if (active) setPreviewError(e.message); });
    }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; void request("paper.preview.cancel").catch(() => {}); };
  }, [paper.id, section, request]);
  useEffect(() => { if (passage && highlight) extracted.current?.querySelector("mark")?.scrollIntoView({ block: "center" }); }, [passage, highlight]);
  const sections = info?.sections ?? [], index = sections.findIndex((item) => item.id === section);
  const move = (id, phrase = "") => { if (id !== section) { setPassage(null); setPreview(null); setError(""); setPreviewError(""); setCheck(null); } setHighlight(phrase); setSection(id); setQuote(phrase.length >= 12 && phrase.length <= 1000 ? phrase : ""); };
  async function search(e) { e.preventDefault(); setError(""); try { setResults(await request("paper.search", { id: paper.id, query: query.trim() })); } catch (e) { setError(e.message); } }
  async function verify(e) { e.preventDefault(); if (!passage) return; setChecking(true); try { const value = await onVerify({ paperId: paper.id, sectionId: section, contentSha256: passage.contentSha256, claim, quote }); if (value) setCheck(value.checks[0]); } catch (e) { setError(e.message); } finally { setChecking(false); } }
  function selectedText() { const selection = window.getSelection(); if (selection && extracted.current?.contains(selection.anchorNode) && extracted.current?.contains(selection.focusNode)) { const text = selection.toString().trim(); if (text.length >= 12 && text.length <= 1000) setQuote(text); else setError("Select 12–1,000 characters inside the extracted passage."); } }
  function keyboard(e) {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    if (e.key === "Tab") { const items = [...dialog.current.querySelectorAll('button:not(:disabled),input,select,textarea,a[href],summary')].filter((el) => el.getClientRects().length); const first = items[0], last = items.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
  }
  return <div className="modal-backdrop paper-backdrop"><section ref={dialog} role="dialog" aria-modal="true" aria-label="Paper reader" className="paper-reader" onKeyDown={keyboard}>
    <header className="paper-reader-header"><div><p className="eyebrow">{paper.kind === "local-pdf" ? "ORIGINAL PDF + EXTRACTED TEXT" : "PMC OPEN-ACCESS TEXT SNAPSHOT"}</p><h2>{paper.title}</h2></div><button ref={close} className="icon-button" aria-label="Close paper reader" onClick={onClose}>×</button></header>
    <div className="paper-toolbar"><div className="paper-pagination"><button aria-label="Previous paper section" disabled={index <= 0} onClick={() => move(sections[index - 1].id)}>←</button><select aria-label="Paper section" value={section} onChange={(e) => move(e.target.value)}>{!sections.length && <option value={section}>Loading section index…</option>}{sections.map((s) => <option value={s.id} key={s.id}>{s.label}{s.status === "no-text" ? " · no text" : ""}</option>)}</select><button aria-label="Next paper section" disabled={index === -1 || index >= sections.length - 1} onClick={() => move(sections[index + 1].id)}>→</button></div><form onSubmit={search}><input aria-label="Search this paper" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={200} placeholder="Find a phrase in this paper" /><button className="small-button" disabled={query.trim().length < 3}>Search</button></form></div>
    {error && <p role="alert" className="paper-reader-error">{error}</p>}
    {results && <div className="paper-search-results"><span>{results.matchingSections} matching sections{results.limited ? " · first 12 shown" : ""}</span><button aria-label="Close paper search results" onClick={() => setResults(null)}>×</button>{results.matches.map((match) => <button key={match.sectionId} onClick={() => { move(match.sectionId, query.trim()); setResults(null); }}><b>{match.label}</b><span>{match.excerpt}</span></button>)}</div>}
    <div className={`paper-reading-columns ${paper.kind === "pmc-fulltext" ? "text-only" : ""}`}>
      {paper.kind === "local-pdf" && <div className="paper-original" aria-label="Original PDF page">{preview ? <><div className="paper-zoom" role="group" aria-label="Original page zoom">{[[0, "Fit page"], [1, "100%"], [1.5, "150%"]].map(([value, label]) => <button key={label} aria-pressed={zoom === value} onClick={() => setZoom(value)}>{label}</button>)}</div><img src={preview.image} alt={`Original PDF page ${preview.page}`} width={preview.width} height={preview.height} style={{ width: zoom ? `${preview.width * zoom}px` : "100%", maxWidth: zoom ? "none" : "100%" }} /></> : <p className="dim-note">{previewError || (error ? "The original page could not be verified." : "Rendering the original PDF page…")}</p>}</div>}
      <div className="paper-text-column"><p className="eyebrow">{passage?.label ?? "EXTRACTED PASSAGE"}</p>{passage?.status === "no-text" ? <div className="paper-no-text"><h3>No readable text layer</h3><p>This page is blank, image-only or has no extractable text. It has been retained in the paper. OCR is not available.</p></div> : <pre className="paper-extracted" ref={extracted}>{passage ? <Highlight text={passage.text} quote={highlight} /> : "Loading verified text snapshot…"}</pre>}
      {passage?.status === "readable" && <details className="paper-verify"><summary>Check a quotation against this section</summary><p className="dim-note">This checks exact text membership. It does not validate the proposed finding.</p><button type="button" className="text-button" onClick={selectedText}>Use selected extracted text</button><form onSubmit={verify}><label>Proposed finding<textarea aria-label="Proposed finding" value={claim} onChange={(e) => setClaim(e.target.value)} maxLength={1200} rows={2} /></label><label>Exact quotation<textarea aria-label="Exact quotation" value={quote} onChange={(e) => setQuote(e.target.value)} maxLength={1000} rows={3} /></label><button className="small-button" disabled={checking || claim.trim().length < 3 || quote.trim().length < 12}>{checking ? "Checking…" : "Check passage membership"}</button></form>{check && <p className="paper-check-result" role="status"><b>{check.status === "quote-found" ? "Passage found" : "Withheld"}</b> · {check.reason}</p>}</details>}
      </div>
    </div>
    <footer className="paper-reader-footer"><details><summary>Source, licence and extraction limits</summary>{info && <><p>{info.author || "Author metadata unavailable"}</p><p>{info.source.originalName ?? info.source.pmcid} · {info.engine}</p>{info.source.url && <button className="text-button" onClick={() => void request("external", { url: info.source.url }).catch((e) => setError(e.message))}>Open original article ↗</button>}{info.source.license && <p>{info.source.license.label} · {info.source.license.text}</p>}<p className="file-digest">Original SHA-256: {paper.sourceSha256}<br />Extracted content SHA-256: {paper.contentSha256}</p>{info.limitations.map((limit) => <p key={limit}>{limit}</p>)}</>}</details><p>Importing and previewing are local. Passages requested by the agent go to your connected provider.</p></footer>
  </section></div>;
}
