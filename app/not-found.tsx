import Link from "next/link";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-[34ch] text-center">
        <p className="t-label text-[var(--accent-text)]">404</p>
        <h1 className="t-h2 mt-2 text-[var(--text)]">There&apos;s nothing at this address.</h1>
        <p className="t-body mt-2 text-[var(--text-2)]">
          The page may have moved. Your records and everything you&apos;ve logged are still where you left them.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/"
            className="grid h-11 place-items-center rounded-[var(--r-md)] bg-[var(--accent)] px-4 text-[14px] font-[590] text-[var(--accent-ink)]"
          >
            Ask something
          </Link>
          <Link
            href="/records"
            className="grid h-11 place-items-center rounded-[var(--r-md)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 text-[14px] font-[590] text-[var(--text)]"
          >
            Your records
          </Link>
        </div>
      </div>
    </main>
  );
}
