import os
from dotenv import load_dotenv
load_dotenv()
 
try:
    import chromadb
except ImportError:
    print("Run: pip install chromadb")
    exit(1)
 
CHROMA_DIR = os.getenv("CHROMA_PERSIST_DIR", "../chroma_store")
print(f"\n━━━ Checking ChromaDB at: {CHROMA_DIR} ━━━\n")
 
if not os.path.exists(CHROMA_DIR):
    print("❌ chroma_store folder does not exist!")
    print("   This means your pipeline/ingest_all.py was never run,")
    print("   OR the CHROMA_PERSIST_DIR path is wrong in your .env")
    exit(1)
 
client = chromadb.PersistentClient(path=CHROMA_DIR)
collections = client.list_collections()
 
if not collections:
    print("❌ No collections found in ChromaDB!")
    print("   Run: python pipeline/ingest_all.py")
    exit(1)
 
print("━━━ Collections found ━━━")
total = 0
for col in collections:
    count = col.count()
    total += count
    status = "✓" if count > 0 else "⚠ EMPTY"
    print(f"  {status}  {col.name}: {count} chunks")
    if count > 0 and count < 5:
        print(f"       ⚠ Only {count} chunks — may be too few for good retrieval")
 
print(f"\n  Total chunks: {total}")
 
if total == 0:
    print("\n❌ All collections are empty — PDF ingestion did not work.")
    print("   Check pipeline/ingest_all.py and re-run it.")
    exit(1)
 
# Check uploads_collection specifically
print("\n━━━ uploads_collection detail ━━━")
try:
    ucol = client.get_collection("uploads_collection")
    if ucol.count() == 0:
        print("  ⚠ uploads_collection is EMPTY")
        print("  This means your uploaded PDF was NOT stored correctly.")
        print("  Apply Bug 1 fix from rag_bug_fixes.py")
    else:
        sample = ucol.get(limit=5, include=["metadatas"])
        print(f"  ✓ {ucol.count()} chunks found")
        subjects = set(m.get("subject_code","?") for m in sample["metadatas"])
        print(f"  Subject codes: {subjects}")
except Exception as e:
    print(f"  uploads_collection not found: {e}")
    print("  This means no PDFs have been uploaded yet via the UI.")
 
# Test actual similarity search
print("\n━━━ Query Test ━━━")
api_key = os.getenv("GOOGLE_API_KEY","")
if not api_key:
    print("⚠ GOOGLE_API_KEY not found — skipping query test")
    exit(0)
 
try:
    from langchain_google_genai import GoogleGenerativeAIEmbeddings
    from langchain_community.vectorstores import Chroma
 
    # Try embedding models in order
    embed_models = ["models/gemini-embedding-2", "models/text-embedding-004"]
    embeddings = None
    for em in embed_models:
        try:
            e = GoogleGenerativeAIEmbeddings(model=em, google_api_key=api_key)
            e.embed_query("test")
            embeddings = e
            print(f"  Using embedding model: {em}")
            break
        except:
            continue
 
    if not embeddings:
        print("❌ Could not load embedding model — check API key")
        exit(1)
 
    test_queries = ["data mining", "what is data mining", "CS3352"]
    for col_name in ["notes_collection", "uploads_collection"]:
        print(f"\n  [{col_name}]")
        try:
            vs = Chroma(
                collection_name=col_name,
                embedding_function=embeddings,
                persist_directory=CHROMA_DIR,
            )
            for q in test_queries:
                docs = vs.similarity_search(q, k=2)
                if docs:
                    print(f"  ✓ Query '{q}' → {len(docs)} results")
                    print(f"    Top: {docs[0].page_content[:100]}...")
                    break
            else:
                print(f"  ⚠ No results for any test query")
                print(f"    Your chunks exist but similarity search returns nothing.")
                print(f"    Possible cause: embedding model mismatch between")
                print(f"    ingestion time and query time.")
        except Exception as e:
            print(f"  ⚠ Error: {e}")
 
    print("\n━━━ Diagnosis complete ━━━")
    print("If uploads_collection is empty → apply Bug 1 fix")
    print("If query returns no results   → apply Bug 2 fix (rag.py)")
    print("If chunks exist but wrong     → re-upload the PDF from UI")
 
except ImportError:
    print("Run: pip install langchain-google-genai langchain-community chromadb")
