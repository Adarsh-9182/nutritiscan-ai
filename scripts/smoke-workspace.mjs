// Runs against a local or explicitly chosen deployment; only synthetic data.
// The temporary test account and its records are removed in finally.
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const base = process.env.SMOKE_ORIGIN || "http://127.0.0.1:3100";
const username = `smoke_${randomBytes(7).toString("hex")}`;
const password = randomBytes(24).toString("base64url");
let cookie = "",
  created = false;
async function call(path, method = "GET", body, expected = 200, origin = base) {
  const result = await fetch(`${base}/api/workspace/${path}`, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(
    result.status,
    expected,
    `${method} ${path}: expected ${expected}, received ${result.status}`,
  );
  if (result.headers.get("set-cookie"))
    cookie = result.headers.get("set-cookie").split(";")[0];
  return result.json();
}
try {
  await call("state", "GET", undefined, 401);
  await call("register", "POST", {
    username,
    password,
    name: "Synthetic Smoke Test",
    consent: true,
    adult: true,
  });
  created = true;
  assert.deepEqual((await call("state")).reports, []);
  const report = {
    title: "Synthetic lab fixture",
    date: "2026-09-16",
    lab: "Test only",
    confirmed: true,
    notes: "Fictional data used by automated verification.",
    observations: [
      { name: "Vitamin B12", value: 245, unit: "pg/mL", low: 200, high: 900 },
    ],
  };
  const saved = await call(
    "records",
    "POST",
    { kind: "report", data: report },
    201,
  );
  assert.equal((await call("state")).reports[0].id, saved.id);
  assert.equal(
    (await call("assistant", "POST", { question: "Summarise my report" })).mode,
    "record-summary",
  );
  const earlier = await call("records", "POST", {
    kind: "report", data: { ...report, date: "2026-06-16", observations: [{ ...report.observations[0], value: 218 }] },
  }, 201);
  const comparison = await call("assistant", "POST", { question: "Compare my reports over time" });
  assert.equal(comparison.mode, "record-summary");
  assert.ok(comparison.text.includes("Recorded change: +27 pg/mL"));
  assert.ok((await call("assistant", "POST", { question: "Prepare questions for my doctor" })).text.includes("Questions prepared from your confirmed records"));
  await call("records", "DELETE", { id: earlier.id });
  assert.equal(
    (
      await call("assistant", "POST", {
        question: "I have crushing chest pain and cannot breathe",
      })
    ).mode,
    "escalation",
  );
  const task = await call(
    "records",
    "POST",
    {
      kind: "task",
      data: { title: "Synthetic appointment", date: "2026-09-20", done: false },
    },
    201,
  );
  await call("records", "POST", {
    kind: "task",
    id: task.id,
    version: 1,
    data: { title: "Synthetic appointment", date: "2026-09-20", done: true },
  });
  await call(
    "records",
    "POST",
    {
      kind: "task",
      id: task.id,
      version: 1,
      data: { title: "Stale appointment", date: "2026-09-20", done: false },
    },
    409,
  );
  assert.equal((await call("export")).tasks[0].done, true);
  await call(
    "records",
    "DELETE",
    { id: saved.id },
    403,
    "https://evil.example",
  );
  await call("logout", "POST", {});
  await call("state", "GET", undefined, 401);
  await call("login", "POST", { username, password });
  assert.equal((await call("state")).reports.length, 1);
  console.log(
    "PASS: signup, empty account, report persistence, summary, escalation, follow-up, concurrency, export, CSRF, logout and login.",
  );
} finally {
  if (created) {
    if (!cookie || cookie === "ns-session=")
      await call("login", "POST", { username, password });
    await call("account", "DELETE", { password });
    await call("state", "GET", undefined, 401);
    console.log(
      "PASS: synthetic account and records removed; session revoked.",
    );
  }
}
