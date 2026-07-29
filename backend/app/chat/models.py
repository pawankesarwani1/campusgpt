"""
chat/models.py — Pydantic models for chat sessions and messages.
"""

from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field


# ──────────────────────────────────────────────────────────────
# Request models
# ──────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    """Request body for /chat/ask endpoint."""
    query: str = Field(..., min_length=1, max_length=2000)
    subject_code: Optional[str] = Field(None, max_length=10)
    mode: Literal["general", "marks13", "pyq_predict", "summarize"] = "general"
    session_id: Optional[str] = None  # If None, a new session is created
    is_temporary: bool = False


class SessionCreate(BaseModel):
    """Request body for creating a new chat session."""
    title: str = Field(..., min_length=1, max_length=200)
    subject_code: Optional[str] = Field(None, max_length=10)


# ──────────────────────────────────────────────────────────────
# Response models
# ──────────────────────────────────────────────────────────────

class MessageOut(BaseModel):
    """A single chat message."""
    id: str
    session_id: str
    role: Literal["user", "assistant"]
    content: str
    mode: Optional[str] = None
    subject_code: Optional[str] = None
    created_at: datetime

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class SessionOut(BaseModel):
    """Chat session metadata."""
    id: str
    user_id: str
    title: str
    subject_code: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_message: Optional[str] = None
    message_count: int = 0
    is_shared: bool = False
    share_id: Optional[str] = None
    is_pinned: bool = False

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class SessionUpdate(BaseModel):
    """Request body for updating a chat session."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    is_pinned: Optional[bool] = None


class SessionDeleteResponse(BaseModel):
    """Response after deleting a session."""
    status: str = "deleted"
    session_id: str
    messages_deleted: int
