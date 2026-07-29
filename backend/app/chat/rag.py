"""
chat/rag.py — RAG chain for CampusGPT.

Queries ChromaDB collections for relevant context, builds a prompt,
and streams the response from Gemini 1.5 Pro token-by-token.

Modes:
  - "general"     : Standard Q&A — notes + syllabus collections
  - "marks13"     : 13-mark answer generation — notes collection
  - "pyq_predict" : Important question prediction — PYQ collection
  - "summarize"   : Summarize uploaded PDF — uploads collection
"""

from typing import AsyncGenerator, Optional
import asyncio

from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.prompts import PromptTemplate
from langchain_core.documents import Document

from app.config import settings
from app.prompts.base_prompt import BASE_PROMPT_TEMPLATE
from app.prompts.marks13_prompt import MARKS13_PROMPT_TEMPLATE
from app.prompts.pyq_prompt import PYQ_PROMPT_TEMPLATE

from app.gemini_client import get_llm, get_embeddings

# ──────────────────────────────────────────────────────────────
# LLM & Embeddings initialization
# ──────────────────────────────────────────────────────────────

llm = get_llm(streaming=True, temperature=0.3)
embeddings = get_embeddings()


# ──────────────────────────────────────────────────────────────
# Prompt templates (keyed by mode)
# ──────────────────────────────────────────────────────────────

PROMPT_TEMPLATES = {
    "general": PromptTemplate(
        input_variables=["context", "question"],
        template=BASE_PROMPT_TEMPLATE,
    ),
    "marks13": PromptTemplate(
        input_variables=["context", "question"],
        template=MARKS13_PROMPT_TEMPLATE,
    ),
    "pyq_predict": PromptTemplate(
        input_variables=["context", "question"],
        template=PYQ_PROMPT_TEMPLATE,
    ),
    "summarize": PromptTemplate(
        input_variables=["context", "question"],
        template=(
            "SYSTEM: You are CampusGPT. Summarize the following uploaded document content "
            "in a clear, structured, and student-friendly manner. Use headings, bullet points, "
            "and highlight key concepts.\n\n"
            "Context:\n{context}\n\n"
            "Request: {question}\n"
            "Summary:"
        ),
    ),
}

# Mode -> which ChromaDB collections to query
MODE_COLLECTIONS = {
    "general": [settings.NOTES_COLLECTION, settings.SYLLABUS_COLLECTION, settings.UPLOADS_COLLECTION],
    "marks13": [settings.NOTES_COLLECTION, settings.UPLOADS_COLLECTION],
    "pyq_predict": [settings.PYQ_COLLECTION],
    "summarize": [settings.UPLOADS_COLLECTION],
}


# ──────────────────────────────────────────────────────────────
# Retriever factory
# ──────────────────────────────────────────────────────────────

def get_retriever(collection_name: str, k: int = 5, filter_dict: Optional[dict] = None):
    """
    Create a LangChain retriever backed by a ChromaDB collection.

    Args:
        collection_name: ChromaDB collection to search.
        k: Number of documents to retrieve.
        filter_dict: Optional metadata filter (e.g. {"subject_code": "CB3491"}).

    Returns:
        LangChain VectorStoreRetriever.
    """
    vectorstore = Chroma(
        collection_name=collection_name,
        embedding_function=embeddings,
        persist_directory=settings.CHROMA_PERSIST_DIR,
    )

    search_kwargs = {"k": k}
    if filter_dict:
        search_kwargs["filter"] = filter_dict

    return vectorstore.as_retriever(search_kwargs=search_kwargs)


# ──────────────────────────────────────────────────────────────
# Context retrieval
# ──────────────────────────────────────────────────────────────

def retrieve_context(
    query: str,
    collections: list[str],
    subject_code: Optional[str] = None,
    k: int = 5,
) -> tuple[str, list[Document]]:
    """
    Retrieve relevant documents from one or more ChromaDB collections.

    Args:
        query: User's question.
        collections: List of collection names to search.
        subject_code: Optional filter by subject code.
        k: Docs per collection.

    Returns:
        Tuple of (formatted_context_string, list_of_source_documents).
    """
    all_docs: list[Document] = []

    # When a subject is selected we still want to surface generic/ad-hoc
    # uploads (which are tagged "UNKNOWN" when no subject was given at upload
    # time). A hard {"subject_code": X} filter would hide those, so we match
    # the selected subject OR "UNKNOWN".
    filter_dict = None
    if subject_code and subject_code.upper() != "UNKNOWN":
        filter_dict = {"subject_code": {"$in": [subject_code.upper(), "UNKNOWN"]}}

    for coll_name in collections:
        try:
            retriever = get_retriever(coll_name, k=k, filter_dict=filter_dict)
            docs = retriever.invoke(query)
            all_docs.extend(docs)
        except Exception as e:
            # Collection may not exist or be empty
            print(f"[RAG] Warning: Could not query '{coll_name}': {e}")
            continue

    # Deduplicate chunks by content
    seen = set()
    unique_docs = []
    for doc in all_docs:
        key = doc.page_content[:100]
        if key not in seen:
            seen.add(key)
            unique_docs.append(doc)

    if not unique_docs:
        return "No relevant context found in the knowledge base.", []

    # Format context with source attribution
    context_parts = []
    for i, doc in enumerate(unique_docs[:8], 1):
        meta = doc.metadata
        source_info = (
            f"[Source {i}: {meta.get('source_file', 'unknown')} | "
            f"Type: {meta.get('doc_type', 'unknown')} | "
            f"Unit: {meta.get('unit', 'N/A')} | "
            f"Page: {meta.get('page', 'N/A')}]"
        )
        context_parts.append(f"{source_info}\n{doc.page_content}")

    formatted_context = "\n\n---\n\n".join(context_parts)
    return formatted_context, unique_docs


# ──────────────────────────────────────────────────────────────
# Main RAG streaming function
# ──────────────────────────────────────────────────────────────

async def rag_stream(
    query: str,
    subject_code: Optional[str] = None,
    mode: str = "general",
    k: int = 5,
) -> AsyncGenerator[str, None]:
    """
    Main RAG function. Retrieves context from ChromaDB, builds a prompt,
    and streams the LLM response token-by-token.

    Args:
        query: User's question or request.
        subject_code: Optional subject code to filter retrieval.
        mode: One of "general", "marks13", "pyq_predict", "summarize".
        k: Number of documents to retrieve per collection.

    Yields:
        String tokens from the LLM response as they are generated.
    """
    # 1. Select prompt template
    prompt_template = PROMPT_TEMPLATES.get(mode, PROMPT_TEMPLATES["general"])

    # 2. Determine which collections to query
    collections = MODE_COLLECTIONS.get(mode, MODE_COLLECTIONS["general"])

    # 3. Retrieve relevant context (run in thread to avoid blocking event loop)
    context, source_docs = await asyncio.to_thread(
        retrieve_context,
        query=query,
        collections=collections,
        subject_code=subject_code,
        k=k,
    )

    # 4. Build the full prompt
    full_prompt = prompt_template.format(context=context, question=query)

    # 5. Stream response from Gemini
    async for chunk in llm.astream(full_prompt):
        if chunk.content:
            yield chunk.content


# ──────────────────────────────────────────────────────────────
# Non-streaming RAG (for testing / fallback)
# ──────────────────────────────────────────────────────────────

async def rag_query(
    query: str,
    subject_code: Optional[str] = None,
    mode: str = "general",
    k: int = 5,
) -> dict:
    """
    Non-streaming RAG query. Returns the full response at once.

    Returns:
        Dict with "answer" (str) and "sources" (list of source metadata).
    """
    # Select prompt and collections
    prompt_template = PROMPT_TEMPLATES.get(mode, PROMPT_TEMPLATES["general"])
    collections = MODE_COLLECTIONS.get(mode, MODE_COLLECTIONS["general"])

    # Retrieve context (run in thread to avoid blocking event loop)
    context, source_docs = await asyncio.to_thread(
        retrieve_context,
        query=query,
        collections=collections,
        subject_code=subject_code,
        k=k,
    )

    # Build prompt and invoke LLM
    full_prompt = prompt_template.format(context=context, question=query)
    response = await llm.ainvoke(full_prompt)

    # Extract source metadata
    sources = [
        {
            "source_file": doc.metadata.get("source_file", ""),
            "doc_type": doc.metadata.get("doc_type", ""),
            "unit": doc.metadata.get("unit", ""),
            "page": doc.metadata.get("page", ""),
            "subject_code": doc.metadata.get("subject_code", ""),
        }
        for doc in source_docs
    ]

    return {
        "answer": response.content,
        "sources": sources,
    }
