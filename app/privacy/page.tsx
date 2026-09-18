import Link from "next/link";
export const metadata = { title: "Privacy & your records" };
export default function Page() {
  return (
    <main className="ns-policy">
      <Link href="/">← NutritiScan</Link>
      <span className="ns-eyebrow">PRIVACY NOTICE · 16 SEPTEMBER 2026</span>
      <h1>
        Your records.
        <br />
        Your control.
      </h1>
      <h2>What this workspace stores</h2>
      <p>
        Your username, a password hash, a recovery-key hash, your profile,
        confirmed report values, notes and follow-up tasks are stored on the
        server. Profile and record content are encrypted with AES-256-GCM; the
        operator’s server can decrypt them to provide the service. This is not
        end-to-end encryption.
      </p>
      <h2>What stays on your device</h2>
      <p>
        PDF reading and text extraction happen in your browser. The original
        file and pasted source text are not uploaded by the report-import
        workflow. Only the values and notes you explicitly confirm are
        submitted. The fictional demo stays in memory and resets on refresh.
      </p>
      <h2>Assistant processing</h2>
      <p>
        Urgent-symptom checks, reference retrieval and every calculation over
        your records run without a model. Only the written explanation is
        generated, and each answer states which engine produced it.
      </p>
      <p>
        <b>Hosted engine.</b> When this deployment has a model credential, the
        companion writes its explanation on the server. What is sent to the
        model provider is your question, the published reference notes it is
        answering from, and up to two of your own earlier messages in that
        conversation. Your profile, reports, saved values and log entries are
        not included: record summaries are computed here and added after the
        model has written its text. The current provider is Google (Gemini) or,
        where an operator has configured one, that operator’s own endpoint;
        provider-side retention follows their terms.
      </p>
      <p>
        <b>On-device engine.</b> Enable it and the explanation is written in
        your browser instead, so the question reaches no provider at all. Model
        files are downloaded from Hugging Face and the WebLLM model library on
        GitHub. Those hosts see network metadata such as your IP address, not
        your chat or records. The model uses device memory and caches files in
        browser storage; turn it off to release memory, clear site data to
        remove the cache.
      </p>
      <p>
        Conversations stay in this tab and disappear on refresh or sign-out.
        They are not written to the database. Only follow-ups, reminders and
        log entries you confirm are saved to your account. The fictional demo
        can also use the hosted engine; it answers over fixed sample data, not
        anyone’s records.
      </p>
      <h2>Sessions and security</h2>
      <p>
        An HttpOnly session cookie keeps you signed in for up to seven days.
        Signing out revokes that session. Recovery keys reset your password and
        revoke existing sessions. Keep your recovery key private. No advertising
        analytics are included in this release.
      </p>
      <h2>Export and deletion</h2>
      <p>
        Settings lets you download your profile, reports and tasks as JSON.
        Account deletion requires your password and removes your account,
        records and sessions from the active database. Infrastructure backups,
        if configured by the operator, follow their retention schedule; this app
        cannot promise immediate erasure from a provider’s backups.
      </p>
      <h2>Scope and contact</h2>
      <p>
        This early-access workspace is for adults 18+. It is not a medical
        record service operated by a hospital. Avoid submitting another adult’s
        records. For privacy or account questions contact{" "}
        <a href="mailto:adarshbhardwaj9182@gmail.com">
          adarshbhardwaj9182@gmail.com
        </a>
        . Never post health information in public GitHub issues.
      </p>
      <Link className="ns-button ns-dark" href="/workspace">
        Back to workspace
      </Link>
    </main>
  );
}
