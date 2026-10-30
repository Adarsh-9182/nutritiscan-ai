import type { Metadata } from "next";
import AccountWorkspace from "@/components/account-workspace";
import { oauthMessage } from "@/lib/account/providers";
export const metadata: Metadata = { title: "Account and billing", robots: { index: false, follow: false } };
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ auth?: string }> }) { const { auth } = await searchParams; return <div className="ns-chat-home"><AccountWorkspace statusMessage={oauthMessage(auth)} /></div>; }
