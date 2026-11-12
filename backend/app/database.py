"""
database.py — Async File-based JSON Database matching Motor's API.

Collections:
  - users: user accounts
  - chat_sessions: chat session metadata
  - messages: individual chat messages
"""

import json
import os
import uuid
import asyncio
from pathlib import Path
from datetime import datetime, timezone

from app.config import settings

# The desktop app sets CAMPUSGPT_DATA_DIR to a writable per-user folder.
DATA_DIR = (
    Path(os.environ["CAMPUSGPT_DATA_DIR"]) / "db"
    if os.getenv("CAMPUSGPT_DATA_DIR")
    else Path(__file__).resolve().parent.parent / "data"
)

class ObjectId:
    def __init__(self, oid=None):
        self.oid = str(oid) if oid else uuid.uuid4().hex[:24]

    def __str__(self):
        return self.oid

    def __repr__(self):
        return f"ObjectId('{self.oid}')"

    def __eq__(self, other):
        if isinstance(other, ObjectId):
            return self.oid == other.oid
        return self.oid == str(other)

def json_serial(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, ObjectId) or type(obj).__name__ == "ObjectId":
        return str(obj)
    raise TypeError(f"Type {type(obj)} not serializable")

def json_deserial(obj):
    for k, v in obj.items():
        if isinstance(v, str):
            try:
                # Naive attempt to parse ISO format datetimes
                if len(v) >= 19 and "T" in v and ":" in v and "-" in v:
                    obj[k] = datetime.fromisoformat(v)
            except ValueError:
                pass
    return obj

class InsertResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id

class DeleteResult:
    def __init__(self, deleted_count):
        self.deleted_count = deleted_count

class AsyncCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, field, direction):
        rev = (direction == -1)
        self.docs.sort(key=lambda x: x.get(field, ""), reverse=rev)
        return self

    async def __aiter__(self):
        for doc in self.docs:
            yield doc

class JSONCollection:
    def __init__(self, name):
        self.name = name
        self.file_path = DATA_DIR / f"{name}.json"
        self._lock = asyncio.Lock()
        os.makedirs(DATA_DIR, exist_ok=True)
        if not self.file_path.exists():
            with open(self.file_path, "w", encoding="utf-8") as f:
                json.dump([], f)

    async def _read(self):
        async with self._lock:
            with open(self.file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return [json_deserial(doc) for doc in data]

    async def _write(self, data):
        async with self._lock:
            with open(self.file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, default=json_serial, indent=2)

    def _matches(self, doc, query):
        for k, v in query.items():
            if k == "_id":
                v = str(v)
            doc_v = doc.get(k)
            if k == "_id" and doc_v is not None:
                doc_v = str(doc_v)
            if doc_v != v:
                return False
        return True

    async def find_one(self, query):
        docs = await self._read()
        for doc in docs:
            if self._matches(doc, query):
                return doc
        return None

    async def insert_one(self, document):
        docs = await self._read()
        doc = document.copy()
        if "_id" not in doc:
            doc["_id"] = ObjectId()
        else:
            if isinstance(doc["_id"], str):
                doc["_id"] = ObjectId(doc["_id"])
        docs.append(doc)
        await self._write(docs)
        return InsertResult(doc["_id"])

    async def update_one(self, query, update):
        docs = await self._read()
        for doc in docs:
            if self._matches(doc, query):
                if "$set" in update:
                    for k, v in update["$set"].items():
                        doc[k] = v
                if "$inc" in update:
                    for k, v in update["$inc"].items():
                        doc[k] = doc.get(k, 0) + v
                break
        await self._write(docs)

    def find(self, query):
        # We can't make `find` itself async because motor returns a cursor
        # synchronously, which is then iterated asynchronously.
        # We'll read synchronously here, or cheat by reading all docs now.
        # It's a mock, so we'll do synchronous file read here.
        with open(self.file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        docs = [json_deserial(doc) for doc in data]
        results = [doc for doc in docs if self._matches(doc, query)]
        return AsyncCursor(results)

    async def delete_one(self, query):
        docs = await self._read()
        new_docs = []
        deleted = False
        for doc in docs:
            if not deleted and self._matches(doc, query):
                deleted = True
                continue
            new_docs.append(doc)
        await self._write(new_docs)

    async def delete_many(self, query):
        docs = await self._read()
        new_docs = []
        count = 0
        for doc in docs:
            if self._matches(doc, query):
                count += 1
            else:
                new_docs.append(doc)
        await self._write(new_docs)
        return DeleteResult(count)

# ──────────────────────────────────────────────────────────────
# Collection accessors
# ──────────────────────────────────────────────────────────────

_users = None
_sessions = None
_messages = None

def get_users_collection():
    global _users
    if not _users:
        _users = JSONCollection("users")
    return _users

def get_sessions_collection():
    global _sessions
    if not _sessions:
        _sessions = JSONCollection("chat_sessions")
    return _sessions

def get_messages_collection():
    global _messages
    if not _messages:
        _messages = JSONCollection("messages")
    return _messages

# ──────────────────────────────────────────────────────────────
# Lifecycle helpers (called from main.py)
# ──────────────────────────────────────────────────────────────

async def create_indexes():
    # JSON Mock doesn't need indexes
    # Just initialize the collections so files are created
    get_users_collection()
    get_sessions_collection()
    get_messages_collection()

async def close_connection():
    pass
