import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  FileText,
  Leaf,
  Moon,
  Pill,
  Heart,
  Stethoscope,
  LockKeyhole,
  Check,
  Sparkles,
  Languages,
  ShieldCheck,
  MessageCircle,
} from "lucide-react";

/** Shared wordmark for the public site and chat. */
export function Brand() {
  return (
    <span className="ns-brand">
      <span className="ns-mark">
        <Plus size={21} strokeWidth={2.5} />
      </span>
      nutriti<span>scan</span>
      <i>°</i>
    </span>
  );
}

/** The strip that scrolls under the hero. Duplicated once for a seamless loop. */
const TOPICS = [
  [Stethoscope, "Clinical context"],
  [Pill, "Medication review"],
  [Leaf, "Care coordination"],
  [Moon, "Shift handoffs"],
  [Heart, "Discharge follow-up"],
  [FileText, "Documentation"],
] as const;

const BENTO = [
  {
    icon: Sparkles,
    tone: "lime",
    title: "One patient, scattered context",
    body: "The planned layer would gather authorized notes, medicines, labs and prior visits into a source-linked brief, so a care team can review the whole story faster.",
    tag: "Planned · record synthesis",
  },
  {
    icon: Stethoscope,
    tone: "plain",
    title: "Documentation that takes over the day",
    body: "Draft visit notes, summaries and patient instructions from approved context. A clinician checks and signs every clinical document before it enters a record.",
    tag: "Planned · clinician-approved drafts",
  },
  {
    icon: Languages,
    tone: "plain",
    title: "Handoffs that lose the next step",
    body: "Prepare a structured handoff or discharge draft with medication changes, pending tests, warning signs and named follow-up tasks for the team to confirm.",
    tag: "Planned · handoffs and discharge",
  },
  {
    icon: ShieldCheck,
    tone: "plain",
    title: "Results waiting for an owner",
    body: "Surface results and follow-up items that may need attention, show their source, and route them to the responsible team for review instead of silently closing the loop.",
    tag: "Planned · human-owned follow-up",
  },
  {
    icon: MessageCircle,
    tone: "plain",
    title: "Prior authorization paperwork",
    body: "Where prior authorization is required, assemble supporting facts and draft the request from approved records. Staff review accuracy and decide what is submitted.",
    tag: "Planned · administrative support",
  },
  {
    icon: MessageCircle,
    tone: "wide",
    title: "An agentic layer across the workflow",
    body: "A supervisor would assign bounded tasks to specialist agents, track source and action history, and pause for a qualified person before any clinical or external action.",
    tag: "Vision · connected, auditable, supervised",
  },
] as const;

const STEPS = [
  [
    "01",
    "Connect approved systems",
    "A hospital chooses which records and tools the layer can access. Access is limited to the team, task and patient it is authorized for.",
  ],
  [
    "02",
    "Let agents prepare the work",
    "A supervisor routes a task to focused agents that collect context, draft a summary or flag a missing next step with links back to the record.",
  ],
  [
    "03",
    "Keep the care team in control",
    "Clinicians and staff review, edit and approve. The intended workflow records who did what and escalates uncertainty rather than making an unreviewed decision.",
  ],
] as const;

export default function ProductLanding() {
  return (
    <div className="ns-marketing nl-root">
      <div className="nl-aurora" aria-hidden />
      <header className="nl-nav">
        <Link href="/" aria-label="NutritiScan home">
          <Brand />
        </Link>
        <nav aria-label="Main navigation">
          <a href="#engine">Hospital problems</a>
          <a href="#how">How it works</a>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <div className="nl-nav-actions">
          <Link className="nl-cta" href="/research">
            Research
          </Link>
          <Link className="nl-cta" href="/chat">
            Start a conversation <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      <main>
        <section className="nl-hero" id="top">
          <p className="nl-positioning">Agentic layer on medical data</p>
          <span className="nl-badge">
            <i /> Building the agentic layer for healthcare
          </span>
          <h1>
            Hospital work,
            <br />
            connected by <em>agents that know when to ask.</em>
          </h1>
          <p>
            NutritiScan is building an agentic layer for the work between hospital
            systems: gathering patient context, preparing documentation, tracking
            handoffs and keeping follow-up visible. The public health chat is our
            first prototype; hospital integrations are still on the roadmap.
          </p>
          <div className="nl-hero-actions">
            <Link href="/chat" className="nl-cta nl-cta-lg">
              Try the current health chat <ArrowRight size={17} />
            </Link>
          </div>
          <ul className="nl-trust">
            <li>
              <Check size={13} /> Public prototype available
            </li>
            <li>
              <FileText size={13} /> Source-linked answers in chat
            </li>
            <li>
              <LockKeyhole size={13} /> Human review is part of the plan
            </li>
          </ul>

          <div className="nl-preview">
            <div className="nl-preview-bar">
              <span className="nl-dot" />
              <span>Hospital workflow concept</span>
              <b>Future workflow · illustration</b>
            </div>
            <div className="nl-preview-grid">
              <div className="nl-thread">
                <p className="nl-ask">
                  What still needs to happen before this patient goes home?
                </p>
                <div className="nl-reply">
                  <span className="nl-avatar">n.</span>
                  <div>
                    <div className="nl-steps">
                      <span>Gathered approved context</span>
                      <span>Found pending tasks</span>
                      <span>Prepared a draft</span>
                    </div>
                    <b>Here is a draft for the care team to review.</b>
                    <p>
                      Medication changes, an outstanding result and a follow-up
                      appointment are listed with their record sources. The
                      responsible clinician confirms the plan before discharge.
                    </p>
                    <div className="nl-source">
                      <FileText size={12} /> Source-linked record summary
                      <ArrowUpRight size={11} />
                    </div>
                    <small>
                      Concept only · no hospital record connected
                    </small>
                  </div>
                </div>
                <div className="nl-composer">
                  Ask about a patient workflow…
                  <span>
                    <ArrowRight size={16} />
                  </span>
                </div>
              </div>
              <aside className="nl-context" aria-label="Preview of agent activity">
                <span className="nl-eyebrow">PLANNED AGENT ACTIVITY</span>
                <p className="nl-context-title">A reviewable workflow.</p>
                <div>
                  <ShieldCheck size={15} />
                  <span>
                    <b>Read approved context</b>
                    <small>Only permitted patient data</small>
                  </span>
                  <Check size={13} />
                </div>
                <div>
                  <Stethoscope size={15} />
                  <span>
                    <b>Supervisor assigned tasks</b>
                    <small>Records · discharge · follow-up</small>
                  </span>
                  <Check size={13} />
                </div>
                <div>
                  <FileText size={15} />
                  <span>
                    <b>Sent draft for review</b>
                    <small>Clinician confirms the next step</small>
                  </span>
                  <Check size={13} />
                </div>
                <p>Future hospital workflow concept · not available in the public chat.</p>
              </aside>
            </div>
          </div>
        </section>

        <section className="nl-marquee" aria-label="Hospital workflows we are exploring">
          <div>
            {[...TOPICS, ...TOPICS].map(([Icon, label], index) => (
              <span key={`${label}-${index}`} aria-hidden={index >= TOPICS.length}>
                <Icon size={15} strokeWidth={1.6} /> {label}
              </span>
            ))}
          </div>
        </section>

        <section className="nl-bento" id="engine">
          <div className="nl-section-head">
            <span className="nl-eyebrow">WHERE HOSPITAL TEAMS LOSE TIME</span>
            <h2>
              Make the next step visible,
              <br />
              with the care team in control.
            </h2>
            <p>
              Documentation burden, care transitions and prior authorization are
              documented by <a className="underline" href="https://effectivehealthcare.ahrq.gov/sites/default/files/related_files/documentation-burden-prepub-technical-brief.pdf">AHRQ</a>,{" "}
              <a className="underline" href="https://www.ahrq.gov/patient-safety/patients-families/engagingfamilies/strategy4/index.html">AHRQ&apos;s discharge guidance</a> and{" "}
              <a className="underline" href="https://www.ama-assn.org/practice-management/prior-authorization/fixing-prior-auth-nearly-40-prior-authorizations-week-way">the AMA</a>.
              We are exploring supervised agent workflows around work that can
              be drafted, organized and checked by a person.
            </p>
          </div>
          <div className="nl-bento-grid">
            {BENTO.map(({ icon: Icon, tone, title, body, tag }) => (
              <article key={title} className={`nl-card nl-${tone}`}>
                <Icon size={20} strokeWidth={1.6} />
                <h3>{title}</h3>
                <p>{body}</p>
                <span>{tag}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="nl-how" id="how">
          <div className="nl-section-head">
            <span className="nl-eyebrow">HOW IT WORKS</span>
            <h2>How the hospital layer is intended to work.</h2>
          </div>
          <ol>
            {STEPS.map(([number, title, body]) => (
              <li key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="nl-privacy">
          <div>
            <LockKeyhole size={24} strokeWidth={1.4} />
            <h2>Health data needs a clear boundary.</h2>
            <p>
              Today’s public chat stores history, profile details and meal notes
              in your browser. Messages and recent context go to our server and
              may be processed by a configured AI provider. There is no hospital
              record connection today. Any future integration would require
              authorized access, clear data handling and hospital review.
            </p>
            <Link href="/privacy">
              Read how your data is handled <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="nl-limits">
            <span className="nl-eyebrow">CURRENT SCOPE</span>
            <ul>
              <li>The live product is an educational health chat for adults 18+.</li>
              <li>Hospital connections and workflow automation are planned.</li>
              <li>No AI output should become a clinical decision without review.</li>
              <li>The chat is not diagnosis, prescribing or emergency care.</li>
            </ul>
          </div>
        </section>

        <section className="nl-close">
          <span className="nl-eyebrow">THE FIRST STEP IS LIVE</span>
          <h2>
            A health conversation is <em>where we start.</em>
          </h2>
          <Link className="nl-cta nl-cta-lg" href="/chat">
            Try the public health chat <ArrowRight size={17} />
          </Link>
          <p>Free early access · hospital workflows are a product direction, not a live service.</p>
        </section>
      </main>

      <footer className="nl-footer">
        <Brand />
        <span>Building the missing layer between health data and the next action.</span>
        <div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms & limitations</Link>
          <Link href="/chat">Try the health chat</Link>
        </div>
      </footer>
    </div>
  );
}
