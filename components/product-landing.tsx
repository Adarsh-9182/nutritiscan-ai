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
  Cpu,
  Languages,
  Bell,
  Activity,
  ShieldCheck,
  MessageCircle,
} from "lucide-react";

/** Shared with the workspace header — its styling stays with the app theme. */
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
  [FileText, "Lab reports"],
  [Bell, "Reminders"],
  [Activity, "Trends"],
] as const;

const BENTO = [
  {
    icon: Sparkles,
    tone: "lime",
    title: "A real AI engine, on by default",
    body: "Ask in your own words and get an answer written for you — grounded in published reference notes, with every source shown next to it.",
    tag: "Hosted engine",
  },
  {
    icon: Cpu,
    tone: "plain",
    title: "Or keep it entirely on your device",
    body: "Switch on the on-device model and the question never leaves the tab. Open weights, no API charges, one download.",
    tag: "WebGPU · optional",
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
    title: "Your records, your call",
    body: "Import a report, confirm the values, and pick which of them the companion is allowed to read. Nothing is shared on your behalf.",
    tag: "You hold the switch",
  },
  {
    icon: Bell,
    tone: "plain",
    title: "Reminders that actually reach you",
    body: "Draft a follow-up in chat, review it, then take it to your calendar or connect Telegram for a nudge at the right hour.",
    tag: "Calendar · Telegram",
  },
  {
    icon: MessageCircle,
    tone: "wide",
    title: "Walk in ready for the appointment",
    body: "Turn a month of notes, values and half-remembered worries into one brief you can hand over — or read off your phone.",
    tag: "Visit preparation",
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
    "Add only the context you choose",
    "Confirmed reports, daily notes and trends stay yours. You decide what the companion may read before it answers.",
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
          <Link href="/workspace?demo=1" className="nl-ghost">
            Live demo
          </Link>
          <Link className="nl-cta" href="/workspace">
            Open the app <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>

      <main>
        <section className="nl-hero" id="top">
          <span className="nl-badge">
            <i /> AI engine live · free early access
          </span>
          <h1>
            Health questions,
            <br />
            answered like <em>a friend who did the reading.</em>
          </h1>
          <p>
            NutritiScan is a health companion that explains things properly,
            keeps your reports in one place and shows you exactly where every
            answer came from. Not a doctor — a much better starting point than
            a search bar at 2am.
          </p>
          <div className="nl-hero-actions">
            <Link href="/workspace" className="nl-cta nl-cta-lg">
              Start a conversation <ArrowRight size={17} />
            </Link>
            <Link href="/workspace?demo=1" className="nl-ghost nl-ghost-lg">
              Take a look inside <ArrowUpRight size={15} />
            </Link>
          </div>
          <ul className="nl-trust">
            <li>
              <Check size={13} /> No card, no trial countdown
            </li>
            <li>
              <FileText size={13} /> Sources on every answer
            </li>
            <li>
              <LockKeyhole size={13} /> No advertising trackers
            </li>
          </ul>

          <div className="nl-preview">
            <div className="nl-preview-bar">
              <span className="nl-dot" />
              <span>Your health companion</span>
              <b>AI engine on</b>
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
              <aside className="nl-context" aria-label="Preview of record access">
                <span className="nl-eyebrow">YOUR CONTEXT</span>
                <p className="nl-context-title">Every source visible.</p>
                <div>
                  <FileText size={15} />
                  <span>
                    <b>Annual wellness panel</b>
                    <small>PDF import · confirmed by you</small>
                  </span>
                  <Check size={13} />
                </div>
                <div>
                  <Moon size={15} />
                  <span>
                    <b>Sleep & energy</b>
                    <small>Reference notes · MedlinePlus</small>
                  </span>
                  <Check size={13} />
                </div>
                <div>
                  <LockKeyhole size={15} />
                  <span>
                    <b>Companion access</b>
                    <small>You pick what it reads</small>
                  </span>
                  <Check size={13} />
                </div>
                <p>Illustrative preview. No provider connection is implied.</p>
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
              The engine is back on,
              <br />
              and it shows its working.
            </h2>
            <p>
              An answer you can’t trace is just a rumour with better grammar.
              NutritiScan keeps the model, the reference notes and your own
              records visibly apart.
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
              Hosted answers send your question and the published reference
              notes to the model provider — never your stored reports. Prefer
              nothing to leave the tab? Turn on the on-device model instead.
              Saved records are encrypted on the server, which can decrypt them
              to run the service.
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
          <Link className="nl-cta nl-cta-lg" href="/workspace">
            Meet your health companion <ArrowRight size={17} />
          </Link>
          <p>Free early access · no card · your records stay yours.</p>
        </section>
      </main>

      <footer className="nl-footer">
        <Brand />
        <span>Made for the human behind the health data.</span>
        <div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms & limitations</Link>
          <Link href="/workspace">Open the app</Link>
        </div>
      </footer>
    </div>
  );
}
