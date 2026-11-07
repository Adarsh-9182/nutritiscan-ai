import type { Metadata } from "next";
import ResearchWorkspace from "@/components/research-workspace";

export const metadata: Metadata = {
  title: "Research workspace | NutritiScan",
  description: "Investigate human biology, disease mechanisms and aging research with source-linked findings, hypothesis drafts and an editable study protocol with bibliography and export.",
};

export default function ResearchPage() {
  return (
    <div className="ns-chat-home">
      <div className="ns-chat-glow" aria-hidden />
      <ResearchWorkspace />
    </div>
  );
}
