"""
auth/models.py — Pydantic models for user authentication.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


# ──────────────────────────────────────────────────────────────
# Request models
# ──────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    """Registration request body."""
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    name: str = Field(..., min_length=1, max_length=100)
    college: str = Field(..., min_length=1, max_length=200)
    department: str = Field(..., min_length=1, max_length=100)
    avatar_color: Optional[str] = "#3B82F6"

class UserUpdate(BaseModel):
    """Update profile request body."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    college: Optional[str] = Field(None, min_length=1, max_length=200)
    department: Optional[str] = Field(None, min_length=1, max_length=100)
    avatar_color: Optional[str] = None


class UserLogin(BaseModel):
    """Login request body."""
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    """Refresh token request body."""
    refresh_token: str


# ──────────────────────────────────────────────────────────────
# Response models
# ──────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    """Public user profile returned in responses."""
    id: str
    email: str
    name: str
    college: str
    department: str
    avatar_color: str
    created_at: datetime

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class Token(BaseModel):
    """JWT token pair returned after login/register."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Decoded token payload."""
    user_id: Optional[str] = None
    email: Optional[str] = None
