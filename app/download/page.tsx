import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, Download, FlaskConical, FolderOpen, Monitor, Terminal } from "lucide-react";
import release from "@/lib/desktop-release.json";
import styles from "./download.module.css";

export const metadata: Metadata = {
  title: "Download for Mac",
  description: "Download NutritiScan for Mac. Read PDFs and permitted PMC full text, follow exact passage citations, review local analyses and preserve your research project.",
  alternates: { canonical: "/download" },
  openGraph: { title: "NutritiScan for Mac", url: "/download", description: "Your biology research workspace, on your Mac." },
};

const FEATURES = [
  { icon: BookOpen, title: "Read the paper behind the finding", text: "Import PDFs with original-page previews or fetch permitted PMC full text by ID. Search passages, check exact quotations and follow citations back to their source." },
  { icon: FolderOpen, title: "Review analyses and retain the result", text: "Inspect CSV/FHIR exports. Review and run supported CSV summaries or correlations, then keep the input fingerprint, recipe, results and saved reports with your project." },
  { icon: Terminal, title: "Your tools, in one workspace", text: "Use the local terminal alongside research chat. The original Claude Code CLI can run there with its own sign-in." },
];

export default function DownloadPage() {
  return <div className={styles.page}>
    <header className={styles.nav}>
      <Link href="/" className={styles.brand} aria-label="NutritiScan home"><span><FlaskConical size={20} /></span>NutritiScan</Link>
      <nav aria-label="Download navigation"><Link href="/research">Open in browser <ArrowRight size={14} /></Link><Link href="/privacy">Privacy</Link></nav>
    </header>
    <main>
      <section className={styles.hero}>
        <span className={styles.badge}><Monitor size={13} />MAC DESKTOP PREVIEW</span>
        <h1>Your research.<br /><em>On your Mac.</em></h1>
        <p className={styles.intro}>Read papers, inspect datasets and investigate biology in one project. Keep the original source beside each passage and preserve how supported analyses were produced.</p>
        <div className={styles.actions}><a className={styles.download} href={release.url} referrerPolicy="no-referrer"><Download size={18} />Download for Mac</a><Link href="/research" className={styles.browser}>Continue in your browser <ArrowRight size={15} /></Link></div>
        <p className={styles.release}>Version {release.version} preview <span>·</span> {Math.ceil(release.sizeBytes / 1_000_000)} MB <span>·</span> macOS {release.minimumMacOS}+ <span>·</span> Apple Silicon</p>
        <p className={styles.previewNotice}>This preview has not been notarized by Apple. macOS may block it from opening. <a href="#install">Read the install notes</a> before downloading.</p>
      </section>
      <figure className={styles.preview}>
        <div className={styles.previewBar}><span><i /><i /><i /></span><p>NutritiScan · Biology workspace</p><b>ACTUAL APP · FICTIONAL SAMPLE DATA</b></div>
        <Image src="/desktop/paper-reader.png" alt="NutritiScan Mac app showing an original fictional PDF page beside its extracted text and source-checking tools" width={1906} height={1280} priority sizes="(max-width: 1100px) 94vw, 1100px" />
        <figcaption>The actual paper reader with a fictional software-test PDF. Its values support no biological or treatment conclusion.</figcaption>
      </figure>
      <section className={styles.features} aria-label="Mac workspace features">{FEATURES.map(({ icon: Icon, title, text }) => <article key={title}><Icon size={22} /><h2>{title}</h2><p>{text}</p></article>)}</section>
      <section id="install" className={styles.install}>
        <div><p className={styles.eyebrow}>GET STARTED</p><h2>From download<br />to your first project.</h2><p>For Macs with an M-series chip and macOS {release.minimumMacOS} or later. Intel Mac, Windows and Linux downloads are not available in this release.</p></div>
        <ol>
          <li><span>01</span><div><h3>Download and extract</h3><p>Open the ZIP file, then move NutritiScan.app into your Applications folder.</p></div></li>
          <li><span>02</span><div><h3>Open the preview</h3><p>This build is locally signed and has not been notarized by Apple. If macOS blocks it, review <a href="https://support.apple.com/102445" target="_blank" rel="noreferrer">Apple’s guidance for opening downloaded apps</a> and decide whether to proceed.</p></div></li>
          <li><span>03</span><div><h3>Read locally or connect your model</h3><p>Manual paper reading and supported local calculations work without model sign-in. For agent chat, install the <a href="https://learn.chatgpt.com/docs/cli" target="_blank" rel="noreferrer">official Codex CLI</a> and choose <strong>Connect through Codex</strong>. Chat requires an eligible ChatGPT account, internet and available plan usage; no paid API fallback is enabled.</p></div></li>
          <li><span>04</span><div><h3>Start with the sample</h3><p>Choose <strong>Explore the sample project</strong>, then open <strong>Papers</strong> and import the fictional sample PDF. Start a new investigation to use the new agent tools. Python 3 is needed for the optional terminal; Claude Code is optional.</p></div></li>
        </ol>
      </section>
      <section className={styles.details} aria-label="Preview details">
        <article><h2>Where your work goes</h2><p>Projects, original paper copies, extracted snapshots and app history stay on your Mac. Requested passages, messages and project context go to your connected model provider. Public retrieval goes to the source databases. Web chats do not automatically sync with the app.</p><p>PDF import supports 20 MB and 80 pages, with no OCR. PMC import supports recorded CC BY/CC0 articles by ID. Local analyses are descriptive; Python/R execution, direct lab connections and clinical validation remain future work.</p></article>
        <article><h2>Release details</h2><dl><div><dt>Build</dt><dd>{release.version} · Apple Silicon (arm64)</dd></div><div><dt>Download</dt><dd>{release.fileName}</dd></div><div><dt>SHA-256</dt><dd className={styles.checksum}>{release.sha256}</dd></div></dl><a href={`https://github.com/Adarsh-9182/nutritiscan-ai/releases/tag/${release.tag}`} target="_blank" rel="noreferrer">Release notes and checksum <ArrowRight size={14} /></a></article>
      </section>
    </main>
    <footer className={styles.footer}><Link href="/">NutritiScan</Link><span>Research support. People keep the scientific decisions.</span><div><Link href="/research">Research</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></footer>
  </div>;
}
