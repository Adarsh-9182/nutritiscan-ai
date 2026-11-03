// Only synthetic accounts and research; never logs credentials, cookies or IDs.
import { randomBytes } from "node:crypto";
const origin = process.argv[2] ?? "https://www.nutritiscan.com";
if (!["https://www.nutritiscan.com", "http://localhost:3000"].includes(origin)) throw new Error("Use the official site or local development server.");
const clients = [0, 1].map(() => ({ email: `research-smoke-${randomBytes(12).toString("hex")}@example.com`, password: randomBytes(24).toString("base64url"), cookie: "", id: "", removed: false }));
const backup = { format: "nutritiscan-research", version: 1, exportedAt: new Date().toISOString(), threads: [] };
let stage = "initial";
function check(value) { if (!value) throw new Error("Smoke check failed"); }
async function api(client, path, method = "GET", body) {
  return fetch(`${origin}${path}`, { method, headers: { origin, ...(client?.cookie ? { cookie: client.cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25_000), redirect: "error" });
}
function capture(client, response) { client.cookie = response.headers.getSetCookie().filter((s) => /^nutritiscan-(session|account)=/.test(s)).map((s) => s.split(";")[0]).join("; "); }
async function save(client, revision, accountId = client.id) { return api(client, "/api/research/backup", "PUT", { accountId, revision, consent: true, backup }); }
try {
  stage = "anonymous"; check((await api(null, "/api/research/backup")).status === 401);
  for (const client of clients) {
    stage = "signup"; const response = await api(null, "/api/health/auth/register", "POST", { email: client.email, password: client.password });
    check(response.status === 201); client.id = (await response.json()).user_id; capture(client, response); check(client.cookie);
  }
  const [first, second] = clients;
  stage = "initial-backup"; check((await (await api(first, "/api/research/backup")).json()).backup === null);
  stage = "save"; const saved = await save(first, null); check(saved.ok); let rev = (await saved.json()).revision;
  stage = "read"; const loaded = await api(first, "/api/research/backup"); check(loaded.ok && loaded.headers.get("cache-control").includes("no-store"));
  check((await loaded.json()).backup.format === "nutritiscan-research");
  stage = "owner-isolation"; check((await (await api(second, "/api/research/backup")).json()).backup === null);
  check((await save(second, rev, first.id)).status === 409); check((await save(second, rev)).status === 409);
  stage = "stale-write"; check((await save(first, null)).status === 409);
  stage = "concurrent-save";
  const raced = await Promise.all([save(first, rev), save(first, rev)]);
  check(raced.map((r) => r.status).sort().join(",") === "200,409");
  rev = (await raced.find((r) => r.status === 200).json()).revision;
  stage = "delete-snapshot"; const deleted = await api(first, "/api/research/backup", "DELETE", { accountId: first.id, revision: rev }); check(deleted.ok); const tombstone = await deleted.json(); check(tombstone.backup === null);
  check((await save(first, rev)).status === 409); check((await save(first, tombstone.revision)).ok);
  stage = "logout"; const old = first.cookie; check((await api(first, "/api/health/auth/logout", "POST")).ok);
  check((await api({ cookie: old }, "/api/research/backup")).status === 401);
  stage = "signin"; const login = await api(null, "/api/health/auth/login", "POST", { email: first.email, password: first.password }); check(login.ok); capture(first, login);
  check((await api(first, "/api/research/backup")).ok);
  console.log(JSON.stringify({ passed: true, checks: ["anonymous-denied", "explicit-save", "private-read", "owner-isolation", "account-binding", "revision-conflict", "concurrent-save", "delete-tombstone", "logout-revocation", "signin-restoration"] }));
} catch { console.error(JSON.stringify({ passed: false, stage })); process.exitCode = 1; }
finally {
  for (const client of clients.filter((c) => c.id)) {
    try {
      const login = await api(null, "/api/health/auth/login", "POST", { email: client.email, password: client.password });
      if (login.ok && (await login.json()).user_id === client.id) {
        capture(client, login);
        const response = await api(client, "/api/health/account", "DELETE", { password: client.password, confirmation: "DELETE MY HEALTH DATA" });
        client.removed = response.status === 204;
        if (client.removed) check((await api(client, "/api/research/backup")).status === 401);
      }
    } catch { client.removed = false; }
  }
  const removed = clients.filter((c) => c.id).every((c) => c.removed);
  console.log(JSON.stringify({ syntheticAccountsRemoved: removed }));
  if (!removed) process.exitCode = 1;
}
