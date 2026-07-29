"""
chat/routes.py — Chat endpoints for CampusGPT.

Endpoints:
  POST   /chat/ask                  — Stream a RAG response (SSE)
  GET    /chat/history/{session_id} — Get chat history for a session
  GET    /chat/sessions             — List all sessions for current user
  POST   /chat/sessions             — Create a new chat session
  DELETE /chat/sessions/{session_id} — Delete a session and its messages
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from sse_starlette.sse import EventSourceResponse

from app.auth.models import UserOut
from app.auth.utils import get_current_user
from app.database import get_sessions_collection, get_messages_collection
from app.chat.models import (
    ChatRequest,
    SessionCreate,
    SessionUpdate,
    MessageOut,
    SessionOut,
    SessionDeleteResponse,
)
from app.chat.rag import rag_stream

router = APIRouter(prefix="/chat", tags=["Chat"])


# ──────────────────────────────────────────────────────────────
# Helper: create or get session
# ──────────────────────────────────────────────────────────────

async def _ensure_session(
    session_id: Optional[str],
    user_id: str,
    query: str,
    subject_code: Optional[str] = None,
) -> str:
    """
    Get an existing session or create a new one.
    Returns the session_id string.
    """
    sessions = get_sessions_collection()

    if session_id:
        # Verify session exists and belongs to user
        try:
            session = await sessions.find_one({
                "_id": ObjectId(session_id),
                "user_id": user_id,
            })
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid session_id format.",
            )
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found or not owned by you.",
            )
        return session_id

    # Create a new session with the query as the title (truncated)
    title = query[:80] + ("..." if len(query) > 80 else "")
    now = datetime.now(timezone.utc)
    session_doc = {
        "user_id": user_id,
        "title": title,
        "subject_code": subject_code or "",
        "created_at": now,
        "updated_at": now,
        "message_count": 0,
        "last_message": "",
        "is_pinned": False,
    }
    result = await sessions.insert_one(session_doc)
    return str(result.inserted_id)


# ──────────────────────────────────────────────────────────────
# Helper: save a message to MongoDB
# ──────────────────────────────────────────────────────────────

async def _save_message(
    session_id: str,
    role: str,
    content: str,
    mode: Optional[str] = None,
    subject_code: Optional[str] = None,
) -> str:
    """Save a message to MongoDB and update the session. Returns message_id."""
    messages = get_messages_collection()
    sessions = get_sessions_collection()
    now = datetime.now(timezone.utc)

    message_doc = {
        "session_id": session_id,
        "role": role,
        "content": content,
        "mode": mode or "",
        "subject_code": subject_code or "",
        "created_at": now,
    }
    result = await messages.insert_one(message_doc)

    # Update session metadata
    await sessions.update_one(
        {"_id": ObjectId(session_id)},
        {
            "$set": {
                "updated_at": now,
                "last_message": content[:100],
            },
            "$inc": {"message_count": 1},
        },
    )

    return str(result.inserted_id)


# ──────────────────────────────────────────────────────────────
# POST /chat/ask — Streaming RAG response via SSE
# ──────────────────────────────────────────────────────────────

@router.post("/ask")
async def chat_ask(
    body: ChatRequest,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Send a query and receive a streamed RAG response via Server-Sent Events.

    The response streams token-by-token. At the end, a special [DONE] event
    is sent with the session_id for client-side reference.

    Both the user query and the assistant response are saved to MongoDB.
    """
    user_id = current_user.id

    # Ensure session exists or create one if not temporary
    session_id = None
    if not body.is_temporary:
        session_id = await _ensure_session(
            session_id=body.session_id,
            user_id=user_id,
            query=body.query,
            subject_code=body.subject_code,
        )

        # Save the user message
        await _save_message(
            session_id=session_id,
            role="user",
            content=body.query,
            mode=body.mode,
            subject_code=body.subject_code,
        )

    # Stream the response
    async def event_generator():
        full_response = ""
        try:
            async for token in rag_stream(
                query=body.query,
                subject_code=body.subject_code,
                mode=body.mode,
            ):
                full_response += token
                yield {
                    "event": "token",
                    "data": json.dumps({"token": token}),
                }

            # Save the complete assistant response if not temporary
            if not body.is_temporary:
                await _save_message(
                    session_id=session_id,
                    role="assistant",
                    content=full_response,
                    mode=body.mode,
                    subject_code=body.subject_code,
                )

            # Send completion event with session_id
            yield {
                "event": "done",
                "data": json.dumps({
                    "session_id": session_id or "temp-session",
                    "total_length": len(full_response),
                }),
            }

        except Exception as e:
            error_msg = f"An error occurred: {str(e)}"
            # Save error as assistant response if not temporary
            if not body.is_temporary:
                await _save_message(
                    session_id=session_id,
                    role="assistant",
                    content=error_msg,
                    mode=body.mode,
                    subject_code=body.subject_code,
                )
            yield {
                "event": "error",
                "data": json.dumps({"error": error_msg}),
            }

    return EventSourceResponse(event_generator())


# ──────────────────────────────────────────────────────────────
# GET /chat/history/{session_id}
# ──────────────────────────────────────────────────────────────

@router.get("/history/{session_id}", response_model=list[MessageOut])
async def get_chat_history(
    session_id: str,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Get all messages for a given chat session, in chronological order.
    Only returns messages for sessions owned by the current user.
    """
    sessions = get_sessions_collection()
    messages = get_messages_collection()

    # Verify session belongs to current user
    try:
        session = await sessions.find_one({
            "_id": ObjectId(session_id),
            "user_id": current_user.id,
        })
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format.",
        )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found or not owned by you.",
        )

    # Fetch messages sorted by creation time
    cursor = messages.find(
        {"session_id": session_id}
    ).sort("created_at", 1)

    result = []
    async for msg in cursor:
        result.append(MessageOut(
            id=str(msg["_id"]),
            session_id=msg["session_id"],
            role=msg["role"],
            content=msg["content"],
            mode=msg.get("mode"),
            subject_code=msg.get("subject_code"),
            created_at=msg["created_at"],
        ))

    return result


# ──────────────────────────────────────────────────────────────
# GET /chat/sessions
# ──────────────────────────────────────────────────────────────

@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    current_user: UserOut = Depends(get_current_user),
):
    """
    List all chat sessions for the current user, newest first.
    """
    sessions = get_sessions_collection()

    cursor = sessions.find(
        {"user_id": current_user.id}
    ).sort("updated_at", -1)

    result = []
    async for session in cursor:
        result.append(SessionOut(
            id=str(session["_id"]),
            user_id=session["user_id"],
            title=session["title"],
            subject_code=session.get("subject_code"),
            created_at=session["created_at"],
            updated_at=session["updated_at"],
            last_message=session.get("last_message"),
            message_count=session.get("message_count", 0),
            is_shared=session.get("is_shared", False),
            share_id=session.get("share_id"),
            is_pinned=session.get("is_pinned", False),
        ))

    return result


# ──────────────────────────────────────────────────────────────
# POST /chat/sessions
# ──────────────────────────────────────────────────────────────

@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreate,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Create a new chat session with a custom title.
    """
    sessions = get_sessions_collection()
    now = datetime.now(timezone.utc)

    session_doc = {
        "user_id": current_user.id,
        "title": body.title,
        "subject_code": body.subject_code or "",
        "created_at": now,
        "updated_at": now,
        "message_count": 0,
        "last_message": "",
        "is_pinned": False,
    }

    result = await sessions.insert_one(session_doc)

    return SessionOut(
        id=str(result.inserted_id),
        user_id=current_user.id,
        title=body.title,
        subject_code=body.subject_code,
        created_at=now,
        updated_at=now,
        last_message="",
        message_count=0,
        is_shared=False,
        share_id=None,
        is_pinned=False,
    )


# ──────────────────────────────────────────────────────────────
# PATCH /chat/sessions/{session_id}
# ──────────────────────────────────────────────────────────────

@router.patch("/sessions/{session_id}", response_model=SessionOut)
async def update_session(
    session_id: str,
    body: SessionUpdate,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Update a chat session (e.g. rename title, pin/unpin).
    """
    sessions = get_sessions_collection()
    
    try:
        session = await sessions.find_one({
            "_id": ObjectId(session_id),
            "user_id": current_user.id,
        })
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id format.")

    if not session:
        raise HTTPException(status_code=404, detail="Session not found or not owned by you.")

    update_fields = {"updated_at": datetime.now(timezone.utc)}
    if body.title is not None:
        update_fields["title"] = body.title
    if body.is_pinned is not None:
        update_fields["is_pinned"] = body.is_pinned

    await sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": update_fields}
    )

    updated_session = await sessions.find_one({"_id": ObjectId(session_id)})
    
    return SessionOut(
        id=str(updated_session["_id"]),
        user_id=updated_session["user_id"],
        title=updated_session["title"],
        subject_code=updated_session.get("subject_code"),
        created_at=updated_session["created_at"],
        updated_at=updated_session["updated_at"],
        last_message=updated_session.get("last_message"),
        message_count=updated_session.get("message_count", 0),
        is_shared=updated_session.get("is_shared", False),
        share_id=updated_session.get("share_id"),
        is_pinned=updated_session.get("is_pinned", False),
    )


# ──────────────────────────────────────────────────────────────
# DELETE /chat/sessions/{session_id}
# ──────────────────────────────────────────────────────────────

@router.delete("/sessions/{session_id}", response_model=SessionDeleteResponse)
async def delete_session(
    session_id: str,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Delete a chat session and all its messages.
    Only the session owner can delete it.
    """
    sessions = get_sessions_collection()
    messages = get_messages_collection()

    # Verify ownership
    try:
        session = await sessions.find_one({
            "_id": ObjectId(session_id),
            "user_id": current_user.id,
        })
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session_id format.",
        )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found or not owned by you.",
        )

    # Delete all messages in the session
    delete_result = await messages.delete_many({"session_id": session_id})

    # Delete the session itself
    await sessions.delete_one({"_id": ObjectId(session_id)})

    return SessionDeleteResponse(
        session_id=session_id,
        messages_deleted=delete_result.deleted_count,
    )


# ──────────────────────────────────────────────────────────────
# DELETE /chat/sessions
# ──────────────────────────────────────────────────────────────

@router.delete("/sessions", response_model=SessionDeleteResponse)
async def delete_all_sessions(
    current_user: UserOut = Depends(get_current_user),
):
    """
    Delete all chat sessions and their messages for the current user.
    """
    sessions = get_sessions_collection()
    messages = get_messages_collection()

    # Find all sessions owned by user
    user_sessions_cursor = sessions.find({"user_id": current_user.id})
    session_ids = []
    async for s in user_sessions_cursor:
        session_ids.append(str(s["_id"]))

    if not session_ids:
        return SessionDeleteResponse(session_id="all", messages_deleted=0)

    # Note: JSONCollection mock in database.py doesn't support $in queries natively for delete_many
    # So we'll iterate and delete them manually, or extend the mock if needed.
    # Actually, we can just delete messages where session_id matches, and then delete sessions.
    
    total_messages_deleted = 0
    for sid in session_ids:
        msg_del = await messages.delete_many({"session_id": sid})
        total_messages_deleted += msg_del.deleted_count
        await sessions.delete_one({"_id": ObjectId(sid)})

    return SessionDeleteResponse(
        session_id="all",
        messages_deleted=total_messages_deleted,
    )


# ──────────────────────────────────────────────────────────────
# POST /chat/sessions/{session_id}/share
# ──────────────────────────────────────────────────────────────

@router.post("/sessions/{session_id}/share")
async def share_session(
    session_id: str,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Generate a public share link for a session.
    """
    sessions = get_sessions_collection()
    
    try:
        session = await sessions.find_one({
            "_id": ObjectId(session_id),
            "user_id": current_user.id,
        })
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id format.")

    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    if session.get("is_shared") and session.get("share_id"):
        return {"share_id": session["share_id"]}

    share_id = str(uuid.uuid4())
    await sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"is_shared": True, "share_id": share_id}}
    )

    return {"share_id": share_id}


# ──────────────────────────────────────────────────────────────
# GET /chat/shared/{share_id}
# ──────────────────────────────────────────────────────────────

@router.get("/shared/{share_id}")
async def get_shared_session(share_id: str):
    """
    Get a shared session and its messages. No auth required.
    """
    sessions = get_sessions_collection()
    messages = get_messages_collection()

    session = await sessions.find_one({"share_id": share_id, "is_shared": True})
    if not session:
        raise HTTPException(status_code=404, detail="Shared chat not found.")

    cursor = messages.find({"session_id": str(session["_id"])}).sort("created_at", 1)
    
    msgs = []
    async for msg in cursor:
        msgs.append({
            "id": str(msg["_id"]),
            "role": msg["role"],
            "content": msg["content"],
            "created_at": msg["created_at"].isoformat(),
        })

    return {
        "session": {
            "title": session["title"],
            "subject_code": session.get("subject_code"),
            "created_at": session["created_at"].isoformat(),
        },
        "messages": msgs
    }
