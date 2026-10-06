import type { Metadata } from "next";
import Link from "next/link";
import AuthPanel from "@/components/auth-panel";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Create or access your NutritiScan account.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="min-h-[100svh] bg-[#080b0d] px-5 py-10 text-white">
      <div className="mx-auto max-w-md">
        <Link href="/chat" className="mb-10 inline-flex items-center gap-2 text-sm text-white/80 hover:text-white">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-300 text-lg font-bold text-[#07130c]">+</span>
          NutritiScan
        </Link>
        <AuthPanel />
        <p className="mt-6 text-center text-xs leading-5 text-white/50">
          The account stores your name encrypted. Chat history stays in this browser unless you explicitly enable account sync in the chat sidebar. This educational prototype is not for emergencies.
        </p>
      </div>
    </main>
  );
}
