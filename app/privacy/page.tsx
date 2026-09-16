import Link from "next/link";
export const metadata = { title: "Privacy & your records" };
export default function Page() {
  return (
    <main className="ns-policy">
      <Link href="/">← NutritiScan</Link>
      <span className="ns-eyebrow">PRIVACY NOTICE · 15 SEPTEMBER 2026</span>
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
        Records summaries are assembled on the server from your confirmed
        records. If an AI provider is enabled, the question you send and your
        language preference are sent to that configured provider. The workspace
        does not automatically send your reports or health profile to it.
        Conversations are not saved by this workspace. Do not put identifying or
        sensitive information in general AI questions. The operator must
        validate provider terms before enabling that feature.
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
