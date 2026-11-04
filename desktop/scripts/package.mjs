import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url);
if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("This local package target is Apple Silicon macOS.");
const electron = require("electron"), base = path.resolve("release"), destination = path.join(base, "NutritiScan.app");
await fs.mkdir(base, { recursive: true });
try { await fs.access(destination); throw new Error("The app bundle already exists. Preserve or move it before packaging a new version."); } catch (e) { if (e.code !== "ENOENT") throw e; }
const temporary = path.join(base, `NutritiScan-build-${randomUUID()}.app`);
try {
await fs.cp(path.resolve(electron, "../../.."), temporary, { recursive: true, verbatimSymlinks: true });
const contents = path.join(temporary, "Contents"), plist = path.join(contents, "Info.plist");
for (const [key, value] of Object.entries({ CFBundleDisplayName: "NutritiScan", CFBundleName: "NutritiScan", CFBundleIdentifier: "com.nutritiscan.biology", CFBundleExecutable: "NutritiScan", CFBundleShortVersionString: "0.1.0", CFBundleVersion: "0.1.0" })) execFileSync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, plist], { stdio: "pipe" });
await fs.rename(path.join(contents, "MacOS/Electron"), path.join(contents, "MacOS/NutritiScan"));
const appRoot = path.join(contents, "Resources/app"); await fs.mkdir(appRoot, { recursive: true });
await fs.cp("dist", path.join(appRoot, "dist"), { recursive: true }); await fs.cp("resources", path.join(appRoot, "resources"), { recursive: true });
await fs.writeFile(path.join(appRoot, "package.json"), JSON.stringify({ name: "nutritiscan-desktop", productName: "NutritiScan", version: "0.1.0", type: "module", main: "dist/main.mjs" }));
execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", "--timestamp=none", temporary], { stdio: "pipe" });
await fs.rename(temporary, destination);
console.log(destination);
} catch (error) { await fs.rm(temporary, { recursive: true, force: true }); throw error; }
