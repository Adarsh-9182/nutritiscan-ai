import type { Metadata } from "next";
import AccountWorkspace from "@/components/account-workspace";
export const metadata: Metadata = { title: "Account and billing", robots: { index: false, follow: false } };
export default function AccountPage() { return <div className="ns-chat-home"><AccountWorkspace /></div>; }
