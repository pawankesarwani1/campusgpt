"""
CampusGPT — ocr_extract.py
Handles image-based / scanned PDFs using Gemini Vision.
Drop into: backend/pipeline/ocr_extract.py

How it works:
  1. Try PyMuPDF text extraction first (fast, free)
  2. If text is empty or too short → PDF is image-based
  3. Convert each page to a PNG image
  4. Send each image to Gemini 2.5 Flash Vision
  5. Gemini reads the image and returns extracted text
  6. Clean and return full text for chunking

Requirements:
  pip install pymupdf google-generativeai pillow
"""

import os, io, base64, re
import fitz                          # PyMuPDF
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

# ── constants ──────────────────────────────────────────────────────────────
MIN_TEXT_CHARS   = 100    # if extracted text < this, treat as image-based PDF
GEMINI_MODEL     = "gemini-2.5-flash"
IMAGE_DPI        = 200    # higher = better OCR, slower. 150-200 is sweet spot
MAX_PAGES        = 80     # safety limit


# ── helpers ────────────────────────────────────────────────────────────────

def _clean_text(text: str) -> str:
    """Remove common OCR artifacts and normalize whitespace."""
    text = re.sub(r'\f', '\n', text)            # form feeds
    text = re.sub(r'[ \t]+', ' ', text)         # multiple spaces
    text = re.sub(r'\n{3,}', '\n\n', text)      # excess blank lines
    text = re.sub(r'[^\x00-\x7F\u0900-\u097F]', '', text)  # keep ASCII + Devanagari
    return text.strip()


def _page_to_base64_png(page) -> str:
    """Render a PDF page to PNG and return as base64 string."""
    mat    = fitz.Matrix(IMAGE_DPI / 72, IMAGE_DPI / 72)  # scale to DPI
    pixmap = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    png    = pixmap.tobytes("png")
    return base64.b64encode(png).decode("utf-8")


def _gemini_vision_ocr(image_b64: str, page_num: int) -> str:
    """Send one page image to Gemini Vision and get back extracted text."""
    model = genai.GenerativeModel(GEMINI_MODEL)

    prompt = (
        "You are an OCR engine for Anna University academic documents. "
        "Extract ALL text from this page image exactly as written. "
        "Preserve headings, bullet points, numbered lists, and tables. "
        "If there are diagrams, describe them briefly in [DIAGRAM: ...] tags. "
        "Return ONLY the extracted text — no commentary, no preamble."
    )

    response = model.generate_content([
        prompt,
        {
            "mime_type": "image/png",
            "data":      image_b64,
        }
    ])

    return response.text.strip()


# ── main public functions ───────────────────────────────────────────────────

def is_image_based_pdf(pdf_path: str) -> bool:
    """
    Returns True if the PDF has little/no text layer (i.e. it is a scanned image).
    Fast check — reads first 3 pages only.
    """
    doc        = fitz.open(pdf_path)
    pages      = min(3, len(doc))
    total_text = ""
    for i in range(pages):
        total_text += doc[i].get_text()
    doc.close()
    return len(total_text.strip()) < MIN_TEXT_CHARS


def extract_text_normal(pdf_path: str) -> str:
    """Extract text from a normal (text-layer) PDF using PyMuPDF."""
    doc  = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text() + "\n"
    doc.close()
    return _clean_text(text)


def extract_text_ocr(pdf_path: str, verbose: bool = True) -> dict:
    """
    Extract text from an image-based PDF using Gemini Vision OCR.

    Returns:
        {
            "text":       str,   # full extracted text
            "pages":      int,   # number of pages processed
            "method":     str,   # "gemini_vision_ocr"
            "page_texts": list   # per-page extracted text
        }
    """
    doc        = fitz.open(pdf_path)
    total_pages = min(len(doc), MAX_PAGES)
    page_texts = []

    if verbose:
        print(f"[OCR] Image-based PDF detected: {os.path.basename(pdf_path)}")
        print(f"[OCR] Processing {total_pages} pages with Gemini Vision...")

    for i in range(total_pages):
        page  = doc[i]
        b64   = _page_to_base64_png(page)
        text  = _gemini_vision_ocr(b64, i + 1)
        page_texts.append(text)

        if verbose:
            print(f"[OCR] Page {i+1}/{total_pages} — {len(text)} chars extracted")

    doc.close()

    full_text = "\n\n".join(page_texts)
    return {
        "text":       _clean_text(full_text),
        "pages":      total_pages,
        "method":     "gemini_vision_ocr",
        "page_texts": page_texts,
    }


def extract_text_smart(pdf_path: str, verbose: bool = True) -> dict:
    """
    Smart extractor — auto-detects PDF type and uses the right method.
    This is the main function to call from runtime_upload.py.

    Returns:
        {
            "text":   str,
            "pages":  int,
            "method": "pymupdf" | "gemini_vision_ocr"
        }
    """
    if is_image_based_pdf(pdf_path):
        if verbose:
            print(f"[SmartExtract] Using Gemini Vision OCR for: {pdf_path}")
        result = extract_text_ocr(pdf_path, verbose)
        return result
    else:
        if verbose:
            print(f"[SmartExtract] Using PyMuPDF for: {pdf_path}")
        text = extract_text_normal(pdf_path)
        doc  = fitz.open(pdf_path)
        pages = len(doc)
        doc.close()
        return {
            "text":   text,
            "pages":  pages,
            "method": "pymupdf",
        }


# ── quick self-test ────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python ocr_extract.py path/to/your.pdf")
        sys.exit(1)

    path   = sys.argv[1]
    result = extract_text_smart(path, verbose=True)

    print("\n" + "="*50)
    print(f"Method : {result['method']}")
    print(f"Pages  : {result['pages']}")
    print(f"Chars  : {len(result['text'])}")
    print(f"Preview:\n{result['text'][:500]}...")
