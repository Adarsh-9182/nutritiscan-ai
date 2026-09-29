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
  [Stethoscope, "Symptoms"],
  [Pill, "Medicines"],
  [Leaf, "Nutrition"],
  [Moon, "Sleep"],
  [Heart, "Wellbeing"],
  [FileText, "Lab results"],
] as const;

const BENTO = [
  {
    icon: Sparkles,
    tone: "lime",
    title: "A supervisor and focused agents",
    body: "With hosted AI connected, a supervisor routes supported questions to Nutrition, Lab or Doctor agents and checks the answer against published references. The chat shows who contributed.",
    tag: "Educational support · engine status shown",
  },
  {
    icon: Stethoscope,
    tone: "plain",
    title: "Doctor and specialist agents",
    body: "Supported questions can be routed to Doctor, Nutrition, Lab, Fitness or Coach specialists, then brought together by the supervisor.",
    tag: "Specialists · supervised response",
  },
  {
    icon: Languages,
    tone: "plain",
    title: "Hinglish bhi chalega",
    body: "Poochho “neend kyu nahi aati” and the answer comes back in the language you asked in — Indian meals and portions included.",
    tag: "English · हिन्दी · Hinglish",
  },
  {
    icon: ShieldCheck,
    tone: "plain",
    title: "Urgent signs checked first",
    body: "Deterministic checks run before agent reasoning and can stop the response when an urgent-care pattern is detected.",
    tag: "Safety checks · not a guarantee",
  },
  {
    icon: MessageCircle,
    tone: "plain",
    title: "A conversation that keeps context",
    body: "Your recent chat, profile and meal notes can help the agents follow what you mean across turns.",
    tag: "Saved in this browser",
  },
  {
    icon: MessageCircle,
    tone: "wide",
    title: "References alongside the answer",
    body: "When published references are used, the chat shows the source notes that informed its explanation.",
    tag: "Source-linked education",
  },
] as const;

const STEPS = [
  [
    "01",
    "Bring the question",
    "A symptom you can’t explain, a medicine you want to understand, a habit you want to start. Plain words are enough.",
  ],
  [
    "02",
    "Add context when it helps",
    "Share relevant details in your message or add context to your local profile. Avoid information you do not want processed.",
  ],
  [
    "03",
    "Leave with a next step",
    "A clearer explanation, the sources behind it, and a follow-up you can save. Nothing is booked or sent for you.",
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
          <a href="#engine">The engine</a>
          <a href="#how">How it works</a>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <div className="nl-nav-actions">
          <Link className="nl-cta" href="/chat">
            Start a conversation <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      <main>
        <section className="nl-hero" id="top">
          <span className="nl-badge">
            <i /> Reference-backed help · free early access
          </span>
          <h1>
            Health questions,
            <br />
            answered like <em>a friend who did the reading.</em>
          </h1>
          <p>
            NutritiScan is an AI health companion for questions about symptoms,
            nutrition, medicines and everyday wellbeing. A supervisor can bring
            focused health agents together and show reference notes used in an
            answer. It is not a doctor, but can be a clearer place to start.
          </p>
          <div className="nl-hero-actions">
            <Link href="/chat" className="nl-cta nl-cta-lg">
              Start a conversation <ArrowRight size={17} />
            </Link>
          </div>
          <ul className="nl-trust">
            <li>
              <Check size={13} /> No card, no trial countdown
            </li>
            <li>
              <FileText size={13} /> Sources shown when used
            </li>
            <li>
              <LockKeyhole size={13} /> No advertising trackers
            </li>
          </ul>

          <div className="nl-preview">
            <div className="nl-preview-bar">
              <span className="nl-dot" />
              <span>Your health companion</span>
              <b>Illustrative preview</b>
            </div>
            <div className="nl-preview-grid">
              <div className="nl-thread">
                <p className="nl-ask">
                  I’ve been struggling with sleep for weeks. Where do I even
                  start?
                </p>
                <div className="nl-reply">
                  <span className="nl-avatar">n.</span>
                  <div>
                    <div className="nl-steps">
                      <span>Checked urgent signs</span>
                      <span>Read 2 references</span>
                      <span>Drafted an explanation</span>
                    </div>
                    <b>Let’s take this one step at a time.</b>
                    <p>
                      Sleep is about rhythm as much as hours — when you go to
                      bed, what breaks the night, and how the next day feels.
                      Let’s note what you’ve been seeing, then turn it into
                      questions worth asking a clinician.
                    </p>
                    <div className="nl-source">
                      <FileText size={12} /> Healthy sleep · MedlinePlus
                      <ArrowUpRight size={11} />
                    </div>
                    <small>
                      Illustrative conversation · not a medical assessment
                    </small>
                  </div>
                </div>
                <div className="nl-composer">
                  Tell me what’s on your mind…
                  <span>
                    <ArrowRight size={16} />
                  </span>
                </div>
              </div>
              <aside className="nl-context" aria-label="Preview of agent activity">
                <span className="nl-eyebrow">AGENT ACTIVITY</span>
                <p className="nl-context-title">A bounded workflow.</p>
                <div>
                  <ShieldCheck size={15} />
                  <span>
                    <b>Checked urgent signs</b>
                    <small>Deterministic checks run first</small>
                  </span>
                  <Check size={13} />
                </div>
                <div>
                  <Stethoscope size={15} />
                  <span>
                    <b>Supervisor selected agents</b>
                    <small>Doctor · Nutrition · Lab</small>
                  </span>
                  <Check size={13} />
                </div>
                <div>
                  <FileText size={15} />
                  <span>
                    <b>Added source notes</b>
                    <small>References shown when used</small>
                  </span>
                  <Check size={13} />
                </div>
                <p>Illustrative preview · agent availability depends on the configured model.</p>
              </aside>
            </div>
          </div>
        </section>

        <section className="nl-marquee" aria-label="Topics you can explore">
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
            <span className="nl-eyebrow">WHAT’S UNDER THE HOOD</span>
            <h2>
              See what shaped each answer,
              <br />
              with the sources in view.
            </h2>
            <p>
              An answer you can’t trace is just a rumour with better grammar.
              NutritiScan shows agent activity and reference notes when they
              contribute to an answer.
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
            <h2>Three steps. No forms to fill first.</h2>
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
            <h2>Personal questions deserve a private space.</h2>
            <p>
              Chat history, profile details and meal notes are stored in this
              browser. When you send a message, recent chat and the profile or
              meal context you provided are sent to NutritiScan’s server and
              may be processed by its configured AI provider. Don’t enter data
              you are not comfortable sharing.
            </p>
            <Link href="/privacy">
              Read how your data is handled <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="nl-limits">
            <span className="nl-eyebrow">HONEST LIMITS</span>
            <ul>
              <li>Educational support, not diagnosis or emergency care.</li>
              <li>Reference coverage is limited and still growing.</li>
              <li>AI can make mistakes — the sources are there to check.</li>
              <li>For adults 18+.</li>
            </ul>
          </div>
        </section>

        <section className="nl-close">
          <span className="nl-eyebrow">WE’RE STARTING WITH YOU</span>
          <h2>
            One question is <em>a good beginning.</em>
          </h2>
          <Link className="nl-cta nl-cta-lg" href="/chat">
            Meet your health companion <ArrowRight size={17} />
          </Link>
          <p>Free early access · no account required · for adults 18+.</p>
        </section>
      </main>

      <footer className="nl-footer">
        <Brand />
        <span>Made for the human behind the health data.</span>
        <div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms & limitations</Link>
          <Link href="/chat">Start a conversation</Link>
        </div>
      </footer>
    </div>
  );
}
