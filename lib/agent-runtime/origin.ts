export function matchesOrigin(request: Request): boolean {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    const url = new URL(request.url);
    // Next's internal URL can use its bind hostname. The browser's Host
    // and the platform-set forwarded protocol identify the public origin.
    const host = request.headers.get("host") ?? url.host;
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? url.protocol.slice(0, -1);
    return ["http", "https"].includes(protocol) && origin.host === host &&
      origin.protocol === `${protocol}:` && origin.pathname === "/" && !origin.search && !origin.hash;
  } catch { return false; }
}
