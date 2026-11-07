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
      <span className="ns-eyebrow">PRIVACY NOTICE · 7 NOVEMBER 2026</span>
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

      <h2>Research conversations and account backups</h2>
      <p>
        Research history and saved source-review notes stay in this browser until
        you choose to save an account snapshot or download a backup file. Account
        snapshots contain the selected device research history, source records,
        drafts and saved notes. They are stored encrypted by the account service
        and accessed using your signed-in account. Health profiles, meal logs and
        health chats are not included. Research backup actions do not call an AI model.
      </p>
      <p>
        You can preview and restore the account snapshot on another device, or
        explicitly delete it from Research conversation history. Deleting the
        snapshot does not erase device copies or downloaded files. Account deletion
        removes the stored research snapshot as well. Hosting backup copies follow
        the host’s retention policy. Research searches and model-assisted follow-ups
        still send their selected public research context to configured sources and
        AI providers; saved source-review notes are excluded from model context.
      </p>
      <h2>Mac desktop research preview</h2>
      <p>
        The separate <Link href="/download">Mac app</Link> keeps project files in
        the folder you choose and saved app history in local Application Support
        storage. App history is plain JSON with owner-only file permissions, not
        encrypted by NutritiScan. Anyone with access to your macOS account may
        be able to read it. Desktop work does not automatically sync with browser
        chats or account research backups.
      </p>
      <p>
        Importing a paper saves an original copy and an extracted text snapshot
        inside the chosen project. PDF extraction, previews and manual passage
        checks run locally. Passages requested during agent chat are sent to
        the connected model provider; importing alone does not send the PDF to
        that provider. Fetching open full text sends the article identifier to
        the official PMC service and retains the returned licence and attribution.
      </p>
      <p>
        The desktop agent sends messages, requested file content, retrieved
        evidence and project context to the model through your installed Codex
        runtime. Public literature queries go to PubMed and ClinicalTrials.gov.
        Codex keeps its own sign-in; NutritiScan does not copy its credentials.
        The terminal can launch the original Claude Code CLI with its own
        account and data handling. Use public or de-identified research data.
      </p>
      <p>
        Archiving retains saved history. Removing archived work asks for
        confirmation, then removes that history from this app; project files,
        saved reports, exports and original Codex history remain separate.
        Restore and export a conversation before removing it if you need a copy.
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

      <h2>Public-page visitor counts</h2>
      <p>
        We use Vercel Web Analytics for aggregate visitor and page-view counts on
        the homepage, download, about, privacy, terms and pricing pages. Query
        strings and URL fragments are removed before sending page views. Health
        chat, research, health workspace, account and sign-in routes are excluded.
        No chat messages, profiles, research drafts, report contents or custom
        content events are sent to analytics. Counts use Vercel&apos;s cookie-free
        analytics; they are estimates of visitors, not verified individual people.
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
