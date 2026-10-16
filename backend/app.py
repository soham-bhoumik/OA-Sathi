"""
OA-Sathi Gait Analysis FastAPI Service
--------------------------------------
Responsible Local Edge Service for Video Movement Assessment.

Key Guarantees:
- Runs locally (default: 127.0.0.1:8000).
- Uploaded videos are held strictly in temporary storage and deleted in a finally: block.
- Zero external network transmissions of video frames or health records.
- CORS restricted narrowly to local development frontend origins.
- Health check endpoint (/health) for frontend availability probing.
"""

import os
import shutil
import tempfile
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.gait_pipeline import (
    MAX_FILE_SIZE_BYTES,
    GaitPipeline,
    PipelineResult,
)

app = FastAPI(
    title="OA-Sathi Gait Analysis Service",
    description="Local pose-estimation and movement assessment pipeline for community health screenings.",
    version="1.0.0",
)

# Narrow CORS for local frontend development
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

_pipeline_instance: Optional[GaitPipeline] = None


def get_pipeline() -> GaitPipeline:
    global _pipeline_instance
    if _pipeline_instance is None:
        _pipeline_instance = GaitPipeline()
    return _pipeline_instance


@app.get("/health")
def health_check():
    pipe = get_pipeline()
    is_ready = pipe is not None and pipe.is_ready()
    return {
        "status": "ok" if is_ready else "degraded",
        "service": "oa-sathi-gait-analysis",
        "version": "1.0.0",
        "model": "mediapipe-pose-lite",
        "modelReady": is_ready,
        "privacyNotice": "Local execution only. Zero video retention or cloud transmissions.",
    }


ALLOWED_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi"}


@app.post("/api/gait/analyze")
async def analyze_gait_video(
    file: UploadFile = File(...),
    recordId: Optional[str] = Form(None),
):
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing filename for uploaded video.",
        )

    _, ext = os.path.splitext(file.filename.lower())
    if ext not in ALLOWED_EXTENSIONS and file.content_type not in (
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "video/x-msvideo",
        "application/octet-stream",
    ):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported video format '{ext}'. Supported formats: mp4, webm, mov, avi.",
        )

    # Secure temporary file handling with guaranteed cleanup
    temp_dir = tempfile.mkdtemp(prefix="oa_gait_")
    temp_file_path = os.path.join(temp_dir, f"upload{ext or '.webm'}")

    try:
        # Stream file to disk while enforcing max file size
        total_bytes = 0
        with open(temp_file_path, "wb") as buffer:
            while chunk := await file.read(1024 * 64):  # 64 KB chunks
                total_bytes += len(chunk)
                if total_bytes > MAX_FILE_SIZE_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Video exceeds maximum allowed limit of {MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB.",
                    )
                buffer.write(chunk)

        if total_bytes == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded video file is empty (0 bytes).",
            )

        # Process through pipeline
        active_pipeline = get_pipeline()
        result: PipelineResult = active_pipeline.process_video_file(
            temp_file_path, record_id=recordId
        )

        return JSONResponse(content=result.to_dict())

    finally:
        # Guaranteed temporary file and directory deletion
        try:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception as e:
            print(f"Temporary cleanup notice: {e}")


@app.get("/api/gait/sample-analysis")
def get_sample_benchmark_analysis(recordId: Optional[str] = "OS-SAMPLE"):
    """
    Returns a benchmark demonstration gait analysis for offline evaluation
    and camera-less testing without requiring live camera hardware.
    """
    import time
    now_ts = int(time.time() * 1000)

    return {
        "analysisId": "gait-sample-benchmark",
        "recordId": recordId,
        "status": "completed",
        "analysisMethod": "mediapipe-pose-lite",
        "modelVersion": "1.1.1",
        "inputQualityStatus": "good",
        "timestamp": now_ts,
        "durationSeconds": 5.4,
        "framesAnalyzed": 64,
        "usableFramesCount": 61,
        "meanLandmarkConfidence": 0.88,
        "features": {
            "cadence": {
                "name": "Step Cadence",
                "value": 104.2,
                "unit": "steps/min",
                "isValid": True,
                "isApproximation": True,
                "confidence": 0.88,
                "clinicalSignificance": "Estimated steps per minute during steady walking.",
                "reasonUnavailable": None,
            },
            "stepSymmetry": {
                "name": "Bilateral Step Symmetry",
                "value": 0.92,
                "unit": "index (0-1)",
                "isValid": True,
                "isApproximation": True,
                "confidence": 0.85,
                "clinicalSignificance": "Balance of left vs right step excursion. 1.0 represents symmetry.",
                "reasonUnavailable": None,
            },
            "activeKneeFlexionRange": {
                "name": "Active Knee Flexion Range",
                "value": 52.4,
                "unit": "degrees",
                "isValid": True,
                "isApproximation": True,
                "confidence": 0.82,
                "clinicalSignificance": "Estimated peak knee flexion angle excursion during stride.",
                "reasonUnavailable": None,
            },
            "coronalTrunkSway": {
                "name": "Coronal Trunk Sway",
                "value": 3.8,
                "unit": "degrees",
                "isValid": True,
                "isApproximation": True,
                "confidence": 0.86,
                "clinicalSignificance": "Standard deviation of lateral trunk tilt angle during walking.",
                "reasonUnavailable": None,
            },
        },
        "limitations": [
            "2D monocular video projection does not substitute for 3D marker-based clinical gait analysis.",
            "Exploratory screening markers; not an OA diagnosis or cartilage integrity test.",
        ],
        "warnings": [],
        "disclaimer": (
            "Exploratory movement features for clinician discussion only. "
            "Not clinically validated for osteoarthritis diagnosis, grading, or treatment decisions."
        ),
        "errorCode": None,
        "errorMessage": None,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.app:app", host="127.0.0.1", port=8000, reload=False)
