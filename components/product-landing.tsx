import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Activity,
  FileText,
  Heart,
  ShieldCheck,
  Check,
  Sparkles,
  CalendarDays,
  LockKeyhole,
  Plus,
} from "lucide-react";

export function Brand() {
  return (
    <span className="ns-brand">
      <span className="ns-mark">
        <Plus size={22} strokeWidth={3} />
      </span>
      nutriti<span>scan</span>
      <i>°</i>
    </span>
  );
}

export default function ProductLanding() {
  return (
    <div className="ns-marketing">
      <header className="ns-public-nav">
        <Link href="/" aria-label="NutritiScan home">
          <Brand />
        </Link>
        <nav aria-label="Main navigation">
          <a href="#how">How it works</a>
          <a href="#built-for-you">Made for you</a>
          <Link href="/privacy">Your privacy</Link>
        </nav>
        <Link className="ns-button ns-dark" href="/workspace">
          Open workspace <ArrowUpRight size={16} />
        </Link>
      </header>
      <main>
        <section className="ns-hero">
          <div className="ns-hero-copy">
            <span className="ns-eyebrow">
              <span className="ns-live-dot" /> A LITTLE CLARITY. A HEALTHIER
              EVERYDAY.
            </span>
            <h1>
              Your health.
              <br />
              Finally, <em>connected.</em>
            </h1>
            <p>
              Make sense of your reports, keep your story together, and walk
              into your next doctor visit prepared.
            </p>
            <div className="ns-actions">
              <Link href="/workspace" className="ns-button ns-dark">
                Start your health story <ArrowRight size={17} />
              </Link>
              <Link href="/workspace?demo=1" className="ns-text-button">
                Explore the demo <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="ns-hero-notes">
              <span>
                <Check size={15} /> Free early access
              </span>
              <span>
                <Check size={15} /> You control your records
              </span>
            </div>
          </div>
          <div
            className="ns-hero-art"
            aria-label="Illustration of the workspace using fictional health data"
          >
            <div className="ns-art-orbit" />
            <div className="ns-art-orbit second" />
            <span className="ns-art-label">YOUR HEALTH, IN PERSPECTIVE</span>
            <div className="ns-floating-card ns-report-art">
              <div className="ns-row">
                <span className="ns-icon soft">
                  <FileText size={19} />
                </span>
                <span>
                  <b>Wellness panel</b>
                  <small>Fictional sample · 10 Sep</small>
                </span>
                <span className="ns-pill">Reviewed by you</span>
              </div>
              <div className="ns-art-result">
                <span>Hemoglobin</span>
                <b>
                  14.2 <small>g/dL</small>
                </b>
              </div>
              <div className="ns-range-track">
                <i style={{ left: "48%" }} />
              </div>
              <div className="ns-row ns-between">
                <small>Report range: 13–17</small>
                <span className="ns-green">Within range</span>
              </div>
            </div>
            <div className="ns-floating-card ns-answer-art">
              <span className="ns-icon dark">
                <Sparkles size={18} />
              </span>
              <div>
                <b>A clearer picture starts here.</b>
                <p>
                  Your reports, the context behind them, and the questions worth
                  bringing to your doctor.
                </p>
                <span className="ns-source">
                  SOURCE-LINKED INFORMATION <ArrowUpRight size={12} />
                </span>
              </div>
            </div>
            <div className="ns-mini-float">
              <Heart size={19} />
              <span>
                One place.
                <br />
                <b>Your whole story.</b>
              </span>
            </div>
            <span className="ns-art-disclaimer">
              Illustrative data · not a medical assessment
            </span>
          </div>
        </section>
        <div className="ns-value-strip">
          <span>
            <FileText /> Understand your reports
          </span>
          <span>
            <Activity /> See your history clearly
          </span>
          <span>
            <CalendarDays /> Stay ready for your next visit
          </span>
          <span>
            <LockKeyhole /> Keep control of your data
          </span>
        </div>
        <section className="ns-public-section" id="how">
          <div className="ns-section-intro">
            <span className="ns-eyebrow">LESS GUESSWORK. MORE CONTEXT.</span>
            <h2>
              From a confusing report
              <br />
              to a clearer conversation.
            </h2>
            <p>Small, thoughtful tools for the moments between appointments.</p>
          </div>
          <div className="ns-feature-grid">
            {[
              [
                "01",
                "Bring your reports together",
                "Import a text-based PDF or enter results. Check every value, unit and reference range before saving.",
                FileText,
              ],
              [
                "02",
                "Understand what is recorded",
                "See results against your own report’s ranges, with explanations linked to their sources.",
                Activity,
              ],
              [
                "03",
                "Make your next visit count",
                "Export a clear summary and keep your own follow-up list. Your clinician makes the medical decisions.",
                CalendarDays,
              ],
            ].map(([n, title, copy, Icon]) => {
              const I = Icon as typeof FileText;
              return (
                <article key={String(n)} className="ns-feature">
                  <div className="ns-row ns-between">
                    <span className="ns-step">{String(n)}</span>
                    <I size={24} />
                  </div>
                  <h3>{String(title)}</h3>
                  <p>{String(copy)}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section className="ns-manifesto" id="built-for-you">
          <div>
            <span className="ns-eyebrow">BUILT AROUND A PERSON. YOU.</span>
            <h2>
              Health information should
              <br />
              feel <em>human.</em>
            </h2>
            <p>
              A thoughtful workspace for your records and questions. No invented
              health scores. No pretending an algorithm is your doctor.
            </p>
            <Link href="/workspace?demo=1" className="ns-button ns-dark">
              Take a look inside <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="ns-trust-list">
            <article>
              <ShieldCheck />
              <div>
                <h3>Your facts stay your facts.</h3>
                <p>Nothing is added to your record until you confirm it.</p>
              </div>
            </article>
            <article>
              <LockKeyhole />
              <div>
                <h3>Privacy is part of the product.</h3>
                <p>
                  Account records are encrypted on the server. Export them or
                  delete your account from Settings.
                </p>
              </div>
            </article>
            <article>
              <Heart />
              <div>
                <h3>Care stays with your clinician.</h3>
                <p>
                  NutritiScan supports understanding and preparation. It does
                  not diagnose, prescribe or replace medical care.
                </p>
              </div>
            </article>
          </div>
        </section>
        <section className="ns-bottom-cta">
          <span className="ns-eyebrow">A BETTER PLACE TO START</span>
          <h2>
            Let’s make health
            <br />a little less overwhelming.
          </h2>
          <Link href="/workspace" className="ns-button ns-dark">
            Create your workspace <ArrowRight size={17} />
          </Link>
          <p>Early access · adults 18+ · records and education</p>
        </section>
      </main>
      <footer className="ns-public-footer">
        <Brand />
        <span>Thoughtfully built. Always a work in progress.</span>
        <div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms & scope</Link>
          <a href="https://github.com/Adarsh-9182/nutritiscan-ai">
            GitHub <ArrowUpRight size={12} />
          </a>
        </div>
      </footer>
    </div>
  );
}
