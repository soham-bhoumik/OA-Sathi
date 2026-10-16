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
from backend.xray_pipeline import (
    KneeXrayPipeline,
    MODEL_METADATA as XRAY_MODEL_METADATA,
    record_xray_audit_event,
    get_xray_audit_trail,
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


# ============================================================================
# KNEE X-RAY RADIOGRAPH ANALYSIS MODULE (DOCTOR PORTAL)
# ============================================================================

_xray_pipeline_instance: Optional[KneeXrayPipeline] = None


def get_xray_pipeline() -> KneeXrayPipeline:
    global _xray_pipeline_instance
    if _xray_pipeline_instance is None:
        _xray_pipeline_instance = KneeXrayPipeline()
    return _xray_pipeline_instance


@app.get("/api/xray/model-info")
def get_xray_model_info():
    """Returns technical metadata, provenance, and validation constraints for the Knee OA model."""
    pipe = get_xray_pipeline()
    return {
        "status": "ok",
        "ready": pipe.is_ready(),
        "genuineModelLoaded": pipe.has_genuine_model(),
        "engine": "onnxruntime-densenet121" if pipe.has_genuine_model() else "edge-gradient-reference",
        **XRAY_MODEL_METADATA,
    }


@app.get("/api/xray/health")
def get_xray_health():
    """Health check endpoint for the X-ray radiograph analysis subsystem."""
    pipe = get_xray_pipeline()
    is_ready = pipe is not None and pipe.is_ready()
    has_model = pipe is not None and pipe.has_genuine_model()
    return {
        "status": "ok" if is_ready else "degraded",
        "service": "oa-sathi-xray-analysis",
        "version": XRAY_MODEL_METADATA["modelVersion"],
        "modelName": XRAY_MODEL_METADATA["modelName"],
        "ready": is_ready,
        "genuineModelLoaded": has_model,
        "engine": "onnxruntime-densenet121" if has_model else "edge-gradient-reference",
        "supportedViews": XRAY_MODEL_METADATA["supportedViews"],
        "privacyNotice": "Local execution only. Zero external cloud image transmission.",
    }


@app.post("/api/xray/analyze")
async def analyze_xray(
    file: UploadFile = File(...),
    patientId: str = Form(...),
    laterality: str = Form("Right"),
    view: str = Form("AP"),
    doctorId: str = Form("Dr. A. Sharma, MO"),
    consentConfirmed: bool = Form(True),
):
    """
    Submits a knee radiograph image to the validated Kellgren-Lawrence grading pipeline.
    Enforces format, dimensions, view validation, and uncertainty calibration.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing filename for uploaded X-ray image.",
        )

    # Read image bytes
    image_bytes = await file.read()
    content_type = file.content_type or "application/octet-stream"

    pipe = get_xray_pipeline()
    result = pipe.analyze_knee_radiograph(
        image_bytes=image_bytes,
        filename=file.filename,
        content_type=content_type,
        patient_id=patientId,
        laterality=laterality,
        view=view,
        doctor_id=doctorId,
        consent_confirmed=consentConfirmed,
    )

    if result.get("status") == "invalid-image":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result.get("error", "Invalid radiograph file."),
        )

    return JSONResponse(content=result)


@app.get("/api/xray/benchmark-fixtures")
def get_xray_benchmark_fixtures():
    """
    Returns pre-configured synthetic / benchmark knee radiographs for
    transparent clinical demonstration and testing without requiring local DICOM files.
    """
    return {
        "status": "ok",
        "fixtures": [
            {
                "id": "fixture_kl0_normal",
                "label": "Benchmark 1: Normal Knee (KL Grade 0 · None)",
                "description": "Preserved medial & lateral joint space; smooth subchondral bone contours; no osteophytes.",
                "anatomicalSite": "Knee",
                "laterality": "Right",
                "view": "AP",
                "simulatedKl": 0,
                "simulatedConfidence": 0.88,
                "filename": "benchmark_knee_normal_kl0.png",
            },
            {
                "id": "fixture_kl2_mild",
                "label": "Benchmark 2: Early Joint Space Narrowing (KL Grade 2 · Minimal/Mild)",
                "description": "Definite early osteophytic spurs at medial tibial plateau; possible medial compartment narrowing.",
                "anatomicalSite": "Knee",
                "laterality": "Right",
                "view": "AP",
                "simulatedKl": 2,
                "simulatedConfidence": 0.74,
                "filename": "benchmark_knee_mild_kl2.png",
            },
            {
                "id": "fixture_kl3_moderate",
                "label": "Benchmark 3: Moderate OA with Sclerosis (KL Grade 3 · Moderate)",
                "description": "Multiple moderate osteophytes; definite medial joint space narrowing; prominent subchondral sclerosis.",
                "anatomicalSite": "Knee",
                "laterality": "Left",
                "view": "AP",
                "simulatedKl": 3,
                "simulatedConfidence": 0.81,
                "filename": "benchmark_knee_moderate_kl3.png",
            },
            {
                "id": "fixture_lateral_abstention",
                "label": "Benchmark 4: Lateral Projection (Demonstrating Model Abstention)",
                "description": "Standard lateral projection. Demonstrates transparent AI refusal when submitted non-weight-bearing/unsupported view.",
                "anatomicalSite": "Knee",
                "laterality": "Left",
                "view": "Lateral",
                "simulatedKl": None,
                "simulatedConfidence": 0.0,
                "filename": "benchmark_knee_lateral_abstain.png",
            },
        ],
    }


@app.get("/api/xray/audit-log")
def get_audit_log(patientId: Optional[str] = None):
    """Retrieves access, upload, analysis, and correction audit log entries."""
    trail = get_xray_audit_trail(patientId)
    return {
        "status": "ok",
        "patientId": patientId,
        "entryCount": len(trail),
        "entries": trail,
    }


@app.post("/api/xray/audit-log")
def log_client_audit_event(
    eventType: str = Form(...),
    patientId: str = Form(...),
    doctorId: str = Form("Dr. A. Sharma, MO"),
    notes: Optional[str] = Form(None),
):
    """Allows client-side clinician actions (e.g. review finalized, correction made) to be recorded in the audit trail."""
    event = record_xray_audit_event(
        event_type=eventType,
        patient_id=patientId,
        doctor_id=doctorId,
        details={"notes": notes or ""},
    )
    return {"status": "ok", "event": event}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.app:app", host="127.0.0.1", port=8000, reload=False)

