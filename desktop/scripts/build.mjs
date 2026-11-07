import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
import { writeNotices } from "./notices.mjs";
import { execFileSync } from "node:child_process";
await mkdir("dist", { recursive: true });
if (process.platform === "darwin") {
  await mkdir(".local/swift-module-cache", { recursive: true });
  execFileSync("/usr/bin/swiftc", ["native/paper-reader.swift", "-o", "dist/paper-reader", "-O", "-target", `${process.arch === "arm64" ? "arm64" : "x86_64"}-apple-macosx13.0`, "-module-cache-path", ".local/swift-module-cache", "-framework", "PDFKit", "-framework", "AppKit"], { stdio: "inherit" });
}
const renderer = await build({ entryPoints: ["src/renderer.jsx"], bundle: true, outfile: "dist/renderer.js", platform: "browser", format: "iife", target: "chrome144", jsx: "automatic", minify: true, metafile: true, define: { "process.env.NODE_ENV": '"production"' } });
await copyFile("src/index.html", "dist/index.html");
const evidence = await build({ entryPoints: ["src/evidence-entry.mjs"], bundle: true, outfile: "dist/evidence.mjs", platform: "node", format: "esm", target: "node24", metafile: true });
const main = await build({ entryPoints: ["src/main.mjs"], bundle: true, outfile: "dist/main.mjs", platform: "node", format: "esm", target: "node24", external: ["electron"], metafile: true });
await copyFile("src/preload.cjs", "dist/preload.cjs");
await writeNotices([renderer, evidence, main].flatMap((result) => Object.keys(result.metafile.inputs)), "dist/THIRD_PARTY_NOTICES.txt");
