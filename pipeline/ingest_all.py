"""
ingest_all.py — Master ingestion script for CampusGPT.

Orchestrates the full pipeline:
  1. Scan all PDFs in data/raw/syllabus/, data/raw/notes/, data/raw/pyq/
  2. Extract text -> Chunk text -> Embed & Store in ChromaDB
  3. Skip already-processed files (idempotent)
  4. Print a summary report

Run:
    python pipeline/ingest_all.py

Or from project root:
    python -m pipeline.ingest_all
"""

import os
import sys
import time

# Ensure project root is on sys.path so imports work when running as script
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from pipeline.extract import extract_all_pdfs, extract_metadata_from_filename, detect_doc_type
from pipeline.chunk import chunk_pages, get_collection_name
from pipeline.embed_store import (
    store_documents,
    source_file_exists,
    get_collection_count,
    COLLECTIONS,
)


# ──────────────────────────────────────────────────────────────
# Summary tracker
# ──────────────────────────────────────────────────────────────

class IngestionSummary:
    """Track ingestion statistics."""

    def __init__(self):
        self.files_scanned = 0
        self.files_processed = 0
        self.files_skipped = 0
        self.chunks_per_collection = {name: 0 for name in COLLECTIONS.values()}
        self.errors = []

    def report(self) -> str:
        lines = [
            "",
            "=" * 60,
            "  INGESTION SUMMARY",
            "=" * 60,
            f"  Files scanned  : {self.files_scanned}",
            f"  Files processed: {self.files_processed}",
            f"  Files skipped  : {self.files_skipped} (already ingested)",
            f"  Errors         : {len(self.errors)}",
            "",
            "  Chunks stored per collection:",
        ]
        for coll_name, count in self.chunks_per_collection.items():
            total = get_collection_count(coll_name)
            lines.append(f"    {coll_name:>25}: +{count:>4} chunks  (total: {total})")

        if self.errors:
            lines.append("")
            lines.append("  Errors:")
            for err in self.errors:
                lines.append(f"    ✗ {err}")

        lines.append("=" * 60)
        return "\n".join(lines)


# ──────────────────────────────────────────────────────────────
# Main ingestion pipeline
# ──────────────────────────────────────────────────────────────

def run_ingestion() -> IngestionSummary:
    """
    Run the full ingestion pipeline:
      1. Extract all PDFs from data/raw/
      2. Chunk each document with metadata
      3. Store embeddings in the appropriate ChromaDB collection
      4. Skip files already in the collection (idempotent)

    Returns:
        IngestionSummary with statistics.
    """
    summary = IngestionSummary()

    print("\n" + "=" * 60)
    print("  CampusGPT — Full Data Ingestion Pipeline")
    print("=" * 60)

    # ── Step 1: Extract all PDFs ──
    print("\n[STEP 1] Extracting text from PDFs...")
    extracted = extract_all_pdfs()
    summary.files_scanned = len(extracted)

    if not extracted:
        print("  [INFO] No PDFs found to process.")
        print("  Place PDFs in:")
        print("    • data/raw/syllabus/  (e.g. CB3491_syllabus.pdf)")
        print("    • data/raw/notes/     (e.g. CB3491_unit1.pdf)")
        print("    • data/raw/pyq/       (e.g. CB3491_2023.pdf)")
        return summary

    # ── Step 2 & 3: Chunk and store each document ──
    print(f"\n[STEP 2] Chunking and storing {len(extracted)} document(s)...")

    for doc_info in extracted:
        source_file = doc_info["source_file"]
        doc_type = doc_info["doc_type"]
        collection_name = get_collection_name(doc_type)

        # Check if already ingested (idempotent)
        if source_file_exists(source_file, collection_name):
            print(f"  [SKIP] {source_file} already in '{collection_name}'")
            summary.files_skipped += 1
            continue

        try:
            # Build base metadata for this document
            base_metadata = {
                "subject_code": doc_info["subject_code"],
                "doc_type": doc_type,
                "unit": doc_info["unit"] if doc_info["unit"] else "",
                "source_file": source_file,
            }

            # Chunk the pages
            documents = chunk_pages(doc_info["pages"], base_metadata)

            if not documents:
                print(f"  [WARN] No chunks created for {source_file}")
                summary.errors.append(f"{source_file}: no chunks created")
                continue

            # Store in ChromaDB
            chunks_stored = store_documents(documents, collection_name)
            summary.chunks_per_collection[collection_name] += chunks_stored
            summary.files_processed += 1

            print(f"  [DONE] {source_file}  ->  {chunks_stored} chunks "
                  f"->  '{collection_name}'")

        except Exception as e:
            error_msg = f"{source_file}: {str(e)}"
            summary.errors.append(error_msg)
            print(f"  [ERROR] {error_msg}")

    return summary


# ──────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    start_time = time.time()

    summary = run_ingestion()

    elapsed = time.time() - start_time
    report = summary.report()
    print(report)
    print(f"\n  Total time: {elapsed:.1f}s")
