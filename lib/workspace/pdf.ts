export async function readReportFile(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Please choose a file smaller than 5 MB.");
  if (/\.txt$/i.test(file.name)) return (await file.text()).slice(0, 100_000);
  if (!/\.pdf$/i.test(file.name))
    throw new Error("Choose a text-based PDF or a .txt file.");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useSystemFonts: true,
  });
  const timeout = setTimeout(() => {
    void task.destroy();
  }, 20_000);
  try {
    const doc = await task.promise;
    if (doc.numPages > 20)
      throw new Error("Choose a report with 20 pages or fewer.");
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let previousY: number | undefined;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5];
        if (previousY !== undefined && Math.abs(previousY - y) > 3)
          text += "\n";
        text += item.str + (item.hasEOL ? "\n" : " ");
        previousY = y;
        if (text.length > 100_000)
          throw new Error(
            "This report has too much text. Import a smaller section.",
          );
      }
      text += "\n";
    }
    if (!text.trim())
      throw new Error(
        "This PDF is scanned or has no readable text. Enter the results manually; image OCR is not available yet.",
      );
    return text;
  } finally {
    clearTimeout(timeout);
    await task.destroy();
  }
}
