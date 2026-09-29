import Link from "next/link";

export const metadata = {
  title: "Terms & product scope",
  description: "NutritiScan is educational health chat, not diagnosis, prescribing or emergency care.",
  alternates: { canonical: "/terms" },
};

export default function Page() {
  return (
    <main className="ns-policy">
      <Link href="/">← NutritiScan</Link>
      <span className="ns-eyebrow">EARLY ACCESS · 29 SEPTEMBER 2026</span>
      <h1>A clearer picture. An honest scope.</h1>

      <h2>What NutritiScan does</h2>
      <p>
        NutritiScan is a conversational health companion. A supervisor may
        route supported questions to specialist agents and use published
        reference notes to prepare an educational response. Agent and model
        availability depends on deployment configuration. Answers can be
        inaccurate or incomplete.
      </p>
      <p>
        The discharge workflow demo uses fictional records and simulated
        roles. It does not connect to a hospital, identify a clinician, send a
        patient message or provide a real clinical audit record.
      </p>

      <h2>Medical decisions stay with qualified professionals</h2>
      <p>
        NutritiScan does not diagnose, prescribe, recommend medication changes,
        provide an individual treatment plan, or replace a clinician. It is not
        a clinically validated diagnostic device. Safety checks may miss
        symptoms or misunderstand your language.
      </p>

      <h2>Urgent concerns</h2>
      <p>
        This is not an emergency service and does not monitor your health. If
        you think you or another person needs urgent help, contact local
        emergency services or a qualified clinician without waiting for this
        app.
      </p>

      <h2>Your responsibilities</h2>
      <p>
        Check health information with a qualified professional. Only share
        information you have the right to use, and avoid entering details you
        do not want processed by NutritiScan or a configured AI provider. This
        early-access service is for adults 18+.
      </p>

      <h2>Availability and feedback</h2>
      <p>
        The chat is currently offered as free early access. Service
        interruptions and changes are possible. Contact{" "}
        <a href="mailto:adarshbhardwaj9182@gmail.com">adarshbhardwaj9182@gmail.com</a>
        {" "}for product questions; do not include sensitive health data in
        public feedback.
      </p>
      <Link className="ns-button ns-dark" href="/chat">Open chat</Link>
    </main>
  );
}
