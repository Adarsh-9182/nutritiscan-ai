import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, Download, FlaskConical, FolderOpen, Monitor, Terminal } from "lucide-react";
import release from "@/lib/desktop-release.json";
import styles from "./download.module.css";

export const metadata: Metadata = {
  title: "Download for Mac",
  description: "Download the NutritiScan Mac research workspace. Work with project files, source-linked research chat, saved reports and a local terminal.",
  alternates: { canonical: "/download" },
  openGraph: { title: "NutritiScan for Mac", url: "/download", description: "Your biology research workspace, on your Mac." },
};

const FEATURES = [
  { icon: BookOpen, title: "Evidence beside the conversation", text: "Search PubMed and ClinicalTrials.gov, inspect retrieved passages and keep the original sources with your investigation." },
  { icon: FolderOpen, title: "A home for each investigation", text: "Open a research folder, inspect CSV or FHIR exports, save reports and pick up from your project handoff." },
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
        <p className={styles.intro}>A dedicated workspace for biology questions, evidence and the work you want to keep. Bring your project files, research chat and terminal together.</p>
        <div className={styles.actions}><a className={styles.download} href={release.url} referrerPolicy="no-referrer"><Download size={18} />Download for Mac</a><Link href="/research" className={styles.browser}>Continue in your browser <ArrowRight size={15} /></Link></div>
        <p className={styles.release}>Version {release.version} preview <span>·</span> {Math.ceil(release.sizeBytes / 1_000_000)} MB <span>·</span> macOS {release.minimumMacOS}+ <span>·</span> Apple Silicon</p>
        <p className={styles.previewNotice}>This preview has not been notarized by Apple. macOS may block it from opening. <a href="#install">Read the install notes</a> before downloading.</p>
      </section>
      <figure className={styles.preview}>
        <div className={styles.previewBar}><span><i /><i /><i /></span><p>NutritiScan · Biology workspace</p><b>ACTUAL APP · FICTIONAL SAMPLE DATA</b></div>
        <Image src="/desktop/workspace.png" alt="NutritiScan Mac app showing research investigations, a synthetic dataset review, saved reports and a local terminal" width={1400} height={900} priority sizes="(max-width: 1100px) 94vw, 1100px" />
        <figcaption>A local sample project. The fictional readings shown are software demonstration data.</figcaption>
      </figure>
      <section className={styles.features} aria-label="Mac workspace features">{FEATURES.map(({ icon: Icon, title, text }) => <article key={title}><Icon size={22} /><h2>{title}</h2><p>{text}</p></article>)}</section>
      <section id="install" className={styles.install}>
        <div><p className={styles.eyebrow}>GET STARTED</p><h2>From download<br />to your first project.</h2><p>For Macs with an M-series chip and macOS {release.minimumMacOS} or later. Intel Mac, Windows and Linux downloads are not available in this release.</p></div>
        <ol>
          <li><span>01</span><div><h3>Download and extract</h3><p>Open the ZIP file, then move NutritiScan.app into your Applications folder.</p></div></li>
          <li><span>02</span><div><h3>Open the preview</h3><p>This build is locally signed and has not been notarized by Apple. If macOS blocks it, review <a href="https://support.apple.com/102445" target="_blank" rel="noreferrer">Apple’s guidance for opening downloaded apps</a> and decide whether to proceed.</p></div></li>
          <li><span>03</span><div><h3>Connect your model</h3><p>Install the <a href="https://learn.chatgpt.com/docs/cli" target="_blank" rel="noreferrer">official Codex CLI</a>, then choose <strong>Connect through Codex</strong> in the app. This local preview uses Codex’s own ChatGPT sign-in. An eligible account, internet connection and available plan usage are required; no paid API fallback is enabled.</p></div></li>
          <li><span>04</span><div><h3>Start with the sample</h3><p>Choose <strong>Explore the sample project</strong> or open a dedicated research folder. Python 3 is needed for the terminal. Claude Code is optional.</p></div></li>
        </ol>
      </section>
      <section className={styles.details} aria-label="Preview details">
        <article><h2>Where your work goes</h2><p>Projects and saved app history stay on your Mac. Requested file content, messages and project context go to your chosen model provider. Public searches go to the source databases. Web chats do not automatically sync with the desktop app.</p><p>Use public or de-identified research data. This preview is research assistance; clinical validation and direct lab instrument connections are not available.</p></article>
        <article><h2>Release details</h2><dl><div><dt>Build</dt><dd>{release.version} · Apple Silicon (arm64)</dd></div><div><dt>Download</dt><dd>{release.fileName}</dd></div><div><dt>SHA-256</dt><dd className={styles.checksum}>{release.sha256}</dd></div></dl><a href={`https://github.com/Adarsh-9182/nutritiscan-ai/releases/tag/${release.tag}`} target="_blank" rel="noreferrer">Release notes and checksum <ArrowRight size={14} /></a></article>
      </section>
    </main>
    <footer className={styles.footer}><Link href="/">NutritiScan</Link><span>Research support. People keep the scientific decisions.</span><div><Link href="/research">Research</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></footer>
  </div>;
}
