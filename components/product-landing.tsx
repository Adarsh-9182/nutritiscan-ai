import Link from "next/link";
import {
  ArrowRight,
  Bell,
  FileText,
  Languages,
  LockKeyhole,
  NotebookPen,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import HomeComposer from "./home-composer";
import HomeDemo from "./home-demo";

/** The NutritiScan mark: a leaf-shaped pulse on deep green, with a saffron dot. */
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg
      className="ns-logo-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="9" fill="#17392f" />
      <path
        d="M7 17.5h4.2l2.3-5.5 3.6 10 2.6-6.2h5.3"
        fill="none"
        stroke="#f4f1e6"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24.6" cy="9.4" r="2.6" fill="#f08a24" />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="ns-brand">
      <Mark />
      <span className="ns-wordmark">
        nutriti<b>scan</b>
      </span>
    </span>
  );
}

const FEATURES = [
  {
    icon: Stethoscope,
    title: "Ask anything about your health",
    text: "Symptoms, reports, diet, sleep, medicines. Clear answers in plain language, with the questions to take to your doctor.",
  },
  {
    icon: FileText,
    title: "Understands your reports",
    text: "Add a lab report and see what is in or out of range, how it changed over time, and what to ask next.",
  },
  {
    icon: NotebookPen,
    title: "Remembers your day",
    text: "Tell it “do roti aur dal khayi” or “slept 6 hours”. It keeps a daily log and points out patterns.",
  },
  {
    icon: Bell,
    title: "Reminds you",
    text: "Medicine and check-up reminders in your calendar or on Telegram, set from a single sentence.",
  },
];

export default function ProductLanding() {
  return (
    <div className="hm">
      <div className="hm-glow" aria-hidden="true" />
      <header className="hm-nav">
        <Link href="/?home" aria-label="NutritiScan home">
          <Brand />
        </Link>
        <nav aria-label="Main navigation">
          <a href="#features">Features</a>
          <a href="#safety">Safety</a>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <div className="hm-nav-actions">
          <Link href="/workspace?login" className="hm-link">
            Log in
          </Link>
          <Link href="/workspace" className="hm-btn">
            Sign up free
          </Link>
        </div>
      </header>

      <main>
        <section className="hm-hero">
          <span className="hm-badge">
            <Languages size={14} /> Made for India · English, हिंदी, Hinglish
          </span>
          <h1>
            Your health questions,
            <br />
            <span>answered clearly.</span>
          </h1>
          <p>
            An AI health companion that knows your reports, keeps your daily log
            and checks every message for emergencies first.
          </p>
          <HomeComposer />
          <p className="hm-fine">
            Free. No sign-up needed to ask. Not a doctor, and not for
            emergencies: call 112.
          </p>
        </section>

        <section className="hm-showcase" aria-label="See it work">
          <HomeDemo />
          <p className="hm-caption">Examples with fictional data</p>
        </section>

        <section className="hm-features" id="features">
          <h2>One companion for everyday health</h2>
          <div className="hm-grid">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <span className="hm-icon">
                  <Icon size={20} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="hm-safety" id="safety">
          <div>
            <h2>Safety runs before the AI does</h2>
            <p>
              Every message is checked for warning signs, in English, Hindi and
              Hinglish, before any model sees it. Answers that drift into doses
              or diagnoses are stopped before they reach your screen.
            </p>
          </div>
          <ul>
            <li>
              <ShieldCheck size={18} /> Emergency guidance comes first, every
              time
            </li>
            <li>
              <Stethoscope size={18} /> No prescriptions, doses or diagnoses
            </li>
            <li>
              <LockKeyhole size={18} /> Records encrypted; you choose what the
              AI can read
            </li>
          </ul>
        </section>

        <section className="hm-cta">
          <h2>Start with one question.</h2>
          <Link href="/workspace?guest" className="hm-btn big">
            Open NutritiScan <ArrowRight size={17} />
          </Link>
        </section>
      </main>

      <footer className="hm-footer">
        <Brand />
        <p>
          Health education and organisation, not medical advice. In an emergency
          call 112.
        </p>
        <nav aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </div>
  );
}
