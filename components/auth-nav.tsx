"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function AuthNav() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/auth", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => { if (live) setSignedIn(Boolean(data.user)); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  if (!signedIn) return <Link href="/login" className="btn-ghost rounded-full px-3 py-1 t-label">Sign in</Link>;
  return <button className="btn-ghost rounded-full px-3 py-1 t-label" onClick={async () => {
    await fetch("/api/auth", { method: "DELETE" });
    window.location.reload();
  }}>Sign out</button>;
}
