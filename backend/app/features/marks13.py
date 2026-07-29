from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
import json

from app.auth.models import UserOut
from app.auth.utils import get_current_user
from app.chat.rag import rag_stream, retrieve_context
from app.config import settings

router = APIRouter(prefix="/features", tags=["Features"])

class Marks13Request(BaseModel):
    subject_code: str
    question: str
    unit: str

@router.post("/13mark")
async def generate_13mark(
    body: Marks13Request,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Generate a structured 13-mark answer for Anna University exams.
    Streams the response and calculates a confidence score based on context retrieval.
    """
    # 1. Retrieve context to calculate confidence score
    collections = [settings.NOTES_COLLECTION]
    context, source_docs = retrieve_context(
        query=f"{body.unit} {body.question}",
        collections=collections,
        subject_code=body.subject_code,
        k=5,
    )
    
    # Simple confidence score: based on number of documents retrieved (mock logic)
    confidence_score = min(len(source_docs) * 20, 100) if source_docs else 0
    
    async def event_generator():
        try:
            # Yield confidence score first as metadata
            yield {
                "event": "metadata",
                "data": json.dumps({"confidence_score": confidence_score}),
            }
            
            # Stream the generated 13-mark answer
            async for token in rag_stream(
                query=f"Unit: {body.unit}\nQuestion: {body.question}",
                subject_code=body.subject_code,
                mode="marks13",
                k=5
            ):
                yield {
                    "event": "token",
                    "data": json.dumps({"token": token}),
                }
                
            yield {
                "event": "done",
                "data": json.dumps({"status": "complete"}),
            }
        except Exception as e:
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)}),
            }

    # Include confidence score in HTTP response header as well
    headers = {"X-Confidence-Score": str(confidence_score)}
    
    return EventSourceResponse(event_generator(), headers=headers)
