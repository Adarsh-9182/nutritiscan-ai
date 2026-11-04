import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await build({ entryPoints: ["src/renderer.jsx"], bundle: true, outfile: "dist/renderer.js", platform: "browser", format: "iife", target: "chrome144", jsx: "automatic", minify: true, define: { "process.env.NODE_ENV": '"production"' } });
await copyFile("src/index.html", "dist/index.html");
await build({ entryPoints: ["src/evidence-entry.mjs"], bundle: true, outfile: "dist/evidence.mjs", platform: "node", format: "esm", target: "node24" });
await build({ entryPoints: ["src/main.mjs"], bundle: true, outfile: "dist/main.mjs", platform: "node", format: "esm", target: "node24", external: ["electron"] });
await copyFile("src/preload.cjs", "dist/preload.cjs");
