// Optional browser regression. Uses the existing desktop Playwright dev dependency.
// All API responses are synthetic; this never invokes a model or clinical service.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(new URL("../desktop/package.json", import.meta.url));
const { chromium } = require("playwright-core");
const base = process.env.RESEARCH_BROWSER_URL || "http://127.0.0.1:3014";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Run this synthetic check against a local server only.");
const output = await mkdtemp(path.join(tmpdir(), "nutritiscan-study-planning-"));
const question = "Synthetic investigation: exercise and blood pressure in adults";
const source = { id: "pubmed:123", title: "Synthetic software-test source — not real research", url: "https://pubmed.ncbi.nlm.nih.gov/123/", kind: "paper", detail: "This is a synthetic fixture for a software check. No scientific conclusion is supported.", metadata: { year: 2026, hasAbstract: true, publicationTypes: ["Observational Study"] } };
const reply = { answer: null, model: null, sources: [source], status: "sources-only", coverage: [{ source: "pubmed", status: "done", count: 1 }, { source: "trials", status: "empty", count: 0 }], notice: "Synthetic browser fixture. Model drafting is disabled in this test.", retrievedAt: "2026-11-06T10:00:00.000Z" };
const fields = {
  "Research question": question,
  "Rationale and evidence gap": "Synthetic planning exercise only; no claim of novelty.",
  "Population and setting": "Fictional adult cohort for software verification.",
  "Eligibility criteria": "Synthetic inclusion and exclusion criteria; no participant records.",
  "Intervention or exposure": "Fictional recorded activity exposure.",
  Comparator: "Fictional comparator for a nonexecuted study.",
  "Outcomes and measurement timing": "Synthetic outcome and timing, awaiting methodological review.",
  "Study design and data collection": "Synthetic observational study proposal.",
  "Sample size rationale": "Not calculated; a statistician must determine assumptions and feasibility.",
  "Statistical analysis plan": "Synthetic prespecified analysis outline; no code executed.",
  "Ethics, consent and data management": "Institutional review not obtained. Synthetic data only.",
};
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const failures = [];
  let searches = 0, otherWrites = 0;
  page.on("pageerror", (error) => failures.push(error.message));
  await page.route("**/api/**", (route) => {
    const request = route.request();
    if (new URL(request.url()).pathname === "/api/research/chat" && request.method() === "POST") {
      searches++;
      return route.fulfill({ contentType: "application/x-ndjson", body: `${JSON.stringify({ type: "step", text: "Loading synthetic test sources…" })}\n${JSON.stringify({ type: "result", result: reply })}\n` });
    }
    if (request.method() !== "GET") otherWrites++;
    return route.fulfill({ json: { configured: false, account: null, plans: [], providers: [], models: [] } });
  });
  await page.goto(`${base}/research`);
  await page.getByRole("heading", { name: /What should we/ }).waitFor();
  await page.screenshot({ path: path.join(output, "research-empty-desktop.png") });
  await page.getByRole("textbox", { name: "Research message", exact: true }).fill(question);
  await page.getByRole("button", { name: "Send research message" }).click();
  const protocol = page.getByRole("region", { name: "Study protocol workspace" }).first();
  const create = protocol.getByRole("button", { name: "Create protocol draft" });
  await create.waitFor(); assert.equal(await create.isDisabled(), true);
  await page.locator("summary").filter({ hasText: /^Review sources/ }).first().click();
  await page.getByRole("button", { name: "Include", exact: true }).click();
  await create.click();
  assert.equal(await protocol.getByLabel("Research question", { exact: true }).inputValue(), question);
  assert.equal(await protocol.getByLabel("Sample size rationale", { exact: true }).inputValue(), "");
  const incompleteDownload = page.waitForEvent("download");
  await protocol.getByRole("button", { name: "Export protocol TXT" }).click();
  const incompleteFile = path.join(output, "incomplete-protocol.txt");
  await (await incompleteDownload).saveAs(incompleteFile);
  assert.match(await readFile(incompleteFile, "utf8"), /NOT PROVIDED/);
  await protocol.getByLabel("Protocol title").fill("Synthetic study planning acceptance check");
  for (const [label, value] of Object.entries(fields)) await protocol.getByLabel(label, { exact: true }).fill(value);
  const review = protocol.getByRole("checkbox", { name: /I personally reviewed/ });
  assert.equal(await review.isEnabled(), true); await review.check();
  await protocol.getByRole("button", { name: "Preview protocol" }).click();
  await protocol.getByRole("region", { name: "Protocol preview" }).waitFor();
  await protocol.getByRole("heading", { name: "Your working protocol" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "protocol-desktop.png") });
  const pending = page.waitForEvent("download");
  await protocol.getByRole("button", { name: "Export protocol TXT" }).click();
  const file = path.join(output, "study-protocol.txt"); await (await pending).saveAs(file);
  const exported = await readFile(file, "utf8");
  assert.match(exported, /Personally marked reviewed/); assert.ok(exported.includes(source.url));
  assert.ok(exported.includes(fields["Sample size rationale"])); assert.ok(!exported.includes("NOT PROVIDED"));
  await page.reload();
  await page.getByLabel("Protocol title").waitFor();
  assert.equal(await protocol.getByLabel("Protocol title").inputValue(), "Synthetic study planning acceptance check");
  assert.equal(await protocol.getByLabel("Statistical analysis plan", { exact: true }).inputValue(), fields["Statistical analysis plan"]);
  assert.equal(await review.isChecked(), true);
  await protocol.getByLabel("Comparator", { exact: true }).fill("Updated synthetic comparator");
  assert.equal(await review.isChecked(), false);
  await page.locator("summary").filter({ hasText: /^Review sources/ }).first().click();
  await page.getByRole("button", { name: "Exclude", exact: true }).click();
  await protocol.getByText(/Your Include decisions changed/).waitFor();
  assert.equal(await protocol.getByRole("button", { name: "Use current included sources" }).isDisabled(), true);
  await page.getByRole("button", { name: "Include", exact: true }).click();
  assert.equal(await review.isChecked(), false);
  assert.equal(searches, 1); assert.equal(otherWrites, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Mobile must not overflow");
  await protocol.getByRole("heading", { name: "Your working protocol" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "protocol-mobile.png") });
  await page.getByRole("button", { name: "Show or hide research conversations" }).click();
  await page.getByRole("button", { name: "Light", exact: true }).last().click();
  const backed = page.waitForEvent("download");
  await page.getByRole("button", { name: "Back up all", exact: true }).click();
  const backupFile = path.join(output, "research-backup.json"); await (await backed).saveAs(backupFile);
  assert.equal(JSON.parse(await readFile(backupFile, "utf8")).threads[0].turns[0].protocol.fields.comparator, "Updated synthetic comparator");
  await page.getByRole("button", { name: "Close conversation history" }).click();
  await protocol.getByRole("button", { name: "Preview protocol" }).click();
  await protocol.getByRole("region", { name: "Protocol preview" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "protocol-light-mobile.png") });
  await page.getByRole("button", { name: "Repeat search, keep protocol" }).click();
  await page.getByRole("region", { name: "Study protocol workspace" }).nth(1).waitFor();
  assert.equal(searches, 2); assert.equal(otherWrites, 0);
  assert.equal(await protocol.getByLabel("Protocol title").inputValue(), "Synthetic study planning acceptance check");
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ result: "PASS", output, checks: ["empty state", "search/source review", "explicit inclusion", "create/edit protocol without model calls", "incomplete export", "personal review", "real TXT download", "source bibliography", "reload", "review reset", "selection change", "mobile", "light theme", "backup", "repeat search preserves draft", "no runtime errors"], searches, otherWrites }));
} finally { await browser.close(); }
