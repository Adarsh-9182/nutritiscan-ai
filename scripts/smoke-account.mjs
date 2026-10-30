// Synthetic account only. Never logs its email, password, UUID or cookies.
import { randomBytes } from "node:crypto";
const origin = process.argv[2] ?? "https://www.nutritiscan.com";
if (!["https://www.nutritiscan.com", "http://localhost:3000"].includes(origin)) throw new Error("Use the official site or local development server.");
const credentials = { email: `account-smoke-${randomBytes(12).toString("hex")}@example.com`, password: randomBytes(24).toString("base64url") };
let cookies = ""; let createdId = ""; let stage = "initial"; let cleaned = false;
function check(value) { if (!value) throw new Error("Check failed"); }
async function api(path, method = "GET", body, cookie = cookies) {
  return fetch(`${origin}${path}`, { method, headers: { origin, ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(25_000) });
}
function capture(response) {
  const set = response.headers.getSetCookie();
  check(set.some((s) => s.startsWith("nutritiscan-session=") && /httponly/i.test(s) && /path=\/;/i.test(s) && /samesite=strict/i.test(s)));
  check(set.some((s) => s.startsWith("nutritiscan-account=") && /httponly/i.test(s)));
  if (origin.startsWith("https")) check(set.filter((s) => /^nutritiscan-(session|account)=/.test(s)).every((s) => /; secure/i.test(s)));
  cookies = set.filter((s) => /^nutritiscan-(session|account)=/.test(s)).map((s) => s.split(";")[0]).join("; ");
}
async function account(cookie = cookies) { const response = await api("/api/account", "GET", undefined, cookie); check(response.ok && response.headers.get("cache-control")?.includes("no-store")); return response.json(); }
try {
  stage = "anonymous"; check((await account("")).account === null);
  stage = "register"; const signup = await api("/api/health/auth/register", "POST", credentials); check(signup.status === 201); const registered = await signup.json();
  check(typeof registered.user_id === "string" && !("access_token" in registered)); createdId = registered.user_id; capture(signup);
  stage = "shared-session"; const current = await account(); check(current.account?.id === createdId && current.plan === "free" && current.billingAvailable && current.subscription === null);
  stage = "logout"; const oldCookies = cookies; const logout = await api("/api/health/auth/logout", "POST"); check(logout.ok); check((await account(oldCookies)).account === null);
  stage = "login"; const signin = await api("/api/health/auth/login", "POST", credentials, ""); check(signin.ok); const signedIn = await signin.json(); check(signedIn.user_id === createdId && !("access_token" in signedIn)); capture(signin); check((await account()).account?.id === createdId);
  stage = "cleanup"; check((await api("/api/health/account", "DELETE", { password: credentials.password, confirmation: "DELETE MY HEALTH DATA" })).status === 204); cleaned = true;
  check((await account()).account === null);
  console.log(JSON.stringify({ passed: true, checks: ["anonymous", "signup", "HttpOnly-root-cookies", "shared-account", "Neon-plan-read", "logout-revocation", "signin", "account-deletion-revocation"], syntheticAccountRemoved: true }));
} catch {
  console.error(JSON.stringify({ passed: false, stage })); process.exitCode = 1;
} finally {
  if (createdId && !cleaned) {
    try {
      const login = await api("/api/health/auth/login", "POST", credentials, "");
      if (login.ok && (await login.json()).user_id === createdId) {
        capture(login); const response = await api("/api/health/account", "DELETE", { password: credentials.password, confirmation: "DELETE MY HEALTH DATA" }); cleaned = response.status === 204;
      }
    } catch {}
    console.log(JSON.stringify({ syntheticAccountRemoved: cleaned }));
  }
}
