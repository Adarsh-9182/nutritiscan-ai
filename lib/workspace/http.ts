export function sameOrigin(req: Request): boolean {
  const expected =
    process.env.APP_ORIGIN ||
    (process.env.NODE_ENV !== "production" ? new URL(req.url).origin : "");
  if (!expected) return false;
  return (
    req.headers.get("origin") === expected &&
    req.headers.get("sec-fetch-site") !== "cross-site"
  );
}
