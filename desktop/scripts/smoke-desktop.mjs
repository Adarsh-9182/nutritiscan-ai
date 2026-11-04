import { _electron as electron } from "playwright-core";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url), packaged = process.argv.includes("--packaged"), live = process.argv.includes("--live"), binary = packaged ? path.resolve("release/NutritiScan.app/Contents/MacOS/NutritiScan") : require("electron");
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nutritiscan-desktop-qa-"));
const output = path.resolve("test-results"); await fs.mkdir(output, { recursive: true });
let app, stage = "launch";
const launch = async () => electron.launch({ executablePath: binary, args: packaged ? [] : [path.resolve(".")], env: { ...process.env, ...(process.argv.includes("--finder-env") ? { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" } : {}), NUTRITISCAN_DATA_DIR: directory } });
try {
  app = await launch(); const page = await app.firstWindow();
  stage = "welcome";
  await page.getByRole("button", { name: "Explore the sample project" }).waitFor();
  await page.screenshot({ path: path.join(output, "welcome.png") });
  const security = await app.evaluate(({ BrowserWindow }) => { const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return { isolation: p.contextIsolation, node: p.nodeIntegration, sandbox: p.sandbox }; });
  assert.deepEqual(security, { isolation: true, node: false, sandbox: true });
  stage = "sample-project";
  await page.getByRole("button", { name: "Explore the sample project" }).click();
  await page.getByRole("textbox", { name: "Research message" }).waitFor();
  await page.getByRole("button", { name: "instrument-readings.csv", exact: true }).click();
  await page.getByRole("button", { name: "Profile dataset", exact: true }).click();
  await page.getByText("6 rows · 3 columns", { exact: true }).waitFor();
  assert.ok((await page.locator(".dataset-profile").innerText()).includes("107.8333"));
  stage = "memory";
  await page.getByRole("tab", { name: "Memory", exact: true }).click();
  await page.getByRole("textbox", { name: "Project memory" }).fill("Synthetic QA handoff: inspect data quality before interpretation.");
  await page.getByRole("button", { name: "Save handoff", exact: true }).click();
  await page.getByText("Project handoff saved on this Mac.", { exact: true }).waitFor();
  stage = "terminal";
  await page.evaluate(() => { window.__qaTerminal = ""; window.biology.onTerminal((e) => { if (e.type === "data") window.__qaTerminal += e.data; }); });
  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await page.evaluate(() => window.biology.terminalInput("printf '\\116\\125\\124\\122\\111\\124\\111\\123\\103\\101\\116\\137\\117\\113\\n'\r"));
  await page.waitForFunction(() => window.__qaTerminal.includes("NUTRITISCAN_OK"));
  await page.getByRole("button", { name: "Close terminal", exact: true }).click();
  stage = "theme-and-layout";
  for (const width of [1400, 1000, 800]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["dark", "light"]) {
      await page.getByRole("button", { name: `Switch to ${theme} mode`, exact: true }).click();
      await page.waitForFunction((t) => document.querySelector(".workspace")?.classList.contains(t), theme);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(output, `workspace-${width}-${theme}.png`) });
    }
  }
  stage = "connect";
  await page.getByRole("button", { name: "Connect through Codex", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".agent-connection b")?.textContent?.includes("ChatGPT"), { timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Codex model"] option').length > 1);
  const state = await page.evaluate(async () => (await window.biology.call("state")).value);
  assert.equal(state.agent.auth.connected, true); assert.ok(state.agent.models.length > 0);
  let expectedMemory = "Synthetic QA handoff: inspect data quality before interpretation.";
  if (live) {
    stage = "live-agent-through-UI";
    await page.getByRole("textbox", { name: "Research message" }).fill("This is a synthetic desktop software test. Inspect the project and profile instrument-readings.csv. Save ui-analysis.md with row count, numeric mean, data limitations and a clear synthetic-data disclaimer. Update the project handoff. Do not search literature or claim any biological effect.");
    await page.getByRole("button", { name: "Send research message", exact: true }).click();
    const deadline = Date.now() + 180000;
    let result;
    while (Date.now() < deadline) {
      result = await page.evaluate(async () => (await window.biology.call("state")).value);
      if (result.project.session.messages.length >= 2 && !result.running) break;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    assert.equal(result.running, false, "Research did not reach a terminal status before the test deadline.");
    assert.equal(result.project.session.status, "completed", result.issue);
    for (const name of ["profile_dataset", "save_artifact", "update_project_memory"]) assert.ok(result.project.session.activities.some((a) => a.name === name && a.status === "completed"));
    expectedMemory = result.project.memory;
    await page.screenshot({ path: path.join(output, "live-native-agent.png") });
  }
  stage = "restart";
  await app.close(); app = await launch(); const restored = await app.firstWindow();
  await restored.getByRole("tab", { name: "Memory", exact: true }).click();
  assert.equal(await restored.getByRole("textbox", { name: "Project memory" }).inputValue(), expectedMemory);
  const finalState = JSON.parse(await fs.readFile(path.join(directory, "workspace.json"), "utf8"));
  assert.equal(finalState.projects.length, 1);
  console.log(JSON.stringify({ passed: true, checks: ["native-electron", "isolated-renderer", "sample-workspace", "CSV-statistics", "memory-save-and-restart", "interactive-PTY", "light-dark-800-1000-1400", "existing-chatgpt-login", "model-catalog"], models: state.agent.models.length, packaged, liveAgent: live }));
} catch (error) { console.error(JSON.stringify({ passed: false, stage, error: error.message })); process.exitCode = 1; }
finally { await app?.close().catch(() => {}); await fs.rm(directory, { recursive: true, force: true }); }
