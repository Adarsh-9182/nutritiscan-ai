import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";

const base = process.argv.find((arg) => arg.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:3134";
const release = JSON.parse(await fs.readFile(new URL("../../lib/desktop-release.json", import.meta.url), "utf8"));
const output = path.resolve("test-results"); await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
let stage = "website";
try {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1400, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/download", "/research", "/chat"]) {
      stage = `${route} at ${width}px`;
      const response = await page.goto(new URL(route, base).href);
      assert.equal(response.status(), 200);
      await page.getByRole("link", { name: "Download for Mac", exact: true }).first().waitFor();
      for (const link of await page.getByRole("link", { name: "Download for Mac", exact: true }).all()) assert.equal(await link.getAttribute("href"), route === "/download" ? release.url : "/download");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Horizontal overflow on ${stage}`);
      if (route === "/download") {
        await page.waitForFunction(() => [...document.images].some((image) => image.alt.startsWith("NutritiScan Mac app") && image.complete && image.naturalWidth > 0));
        assert.ok((await page.locator("body").innerText()).includes(release.sha256));
        await page.screenshot({ path: path.join(output, `web-download-${width}.png`), fullPage: true });
      }
    }
  }
  assert.deepEqual(errors, [], "Uncaught browser errors");
  if (process.argv.includes("--verify-download")) {
    stage = "public-download-integrity";
    await page.goto(new URL("/download", base).href);
    const waiting = page.waitForEvent("download", { timeout: 120000 });
    await page.getByRole("link", { name: "Download for Mac", exact: true }).click();
    const download = await waiting;
    assert.equal(download.suggestedFilename(), release.fileName);
    const file = await download.path();
    assert.ok(file, await download.failure());
    assert.equal((await fs.stat(file)).size, release.sizeBytes);
    const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk);
    assert.equal(hash.digest("hex"), release.sha256);
  }
  console.log(JSON.stringify({ passed: true, base, checks: ["homepage-download-link", "research-download-link", "health-chat-download-link", "install-page", "real-app-image", "desktop-and-mobile-layout", "release-metadata"], publicDownloadVerified: process.argv.includes("--verify-download"), version: release.version }));
} catch (error) { console.error(JSON.stringify({ passed: false, stage, error: error.message })); process.exitCode = 1; }
finally { await browser.close(); }
