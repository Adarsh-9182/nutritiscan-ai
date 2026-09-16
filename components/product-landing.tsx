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
} from "lucide-react";
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
export default function ProductLanding() {
  return (
    <div className="ns-marketing ns-editorial">
      <header className="ns-public-nav">
        <Link href="/" aria-label="NutritiScan home">
          <Brand />
        </Link>
        <nav aria-label="Main navigation">
          <a href="#companion">The companion</a>
          <a href="#care">From questions to care</a>
          <Link href="/privacy">Your privacy</Link>
        </nav>
        <Link className="ns-button ns-dark" href="/workspace">
          Let’s talk <ArrowUpRight size={16} />
        </Link>
      </header>
      <main>
        <section className="ne-hero" id="companion">
          <div className="ne-hero-copy">
            <span className="ne-kicker">YOUR EVERYDAY HEALTH COMPANION</span>
            <h1>
              For the questions
              <br />
              between
              <br />
              <em>appointments.</em>
            </h1>
            <p>
              A symptom you can’t explain. A medicine you want to understand. A
              healthier habit you want to start.
              <br />
              Let’s make room for all of it.
            </p>
            <div className="ne-actions">
              <Link href="/workspace" className="ns-button ns-dark">
                Start a conversation <ArrowRight size={17} />
              </Link>
              <Link href="/workspace?demo=1">
                Take a look inside <ArrowUpRight size={15} />
              </Link>
            </div>
            <div className="ne-smallprint">
              <span>
                <Check size={13} /> Free early access
              </span>
              <span>
                <LockKeyhole size={12} /> No advertising trackers
              </span>
            </div>
          </div>
          <div className="ne-preview">
            <div className="ne-preview-top">
              <span className="ha-status-dot" /> A little space for your health{" "}
              <span>PRODUCT PREVIEW</span>
            </div>
            <div className="ne-preview-body">
              <span className="ne-kicker">START WHERE YOU ARE</span>
              <h2>
                How are you
                <br />
                <em>really feeling?</em>
              </h2>
              <div className="ne-example-question">
                I’ve been struggling with sleep. Where do I start?
              </div>
              <div className="ne-example-answer">
                <span className="ha-tiny-mark">n.</span>
                <div>
                  <b>Let’s take it one step at a time.</b>
                  <p>
                    We can explore sleep information, organise what you’ve
                    noticed, and prepare questions for your clinician.
                  </p>
                  <small>
                    Illustrative conversation · not a medical assessment
                  </small>
                </div>
              </div>
              <Link href="/workspace" className="ne-prompt">
                Tell me what’s on your mind…
                <span>
                  <ArrowRight size={18} />
                </span>
              </Link>
            </div>
            <div className="ne-preview-bottom">
              <span>YOUR QUESTIONS</span>
              <span>YOUR CONTEXT</span>
              <span>YOUR NEXT STEP</span>
            </div>
          </div>
        </section>
        <section className="ne-topics" aria-label="Topics to explore">
          <span>HEALTH IS MORE THAN A REPORT.</span>
          <div>
            {[
              [Stethoscope, "Symptoms"],
              [Pill, "Medicines"],
              [Leaf, "Nutrition"],
              [Moon, "Sleep"],
              [Heart, "Wellbeing"],
              [FileText, "Your records"],
            ].map(([Icon, label]) => {
              const I = Icon as typeof Heart;
              return (
                <Link key={String(label)} href="/workspace">
                  <I size={20} strokeWidth={1.4} />
                  {String(label)}
                </Link>
              );
            })}
          </div>
        </section>
        <section className="ne-care" id="care">
          <div>
            <span className="ne-kicker">
              A CONVERSATION THAT GOES SOMEWHERE
            </span>
            <h2>
              Understand a little more.
              <br />
              <em>Know what to ask next.</em>
            </h2>
            <p>
              NutritiScan brings educational references and your own records
              into one thoughtful workspace.
            </p>
          </div>
          <ol>
            {[
              [
                "01",
                "Bring your question",
                "Explore curated information about everyday health. Source links show where the reference notes come from.",
              ],
              [
                "02",
                "Add the context you choose",
                "Keep confirmed reports together, compare recorded values and prepare a visit brief.",
              ],
              [
                "03",
                "Choose your next step",
                "Review and save a follow-up to your care list. Nothing is booked or sent on your behalf.",
              ],
            ].map(([number, title, body]) => (
              <li key={number}>
                <span>{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="ne-privacy">
          <LockKeyhole size={26} strokeWidth={1.3} />
          <div>
            <h2>Personal questions deserve a private space.</h2>
            <p>
              Optional on-device AI runs in a compatible browser after a model
              download. Your conversation stays in the tab. Saved records are
              encrypted on the server, where the service can decrypt them.
            </p>
            <Link href="/privacy">
              Read how your data is handled <ArrowUpRight size={14} />
            </Link>
          </div>
          <span>
            YOUR HEALTH.
            <br />
            YOUR CONTROL.
          </span>
        </section>
        <section className="ne-close">
          <span className="ne-kicker">WE’RE STARTING WITH YOU</span>
          <h2>
            One question is
            <br />
            <em>a good beginning.</em>
          </h2>
          <Link className="ns-button ns-dark" href="/workspace">
            Meet your health companion <ArrowRight size={17} />
          </Link>
          <p>
            For adults 18+. Educational support, not a doctor or emergency
            service.
            <br />
            Early access · limited reference coverage · AI can make mistakes.
          </p>
        </section>
      </main>
      <footer className="ne-footer">
        <Brand />
        <span>Made for the human behind the health data.</span>
        <div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms & limitations</Link>
        </div>
      </footer>
    </div>
  );
}
