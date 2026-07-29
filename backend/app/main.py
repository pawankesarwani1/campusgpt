"""
main.py — FastAPI application entry point for CampusGPT.

Run with:
    cd backend
    uvicorn app.main:app --reload --port 8000
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.config import settings
from app.database import create_indexes, close_connection
from app.auth.routes import router as auth_router
from app.chat.routes import router as chat_router
from app.upload.routes import router as upload_router


# ──────────────────────────────────────────────────────────────
# Lifespan: startup & shutdown
# ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: create DB indexes on startup, close connection on shutdown."""
    # Startup
    print("[CampusGPT] Starting up...")
    await create_indexes()
    print("[CampusGPT] MongoDB indexes created.")
    yield
    # Shutdown
    print("[CampusGPT] Shutting down...")
    await close_connection()
    print("[CampusGPT] MongoDB connection closed.")


# ──────────────────────────────────────────────────────────────
# App factory
# ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="CampusGPT API",
    description="AI Study Assistant for Anna University Students — RAG-powered Q&A, "
                "13-mark answer generation, PYQ analysis, and PDF summarization.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


# ──────────────────────────────────────────────────────────────
# CORS middleware
# ──────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Compress API responses > 1KB (chat histories, exam papers, session lists)
app.add_middleware(GZipMiddleware, minimum_size=1000)


# ──────────────────────────────────────────────────────────────
# Include routers
# ──────────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(upload_router)
from app.features.exam_mode import router as features_router
app.include_router(features_router)


# ──────────────────────────────────────────────────────────────
# Health check
# ──────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "CampusGPT API running",
        "version": "1.0",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health():
    """Detailed health check."""
    return {
        "status": "healthy",
        "service": "CampusGPT API",
        "version": "1.0.0",
        "mongodb": settings.MONGODB_URI.split("@")[-1] if "@" in settings.MONGODB_URI else "localhost",
        "chroma_dir": settings.CHROMA_PERSIST_DIR,
    }
