import type { Metadata } from "next";
import AccountLogin from "@/components/account-login";
import { safeAccountReturn } from "@/lib/account/session";
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  return <div className="ns-chat-home"><AccountLogin next={safeAccountReturn(params.next)} /></div>;
}
