import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: "NutritiScan is building a research agent for human biology, with a Mac project workspace and a web evidence-to-protocol workflow.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return <main className="ns-policy">
    <Link href="/">← NutritiScan</Link>
    <span className="ns-eyebrow">ABOUT THE PRODUCT</span>
    <h1>A research agent for human biology.</h1>
    <p>NutritiScan is building a working environment for researchers to investigate
      evidence, understand datasets, develop analyses and preserve their work.
      The Mac application is the primary research workspace. Cancer biology and
      treatment resistance are the first specialist direction.</p>

    <h2>What can I use today?</h2>
    <p>The Mac preview brings local project files, PDF/PMC paper reading with exact passage citations, CSV/FHIR
      inspection, reviewed descriptive analyses, public literature search, saved reports,
      a project handoff and a terminal
      together. Agent chat uses your installed Codex client and existing managed
      ChatGPT sign-in. The web workspace supports source review and an editable
      study protocol with bibliography and export.</p>

    <h2>What comes next?</h2>
    <p>Broader evidence retrieval, reproducible scientific computation, public
      cancer cohort connectors and structured hypothesis validation are roadmap
      work. Each needs known-answer checks and evaluation with researchers.
      Database reference links do not mean their data has been ingested.</p>

    <h2>Can it discover or validate a cure?</h2>
    <p>No disease cure has been developed or validated by this product.
      NutritiScan aims to help researchers develop better treatments.
      A computational finding needs independent replication, experimental
      validation and the appropriate clinical studies before it can support a
      treatment claim. Scientific and clinical decisions remain with qualified people.</p>

    <h2>Where does research data go?</h2>
    <p>Desktop project files and history remain on your Mac. Requested content,
      messages and project context go to the connected model provider during a run;
      public search terms go to the enabled databases. Local app history is not
      application-level encrypted. Use public or appropriately de-identified
      material and review the <Link href="/privacy">privacy notice</Link>.</p>

    <h2>What happened to the health chat?</h2>
    <p>The earlier <Link href="/chat">educational health chat</Link> and Android
      beta remain separate. NutritiScan does not diagnose, prescribe or replace
      medical care. The separate health dashboard shows its own service status.</p>

    <p><Link href="/download">Download the Mac preview</Link> or{" "}
      <Link href="/research">open the web research workspace</Link>.</p>
  </main>;
}
