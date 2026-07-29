"""
auth/routes.py — Authentication endpoints for CampusGPT.

Endpoints:
  POST /auth/register  — Create a new user account
  POST /auth/login     — Authenticate and get tokens
  POST /auth/refresh   — Refresh an expired access token
  GET  /auth/me        — Get current user profile
"""

from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status, Depends

from app.database import get_users_collection
from app.auth.models import (
    UserCreate,
    UserLogin,
    UserOut,
    UserUpdate,
    Token,
    RefreshRequest,
)
from app.auth.utils import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Brute-force protection: lock an account after too many failed logins.
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


# ──────────────────────────────────────────────────────────────
# POST /auth/register
# ──────────────────────────────────────────────────────────────

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate):
    """
    Register a new user account.

    - Checks for duplicate email
    - Hashes password with bcrypt
    - Stores user in MongoDB
    - Returns access + refresh tokens
    """
    users = get_users_collection()

    # Check if email already exists
    existing = await users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    # Create user document
    user_doc = {
        "email": user_data.email,
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "college": user_data.college,
        "department": user_data.department,
        "avatar_color": user_data.avatar_color or "#3B82F6",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    result = await users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    # Generate tokens
    token_data = {"sub": user_id, "email": user_data.email}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
    )


# ──────────────────────────────────────────────────────────────
# POST /auth/login
# ──────────────────────────────────────────────────────────────

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin):
    """
    Authenticate a user and return JWT tokens.

    - Verifies email exists in MongoDB
    - Verifies password against bcrypt hash
    - Returns access + refresh tokens
    """
    users = get_users_collection()

    user_doc = await users.find_one({"email": credentials.email})
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    now = datetime.now(timezone.utc)

    # Reject login while the account is temporarily locked from too many
    # failed attempts.
    lockout_until = user_doc.get("lockout_until")
    if lockout_until:
        # Stored datetimes come back naive (UTC) from Mongo — normalise.
        if lockout_until.tzinfo is None:
            lockout_until = lockout_until.replace(tzinfo=timezone.utc)
        if lockout_until > now:
            minutes_left = int((lockout_until - now).total_seconds() // 60) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed attempts. Try again in {minutes_left} minute(s).",
            )

    if not verify_password(credentials.password, user_doc["password_hash"]):
        # Count this failure; lock the account once the threshold is hit.
        attempts = user_doc.get("failed_login_attempts", 0) + 1
        update = {"failed_login_attempts": attempts}
        detail = "Invalid email or password."
        if attempts >= MAX_FAILED_ATTEMPTS:
            update["lockout_until"] = now + timedelta(minutes=LOCKOUT_MINUTES)
            update["failed_login_attempts"] = 0
            detail = f"Too many failed attempts. Account locked for {LOCKOUT_MINUTES} minutes."
        await users.update_one({"_id": user_doc["_id"]}, {"$set": update})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
        )

    # Successful login — clear any failed-attempt / lockout state.
    if user_doc.get("failed_login_attempts") or user_doc.get("lockout_until"):
        await users.update_one(
            {"_id": user_doc["_id"]},
            {"$set": {"failed_login_attempts": 0, "lockout_until": None}},
        )

    user_id = str(user_doc["_id"])
    token_data = {"sub": user_id, "email": user_doc["email"]}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
    )


# ──────────────────────────────────────────────────────────────
# POST /auth/refresh
# ──────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=Token)
async def refresh_token(body: RefreshRequest):
    """
    Exchange a valid refresh token for a new access token.

    - Decodes the refresh token
    - Verifies it's a refresh-type token
    - Issues a new access token (refresh token stays the same)
    """
    payload = decode_token(body.refresh_token)

    # Ensure it's a refresh token
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type. Expected a refresh token.",
        )

    user_id = payload.get("sub")
    email = payload.get("email")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token payload.",
        )

    # Verify user still exists
    users = get_users_collection()
    user_doc = await users.find_one({"_id": ObjectId(user_id)})
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists.",
        )

    # Issue a new access token AND a rotated refresh token, so a leaked
    # refresh token has a shorter useful lifetime. The frontend stores the
    # returned refresh token, so rotation is transparent to the client.
    token_data = {"sub": user_id, "email": email}
    new_access_token = create_access_token(token_data)
    new_refresh_token = create_refresh_token(token_data)

    return Token(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
    )


# ──────────────────────────────────────────────────────────────
# GET /auth/me
# ──────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def get_me(current_user: UserOut = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return current_user


# ──────────────────────────────────────────────────────────────
# PUT /auth/me
# ──────────────────────────────────────────────────────────────

@router.put("/me", response_model=UserOut)
async def update_me(
    update_data: UserUpdate,
    current_user: UserOut = Depends(get_current_user)
):
    """Update the authenticated user's profile."""
    users = get_users_collection()
    
    update_fields = {}
    if update_data.name is not None:
        update_fields["name"] = update_data.name
    if update_data.college is not None:
        update_fields["college"] = update_data.college
    if update_data.department is not None:
        update_fields["department"] = update_data.department
    if update_data.avatar_color is not None:
        update_fields["avatar_color"] = update_data.avatar_color
        
    if update_fields:
        update_fields["updated_at"] = datetime.now(timezone.utc)
        await users.update_one(
            {"_id": ObjectId(current_user.id)},
            {"$set": update_fields}
        )
        
    # Re-fetch the user to return updated data
    user_doc = await users.find_one({"_id": ObjectId(current_user.id)})
    return UserOut(
        id=str(user_doc["_id"]),
        email=user_doc["email"],
        name=user_doc["name"],
        college=user_doc["college"],
        department=user_doc["department"],
        avatar_color=user_doc.get("avatar_color", "#3B82F6"),
        created_at=user_doc["created_at"],
    )
