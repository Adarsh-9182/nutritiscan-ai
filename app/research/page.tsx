import type { Metadata } from "next";
import Link from "next/link";
import ResearchWorkspace from "@/components/research-workspace";

export const metadata: Metadata = {
  title: "Health research workspace",
  description: "Search PubMed and ClinicalTrials.gov, inspect sources, and build a cited evidence brief.",
  alternates: { canonical: "/research" },
  robots: { index: false, follow: true },
};

export default function ResearchPage() {
  return (
    <main className="min-h-[100svh] px-4 py-5 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--emerald)] text-sm font-bold text-[#07130c]">N</span>
            NutritiScan
          </Link>
          <Link href="/chat" className="btn-ghost rounded-full px-4 py-2 text-sm">Health chat →</Link>
        </header>
        <ResearchWorkspace />
        <footer className="mt-16 border-t border-[var(--border)] pt-5 text-xs leading-relaxed text-[var(--text-dim)]">
          Research support only. Search coverage is incomplete, abstracts can omit important details, and this workspace does not provide clinical recommendations. Always check the linked source and consult qualified experts for decisions.
        </footer>
      </div>
    </main>
  );
}
