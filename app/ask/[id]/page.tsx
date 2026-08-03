import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConversationScreen } from "@/components/screens/conversation";
import { conversationById } from "@/lib/v2/conversation";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const conversation = conversationById(id);
  return { title: conversation?.title ?? "Ask" };
}

export default async function Page({ params }: Props) {
  const { id } = await params;

  // "new" is the live path — a question typed on the home screen
  // or dictated, arriving via ?q=. Everything else must resolve to
  // a real stored conversation rather than silently rendering an
  // empty thread the user can't account for.
  if (id !== "new") {
    const conversation = conversationById(id);
    if (!conversation) notFound();
    return (
      <Suspense fallback={null}>
        <ConversationScreen conversation={conversation} />
      </Suspense>
    );
  }

  // `useSearchParams` in the child forces a Suspense boundary —
  // without one the whole route opts out of static rendering.
  return (
    <Suspense fallback={null}>
      <ConversationScreen />
    </Suspense>
  );
}
