import type { Metadata } from "next";
import AgentStudio from "@/components/agent-studio";

export const metadata: Metadata = {
  title: "Agent Studio",
  description: "Create research agents with scoped plugins, visible task execution, source-linked briefs and approved downloads.",
  alternates: { canonical: "/agents" },
};

export default function AgentsPage() {
  return <main className="ns-chat-home min-h-[100svh]"><AgentStudio /></main>;
}
