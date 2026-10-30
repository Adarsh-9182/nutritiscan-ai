import type { Metadata } from "next";
import ResearchWorkspace from "@/components/research-workspace";

export const metadata: Metadata = {
  title: "Research chat | NutritiScan",
  description: "Investigate human biology, disease mechanisms and aging research with source-linked findings, testable hypothesis drafts and proposed study plans.",
};

export default function ResearchPage() {
  return (
    <div className="ns-chat-home">
      <div className="ns-chat-glow" aria-hidden />
      <ResearchWorkspace />
    </div>
  );
}
