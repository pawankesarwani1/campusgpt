"""
upload/routes.py — PDF upload endpoint for CampusGPT.

Allows authenticated students to upload PDFs which get processed
through the pipeline (extract -> chunk -> embed -> store).
"""

import sys
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status

from app.auth.models import UserOut
from app.auth.utils import get_current_user

# Add the project root (parent of backend/) to sys.path so we can import the pipeline
PROJECT_ROOT = str(Path(__file__).resolve().parent.parent.parent.parent)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from pipeline.runtime_upload import process_uploaded_pdf

router = APIRouter(prefix="/upload", tags=["Upload"])

# Max file size: 10 MB (prevents OOM on Railway/Render containers)
MAX_FILE_SIZE = 10 * 1024 * 1024


# ──────────────────────────────────────────────────────────────
# POST /upload/pdf
# ──────────────────────────────────────────────────────────────

@router.post("/pdf")
async def upload_pdf(
    files: list[UploadFile] = File(..., description="PDF files to upload"),
    subject_code: str = Form("UNKNOWN", description="Subject code e.g. CB3491"),
    current_user: UserOut = Depends(get_current_user),
):
    """
    Upload multiple PDF files for processing.
    - Validates file type (must be .pdf)
    - Validates file size (max 20MB per file)
    - Processes through the pipeline: extract -> chunk -> embed -> store
    - Returns aggregated processing results
    Requires JWT authentication.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    # Subject code is required — reject uploads without one.
    subject_code = (subject_code or "").strip()
    if not subject_code or subject_code.upper() == "UNKNOWN":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A subject code is required to upload files.",
        )

    results = []
    total_chunks = 0
    has_success = False
    has_error = False

    for file in files:
        # Validate file type
        if not file.filename or not file.filename.lower().endswith(".pdf"):
            results.append({"filename": file.filename, "status": "error", "error": "Only PDF files are accepted."})
            has_error = True
            continue

        if file.content_type and file.content_type != "application/pdf":
            results.append({"filename": file.filename, "status": "error", "error": f"Invalid content type: {file.content_type}"})
            has_error = True
            continue

        # Read file bytes
        file_bytes = await file.read()

        # Validate file size
        if len(file_bytes) > MAX_FILE_SIZE:
            results.append({"filename": file.filename, "status": "error", "error": f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)} MB."})
            has_error = True
            continue

        if len(file_bytes) == 0:
            results.append({"filename": file.filename, "status": "error", "error": "Uploaded file is empty."})
            has_error = True
            continue

        # Validate PDF magic bytes (prevents disguised executables)
        if len(file_bytes) < 4 or file_bytes[:4] != b'%PDF':
            results.append({"filename": file.filename, "status": "error", "error": "Invalid PDF: file does not have a valid PDF header."})
            has_error = True
            continue

        # Process through the pipeline
        try:
            res = process_uploaded_pdf(
                file_bytes=file_bytes,
                filename=file.filename,
                subject_code=subject_code,
            )
            
            if res["status"] == "error":
                results.append({"filename": file.filename, "status": "error", "error": res.get("error", "Processing failed")})
                has_error = True
            else:
                chunks = res.get("chunks_stored", 0)
                total_chunks += chunks
                results.append({"filename": file.filename, "status": "success", "chunks_stored": chunks})
                has_success = True
        except Exception as e:
            results.append({"filename": file.filename, "status": "error", "error": str(e)})
            has_error = True

    overall_status = "error"
    if has_success and has_error:
        overall_status = "partial_success"
    elif has_success:
        overall_status = "success"

    # If all failed, return 422
    if overall_status == "error":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=results[0].get("error", "All files failed to process.") if len(results) == 1 else "All files failed to process."
        )

    return {
        "status": overall_status,
        "total_chunks_stored": total_chunks,
        "subject_code": subject_code,
        "results": results,
        "uploaded_by": current_user.email,
    }
