// Small, dependency-free PDFs for deterministic software tests. No research data.
export function textPdf(pages, title = "NutritiScan fictional software-test paper") {
  const escape = (s) => s.replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, "\\$&");
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Title (${escape(title)}) /Author (NutritiScan software test) >>`];
  const kids = [];
  for (const lines of pages) {
    const page = objects.length + 1, stream = page + 1; kids.push(`${page} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${stream} 0 R >>`);
    const content = lines.length ? `BT /F1 12 Tf 50 740 Td 22 TL ${lines.map((line) => `(${escape(line)}) Tj T*`).join(" ")} ET` : "";
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(" ")}] >>`;
  let output = "%PDF-1.4\n", offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(output)); output += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}
export const samplePaperPages = [
  ["NUTRITISCAN - FICTIONAL RESEARCH NOTE", "Software demonstration only. This is not a published study.", "", "Question", "How can an agent preserve the source and page of a quotation?", "", "Methods", "Eight invented measurements are stored in synthetic-cohort.csv.", "The values were constructed for deterministic software checks.", "No participants, specimens or biological experiments were involved."],
  ["RESULTS - SYNTHETIC SOFTWARE DATA ONLY", "", "The mean signal was 5 in model_A and 12 in model_B.", "Seven complete pairs had a Pearson correlation of 1.", "One signal value was missing and no values were imputed.", "", "Limitations", "These fictional values provide no evidence about cancer or treatment.", "A quotation match establishes text membership, not scientific validity.", "The third page is intentionally blank to test missing text handling."],
  [],
];
