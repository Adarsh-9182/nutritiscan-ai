// Exercise the live client with synthetic local documents and intercepted APIs.
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(new URL("../desktop/package.json", import.meta.url)), { chromium } = require("playwright-core");
const origin = new URL(process.argv.find((arg) => arg.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:3014").origin;
if (!["127.0.0.1", "localhost", "www.nutritiscan.com"].includes(new URL(origin).hostname)) throw new Error("Use the local preview or authorized production domain.");
const nativeFile = path.resolve("desktop/test-results/study-plan-mac.json"), original = JSON.parse(await fs.readFile(nativeFile, "utf8"));
const output = path.resolve(".local/study-transfer-checks"); await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } }), page = await context.newPage(), errors = [];
  let writes = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    if (route.request().method() !== "GET") { writes++; return route.abort(); }
    await route.fulfill({ json: { configured: false, account: null, plans: [] } });
  });
  await page.goto(`${origin}/research`);
  await page.getByRole("button", { name: "Show or hide research conversations", exact: true }).waitFor();
  await page.evaluate(() => localStorage.setItem("ns-research-chat-v1", JSON.stringify({ version: 1, activeId: null, threads: [{ id: "existing-work", title: "Existing synthetic browser work", query: "", updatedAt: 1, turns: [] }] })));
  await page.reload();
  await page.getByRole("button", { name: "Show or hide research conversations", exact: true }).click();
  await page.getByLabel("Mac study draft file", { exact: true }).setInputFiles(nativeFile);
  await page.getByRole("region", { name: "Study draft import preview", exact: true }).waitFor();
  await page.getByRole("button", { name: "Open imported study draft", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Protocol title", exact: true });
  await title.waitFor(); assert.equal(await title.inputValue(), original.protocol.title);
  await page.getByText("Biology context snapshot", { exact: true }).click();
  await page.getByText("Synthetic cell model", { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Statistical analysis plan", exact: true }).fill("Updated in the browser after a native Mac transfer.");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export draft for Mac", exact: true }).click();
  const download = await pending, returnedFile = path.resolve("desktop/test-results/study-plan-web-return.json"); await download.saveAs(returnedFile);
  const returned = JSON.parse(await fs.readFile(returnedFile, "utf8"));
  assert.equal(returned.protocol.fields.analysis, "Updated in the browser after a native Mac transfer.");
  assert.deepEqual(returned.bibliography, original.bibliography); assert.deepEqual(returned.protocol.biologyContext, original.protocol.biologyContext);
  assert.equal(returned.protocol.reviewedAt, null);
  await page.reload();
  assert.equal(await page.getByRole("textbox", { name: "Statistical analysis plan", exact: true }).inputValue(), returned.protocol.fields.analysis);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ns-research-chat-v1")));
  assert.equal(stored.threads.length, 2); assert.equal(stored.threads[0].title, "Existing synthetic browser work");
  assert.equal(stored.threads[1].turns[0].reply.status, "sources-only");
  await title.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, "web-import-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 }); await title.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(output, "web-import-mobile.png") });
  assert.equal(writes, 0); assert.deepEqual(errors, []);
  const result = { passed: true, origin, apiFixtures: true, modelCalls: 0, liveAccountWrites: 0, checks: ["native-JSON-import-preview", "existing-work-preserved", "context-and-bibliography-retained", "review-reset", "browser-edit", "JSON-return-to-Mac", "reload", "desktop-mobile", "no-runtime-errors"], returnedFile };
  await fs.writeFile(path.join(output, "result.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await browser.close(); }
