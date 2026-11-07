import type { BeforeSendEvent } from "@vercel/analytics";

// Count discovery pages only. Never emit URLs or events from health,
// research, authentication, account or shared-workspace routes.
const PUBLIC_PATHS = new Set(["/", "/download", "/about", "/privacy", "/terms", "/pricing"]);
export function publicPageEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  if (event.type !== "pageview") return null;
  try {
    const url = new URL(event.url);
    if (!PUBLIC_PATHS.has(url.pathname) || !["www.nutritiscan.com", "nutritiscan.com"].includes(url.hostname)) return null;
    url.search = ""; url.hash = "";
    return { ...event, url: url.href };
  } catch { return null; }
}
