from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from sse_starlette.sse import EventSourceResponse
from fastapi.responses import JSONResponse
import json

from app.auth.models import UserOut
from app.auth.utils import get_current_user
from app.chat.rag import get_retriever, llm
from app.config import settings
from langchain_core.prompts import PromptTemplate

router = APIRouter(prefix="/features", tags=["Features"])

class ExamModeRequest(BaseModel):
    subject_code: str
    subject_name: Optional[str] = ""
    units: List[str]
    include_answers: bool
    mode: Optional[str] = "descriptive" # "descriptive" or "mcq"

@router.post("/exam-mode")
async def generate_exam_mode(
    body: ExamModeRequest,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Generates a full Anna University style exam paper or MCQs.
    Streams the response if descriptive, returns JSON if mcq.
    """
    all_context_docs = []
    
    # Check if "Full Question Paper" is selected
    if "Full Question Paper" in body.units:
        try:
            retriever = get_retriever(
                collection_name=settings.NOTES_COLLECTION,
                k=10, 
                filter_dict={"subject_code": body.subject_code.upper()}
            )
            docs = retriever.invoke("important concepts summary covering all units")
            all_context_docs.extend(docs)
        except Exception as e:
            print(f"[Exam Mode] Error retrieving full paper context: {e}")
    else:
        for unit in body.units:
            try:
                retriever = get_retriever(
                    collection_name=settings.NOTES_COLLECTION,
                    k=3,
                    filter_dict={"subject_code": body.subject_code.upper(), "unit": unit}
                )
                docs = retriever.invoke("important concepts summary")
                all_context_docs.extend(docs)
            except Exception as e:
                print(f"[Exam Mode] Error retrieving for {unit}: {e}")
                continue
            
    context = "\n\n".join([d.page_content for d in all_context_docs])
    if not context:
        context = "No detailed notes found. Rely on general knowledge for this subject."

    # MCQ Mode Logic
    if body.mode == "mcq":
        mcq_prompt = PromptTemplate(
            input_variables=["context", "subject_code", "subject_name", "units"],
            template=(
                "SYSTEM: Generate 10 multiple-choice questions for {subject_code} {subject_name} covering {units}.\n"
                "Return ONLY a valid JSON array of objects. Do not use markdown blocks like ```json. Just raw JSON.\n"
                "Each object MUST have the following structure:\n"
                "{{\n"
                '  "id": 1,\n'
                '  "question": "What is ...?",\n'
                '  "options": ["A", "B", "C", "D"],\n'
                '  "answer": "A",\n'
                '  "explanation": "Brief explanation of why A is correct."\n'
                "}}\n"
                "CONTEXT:\n{context}\n\n"
                "JSON Output:"
            )
        )
        full_prompt = mcq_prompt.format(
            context=context,
            subject_code=body.subject_code,
            subject_name=body.subject_name,
            units=", ".join(body.units)
        )
        
        response = await llm.ainvoke(full_prompt)
        content = response.content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
            
        try:
            questions = json.loads(content.strip())
            return JSONResponse({"questions": questions})
        except json.JSONDecodeError:
            return JSONResponse({"error": "Failed to generate valid MCQ format. Please try again."}, status_code=500)

    # Descriptive Mode Logic
    answer_instruction = (
        "Also generate model answers immediately following each question. "
        "Keep 2-mark answers brief. Keep 13-mark answers detailed with headings."
    ) if body.include_answers else "Do NOT generate answers, ONLY the question paper."

    prompt_template = PromptTemplate(
        input_variables=["context", "subject_code", "subject_name", "units", "answer_instruction"],
        template=(
            "SYSTEM: Generate a full Anna University style exam paper for {subject_code} {subject_name} covering the following units: {units}.\n"
            "Follow this exact format for the question paper:\n\n"
            "PART A (10 x 2 = 20 marks)\n"
            "1. [question]\n"
            "2. [question]\n"
            "...\n"
            "10. [question]\n\n"
            "PART B (5 x 13 = 65 marks)\n"
            "11. (a) [question] \n"
            "    OR\n"
            "    (b) [question]\n"
            "...\n\n"
            "INSTRUCTIONS:\n"
            "- {answer_instruction}\n"
            "- Ensure questions are distributed across the provided units.\n"
            "- Use the provided context to create highly relevant questions.\n\n"
            "CONTEXT:\n{context}\n\n"
            "Begin the Exam Paper now:"
        )
    )
    
    full_prompt = prompt_template.format(
        context=context,
        subject_code=body.subject_code,
        subject_name=body.subject_name,
        units=", ".join(body.units),
        answer_instruction=answer_instruction
    )
    
    async def event_generator():
        try:
            async for chunk in llm.astream(full_prompt):
                if chunk.content:
                    yield {
                        "event": "token",
                        "data": json.dumps({"token": chunk.content}),
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

    return EventSourceResponse(event_generator())
