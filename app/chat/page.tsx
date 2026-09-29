import type { Metadata, Viewport } from "next";
import ChatWorkspace from "@/components/chat-workspace";

export const metadata: Metadata = {
  title: "Try the public health chat",
  description: "Explore NutritiScan's current educational health chat prototype with a supervisor and specialist agents. Hospital workflows are in development.",
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
