"use client";

import { Analytics } from "@vercel/analytics/next";
import { publicPageEvent } from "@/lib/http/public-analytics";

export function PublicAnalytics() {
  return <Analytics beforeSend={publicPageEvent} />;
}
