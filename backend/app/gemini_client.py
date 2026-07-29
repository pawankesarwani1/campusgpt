"""
CampusGPT — gemini_client.py
Drop this file into your backend/app/ folder.
 
Handles:
  - 503 overload with automatic retry (3 attempts, 5s apart)
  - Model fallback: 2.5-flash -> 2.5-flash-lite -> 2.0-flash
  - Streaming support
  - Embeddings for ChromaDB RAG
 
Usage in rag.py:
  from app.gemini_client import get_llm, get_embeddings, WORKING_MODEL
"""
 
import time, os
from dotenv import load_dotenv
 
load_dotenv()
 
# ── Model priority list ────────────────────────────────
# Script tries each in order and sticks with the first that works
MODELS = [
    "gemini-2.5-flash",       # best — try first
    "gemini-2.5-flash-lite",  # lighter, almost always available
    "gemini-2.0-flash",       # older fallback
]
 
EMBED_MODELS = [
    "models/gemini-embedding-2",
    "models/gemini-embedding-2",
    "models/gemini-embedding-2",
]
 
WORKING_MODEL = None  # set after first successful call
 
# ─────────────────────────────────────────────────────
def _call_with_retry(fn, max_tries=3, wait=5):
    """Call fn(). On 503, wait and retry up to max_tries times."""
    for attempt in range(1, max_tries + 1):
        try:
            return fn()
        except Exception as e:
            err = str(e)
            is_overload = "503" in err or "429" in err or "RESOURCE_EXHAUSTED" in err or "UNAVAILABLE" in err or "high demand" in err.lower()
            if is_overload and attempt < max_tries:
                print(f"[CampusGPT] Overload/Rate limit - retry {attempt}/{max_tries} in {wait}s...")
                time.sleep(wait)
            else:
                raise
 
 
# ─────────────────────────────────────────────────────
def get_llm(streaming=True, temperature=0.3):
    """
    Returns a LangChain ChatGoogleGenerativeAI instance
    using the first available working model.
    """
    global WORKING_MODEL
 
    from langchain_google_genai import ChatGoogleGenerativeAI
 
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY not found in environment / .env file")
 
    # If we already found a working model, use it directly
    if WORKING_MODEL:
        return ChatGoogleGenerativeAI(
            model=WORKING_MODEL,
            google_api_key=api_key,
            temperature=temperature,
            streaming=streaming,
        )
 
    # Otherwise probe each model
    last_error = None
    for model_name in MODELS:
        try:
            print(f"[CampusGPT] Trying LLM model: {model_name}")
            llm = ChatGoogleGenerativeAI(
                model=model_name,
                google_api_key=api_key,
                temperature=temperature,
                streaming=streaming,
            )
            # quick smoke-test (non-streaming, cheap call)
            _call_with_retry(
                lambda: ChatGoogleGenerativeAI(
                    model=model_name,
                    google_api_key=api_key,
                    temperature=0,
                    streaming=False,
                ).invoke("hi")
            )
            WORKING_MODEL = model_name
            print(f"[CampusGPT] Using model: {WORKING_MODEL}")
            return llm
        except Exception as e:
            err = str(e)
            if "503" in err or "429" in err or "RESOURCE_EXHAUSTED" in err or "UNAVAILABLE" in err or "404" in err:
                print(f"[CampusGPT] {model_name} unavailable/rate-limited - trying next...")
                last_error = e
            else:
                raise  # unexpected error - surface it
 
    raise Exception(
        f"All Gemini models are currently unavailable.\n"
        f"Last error: {last_error}\n"
        f"Check status: https://status.cloud.google.com"
    )
 
 
# ─────────────────────────────────────────────────────
def get_embeddings():
    """
    Returns a LangChain GoogleGenerativeAIEmbeddings instance
    using the first available embedding model.
    """
    from langchain_google_genai import GoogleGenerativeAIEmbeddings
 
    api_key = os.getenv("GOOGLE_API_KEY")
    last_error = None
 
    for em in EMBED_MODELS:
        try:
            print(f"[CampusGPT] Trying embedding model: {em}")
            embeddings = GoogleGenerativeAIEmbeddings(
                model=em,
                google_api_key=api_key,
            )
            # quick smoke-test
            embeddings.embed_query("test")
            print(f"[CampusGPT] Using embedding model: {em}")
            return embeddings
        except Exception as e:
            print(f"[CampusGPT] {em} failed — trying next...")
            last_error = e
 
    raise Exception(f"All embedding models failed. Last error: {last_error}")
 
 
# ─────────────────────────────────────────────────────
# Quick self-test — run directly:  python gemini_client.py
if __name__ == "__main__":
    print("Testing gemini_client.py...\n")
    llm = get_llm(streaming=False)
    resp = llm.invoke("Say hello as CampusGPT in one sentence.")
    print(f"LLM response: {resp.content}\n")
    emb = get_embeddings()
    vec = emb.embed_query("What is Docker?")
    print(f"Embedding dims: {len(vec)}")
    print(f"\nWorking model: {WORKING_MODEL}")
