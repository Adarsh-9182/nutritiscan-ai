import fs from "node:fs/promises";
import path from "node:path";

export async function writeNotices(inputs, destination) {
  const packages = new Map();
  for (const input of inputs) {
    if (!input.includes("node_modules/")) continue;
    let directory = path.dirname(path.resolve(input));
    while (directory.includes(`${path.sep}node_modules`)) {
      try {
        const metadata = JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8"));
        if (metadata.name && metadata.version) { packages.set(`${metadata.name}@${metadata.version}`, { directory, metadata }); break; }
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      directory = path.dirname(directory);
    }
  }
  const notices = ["NutritiScan desktop — third-party JavaScript component notices", "These notices apply to the components named below. They do not grant a license to NutritiScan's own source code."];
  for (const [name, { directory, metadata }] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    const filenames = (await fs.readdir(directory)).filter((name) => /^(licen[cs]e|copying|notice)([._-]|$)/i.test(name));
    const texts = [];
    for (const filename of filenames) { const file = path.join(directory, filename); if ((await fs.stat(file)).isFile()) texts.push(await fs.readFile(file, "utf8")); }
    if (!texts.length) throw new Error(`The bundled component ${name} needs a reviewed license notice before packaging.`);
    notices.push(`\n${"=".repeat(72)}\n${name}\nDeclared license: ${metadata.license ?? "See license below"}\n${texts.join("\n\n")}`);
  }
  await fs.writeFile(destination, notices.join("\n\n") + "\n");
}
