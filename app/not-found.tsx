import Link from "next/link";

export const metadata = { title: "Not found — NutritiScan AI" };

export default function NotFound() {
  return (
    <main className="bg-aurora grid min-h-[100svh] place-items-center px-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-[var(--emerald)]">404</p>
        <h1 className="mt-2 text-xl font-semibold">There&apos;s nothing at this address.</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          The page may have moved. Your dashboard and scanner are both still where you left them.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/dashboard" className="btn-primary rounded-xl px-4 py-2.5 text-sm">
            Go to dashboard
          </Link>
          <Link href="/scan" className="btn-ghost rounded-xl px-4 py-2.5 text-sm">
            Scan a meal
          </Link>
        </div>
      </div>
    </main>
  );
}
