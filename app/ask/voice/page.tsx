import type { Metadata } from "next";
import { VoiceScreen } from "@/components/screens/voice";

// A static segment wins over the sibling `[id]` route, so this
// resolves to the voice screen rather than to a conversation
// called "voice".
export const metadata: Metadata = { title: "Voice" };

export default function Page() {
  return <VoiceScreen />;
}
