"""
runtime_upload.py — Handle student PDF uploads at runtime for CampusGPT.

Provides a function to process a student-uploaded PDF:
  1. Save the file to data/raw/uploads/
  2. Extract text using extract.extract_single_pdf
  3. Chunk the text with metadata
  4. Store in the "uploads_collection" in ChromaDB
"""

import os
import time

from pipeline.extract import extract_single_pdf, extract_single_pdf_by_page
from pipeline.chunk import chunk_pages, chunk_full_text_with_pages, get_collection_name
from pipeline.embed_store import store_documents


# ──────────────────────────────────────────────────────────────
# Path helpers
# ──────────────────────────────────────────────────────────────

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# The desktop app sets CAMPUSGPT_DATA_DIR to a writable per-user folder.
UPLOADS_DIR = (
    os.path.join(os.environ["CAMPUSGPT_DATA_DIR"], "uploads")
    if os.getenv("CAMPUSGPT_DATA_DIR")
    else os.path.join(PROJECT_ROOT, "data", "raw", "uploads")
)


def _ensure_dir(path: str) -> None:
    """Create directory if it does not exist."""
    os.makedirs(path, exist_ok=True)


# ──────────────────────────────────────────────────────────────
# Runtime upload processing
# ──────────────────────────────────────────────────────────────

def process_uploaded_pdf(
    file_bytes: bytes,
    filename: str,
    subject_code: str = "UNKNOWN",
) -> dict:
    """
    Process a student-uploaded PDF file end-to-end:
      1. Save bytes to data/raw/uploads/<filename>
      2. Extract text page-by-page
      3. Chunk with metadata (doc_type="student_upload")
      4. Store chunks in "uploads_collection" in ChromaDB

    Args:
        file_bytes: Raw bytes of the uploaded PDF file.
        filename: Original filename (e.g. "my_notes.pdf").
        subject_code: Subject code to tag the upload with (e.g. "CB3491").
                      Defaults to "UNKNOWN" if not provided.

    Returns:
        Dict with keys:
            status (str): "success" or "error"
            chunks_stored (int): Number of chunks stored
            subject_code (str): Subject code used
            filename (str): Saved filename
            error (str): Error message if status is "error"
    """
    try:
        _ensure_dir(UPLOADS_DIR)

        # ── Step 1: Save PDF to disk ──
        import hashlib
        base, ext = os.path.splitext(filename)
        file_hash = hashlib.md5(file_bytes).hexdigest()[:12]
        safe_filename = f"{base}_{file_hash}{ext}"
        save_path = os.path.join(UPLOADS_DIR, safe_filename)

        if os.path.exists(save_path):
            print(f"  [UPLOAD] Duplicate detected. Skipping extraction: {save_path}")
            return {
                "status": "duplicate",
                "chunks_stored": 0,
                "subject_code": subject_code.upper(),
                "filename": safe_filename,
                "message": "File already exists in knowledge base."
            }

        temp_path = save_path + ".tmp"
        with open(temp_path, "wb") as f:
            f.write(file_bytes)

        print(f"  [UPLOAD] Saved temp: {temp_path}")

        # ── Step 2: Extract text ──
        from pipeline.ocr_extract import extract_text_smart
        result = extract_text_smart(temp_path, verbose=True)
        text = result["text"]

        if not text or not text.strip():
            return {
                "status": "error",
                "chunks_stored": 0,
                "subject_code": subject_code,
                "filename": safe_filename,
                "error": "No text could be extracted from the PDF.",
            }

        print(f"  [UPLOAD] Extracted text from {safe_filename}")

        # ── Step 3: Chunk text with metadata ──
        base_metadata = {
            "subject_code": subject_code.upper(),
            "doc_type": "student_upload",
            "unit": "",
            "source_file": safe_filename,
            "ocr_method": result["method"],
            "pages": result["pages"],
        }

        documents = chunk_full_text_with_pages(text, base_metadata)

        if not documents:
            return {
                "status": "error",
                "chunks_stored": 0,
                "subject_code": subject_code,
                "filename": safe_filename,
                "error": "Text was extracted but no chunks were created.",
            }

        print(f"  [UPLOAD] Created {len(documents)} chunk(s)")

        # ── Step 4: Store in ChromaDB uploads_collection ──
        # We store ONLY here (not also in notes_collection): every chunk stored
        # is embedded via the Gemini API, so a second store would double the
        # embedding-API usage and hit the quota twice as fast. Retrieval already
        # searches uploads_collection in general/marks13/summarize modes, so a
        # single store keeps the upload fully findable.
        collection_name = get_collection_name("student_upload")
        chunks_stored = store_documents(documents, collection_name)

        print(f"  [UPLOAD] Stored {chunks_stored} chunk(s) in '{collection_name}'")

        # ── Step 5: Mark as success (Rename temp to final) ──
        if os.path.exists(temp_path):
            os.rename(temp_path, save_path)

        return {
            "status": "success",
            "chunks_stored": chunks_stored,
            "subject_code": subject_code.upper(),
            "filename": safe_filename,
        }

    except Exception as e:
        # Clean up temp file if exists
        if 'temp_path' in locals() and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except:
                pass

        # Surface a friendly message for Google API quota / rate-limit errors
        # instead of the raw RESOURCE_EXHAUSTED JSON blob.
        raw = str(e)
        if any(t in raw for t in ("RESOURCE_EXHAUSTED", "429")) or "quota" in raw.lower():
            friendly = (
                "The AI embedding service has hit its usage limit (Google API quota "
                "exceeded). Please wait a few minutes and try again — or upload a smaller "
                "PDF. If this keeps happening, the API key's daily quota is used up."
            )
        else:
            friendly = raw

        return {
            "status": "error",
            "chunks_stored": 0,
            "subject_code": subject_code,
            "filename": filename,
            "error": friendly,
        }


# ──────────────────────────────────────────────────────────────
# CLI test
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    print("=" * 60)
    print("CampusGPT — Runtime Upload Processor")
    print("=" * 60)

    if len(sys.argv) < 2:
        print("\nUsage: python -m pipeline.runtime_upload <pdf_path> [subject_code]")
        print("Example: python -m pipeline.runtime_upload ./my_notes.pdf CB3491")
        sys.exit(1)

    pdf_path = sys.argv[1]
    subject = sys.argv[2] if len(sys.argv) > 2 else "UNKNOWN"

    if not os.path.isfile(pdf_path):
        print(f"Error: File not found: {pdf_path}")
        sys.exit(1)

    with open(pdf_path, "rb") as f:
        file_bytes = f.read()

    result = process_uploaded_pdf(
        file_bytes=file_bytes,
        filename=os.path.basename(pdf_path),
        subject_code=subject,
    )

    print(f"\nResult: {result}")
