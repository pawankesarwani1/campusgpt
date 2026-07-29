"""
chunk.py — Text chunking module for CampusGPT.

Uses LangChain RecursiveCharacterTextSplitter to split extracted text
into semantically meaningful chunks with rich metadata for retrieval.
"""

import re
from typing import Optional

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document


# ──────────────────────────────────────────────────────────────
# Splitter configuration
# ──────────────────────────────────────────────────────────────

# Using tiktoken-based token counting for accurate chunk sizing
# model "cl100k_base" is the tokenizer used by text-embedding-ada-002
# and is a reasonable proxy for general token counting.
CHUNK_SIZE = 500       # tokens
CHUNK_OVERLAP = 50     # tokens

_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    encoding_name="cl100k_base",
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
    separators=["\n\n", "\n", ". ", " ", ""],
)


# ──────────────────────────────────────────────────────────────
# Chunking functions
# ──────────────────────────────────────────────────────────────

def chunk_text(text: str, metadata: dict) -> list[Document]:
    """
    Split text into chunks and attach metadata to each chunk.

    Args:
        text: Raw or cleaned text to split.
        metadata: Dict with keys like:
            - subject_code (str): e.g. "CB3491"
            - doc_type (str): "notes" | "syllabus" | "pyq" | "student_upload"
            - unit (str | None): e.g. "unit1"
            - source_file (str): e.g. "CB3491_unit1.pdf"
            - page (int | None): page number of origin

    Returns:
        List of LangChain Document objects with text content and metadata.
    """
    if not text or not text.strip():
        return []

    # Create documents from text
    chunks = _splitter.split_text(text)

    documents = []
    for i, chunk in enumerate(chunks):
        chunk_meta = {
            **metadata,
            "chunk_index": i,
        }
        # Ensure all metadata values are serializable (ChromaDB requirement)
        # Convert None values to empty strings
        for key, value in chunk_meta.items():
            if value is None:
                chunk_meta[key] = ""

        documents.append(Document(page_content=chunk, metadata=chunk_meta))

    return documents


def chunk_pages(pages: list[dict], base_metadata: dict) -> list[Document]:
    """
    Chunk page-by-page extracted text, preserving page numbers in metadata.

    Args:
        pages: List of dicts from extract.extract_single_pdf_by_page():
               [{"page": 1, "text": "..."}, ...]
        base_metadata: Dict with subject_code, doc_type, unit, source_file.

    Returns:
        List of LangChain Document objects with per-page metadata.
    """
    all_documents = []

    for page_info in pages:
        page_num = page_info["page"]
        page_text = page_info["text"]

        if not page_text.strip():
            continue

        page_metadata = {
            **base_metadata,
            "page": page_num,
        }

        page_docs = chunk_text(page_text, page_metadata)
        all_documents.extend(page_docs)

    return all_documents


def chunk_full_text_with_pages(
    full_text: str,
    base_metadata: dict,
    page_markers: Optional[list[int]] = None
) -> list[Document]:
    """
    Alternative chunking for a single concatenated text.
    Splits the full text as one block (no per-page splitting).
    Useful for student uploads where page boundaries don't matter.

    Args:
        full_text: Full concatenated text.
        base_metadata: Metadata dict.
        page_markers: Optional list of character offsets where pages start.

    Returns:
        List of LangChain Documents.
    """
    metadata = {**base_metadata}
    if "page" not in metadata:
        metadata["page"] = 0  # 0 = full-document chunking, no specific page

    return chunk_text(full_text, metadata)


# ──────────────────────────────────────────────────────────────
# Utility: get doc_type -> collection name mapping
# ──────────────────────────────────────────────────────────────

DOC_TYPE_TO_COLLECTION = {
    "notes": "notes_collection",
    "syllabus": "syllabus_collection",
    "pyq": "pyq_collection",
    "student_upload": "uploads_collection",
}


def get_collection_name(doc_type: str) -> str:
    """Map a doc_type to its ChromaDB collection name."""
    return DOC_TYPE_TO_COLLECTION.get(doc_type, "notes_collection")


# ──────────────────────────────────────────────────────────────
# CLI test
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Quick test with sample text
    sample_text = (
        "Database Management Systems is a critical subject in computer science. "
        "Unit 1 covers the fundamentals of database design including ER diagrams, "
        "relational models, and normalization. Students must understand the difference "
        "between logical and physical data independence. The relational model was "
        "proposed by E.F. Codd in 1970 and remains the foundation of modern databases."
    )
    sample_meta = {
        "subject_code": "CB3491",
        "doc_type": "notes",
        "unit": "unit1",
        "source_file": "CB3491_unit1.pdf",
        "page": 1,
    }
    docs = chunk_text(sample_text, sample_meta)
    print(f"Created {len(docs)} chunk(s) from sample text.")
    for doc in docs:
        print(f"  Chunk {doc.metadata['chunk_index']}: "
              f"{len(doc.page_content)} chars | meta={doc.metadata}")
