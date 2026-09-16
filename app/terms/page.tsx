import Link from "next/link";
export const metadata = { title: "Terms & product scope" };
export default function Page() {
  return (
    <main className="ns-policy">
      <Link href="/">← NutritiScan</Link>
      <span className="ns-eyebrow">EARLY ACCESS · 16 SEPTEMBER 2026</span>
      <h1>
        A clearer picture.
        <br />
        An honest scope.
      </h1>
      <h2>What NutritiScan does</h2>
      <p>
        NutritiScan helps adults organise confirmed report values, compare them
        with the reference ranges printed on those reports, maintain their own
        follow-up list and prepare information for a clinician. It may provide
        source-linked general education. Optional on-device AI is a small
        general-purpose model, requires a compatible browser and a model
        download, and can produce inaccurate answers. Educational coverage
        is limited; source links are reference material, not clinical verification.
      </p>
      <h2>Medical decisions stay with qualified professionals</h2>
      <p>
        This product does not diagnose, prescribe, recommend medication changes,
        provide individual treatment plans, or replace a clinician. It is not a
        clinically validated diagnostic device. A result within a reference
        range does not prove you are healthy; one outside a range does not
        establish a diagnosis. Comparisons across laboratories and methods may
        be invalid.
      </p>
      <h2>Urgent concerns</h2>
      <p>
        This is not an emergency service and does not monitor your health.
        Automated checks may miss symptoms or misunderstand your language. If
        you think you or another person needs urgent help, contact local
        emergency services or a qualified clinician without waiting for this
        app.
      </p>
      <h2>Your responsibilities</h2>
      <p>
        Check extracted test names, values, units, dates and reference ranges
        against the original report. Only submit information you have the right
        to use. Keep your password and recovery key private. Do not rely on the
        app to remind you of care: email and push notifications are not enabled.
      </p>
      <h2>Availability and price</h2>
      <p>
        This release is free early access, with no subscription purchase or
        charge. Account storage is limited to 500 records. Future paid plans,
        consultations and additional features are not included or promised. You
        can export your records at any time. Service interruptions are possible.
      </p>
      <h2>Feedback</h2>
      <p>
        Contact{" "}
        <a href="mailto:adarshbhardwaj9182@gmail.com">
          adarshbhardwaj9182@gmail.com
        </a>{" "}
        for product questions. Share no sensitive health data in public
        feedback.
      </p>
      <Link className="ns-button ns-dark" href="/workspace">
        Open workspace
      </Link>
    </main>
  );
}
