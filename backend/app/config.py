"""
config.py — Application settings loaded from environment variables.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from backend/ directory
BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


class Settings:
    """Centralized application configuration."""

    # ── Google AI ──
    GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")

    # ── MongoDB ──
    MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    MONGODB_DB_NAME: str = os.getenv("MONGODB_DB_NAME", "campusgpt")

    # ── JWT ──
    # No insecure hardcoded fallback: if JWT_SECRET is missing the app must
    # refuse to start (enforced below) rather than silently sign tokens with a
    # publicly-known default that an attacker could use to forge admin tokens.
    JWT_SECRET: str = os.getenv("JWT_SECRET", "")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

    # ── ChromaDB ──
    CHROMA_PERSIST_DIR: str = os.getenv(
        "CHROMA_PERSIST_DIR",
        str(BACKEND_DIR.parent / "chroma_store")
    )

    # ── CORS ──
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",     # Vite dev server
        "http://127.0.0.1:5173",     # Vite dev server IP
        "http://localhost:3000",     # Next.js dev server
        "http://127.0.0.1:3000",
        "http://localhost:8000",     # Self
        "http://127.0.0.1:8000",
        "https://campusgpt.in",     # Production domain
        "*"                          # Allow all for local dev just in case
    ]

    # ── ChromaDB collection names ──
    NOTES_COLLECTION: str = "notes_collection"
    SYLLABUS_COLLECTION: str = "syllabus_collection"
    PYQ_COLLECTION: str = "pyq_collection"
    UPLOADS_COLLECTION: str = "uploads_collection"


settings = Settings()


# ──────────────────────────────────────────────────────────────
# Startup security checks — fail fast on insecure configuration
# ──────────────────────────────────────────────────────────────

if not settings.JWT_SECRET or len(settings.JWT_SECRET) < 32:
    raise RuntimeError(
        "CRITICAL: JWT_SECRET must be set in backend/.env and be at least 32 "
        "characters (256-bit entropy). Generate one with:\n"
        '    python -c "import secrets; print(secrets.token_urlsafe(48))"'
    )
