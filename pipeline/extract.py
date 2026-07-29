"""
extract.py — PDF text extraction module for CampusGPT.

Uses PyMuPDF (fitz) to extract text from PDFs located in data/raw/.
Detects document type (syllabus, notes, pyq) from folder path.
Cleans extracted text and saves as .txt files in data/processed/.
"""

import os
import re
import fitz  # PyMuPDF


# ──────────────────────────────────────────────────────────────
# Path helpers
# ──────────────────────────────────────────────────────────────

# Resolve project root relative to this file: campusgpt/
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RAW_DIR = os.path.join(PROJECT_ROOT, "data", "raw")
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "data", "processed")


def _ensure_dir(path: str) -> None:
    """Create directory if it does not exist."""
    os.makedirs(path, exist_ok=True)


# ──────────────────────────────────────────────────────────────
# Text cleaning
# ──────────────────────────────────────────────────────────────

def clean_text(text: str) -> str:
    """
    Clean extracted PDF text:
    - Collapse multiple whitespace / newlines
    - Strip non-printable characters (keep basic punctuation)
    - Normalize unicode dashes and quotes
    """
    # Replace common unicode characters with ASCII equivalents
    text = text.replace("\u2018", "'").replace("\u2019", "'")
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    text = text.replace("\u2013", "-").replace("\u2014", "-")

    # Remove non-printable characters (keep newlines, tabs, standard printable)
    text = re.sub(r'[^\x20-\x7E\n\t]', ' ', text)

    # Collapse multiple spaces (but preserve single newlines for paragraph breaks)
    text = re.sub(r'[ \t]+', ' ', text)
    # Collapse 3+ newlines into 2
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip()


# ──────────────────────────────────────────────────────────────
# Document-type detection
# ──────────────────────────────────────────────────────────────

def detect_doc_type(pdf_path: str) -> str:
    """
    Detect document type from the folder path:
      data/raw/syllabus/  -> "syllabus"
      data/raw/notes/     -> "notes"
      data/raw/pyq/       -> "pyq"
      data/raw/uploads/   -> "student_upload"
    Falls back to "unknown" if none match.
    """
    normalized = pdf_path.replace("\\", "/").lower()

    if "/syllabus/" in normalized:
        return "syllabus"
    elif "/notes/" in normalized:
        return "notes"
    elif "/pyq/" in normalized:
        return "pyq"
    elif "/uploads/" in normalized:
        return "student_upload"
    else:
        return "unknown"


# ──────────────────────────────────────────────────────────────
# Core extraction
# ──────────────────────────────────────────────────────────────

def extract_single_pdf(pdf_path: str) -> str:
    """
    Extract all text from a single PDF file.

    Args:
        pdf_path: Absolute or relative path to the PDF.

    Returns:
        Cleaned concatenated text from all pages.
    """
    if not os.path.isfile(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    doc = fitz.open(pdf_path)
    pages_text = []

    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        page_text = page.get_text("text")
        if page_text:
            pages_text.append(page_text)

    doc.close()
    full_text = "\n\n".join(pages_text)
    return clean_text(full_text)


def extract_single_pdf_by_page(pdf_path: str) -> list[dict]:
    """
    Extract text from a PDF page-by-page.

    Args:
        pdf_path: Path to the PDF.

    Returns:
        List of dicts: [{"page": 1, "text": "..."}, ...]
    """
    if not os.path.isfile(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    doc = fitz.open(pdf_path)
    pages = []

    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        page_text = page.get_text("text")
        cleaned = clean_text(page_text) if page_text else ""
        if cleaned:
            pages.append({
                "page": page_num + 1,  # 1-indexed
                "text": cleaned
            })

    doc.close()
    return pages


# ──────────────────────────────────────────────────────────────
# Batch extraction helpers
# ──────────────────────────────────────────────────────────────

def extract_metadata_from_filename(filename: str) -> dict:
    """
    Parse subject_code and unit from filename.

    Expected patterns:
        CB3491_syllabus.pdf   -> subject_code=CB3491, unit=None
        CB3491_unit1.pdf      -> subject_code=CB3491, unit=unit1
        CB3491_unit3_notes.pdf-> subject_code=CB3491, unit=unit3
        CB3491_2023.pdf       -> subject_code=CB3491, unit=None

    Subject codes: 2 uppercase letters followed by 4 digits (e.g. CB3491, CS3491).
    """
    basename = os.path.splitext(filename)[0]

    # Extract subject code (pattern: 2 uppercase letters + 4 digits)
    code_match = re.search(r'([A-Z]{2}\d{4})', basename, re.IGNORECASE)
    subject_code = code_match.group(1).upper() if code_match else "UNKNOWN"

    # Extract unit number
    unit_match = re.search(r'(unit\s*\d+)', basename, re.IGNORECASE)
    unit = unit_match.group(1).lower().replace(" ", "") if unit_match else None

    return {
        "subject_code": subject_code,
        "unit": unit,
    }


def extract_all_pdfs() -> list[dict]:
    """
    Scan data/raw/syllabus/, data/raw/notes/, data/raw/pyq/ and extract all PDFs.

    For each PDF:
      1. Extract text page-by-page
      2. Save concatenated text to data/processed/<filename>.txt
      3. Return extraction metadata

    Returns:
        List of dicts with keys:
            pdf_path, doc_type, subject_code, unit, output_txt, pages
    """
    _ensure_dir(PROCESSED_DIR)

    subdirs = ["syllabus", "notes", "pyq"]
    results = []

    for subdir in subdirs:
        folder = os.path.join(RAW_DIR, subdir)
        if not os.path.isdir(folder):
            print(f"  [SKIP] Folder not found: {folder}")
            continue

        pdf_files = [f for f in os.listdir(folder) if f.lower().endswith(".pdf")]
        if not pdf_files:
            print(f"  [SKIP] No PDFs in {folder}")
            continue

        for pdf_file in sorted(pdf_files):
            pdf_path = os.path.join(folder, pdf_file)
            doc_type = detect_doc_type(pdf_path)
            meta = extract_metadata_from_filename(pdf_file)

            print(f"  [EXTRACT] {pdf_file}  ->  type={doc_type}, "
                  f"subject={meta['subject_code']}, unit={meta['unit']}")

            # Extract page-by-page
            pages = extract_single_pdf_by_page(pdf_path)

            # Save concatenated text to processed/
            full_text = "\n\n".join(p["text"] for p in pages)
            txt_filename = os.path.splitext(pdf_file)[0] + ".txt"
            txt_path = os.path.join(PROCESSED_DIR, txt_filename)
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(full_text)

            results.append({
                "pdf_path": pdf_path,
                "source_file": pdf_file,
                "doc_type": doc_type,
                "subject_code": meta["subject_code"],
                "unit": meta["unit"],
                "output_txt": txt_path,
                "pages": pages,
            })

    return results


# ──────────────────────────────────────────────────────────────
# CLI entry point
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("CampusGPT — PDF Text Extraction")
    print("=" * 60)
    results = extract_all_pdfs()
    print(f"\nExtracted {len(results)} PDF(s).")
    for r in results:
        page_count = len(r["pages"])
        print(f"  • {r['source_file']}  ->  {page_count} page(s)  ->  {r['output_txt']}")
