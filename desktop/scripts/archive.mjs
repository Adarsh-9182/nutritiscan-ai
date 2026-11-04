import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";

if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("Archive the tested Apple Silicon app on macOS.");
const { version } = JSON.parse(await fs.readFile("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Use a numeric release version.");
const app = path.resolve("release/NutritiScan.app"), plist = path.join(app, "Contents/Info.plist");
const readPlist = (key) => execFileSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plist], { encoding: "utf8" }).trim();
if (readPlist("CFBundleShortVersionString") !== version) throw new Error("Repackage the app before creating this version's download.");
execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", app], { stdio: "pipe" });
const fileName = `NutritiScan-${version}-mac-arm64.zip`, destination = path.resolve("release", fileName);
try { await fs.access(destination); throw new Error("This download already exists. Preserve it and choose a new release version."); } catch (error) { if (error.code !== "ENOENT") throw error; }
const temporary = `${destination}.${randomUUID()}.tmp.zip`;
try {
  execFileSync("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, temporary], { stdio: "pipe" });
  await fs.rename(temporary, destination);
} finally { await fs.unlink(temporary).catch(() => {}); }
const hash = createHash("sha256");
for await (const chunk of createReadStream(destination)) hash.update(chunk);
const sha256 = hash.digest("hex"), tag = `desktop-v${version}`;
await fs.writeFile(`${destination}.sha256`, `${sha256}  ${fileName}\n`, { flag: "wx" });
const manifest = { version, tag, channel: "preview", architecture: "arm64", minimumMacOS: readPlist("LSMinimumSystemVersion"), fileName, sizeBytes: (await fs.stat(destination)).size, sha256, url: `https://github.com/Adarsh-9182/nutritiscan-ai/releases/download/${tag}/${fileName}` };
const manifestFile = path.resolve("../lib/desktop-release.json"), manifestTemp = `${manifestFile}.${randomUUID()}.tmp`;
try { await fs.writeFile(manifestTemp, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" }); await fs.rename(manifestTemp, manifestFile); } finally { await fs.unlink(manifestTemp).catch(() => {}); }
console.log(JSON.stringify(manifest));
