/**
 * Browser-side text extraction for uploaded documents (PDF, DOCX, CSV, XLS/XLSX,
 * and any text format). Parsers are imported on demand so they only load for
 * the file types that need them. Throws an Error with a user-facing message.
 */

export const ACCEPTED_DOCS = ".md,.markdown,.txt,.pdf,.docx,.csv,.xls,.xlsx,.json,.yaml,.yml";

export async function extractText(file: File): Promise<string> {
  const lower = file.name.toLowerCase();

  if (file.type === "application/pdf" || lower.endsWith(".pdf")) {
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf");
      // Load the worker from a CDN to avoid Next.js chunk 404s, pinned to the library version.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pdfjs as any).GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${(pdfjs as any).version}/legacy/build/pdf.worker.min.js`;
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const content = await (await pdf.getPage(i)).getTextContent();
        pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
      }
      return pages.join("\n\n");
    } catch {
      throw new Error("Could not read this PDF. Try a .txt/.md export or a different PDF.");
    }
  }

  if (lower.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    try {
      const mammoth = await import("mammoth");
      return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
    } catch {
      throw new Error("Could not extract text from this .docx file.");
    }
  }

  if (lower.endsWith(".doc")) throw new Error(".doc (binary) files are not supported. Convert to .docx or PDF.");

  if (lower.endsWith(".csv") || file.type === "text/csv") {
    try {
      const papa = await import("papaparse");
      const parsed = papa.parse(await file.text(), { skipEmptyLines: true });
      return (parsed.data as unknown[]).map((row) => (Array.isArray(row) ? row.join(" ") : String(row))).join("\n");
    } catch {
      throw new Error("Could not parse this CSV file.");
    }
  }

  if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) {
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      return workbook.SheetNames.map((name) => `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join("\n\n");
    } catch {
      throw new Error("Could not parse this Excel file.");
    }
  }

  return file.text();
}
