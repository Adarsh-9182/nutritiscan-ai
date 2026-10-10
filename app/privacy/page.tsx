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
      <span className="ns-eyebrow">PRIVACY NOTICE · 9 OCTOBER 2026</span>
      <h1>Private health questions deserve care.</h1>
      <p>
        NutritiScan offers a public health conversation, a local Android journal,
        and a separate shared health workspace. Shared accounts and private report
        storage require a deployed health service; the dashboard displays its
        connection status. Public-chat attachments and shared report uploads have
        different data boundaries, described below.
      </p>
      <p>
        NutritiScan is designed for people of all ages. Younger users should
        review this notice with a parent or guardian before sharing personal
        health information. A verified parent or guardian consent flow for
        children&apos;s health records is not yet available; do not upload or
        store a child&apos;s records in the shared account until that safeguard
        is provided.
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
      <p>
        Chat report attachments are read in your browser. The original file is
        not uploaded as a file, but up to 12,000 extracted text characters are
        added to the conversation, saved with chat history in this browser, and
        sent with your message to NutriScan&apos;s server and, when configured, a
        hosted AI provider. Remove the message or clear this site&apos;s browser
        data to remove that local copy.
      </p>

      <h2>Android local data and public chat</h2>
      <p>
        The Android app saves local profiles, meal entries, health history and
        conversations on your device using app storage. NutritiScan does not
        encrypt that local journal storage. Public AI chat asks for consent before
        sending chosen messages to the web server and configured AI provider;
        the local profile and meal journal are not silently attached. You can
        revoke public-chat consent and delete local entries in the app’s You screen.
        Barcode lookup sends a product code to Open Food Facts, not your health profile.
      </p>
      <h2>Shared account, reports and consent</h2>
      <p>
        When connected, the shared health service stores records and conversations
        under your account. Health content and original files are encrypted by the
        service. Native access tokens use secure device credential storage; web
        sessions use an HttpOnly cookie. Explicit health storage consent is
        required, and cloud AI processing is a separate optional choice. The
        service records access and change events without clinical payloads.
      </p>
      <p>
        Uploaded shared reports go to private object storage. Extracted values
        stay as drafts until you compare them with the original and confirm the
        name, value, unit and collection date. Patient confirmation is not clinical
        validation. Structured records support FHIR export; the prototype is not
        a certified FHIR server. NutritiScan does not use patient records for model
        training. Any configured provider’s retention and processing terms must
        be reviewed before real patient use.
      </p>
      <h2>Voice, export and deletion</h2>
      <p>
        Voice transcription requires an enabled provider and cloud AI consent.
        Audio is sent for transcription after you choose to transcribe, is not
        added to health history by this service, and the transcript is reviewed
        before a question is sent. The provider may have separate retention terms.
        Shared records and conversation history can be exported from the dashboard;
        originals are downloaded separately. Account deletion requires your password
        or a sign-in from the last 15 minutes.
        It removes active records, documents and sessions. Infrastructure backups
        follow the host’s retention policy. Android local entries are deleted
        separately in the app. Revoking storage consent stops routine access and
        new storage but keeps export and deletion available.
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
