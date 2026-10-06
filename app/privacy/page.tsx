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
      <span className="ns-eyebrow">PRIVACY NOTICE · 6 OCTOBER 2026</span>
      <h1>Private health questions deserve care.</h1>
      <p>
        NutritiScan currently offers an educational conversation with health
        agents. It does not provide a connected medical record service. Chat supports text-based PDF or TXT attachments for
        explanation; scanned PDFs and image files are not supported yet.
      </p>

      <h2>What stays in your browser</h2>
      <p>
        Chat history, your optional health profile, and meal notes are saved in
        this browser so they can be available in later conversations. Profile
        details and meal notes stay browser-local. Chats remain on this device
        unless you sign in and explicitly choose
        <strong> Save current chats to my account</strong>. When enabled,
        current and future conversations are encrypted with NutritiScan&apos;s
        application key before storage and can sync across devices. This is
        server-side encryption, not end-to-end encryption. Deleting a
        conversation from the chat list removes its local and synced copies.
        Other local copies remain in this browser until you clear site data.
        Anyone with access to this browser profile may be able to view them.
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
      <p>
        Chat report attachments are read in your browser. The original file is
        not uploaded as a file, but up to 12,000 extracted text characters are
        added to the conversation, saved with chat history in this browser, and
        sent with your message to NutritiScan&apos;s server and, when configured,
        a hosted AI provider. If account sync is enabled, that conversation
        also becomes part of the encrypted account history. Clear this
        site&apos;s browser data to remove the local copy.
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
