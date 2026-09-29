"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Check, FileText, RotateCcw } from "lucide-react";
import {
  applyWorkflowEvent,
  INITIAL_CASE,
  workflowStatus,
  type PendingResultCase,
  type ReviewDecision,
  type WorkflowEvent,
} from "@/lib/discharge/workflow";

const STATUS_TEXT = {
  "needs-owner": "Needs an owner",
  "awaiting-result": "Waiting for the lab",
  "needs-review": "Needs clinician review",
  "needs-message": "Needs an approved update",
  "needs-delivery": "Ready to record delivery",
  closed: "Closed with a review trail",
} as const;

const field = "mt-2 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--emerald)]";
const card = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6";
const action = "rounded-xl bg-[var(--emerald)] px-4 py-2.5 text-sm font-semibold text-[#07130c] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--emerald)]";

export default function DischargeDemo() {
  const [caseState, setCaseState] = useState<PendingResultCase>(INITIAL_CASE);
  const [owner, setOwner] = useState("");
  const [deadline, setDeadline] = useState("");
  const [decision, setDecision] = useState<ReviewDecision>("contact-patient");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("Your test result is available. Please contact the care team using the number on your discharge papers to discuss the reviewed result and next steps.");
  const [error, setError] = useState("");
  const status = workflowStatus(caseState);

  function act(event: WorkflowEvent) {
    try {
      const next = applyWorkflowEvent(caseState, event, new Date().toISOString());
      setCaseState(next);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This step could not be completed.");
    }
  }

  function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    act({ type: "assign", owner, deadline });
  }

  function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    act({ type: "review", clinician: caseState.owner ?? "", decision, note });
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    act({ type: "approve-message", approvedBy: caseState.owner ?? "", message });
  }

  function reset() {
    setCaseState(INITIAL_CASE);
    setOwner("");
    setDeadline("");
    setDecision("contact-patient");
    setNote("");
    setError("");
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
            Follow a fictional test from discharge to an assigned owner, clinical review and a documented outcome. Every step below is a local simulation. No hospital system is connected and no patient message is sent.
          </p>
        </section>

        <div className="mt-9 grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
          <div className="space-y-5">
            <section className={card} aria-labelledby="case-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-dim)]">Fictional case · SYN-2047</p>
                  <h2 id="case-heading" className="mt-2 text-xl font-semibold">One test is pending at discharge</h2>
                </div>
                <span className={`rounded-full border border-[var(--border-strong)] px-3 py-1 text-xs ${status === "closed" ? "text-[var(--emerald)]" : "text-[var(--amber)]"}`} role="status">
                  {STATUS_TEXT[status]}
                </span>
              </div>
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                <div><dt className="text-[var(--text-dim)]">Patient</dt><dd className="mt-1 font-medium">Fictional adult patient</dd></div>
                <div><dt className="text-[var(--text-dim)]">Discharged</dt><dd className="mt-1 font-medium">28 Sep 2026</dd></div>
                <div><dt className="text-[var(--text-dim)]">Pending test</dt><dd className="mt-1 font-medium">Urine culture</dd></div>
              </dl>
              <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"><FileText size={14} /> Source · synthetic discharge note, item 4</p>
                <p className="mt-2 text-sm leading-6">“Urine culture collected before discharge. Result pending; treating team to review when available.”</p>
              </div>
              {caseState.resultArrived && (
                <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"><FileText size={14} /> Source · synthetic lab report SYN-LAB-102</p>
                  <p className="mt-2 text-sm leading-6">Result: no growth at 48 hours. This fictional value is for workflow demonstration only.</p>
                </div>
              )}
            </section>

            <section className={card} aria-labelledby="workflow-heading">
              <div className="flex items-center justify-between gap-3">
                <h2 id="workflow-heading" className="text-xl font-semibold">Work the case</h2>
                <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"><RotateCcw size={13} /> Start over</button>
              </div>
              {error && <p role="alert" className="mt-4 rounded-lg border border-[var(--rose)] p-3 text-sm text-[var(--rose)]">{error}</p>}

              {status === "needs-owner" && (
                <form onSubmit={submitAssignment} className="mt-6 space-y-4">
                  <Step number="01" title="Assign a responsible clinician" description="A test cannot be followed up without an owner and review deadline." />
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
                  <button type="submit" className={action}>Confirm assignment</button>
                </form>
              )}

              {status === "awaiting-result" && (
                <div className="mt-6 space-y-4">
                  <Step number="02" title="Wait for the lab result" description={`${caseState.owner} owns review by ${caseState.deadline}. A live integration would detect the result; this demo simulates arrival.`} />
                  <button type="button" onClick={() => act({ type: "result-arrived" })} className={action}>Simulate result arrival</button>
                </div>
              )}

              {status === "needs-review" && (
                <form onSubmit={submitReview} className="mt-6 space-y-4">
                  <Step number="03" title="Record the clinician's review" description="The agent can surface the result; only the assigned clinician decides the follow-up." />
                  <label className="block text-sm">Decision
                    <select value={decision} onChange={(event) => setDecision(event.target.value as ReviewDecision)} className={field}>
                      <option value="contact-patient">Patient contact required</option>
                      <option value="no-contact-needed">No patient contact needed</option>
                    </select>
                  </label>
                  <label className="block text-sm">Clinical review note
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} className={field} rows={3} required placeholder="Record why this follow-up decision was made in the synthetic case." />
                  </label>
                  <button type="submit" className={action}>Confirm fictional review</button>
                </form>
              )}

              {status === "needs-message" && (
                <form onSubmit={submitMessage} className="mt-6 space-y-4">
                  <Step number="04" title="Approve the patient update" description="Review the wording before the workflow can record any delivery." />
                  <label className="block text-sm">Draft message
                    <textarea value={message} onChange={(event) => setMessage(event.target.value)} className={field} rows={4} required />
                  </label>
                  <button type="submit" className={action}>Approve draft in demo</button>
                </form>
              )}

              {status === "needs-delivery" && (
                <div className="mt-6 space-y-4">
                  <Step number="05" title="Verify delivery" description="This button records a fictional delivery receipt. It does not send a message." />
                  <blockquote className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm leading-6 text-[var(--text-muted)]">{caseState.approvedMessage}</blockquote>
                  <button type="button" onClick={() => act({ type: "record-delivery" })} className={action}>Record simulated delivery</button>
                </div>
              )}

              {status === "closed" && (
                <div className="mt-6 rounded-xl border border-[var(--emerald)]/50 bg-[var(--emerald)]/10 p-5">
                  <div className="flex items-center gap-2 font-semibold text-[var(--emerald)]"><Check size={18} /> Synthetic case closed</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">A clinician review is recorded{caseState.delivered ? ", and the approved patient update has a simulated delivery receipt" : " with no patient contact required"}. The history remains visible for review.</p>
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-5">
            <section className={card} aria-labelledby="trail-heading">
              <h2 id="trail-heading" className="text-lg font-semibold">Review trail</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Every transition has a reason and an actor. In this demo, you are simulating those actors.</p>
              <ol className="mt-5 space-y-4 text-sm">
                <li className="border-l-2 border-[var(--emerald)] pl-4"><b>Source received</b><p className="mt-1 text-[var(--text-muted)]">Synthetic discharge note identifies one pending test.</p></li>
                {caseState.history.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="border-l-2 border-[var(--border-strong)] pl-4">
                    <b>{entry.description}</b><p className="mt-1 text-xs text-[var(--text-dim)]">{new Date(entry.at).toLocaleString()}</p>
                  </li>
                ))}
              </ol>
            </section>
            <section className={card}>
              <h2 className="text-lg font-semibold">What this proves</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">The workflow cannot close merely because a model saw a result. It needs an assigned owner and documented clinical review. Patient contact needs an approved message and a delivery record.</p>
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">Actual record extraction, user identity, durable storage, hospital access, messaging and clinical validation are future milestones.</p>
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
