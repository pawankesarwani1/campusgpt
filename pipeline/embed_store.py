"""
embed_store.py — Embedding and ChromaDB storage module for CampusGPT.

Uses Google Generative AI Embeddings (models/embedding-001) via langchain-google-genai.
Stores document chunks in separate ChromaDB collections for notes, PYQs, syllabus, and uploads.
"""

import os
from typing import Optional

from dotenv import load_dotenv
from langchain_core.documents import Document
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import Chroma


# ──────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────

# Load environment variables from .env at project root
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

CHROMA_PERSIST_DIR = os.path.join(PROJECT_ROOT, "chroma_store")

# Collection names
COLLECTIONS = {
    "notes": "notes_collection",
    "syllabus": "syllabus_collection",
    "pyq": "pyq_collection",
    "uploads": "uploads_collection",
}

# All collection names as a list
ALL_COLLECTION_NAMES = list(COLLECTIONS.values())


# ──────────────────────────────────────────────────────────────
# Embedding model singleton
# ──────────────────────────────────────────────────────────────

_embeddings_model: Optional[GoogleGenerativeAIEmbeddings] = None


def get_embeddings_model() -> GoogleGenerativeAIEmbeddings:
    """
    Get or create the Google Generative AI Embeddings model.
    Uses GOOGLE_API_KEY from environment.
    """
    global _embeddings_model
    if _embeddings_model is None:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key or api_key == "your_key_here":
            raise ValueError(
                "GOOGLE_API_KEY is not set. "
                "Please set it in the .env file at the project root."
            )
        _embeddings_model = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-2",
            google_api_key=api_key,
        )
    return _embeddings_model


# ──────────────────────────────────────────────────────────────
# ChromaDB vector store helpers
# ──────────────────────────────────────────────────────────────

def _get_chroma_store(collection_name: str) -> Chroma:
    """
    Create/open a ChromaDB vector store for the given collection.

    Args:
        collection_name: Name of the ChromaDB collection.

    Returns:
        LangChain Chroma vector store instance.
    """
    return Chroma(
        collection_name=collection_name,
        embedding_function=get_embeddings_model(),
        persist_directory=CHROMA_PERSIST_DIR,
    )


# ──────────────────────────────────────────────────────────────
# Store documents
# ──────────────────────────────────────────────────────────────

def store_documents(documents: list[Document], collection_name: str) -> int:
    """
    Embed and store a list of LangChain Documents into a ChromaDB collection.

    Args:
        documents: List of Document objects (with page_content and metadata).
        collection_name: Target ChromaDB collection name.

    Returns:
        Number of documents stored.
    """
    if not documents:
        print(f"  [WARN] No documents to store in '{collection_name}'.")
        return 0

    store = _get_chroma_store(collection_name)

    # Add documents in batches to avoid API rate limits
    BATCH_SIZE = 10
    total_stored = 0

    import time
    for i in range(0, len(documents), BATCH_SIZE):
        batch = documents[i:i + BATCH_SIZE]
        store.add_documents(batch)
        total_stored += len(batch)
        print(f"  [STORE] Stored batch {i // BATCH_SIZE + 1} "
              f"({len(batch)} docs) -> '{collection_name}'")
        
        # Add a delay between batches to respect the 100 RPM free tier limit
        if i + BATCH_SIZE < len(documents):
            print("  [STORE] Sleeping for 32 seconds to respect Gemini API rate limits...")
            time.sleep(32)

    return total_stored


# ──────────────────────────────────────────────────────────────
# Query functions
# ──────────────────────────────────────────────────────────────

def query_collection(
    query: str,
    collection_name: str,
    k: int = 5,
    filter_metadata: Optional[dict] = None,
) -> list[Document]:
    """
    Query a single ChromaDB collection for similar documents.

    Args:
        query: Search query string.
        collection_name: ChromaDB collection to search.
        k: Number of results to return.
        filter_metadata: Optional metadata filter dict (ChromaDB where clause).

    Returns:
        List of matching Document objects, ranked by similarity.
    """
    store = _get_chroma_store(collection_name)

    kwargs = {"k": k}
    if filter_metadata:
        kwargs["filter"] = filter_metadata

    results = store.similarity_search(query, **kwargs)
    return results


def query_all(
    query: str,
    k: int = 5,
    filter_metadata: Optional[dict] = None,
) -> list[Document]:
    """
    Query all 3 primary collections (notes, syllabus, pyq) and merge results.
    Results are sorted by relevance (using similarity_search_with_score).

    Args:
        query: Search query string.
        k: Number of results per collection.
        filter_metadata: Optional metadata filter dict.

    Returns:
        Merged list of Documents from all collections, sorted by score.
    """
    all_results = []

    # Query the 3 main collections (excluding uploads unless specified)
    primary_collections = [
        COLLECTIONS["notes"],
        COLLECTIONS["syllabus"],
        COLLECTIONS["pyq"],
    ]

    for coll_name in primary_collections:
        try:
            store = _get_chroma_store(coll_name)
            kwargs = {"k": k}
            if filter_metadata:
                kwargs["filter"] = filter_metadata

            # Use similarity_search_with_score for ranking
            scored_results = store.similarity_search_with_score(query, **kwargs)

            for doc, score in scored_results:
                doc.metadata["_score"] = score
                doc.metadata["_collection"] = coll_name
                all_results.append((doc, score))

        except Exception as e:
            # Collection may not exist yet — that's fine
            print(f"  [WARN] Could not query '{coll_name}': {e}")
            continue

    # Sort by score (lower = more similar in ChromaDB's L2 distance)
    all_results.sort(key=lambda x: x[1])

    # Return top k documents overall
    return [doc for doc, score in all_results[:k]]


def query_all_including_uploads(
    query: str,
    k: int = 5,
    filter_metadata: Optional[dict] = None,
) -> list[Document]:
    """
    Query ALL 4 collections (notes, syllabus, pyq, uploads) and merge results.

    Args:
        query: Search query string.
        k: Number of results per collection.
        filter_metadata: Optional metadata filter dict.

    Returns:
        Merged and ranked list of Documents.
    """
    all_results = []

    for coll_name in ALL_COLLECTION_NAMES:
        try:
            store = _get_chroma_store(coll_name)
            kwargs = {"k": k}
            if filter_metadata:
                kwargs["filter"] = filter_metadata

            scored_results = store.similarity_search_with_score(query, **kwargs)

            for doc, score in scored_results:
                doc.metadata["_score"] = score
                doc.metadata["_collection"] = coll_name
                all_results.append((doc, score))

        except Exception as e:
            print(f"  [WARN] Could not query '{coll_name}': {e}")
            continue

    all_results.sort(key=lambda x: x[1])
    return [doc for doc, score in all_results[:k]]


# ──────────────────────────────────────────────────────────────
# Utility: check if a source_file already exists in a collection
# ──────────────────────────────────────────────────────────────

def source_file_exists(source_file: str, collection_name: str) -> bool:
    """
    Check if documents from a given source_file already exist in the collection.

    Args:
        source_file: The filename to check (e.g. "CB3491_unit1.pdf").
        collection_name: ChromaDB collection name.

    Returns:
        True if at least one document with that source_file exists.
    """
    try:
        store = _get_chroma_store(collection_name)
        results = store.similarity_search(
            query="test",  # dummy query, we only care about the filter
            k=1,
            filter={"source_file": source_file},
        )
        return len(results) > 0
    except Exception:
        return False


def get_collection_count(collection_name: str) -> int:
    """
    Get the number of documents in a ChromaDB collection.

    Args:
        collection_name: Name of the collection.

    Returns:
        Document count (0 if collection doesn't exist).
    """
    try:
        store = _get_chroma_store(collection_name)
        # Access the underlying ChromaDB collection
        collection = store._collection
        return collection.count()
    except Exception:
        return 0


# ──────────────────────────────────────────────────────────────
# CLI test
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("CampusGPT — Embedding & ChromaDB Store")
    print("=" * 60)

    # Print collection counts
    for label, coll_name in COLLECTIONS.items():
        count = get_collection_count(coll_name)
        print(f"  {label:>10}: {coll_name}  ->  {count} document(s)")

    # Quick embedding test
    print("\n[TEST] Generating test embedding...")
    model = get_embeddings_model()
    test_embedding = model.embed_query("What is normalization in DBMS?")
    print(f"  Embedding dimension: {len(test_embedding)}")
    print("  ✓ Embedding model is working.")
