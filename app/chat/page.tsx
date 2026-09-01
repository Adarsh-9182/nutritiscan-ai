import ChatWorkspace from "@/components/chat-workspace";

export const metadata = {
  title: "Consultation",
  description: "Talk to five specialists at once, with every conversation kept and searchable.",
  // A health conversation is personal to one device. There is nothing here
  // for a crawler, and the route only ever renders local data.
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ChatWorkspace />;
}
