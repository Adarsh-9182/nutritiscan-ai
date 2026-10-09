import re
from io import BytesIO

from pypdf import PdfReader

# Extraction proposes transcriptions, never interpretation or reference ranges.
ROW = re.compile(
    r"^\s*([A-Za-z][A-Za-z ()/\-]{1,100}?)\s*[:|]?\s+([0-9]+(?:\.[0-9]+)?)\s+(g/dL|g/L|mg/dL|mmol/L|ng/mL|pg/mL|mIU/L|IU/L|U/L|%|µg/L|ug/L)\b",
    re.I,
)


def extract(data, mime):
    if mime == "application/pdf":
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted or len(reader.pages) > 30:
            raise ValueError("Use an unencrypted PDF with at most 30 pages.")
        pages = [(page.extract_text() or "")[:50000] for page in reader.pages]
    else:
        import pytesseract
        from PIL import Image

        image = Image.open(BytesIO(data))
        if image.width * image.height > 25_000_000:
            raise ValueError("Use an image smaller than 25 megapixels.")
        pages = [pytesseract.image_to_string(image, timeout=30)[:50000]]
    candidates = []
    for page_number, text in enumerate(pages, 1):
        for line in text.splitlines():
            match = ROW.match(line)
            if not match:
                continue
            candidates.append(
                {
                    "name": match[1].strip(),
                    "value": float(match[2]),
                    "unit": match[3],
                    "measured_at": "",
                    "source_page": page_number,
                    "source_text": line[:1000],
                    "uncertain": True,
                }
            )
            if len(candidates) >= 200:
                break
    return {
        "pages": [{"page": i + 1, "text": text} for i, text in enumerate(pages)],
        "candidates": candidates,
        "review_note": "Check every name, value and unit against the original. Enter the collection date; it is never guessed.",
        "needs_ocr": mime == "application/pdf"
        and not any(text.strip() for text in pages),
    }
