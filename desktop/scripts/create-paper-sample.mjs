import fs from "node:fs/promises";
import { textPdf, samplePaperPages } from "./pdf-fixtures.mjs";
await fs.writeFile("resources/sample-paper.pdf", textPdf(samplePaperPages), { flag: "wx" });
console.log("Created resources/sample-paper.pdf (fictional software-test fixture, three pages).");
