from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List
import json
from datetime import datetime, timezone, timedelta

from app.auth.models import UserOut
from app.auth.utils import get_current_user
from app.chat.rag import get_retriever, llm
from app.prompts.pyq_prompt import PYQ_PROMPT_TEMPLATE
from app.database import get_pyq_cache_collection
from app.config import settings
from langchain_core.prompts import PromptTemplate

router = APIRouter(prefix="/features", tags=["Features"])

class PyqPredictRequest(BaseModel):
    subject_code: str
    unit: Optional[str] = None

class QuestionPrediction(BaseModel):
    question: str
    frequency: int
    marks: int
    priority: str

class UnitPrediction(BaseModel):
    unit: str
    questions: List[QuestionPrediction]

class PyqPredictResponse(BaseModel):
    subject_code: str
    predictions: List[UnitPrediction]
    years_analyzed: List[str]

@router.post("/pyq-predict", response_model=PyqPredictResponse)
async def predict_pyq(
    body: PyqPredictRequest,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Analyzes past year questions (PYQs) and predicts important questions.
    Returns structured JSON. Caches results for 24 hours.
    """
    cache_collection = get_pyq_cache_collection()
    
    # 1. Check cache
    cache_key = f"{body.subject_code}_{body.unit or 'all'}"
    cached_result = await cache_collection.find_one({"cache_key": cache_key})
    
    if cached_result:
        # Check if cache is still valid (24 hours)
        cached_time = cached_result.get("created_at")
        if cached_time:
            if isinstance(cached_time, str):
                cached_time = datetime.fromisoformat(cached_time)
            
            if datetime.now(timezone.utc) - cached_time < timedelta(hours=24):
                return cached_result["data"]
                
    # 2. Retrieve PYQ context
    filter_dict = {"subject_code": body.subject_code.upper()}
    if body.unit:
        filter_dict["unit"] = body.unit
        
    try:
        retriever = get_retriever(
            collection_name=settings.PYQ_COLLECTION, 
            k=20, 
            filter_dict=filter_dict
        )
        docs = retriever.invoke("important questions repeated frequent")
    except Exception as e:
        print(f"[PYQ Predictor] Error retrieving docs: {e}")
        docs = []

    if not docs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No PYQ data found for subject {body.subject_code}",
        )
        
    context = "\n\n---\n\n".join([d.page_content for d in docs])
    
    # 3. Build Prompt for JSON extraction
    json_prompt = PromptTemplate(
        input_variables=["context", "question"],
        template=(
            "SYSTEM: Analyze the following Past Year Questions (PYQs) context and identify the most frequently asked and important questions.\n"
            "Return ONLY a valid JSON object matching this exact structure, with no markdown formatting or backticks:\n"
            "{{\n"
            '  "subject_code": "{subject_code}",\n'
            '  "predictions": [\n'
            "    {{\n"
            '      "unit": "Unit 1",\n'
            '      "questions": [\n'
            '        {{ "question": "...", "frequency": 3, "marks": 13, "priority": "high" }}\n'
            "      ]\n"
            "    }}\n"
            "  ],\n"
            '  "years_analyzed": ["2019", "2020", "2021", "2022", "2023"]\n'
            "}}\n\n"
            "Context:\n{context}\n\n"
            "Request: Extract important questions and return ONLY JSON."
        )
    )
    
    full_prompt = json_prompt.format(
        context=context, 
        question="", 
        subject_code=body.subject_code
    )
    
    # 4. Invoke LLM
    response = await llm.ainvoke(full_prompt)
    response_text = response.content.strip()
    
    # Clean up markdown code blocks if LLM still returned them
    if response_text.startswith("```json"):
        response_text = response_text[7:]
    if response_text.startswith("```"):
        response_text = response_text[3:]
    if response_text.endswith("```"):
        response_text = response_text[:-3]
        
    response_text = response_text.strip()
    
    # 5. Parse JSON
    try:
        result_data = json.loads(response_text)
    except json.JSONDecodeError:
        print(f"[PYQ Predictor] Failed to parse JSON: {response_text}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate structured prediction data."
        )
        
    # 6. Save to cache
    cache_doc = {
        "cache_key": cache_key,
        "data": result_data,
        "created_at": datetime.now(timezone.utc)
    }
    await cache_collection.insert_one(cache_doc)
    
    return result_data