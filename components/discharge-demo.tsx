"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Check, FileText, RotateCcw } from "lucide-react";
import { extractPendingTests, SYNTHETIC_CASES } from "@/lib/discharge/extract";
import { DEMO_ACTORS, demoStorageKey, recordDemoEvent, restoreDemo, type RecordedEvent } from "@/lib/discharge/demo-store";
import {
  INITIAL_CASE,
  workflowStatus,
  type PendingResultCase,
  type ReviewDecision,
  type WorkflowEvent,
} from "@/lib/discharge/workflow";

const STATUS_TEXT = {
  "needs-source-review": "Needs source review",
  "needs-owner": "Needs an owner",
  "awaiting-result": "Waiting for the lab",
  "escalated-awaiting-result": "Escalated · waiting for result",
  "needs-review": "Needs clinician review",
  "needs-escalation-ack": "Needs escalation acknowledgement",
  "needs-message": "Needs an approved update",
  "needs-delivery": "Ready to record delivery",
  closed: "Closed with a review trail",
} as const;

const field = "mt-2 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--emerald)]";
const card = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6";
const action = "rounded-xl bg-[var(--emerald)] px-4 py-2.5 text-sm font-semibold text-[#07130c] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--emerald)]";
export default function DischargeDemo() {
  const [caseId, setCaseId] = useState(SYNTHETIC_CASES[0].id);
  const demoCase = SYNTHETIC_CASES.find((item) => item.id === caseId) ?? SYNTHETIC_CASES[0];
  const candidates = extractPendingTests(demoCase.document);
  const candidate = candidates[0];
  const [caseState, setCaseState] = useState<PendingResultCase>(INITIAL_CASE);
  const [events, setEvents] = useState<RecordedEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [testName, setTestName] = useState(extractPendingTests(SYNTHETIC_CASES[0].document)[0]?.testName ?? "");
  const [sourceReviewer, setSourceReviewer] = useState("");
  const [owner, setOwner] = useState("");
  const [deadline, setDeadline] = useState("");
  const [observedOn, setObservedOn] = useState("");
  const [escalationNote, setEscalationNote] = useState("");
  const [decision, setDecision] = useState<ReviewDecision>("contact-patient");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("Your test result is available. Please contact the care team using the number on your discharge papers to discuss the reviewed result and next steps.");
  const [error, setError] = useState("");
  const status = workflowStatus(caseState);

  useEffect(() => {
    try {
      const restored = restoreDemo(localStorage.getItem(demoStorageKey(caseId)), caseId);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore browser-only fictional state after hydration
      setCaseState(restored.state);
      setEvents(restored.events);
      setError(restored.error ?? "");
      if (restored.error) localStorage.removeItem(demoStorageKey(caseId));
    } catch {
      setError("Browser storage is unavailable. This demo will reset when you leave.");
    }
    setReady(true);
  }, [caseId]);

  function act(event: WorkflowEvent, actorId: string) {
    if (!ready) return;
    try {
      const next = recordDemoEvent(events, event, actorId, new Date().toISOString(), caseId);
      try {
        localStorage.setItem(demoStorageKey(caseId), next.serialized);
        setError("");
      } catch {
        setError("Browser storage is unavailable. Your simulated steps will last only until this page closes.");
      }
      setCaseState(next.state);
      setEvents(next.events);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This step could not be completed.");
    }
  }

  function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    act({ type: "assign", owner, deadline }, caseState.source?.reviewedBy ?? "");
  }

  function submitSourceReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (candidates.length !== 1 || !candidate) {
      setError("This demo needs exactly one pending-test candidate. Review all candidates before creating a case.");
      return;
    }
    act({ type: "confirm-source", source: candidate, testName }, sourceReviewer);
  }

  function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    act({ type: "review", decision, note }, caseState.owner ?? "");
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    act({ type: "approve-message", message }, caseState.owner ?? "");
  }

  function submitEscalation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    act({ type: "escalate-deadline", observedOn }, caseState.source?.reviewedBy ?? "");
  }

  function submitEscalationAck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    act({ type: "acknowledge-escalation", note: escalationNote }, caseState.source?.reviewedBy ?? "");
  }

  function selectCase(nextCaseId: string) {
    const nextCase = SYNTHETIC_CASES.find((item) => item.id === nextCaseId);
    if (!nextCase || nextCaseId === caseId) return;
    setReady(false);
    setCaseId(nextCaseId);
    setCaseState(INITIAL_CASE);
    setEvents([]);
    setTestName(extractPendingTests(nextCase.document)[0]?.testName ?? "");
    setSourceReviewer("");
    setOwner("");
    setDeadline("");
    setObservedOn("");
    setEscalationNote("");
    setDecision("contact-patient");
    setNote("");
    setError("");
  }

  function reset() {
    setCaseState(INITIAL_CASE);
    setEvents([]);
    setTestName(candidate?.testName ?? "");
    setSourceReviewer("");
    setOwner("");
    setDeadline("");
    setObservedOn("");
    setEscalationNote("");
    setDecision("contact-patient");
    setNote("");
    setError("");
    try { localStorage.removeItem(demoStorageKey(caseId)); }
    catch { setError("Browser storage could not be cleared. The demo may return after a refresh."); }
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-8 text-[var(--text)] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
            <ArrowLeft size={16} /> NutritiScan
          </Link>
          <span className="rounded-full border border-[var(--border-strong)] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[var(--emerald)]">
            Synthetic workflow demo
          </span>
        </header>

        <section className="mt-12 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-[var(--emerald)]">Discharge follow-up · first product slice</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Close the loop on a pending result.</h1>
          <p className="mt-5 text-base leading-7 text-[var(--text-muted)]">
            Work through fictional discharge cases from source review to a documented outcome. One case also demonstrates a missed deadline and human escalation. Extraction uses a simple rule, and demo steps are saved in this browser. No hospital system is connected and no patient message is sent.
          </p>
          <p className="mt-3 text-sm text-[var(--amber)]">Use fictional information only. Review notes and draft messages are saved in this browser.</p>
        </section>

        <section className={`${card} mt-9`} aria-label="Choose fictional case">
          <h2 className="text-lg font-semibold">Choose a fictional case</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {SYNTHETIC_CASES.map((item) => (
              <button key={item.id} type="button" onClick={() => selectCase(item.id)} aria-pressed={caseId === item.id}
                className={`rounded-xl border p-4 text-left ${caseId === item.id ? "border-[var(--emerald)] bg-[var(--emerald)]/10" : "border-[var(--border-strong)] hover:border-[var(--emerald)]"}`}>
                <span className="text-xs font-semibold text-[var(--emerald)]">{item.id}</span>
                <strong className="mt-1 block text-sm">{item.label}</strong>
                <span className="mt-2 block text-xs leading-5 text-[var(--text-muted)]">{item.scenario}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
          <div className="space-y-5">
            <section className={card} aria-labelledby="case-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-dim)]">Fictional case · {demoCase.id}</p>
                  <h2 id="case-heading" className="mt-2 text-xl font-semibold">A test candidate was found at discharge</h2>
                </div>
                <span className={`rounded-full border border-[var(--border-strong)] px-3 py-1 text-xs ${status === "closed" ? "text-[var(--emerald)]" : "text-[var(--amber)]"}`} role="status">
                  {STATUS_TEXT[status]}
                </span>
              </div>
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                <div><dt className="text-[var(--text-dim)]">Patient</dt><dd className="mt-1 font-medium">Fictional adult patient</dd></div>
                <div><dt className="text-[var(--text-dim)]">Discharged</dt><dd className="mt-1 font-medium">{demoCase.dischargedOn}</dd></div>
                <div><dt className="text-[var(--text-dim)]">Pending test</dt><dd className="mt-1 font-medium">{caseState.source?.testName ?? "Awaiting source review"}</dd></div>
              </dl>
              <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"><FileText size={14} /> Source · {demoCase.document.title}, page {candidate?.page ?? "?"}, line {candidate?.line ?? "?"}</p>
                <p className="mt-2 text-sm leading-6">“{candidate?.excerpt ?? "No pending-test line found."}”</p>
                <p className="mt-2 text-xs text-[var(--text-dim)]">Rule match · {caseState.source ? `reviewed by ${caseState.source.reviewedBy}${caseState.source.testName !== caseState.source.extractedTestName ? ` · corrected from ${caseState.source.extractedTestName}` : ""}` : "unconfirmed extraction"}</p>
                <details className="mt-4 border-t border-[var(--border)] pt-3 text-sm">
                  <summary className="cursor-pointer text-[var(--emerald)]">Read the full fictional source page</summary>
                  <ol className="mt-3 list-decimal space-y-1 pl-7 text-[var(--text-muted)]">
                    {demoCase.document.pages[0].split("\n").map((line, index) => (
                      <li key={`${index}-${line}`} className={index + 1 === candidate?.line ? "font-semibold text-[var(--text)]" : ""}>{line}</li>
                    ))}
                  </ol>
                </details>
              </div>
              {caseState.resultArrived && (
                <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"><FileText size={14} /> Source · {demoCase.result.title} {demoCase.result.documentId}</p>
                  <p className="mt-2 text-sm leading-6">{demoCase.result.testName}: {demoCase.result.text}</p>
                </div>
              )}
            </section>

            <section className={card} aria-labelledby="workflow-heading">
              <div className="flex items-center justify-between gap-3">
                <h2 id="workflow-heading" className="text-xl font-semibold">Work the case</h2>
                <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"><RotateCcw size={13} /> Start over</button>
              </div>
              {error && <p role="alert" className="mt-4 rounded-lg border border-[var(--rose)] p-3 text-sm text-[var(--rose)]">{error}</p>}

              {status === "needs-source-review" && (
                <form onSubmit={submitSourceReview} className="mt-6 space-y-4">
                  <Step number="01" title="Review the extracted test" description="Check the exact source line and correct the test name if the rule got it wrong. Assignment stays locked until you confirm." />
                  <label className="block text-sm">Extracted test name
                    <input value={testName} onChange={(event) => setTestName(event.target.value)} className={field} maxLength={120} required />
                    <span className="mt-2 block text-xs leading-5 text-[var(--text-dim)]">A corrected name must match the lab result before this demo can advance. Use Start over to review the source again.</span>
                  </label>
                  <label className="block text-sm">Reviewing coordinator
                    <select value={sourceReviewer} onChange={(event) => setSourceReviewer(event.target.value)} className={field} required>
                      <option value="">Choose a fictional reviewer</option>
                      <option value="Anika, discharge coordinator">Anika, discharge coordinator</option>
                      <option value="Ravi, discharge nurse">Ravi, discharge nurse</option>
                    </select>
                  </label>
                  <button type="submit" disabled={!ready} className={action}>Confirm source in demo</button>
                </form>
              )}

              {status === "needs-owner" && (
                <form onSubmit={submitAssignment} className="mt-6 space-y-4">
                  <Step number="02" title="Assign a responsible clinician" description="A test cannot be followed up without an owner and review deadline." />
                  <label className="block text-sm">Responsible clinician
                    <select value={owner} onChange={(event) => setOwner(event.target.value)} className={field} required>
                      <option value="">Choose a fictional clinician</option>
                      <option value="Dr Meera Shah">Dr Meera Shah</option>
                      <option value="Dr Arun Rao">Dr Arun Rao</option>
                    </select>
                  </label>
                  <label className="block text-sm">Review deadline
                    <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className={field} required />
                  </label>
                  <button type="submit" disabled={!ready} className={action}>Confirm assignment</button>
                </form>
              )}

              {(status === "awaiting-result" || status === "escalated-awaiting-result") && (
                <div className="mt-6 space-y-4">
                  <Step number="03" title="Wait for the lab result" description={`${caseState.owner} owns review by ${caseState.deadline}. A live integration would detect the result; this demo matches a fictional lab report to the reviewed test.`} />
                  {status === "escalated-awaiting-result" && <p className="rounded-xl border border-[var(--amber)] p-3 text-sm text-[var(--amber)]">The deadline was missed. This case stays open while the result is pending, even after a coordinator acknowledges the escalation.</p>}
                  {demoCase.requiresEscalation && !caseState.escalation && <p className="text-sm text-[var(--amber)]">In this fictional case, record the missed deadline below before the result appears.</p>}
                  <button type="button" disabled={!ready || (demoCase.requiresEscalation && !caseState.escalation)} onClick={() => act({ type: "result-arrived", testName: demoCase.result.testName }, DEMO_ACTORS["Fictional lab feed"].id)} className={`${action} disabled:cursor-not-allowed disabled:opacity-50`}>Match simulated lab result</button>
                </div>
              )}

              {status === "needs-review" && (
                <form onSubmit={submitReview} className="mt-6 space-y-4">
                  <Step number="04" title="Record the clinician's review" description="The agent can surface the result; only the assigned clinician decides the follow-up." />
                  <label className="block text-sm">Decision
                    <select value={decision} onChange={(event) => setDecision(event.target.value as ReviewDecision)} className={field}>
                      <option value="contact-patient">Patient contact required</option>
                      <option value="no-contact-needed">No patient contact needed</option>
                    </select>
                  </label>
                  <label className="block text-sm">Clinical review note
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} className={field} rows={3} maxLength={1000} required placeholder="Record why this follow-up decision was made in the synthetic case." />
                  </label>
                  <button type="submit" disabled={!ready} className={action}>Confirm fictional review</button>
                </form>
              )}

              {status === "needs-message" && (
                <form onSubmit={submitMessage} className="mt-6 space-y-4">
                  <Step number="05" title="Approve the patient update" description="Review the wording before the workflow can record any delivery." />
                  <label className="block text-sm">Draft message
                    <textarea value={message} onChange={(event) => setMessage(event.target.value)} className={field} rows={4} maxLength={600} required />
                  </label>
                  <button type="submit" disabled={!ready} className={action}>Approve draft in demo</button>
                </form>
              )}

              {status === "needs-escalation-ack" && (
                <div className="mt-6 space-y-4">
                  <Step number="05" title="Acknowledge the missed deadline" description="The clinical decision is recorded. A coordinator must document a human follow-up plan for the escalated exception before this case can close." />
                  <p className="text-sm text-[var(--amber)]">Complete the escalation form below to continue.</p>
                </div>
              )}

              {status === "needs-delivery" && (
                <div className="mt-6 space-y-4">
                  <Step number="06" title="Verify delivery" description="This button records a fictional delivery receipt. It does not send a message." />
                  <blockquote className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm leading-6 text-[var(--text-muted)]">{caseState.approvedMessage}</blockquote>
                  <button type="button" disabled={!ready} onClick={() => act({ type: "record-delivery" }, DEMO_ACTORS["Fictional delivery feed"].id)} className={action}>Record simulated delivery</button>
                </div>
              )}

              {status === "closed" && (
                <div className="mt-6 rounded-xl border border-[var(--emerald)]/50 bg-[var(--emerald)]/10 p-5">
                  <div className="flex items-center gap-2 font-semibold text-[var(--emerald)]"><Check size={18} /> Synthetic case closed</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">A clinician review is recorded{caseState.delivered ? ", and the approved patient update has a simulated delivery receipt" : " with no patient contact required"}. The history remains visible for review.</p>
                </div>
              )}
            </section>

            {caseState.owner && !caseState.review && !caseState.escalation && (
              <section className={card} aria-labelledby="escalation-heading">
                <h2 id="escalation-heading" className="text-lg font-semibold">Deadline exception</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">If the agreed review deadline passes without clinical review, record a fictional escalation. The hospital must define the real escalation policy.</p>
                <form onSubmit={submitEscalation} className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="min-w-48 flex-1 text-sm">Simulated date the miss was noticed
                    <input type="date" value={observedOn} onChange={(event) => setObservedOn(event.target.value)} className={field} min={caseState.deadline ?? undefined} required />
                  </label>
                  <button type="submit" disabled={!ready} className={action}>Escalate missed deadline</button>
                </form>
                <p className="mt-2 text-xs text-[var(--text-dim)]">Choose a date after {caseState.deadline}; this does not run an automatic clock or contact anyone.</p>
              </section>
            )}

            {caseState.escalation && (
              <section className={card} aria-labelledby="escalation-heading">
                <h2 id="escalation-heading" className="text-lg font-semibold">Escalation record</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Missed review deadline recorded on {caseState.escalation.observedOn}. The case remains open until a result is reviewed and all required follow-up is documented.</p>
                {caseState.escalation.acknowledgedBy ? (
                  <p className="mt-4 rounded-xl border border-[var(--border-strong)] p-4 text-sm">Acknowledged by {caseState.escalation.acknowledgedBy}: {caseState.escalation.note}</p>
                ) : (
                  <form onSubmit={submitEscalationAck} className="mt-4 space-y-3">
                    <label className="block text-sm">Human follow-up plan
                      <textarea value={escalationNote} onChange={(event) => setEscalationNote(event.target.value)} className={field} rows={3} maxLength={500} required placeholder="For this fictional case, record who will check the delayed result and how the team will follow up." />
                    </label>
                    <button type="submit" disabled={!ready} className={action}>Acknowledge in demo</button>
                  </form>
                )}
              </section>
            )}
          </div>

          <aside className="space-y-5">
            <section className={card} aria-labelledby="trail-heading">
              <h2 id="trail-heading" className="text-lg font-semibold">Review trail</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Every transition has a reason and an actor. In this demo, you are simulating those actors.</p>
              <ol className="mt-5 space-y-4 text-sm">
                <li className="border-l-2 border-[var(--emerald)] pl-4"><b>Candidate extracted</b><p className="mt-1 text-[var(--text-muted)]">Rule found {candidates.length} pending test{candidates.length === 1 ? "" : "s"} in a synthetic discharge note. No fact is confirmed yet.</p></li>
                {caseState.history.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="border-l-2 border-[var(--border-strong)] pl-4">
                    <b>{entry.description}</b><p className="mt-1 text-xs text-[var(--text-dim)]">{entry.actor.role} · {new Date(entry.at).toLocaleString()}</p>
                  </li>
                ))}
              </ol>
            </section>
            <section className={card}>
              <h2 className="text-lg font-semibold">What this proves</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">The workflow requires source review, an assigned owner and documented clinical review. A missed deadline creates an exception that a person must acknowledge. Patient contact needs an approved message and a delivery record.</p>
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">Roles here are simulated and browser storage can be edited or cleared. Verified identities, server audit, PDF/OCR extraction, hospital access, messaging and clinical validation are future milestones.</p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div>
      <span className="text-xs font-semibold tracking-widest text-[var(--emerald)]">STEP {number}</span>
      <h3 className="mt-2 text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{description}</p>
    </div>
  );
}
