import type { Metadata, Viewport } from "next";
import ChatWorkspace from "@/components/chat-workspace";

export const metadata: Metadata = {
  title: "Chat with your health agents",
  description: "Ask anything — a Supervisor and five specialist agents (Doctor, Nutrition, Fitness, Lab, Coach) answer together.",
  alternates: { canonical: "/chat" },
};

export const viewport: Viewport = { themeColor: "#05080a" };

/**
 * The conversation — what "Start a conversation" on the landing opens.
 *
 * `ns-chat-home` is a theme scope, not a layout: it re-points the application
 * tokens at the landing's green palette and puts the bloom behind, so the chat
 * keeps the landing's look without any chat component knowing about it.
 */
export default function Page() {
  return (
    <div className="ns-chat-home">
      <div className="ns-chat-glow" aria-hidden />
      <ChatWorkspace />
    </div>
  );
}
