import Foundation
import AppKit
import PDFKit
import Darwin

// One document per short-lived process. Input/output are bounded by the host as
// well. No document URLs, scripts, actions, attachments or network APIs are used.
struct ReaderError: Error { let message: String }
func fail(_ message: String) throws -> Never { throw ReaderError(message: message) }
func emit(_ object: Any) throws {
    let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
}

do {
    let mode = CommandLine.arguments.dropFirst().first ?? "extract"
    guard ["extract", "preview"].contains(mode) else { try fail("Unknown paper-reader operation.") }
    let data = FileHandle.standardInput.readData(ofLength: 20_000_001)
    guard data.count > 4 && data.count <= 20_000_000 && data.prefix(5) == Data("%PDF-".utf8) else { try fail("Choose a PDF smaller than 20 MB.") }
    guard let document = PDFDocument(data: data) else { try fail("This PDF is damaged or unsupported. The original was preserved.") }
    guard !document.isLocked && !document.isEncrypted else { try fail("Encrypted PDFs are not supported. Import an authorised unencrypted copy.") }
    guard document.pageCount > 0 && document.pageCount <= 80 else { try fail("Choose a PDF with 1–80 pages. Split a larger paper into an explicitly labelled extract.") }
    if mode == "preview" {
        guard CommandLine.arguments.count == 3, let number = Int(CommandLine.arguments[2]), number >= 1, number <= document.pageCount, let page = document.page(at: number - 1) else { try fail("Choose an existing PDF page.") }
        let image = page.thumbnail(of: NSSize(width: 1100, height: 1500), for: .mediaBox)
        guard let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]), png.count <= 5_000_000 else { try fail("The PDF page preview exceeds its display limit.") }
        try emit(["image": png.base64EncodedString(), "width": bitmap.pixelsWide, "height": bitmap.pixelsHigh, "page": number])
    } else {
        var sections: [[String: Any]] = [], total = 0
        for index in 0..<document.pageCount {
            guard let page = document.page(at: index) else { try fail("A PDF page could not be read. No partial extraction was imported.") }
            let text = (page.string ?? "").replacingOccurrences(of: "\u{0000}", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
            total += text.utf16.count
            guard text.utf16.count <= 40_000 && total <= 400_000 else { try fail("This PDF exceeds the text extraction limit. No pages were silently truncated.") }
            sections.append(["id": "p\(index + 1)", "label": "PDF page \(index + 1)", "page": index + 1, "text": text, "status": text.isEmpty ? "no-text" : "readable"])
        }
        let attributes = document.documentAttributes ?? [:]
        let title = String((attributes[PDFDocumentAttribute.titleAttribute] as? String ?? "").prefix(1000))
        let author = String((attributes[PDFDocumentAttribute.authorAttribute] as? String ?? "").prefix(2000))
        try emit(["engine": "apple-pdfkit-v1", "title": title, "author": author, "sections": sections])
    }
} catch {
    let message = (error as? ReaderError)?.message ?? "The PDF could not be processed. The original was preserved."
    try? emit(["error": message])
    exit(1)
}
