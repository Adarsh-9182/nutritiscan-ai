import Link from "next/link";

export const metadata = {
  title: "Privacy & chat data",
  description: "How NutritiScan handles chat messages, health profile details and meal notes.",
  alternates: { canonical: "/privacy" },
};

export default function Page() {
  return (
    <main className="ns-policy">
      <Link href="/">← NutritiScan</Link>
      <span className="ns-eyebrow">PRIVACY NOTICE · 29 SEPTEMBER 2026</span>
      <h1>Private health questions deserve care.</h1>
      <p>
        NutritiScan currently offers a conversation with health agents. It does
        not provide account-based records, report uploads, or a connected
        medical record service.
      </p>

      <h2>What stays in your browser</h2>
      <p>
        Chat history, your optional health profile, and meal notes are saved in
        this browser so they can be available in later conversations. They are
        not synced to a NutritiScan account. Anyone with access to this browser
        profile may be able to view them. Use your browser&apos;s site-data
        controls to remove locally saved information.
      </p>
      <p>
        The separate synthetic discharge demo saves its fictional workflow
        steps, review notes and draft messages in this browser so a page
        refresh can restore them. They are not sent to NutritiScan&apos;s server.
        Use fictional information only in that demo. Its Start over control
        clears the saved steps for the selected fictional case. Clear site data
        to remove every saved demo case.
      </p>

      <h2>What is sent when you chat</h2>
      <p>
        When you send a message, the chat sends recent conversation messages
        and the profile and meal context saved in this browser to NutritiScan&apos;s
        server. The server sanitizes this input and runs urgent-symptom checks
        before agent reasoning. Depending on deployment configuration, the
        question and context may be processed by a hosted AI provider. Provider
        handling is subject to that provider&apos;s terms and retention practices.
        Do not include information you are not comfortable sending.
      </p>

      <h2>Safety and limits</h2>
      <p>
        Automated checks can miss urgent symptoms or misunderstand language.
        NutritiScan is educational support, not a diagnosis, prescription,
        emergency service, or replacement for a qualified clinician.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions, contact{" "}
        <a href="mailto:adarshbhardwaj9182@gmail.com">adarshbhardwaj9182@gmail.com</a>.
        Do not send health information in public GitHub issues.
      </p>
      <Link className="ns-button ns-dark" href="/chat">Back to chat</Link>
    </main>
  );
}
