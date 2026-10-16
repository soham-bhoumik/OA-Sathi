"""
OA-Sathi Modular Pose-Estimation & Gait Analysis Pipeline
---------------------------------------------------------
Stages:
1. Input validation (format, file size, frame count, duration)
2. Frame sampling (bounded rate, timestamp tracking)
3. Pose estimation (MediaPipe PoseLandmarker local execution)
4. Landmark quality checks (visibility, presence, usable frame count)
5. Defensible movement feature extraction (cadence, symmetry, knee flexion, trunk sway)
6. Result validation (sanitizing values, preventing zero-substitutions for missing data)
7. Structured serialization matching the OA-Sathi schema

Responsible Healthcare AI Guarantees:
- Zero external network transmissions of video frames or biometric data.
- Exploratory movement descriptors only — strictly non-diagnostic.
- Missing landmarks are explicitly flagged as invalid/unavailable, never replaced with zero.
- No radiographic grading, joint space narrowing inference, or OA probability fabrication.
"""

from __future__ import annotations

import math
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

from backend.models.download_model import ensure_model_exists


# MediaPipe Pose Landmark Indices
LEFT_SHOULDER = 11
RIGHT_SHOULDER = 12
LEFT_HIP = 23
RIGHT_HIP = 24
LEFT_KNEE = 25
RIGHT_KNEE = 26
LEFT_ANKLE = 27
RIGHT_ANKLE = 28
LEFT_HEEL = 29
RIGHT_HEEL = 30
LEFT_FOOT_INDEX = 31
RIGHT_FOOT_INDEX = 32

# Pipeline Limits
MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB
MAX_DURATION_SECONDS = 20.0
MAX_SAMPLED_FRAMES = 120
TARGET_SAMPLE_FPS = 12.0
MIN_USABLE_FRAMES = 6
MIN_LANDMARK_VISIBILITY = 0.40


@dataclass
class MovementFeatureOutput:
    name: str
    value: Optional[float]
    unit: str
    is_valid: bool
    is_approximation: bool
    confidence: float
    clinical_significance: str
    reason_unavailable: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "value": round(self.value, 2) if self.value is not None else None,
            "unit": self.unit,
            "isValid": self.is_valid,
            "isApproximation": self.is_approximation,
            "confidence": round(self.confidence, 2),
            "clinicalSignificance": self.clinical_significance,
            "reasonUnavailable": self.reason_unavailable,
        }


@dataclass
class PipelineResult:
    analysis_id: str
    record_id: Optional[str]
    status: str  # "completed" | "insufficient-quality" | "failed" | "model-unavailable"
    analysis_method: str
    model_version: str
    input_quality_status: str  # "good" | "fair" | "insufficient" | "unusable"
    timestamp: int
    duration_seconds: float
    frames_analyzed: int
    usable_frames_count: int
    mean_landmark_confidence: float
    features: Dict[str, MovementFeatureOutput] = field(default_factory=dict)
    limitations: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    disclaimer: str = (
        "Exploratory movement features for clinician discussion only. "
        "Not clinically validated for osteoarthritis diagnosis, grading, or treatment decisions."
    )
    error_code: Optional[str] = None
    error_message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "analysisId": self.analysis_id,
            "recordId": self.record_id,
            "status": self.status,
            "analysisMethod": self.analysis_method,
            "modelVersion": self.model_version,
            "inputQualityStatus": self.input_quality_status,
            "timestamp": self.timestamp,
            "durationSeconds": round(self.duration_seconds, 2),
            "framesAnalyzed": self.frames_analyzed,
            "usableFramesCount": self.usable_frames_count,
            "meanLandmarkConfidence": round(self.mean_landmark_confidence, 2),
            "features": {k: v.to_dict() for k, v in self.features.items()},
            "limitations": self.limitations,
            "warnings": self.warnings,
            "disclaimer": self.disclaimer,
            "errorCode": self.error_code,
            "errorMessage": self.error_message,
        }


class GaitPipeline:
    """Modular, local gait analysis execution pipeline."""

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or ensure_model_exists()
        self._landmarker: Optional[mp_vision.PoseLandmarker] = None
        self._initialize_landmarker()

    def _initialize_landmarker(self) -> None:
        try:
            base_options = mp_python.BaseOptions(model_asset_path=self.model_path)
            options = mp_vision.PoseLandmarkerOptions(
                base_options=base_options,
                running_mode=mp_vision.RunningMode.IMAGE,
                num_poses=1,
                min_pose_detection_confidence=0.5,
                min_pose_presence_confidence=0.5,
                min_tracking_confidence=0.5,
                output_segmentation_masks=False,
            )
            self._landmarker = mp_vision.PoseLandmarker.create_from_options(options)
        except Exception as e:
            self._landmarker = None
            print(f"PoseLandmarker initialization warning: {e}")

    def is_ready(self) -> bool:
        return self._landmarker is not None

    def process_video_file(
        self, file_path: str, record_id: Optional[str] = None
    ) -> PipelineResult:
        analysis_id = f"gait-{uuid.uuid4().hex[:10]}"
        now_ts = int(time.time() * 1000)

        # STAGE 1: Input Validation
        if not os.path.exists(file_path):
            return PipelineResult(
                analysis_id=analysis_id,
                record_id=record_id,
                status="failed",
                analysis_method="mediapipe-pose-lite",
                model_version="1.1.1",
                input_quality_status="unusable",
                timestamp=now_ts,
                duration_seconds=0.0,
                frames_analyzed=0,
                usable_frames_count=0,
                mean_landmark_confidence=0.0,
                error_code="FILE_NOT_FOUND",
                error_message="Uploaded video file could not be found or read.",
            )

        file_size = os.path.getsize(file_path)
        if file_size == 0:
            return PipelineResult(
                analysis_id=analysis_id,
                record_id=record_id,
                status="failed",
                analysis_method="mediapipe-pose-lite",
                model_version="1.1.1",
                input_quality_status="unusable",
                timestamp=now_ts,
                duration_seconds=0.0,
                frames_analyzed=0,
                usable_frames_count=0,
                mean_landmark_confidence=0.0,
                error_code="EMPTY_FILE",
                error_message="Uploaded video file is empty (0 bytes).",
            )

        if file_size > MAX_FILE_SIZE_BYTES:
            return PipelineResult(
                analysis_id=analysis_id,
                record_id=record_id,
                status="failed",
                analysis_method="mediapipe-pose-lite",
                model_version="1.1.1",
                input_quality_status="unusable",
                timestamp=now_ts,
                duration_seconds=0.0,
                frames_analyzed=0,
                usable_frames_count=0,
                mean_landmark_confidence=0.0,
                error_code="FILE_TOO_LARGE",
                error_message=f"File exceeds maximum allowed size of {MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB.",
            )

        if not self.is_ready():
            return PipelineResult(
                analysis_id=analysis_id,
                record_id=record_id,
                status="model-unavailable",
                analysis_method="mediapipe-pose-lite",
                model_version="1.1.1",
                input_quality_status="unusable",
                timestamp=now_ts,
                duration_seconds=0.0,
                frames_analyzed=0,
                usable_frames_count=0,
                mean_landmark_confidence=0.0,
                error_code="MODEL_NOT_READY",
                error_message="Local pose-estimation model is not initialized or model asset missing.",
            )

        cap = cv2.VideoCapture(file_path)
        if not cap.isOpened():
            return PipelineResult(
                analysis_id=analysis_id,
                record_id=record_id,
                status="failed",
                analysis_method="mediapipe-pose-lite",
                model_version="1.1.1",
                input_quality_status="unusable",
                timestamp=now_ts,
                duration_seconds=0.0,
                frames_analyzed=0,
                usable_frames_count=0,
                mean_landmark_confidence=0.0,
                error_code="DECODE_ERROR",
                error_message="Unable to decode video. Unsupported container format or corrupted stream.",
            )

        try:
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
            duration = total_frames / fps if fps > 0 else 0.0

            if total_frames <= 0 or duration <= 0.0:
                return PipelineResult(
                    analysis_id=analysis_id,
                    record_id=record_id,
                    status="failed",
                    analysis_method="mediapipe-pose-lite",
                    model_version="1.1.1",
                    input_quality_status="unusable",
                    timestamp=now_ts,
                    duration_seconds=0.0,
                    frames_analyzed=0,
                    usable_frames_count=0,
                    mean_landmark_confidence=0.0,
                    error_code="EMPTY_STREAM",
                    error_message="Video contains 0 playable frames.",
                )

            # STAGE 2: Frame Sampling
            sample_stride = max(1, int(round(fps / TARGET_SAMPLE_FPS)))
            sampled_frames_data: List[Tuple[float, Any]] = []

            frame_idx = 0
            while cap.isOpened() and len(sampled_frames_data) < MAX_SAMPLED_FRAMES:
                ret, frame = cap.read()
                if not ret:
                    break
                if frame_idx % sample_stride == 0:
                    t_sec = frame_idx / fps
                    sampled_frames_data.append((t_sec, frame))
                frame_idx += 1

            effective_duration = sampled_frames_data[-1][0] if sampled_frames_data else duration

            # STAGE 3: Pose Estimation
            frame_landmarks_list: List[Tuple[float, Any, float]] = []
            confidence_scores: List[float] = []

            for t_sec, frame in sampled_frames_data:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
                detection_result = self._landmarker.detect(mp_image)

                if (
                    detection_result
                    and detection_result.pose_landmarks
                    and len(detection_result.pose_landmarks) > 0
                ):
                    landmarks = detection_result.pose_landmarks[0]
                    # Quality score for this frame
                    core_indices = [LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE]
                    visibilities = [landmarks[idx].visibility for idx in core_indices if idx < len(landmarks)]
                    frame_conf = float(np.mean(visibilities)) if visibilities else 0.0
                    confidence_scores.append(frame_conf)
                    frame_landmarks_list.append((t_sec, landmarks, frame_conf))
                else:
                    confidence_scores.append(0.0)

            total_analyzed = len(sampled_frames_data)
            mean_conf = float(np.mean(confidence_scores)) if confidence_scores else 0.0

            # STAGE 4: Landmark Quality Checks
            usable_frames = [
                (t, lm, conf)
                for t, lm, conf in frame_landmarks_list
                if conf >= MIN_LANDMARK_VISIBILITY
            ]
            usable_count = len(usable_frames)

            # Determine input quality
            if usable_count == 0 or total_analyzed == 0:
                input_quality = "unusable"
            elif usable_count < MIN_USABLE_FRAMES or (usable_count / total_analyzed) < 0.35:
                input_quality = "insufficient"
            elif (usable_count / total_analyzed) < 0.70:
                input_quality = "fair"
            else:
                input_quality = "good"

            if input_quality in ("insufficient", "unusable"):
                return PipelineResult(
                    analysis_id=analysis_id,
                    record_id=record_id,
                    status="insufficient-quality",
                    analysis_method="mediapipe-pose-lite",
                    model_version="1.1.1",
                    input_quality_status=input_quality,
                    timestamp=now_ts,
                    duration_seconds=effective_duration,
                    frames_analyzed=total_analyzed,
                    usable_frames_count=usable_count,
                    mean_landmark_confidence=mean_conf,
                    features=self._create_empty_features(
                        reason="Insufficient usable pose frames where lower limbs were tracked."
                    ),
                    limitations=[
                        "Camera framing did not capture full-body walking motion.",
                        "Severe occlusion, poor lighting, or subject out of frame.",
                    ],
                    warnings=[
                        "Automated metrics withheld to prevent invalid measurements.",
                        "Please position camera to capture the participant's full height during walking.",
                    ],
                )

            # STAGE 5: Defensible Movement Feature Extraction
            features, feature_warnings = self._extract_features(
                usable_frames, effective_duration, mean_conf
            )

            limitations = [
                "2D monocular video projection does not substitute for 3D marker-based clinical gait analysis.",
                "Exploratory screening markers; not an OA diagnosis or cartilage integrity test.",
            ]
            if input_quality == "fair":
                limitations.append("Video quality was fair; minor frame dropouts or partial limb tracking occurred.")

            return PipelineResult(
                analysis_id=analysis_id,
                record_id=record_id,
                status="completed",
                analysis_method="mediapipe-pose-lite",
                model_version="1.1.1",
                input_quality_status=input_quality,
                timestamp=now_ts,
                duration_seconds=effective_duration,
                frames_analyzed=total_analyzed,
                usable_frames_count=usable_count,
                mean_landmark_confidence=mean_conf,
                features=features,
                limitations=limitations,
                warnings=feature_warnings,
            )

        finally:
            cap.release()

    def _create_empty_features(self, reason: str) -> Dict[str, MovementFeatureOutput]:
        return {
            "cadence": MovementFeatureOutput(
                name="Step Cadence",
                value=None,
                unit="steps/min",
                is_valid=False,
                is_approximation=True,
                confidence=0.0,
                clinical_significance="Estimated steps per minute during steady walking.",
                reason_unavailable=reason,
            ),
            "stepSymmetry": MovementFeatureOutput(
                name="Bilateral Step Symmetry",
                value=None,
                unit="index (0-1)",
                is_valid=False,
                is_approximation=True,
                confidence=0.0,
                clinical_significance="Balance of left vs right step stride duration. 1.0 represents symmetry.",
                reason_unavailable=reason,
            ),
            "activeKneeFlexionRange": MovementFeatureOutput(
                name="Active Knee Flexion Range",
                value=None,
                unit="degrees",
                is_valid=False,
                is_approximation=True,
                confidence=0.0,
                clinical_significance="Peak active knee flexion excursion during walking phase.",
                reason_unavailable=reason,
            ),
            "coronalTrunkSway": MovementFeatureOutput(
                name="Coronal Trunk Sway",
                value=None,
                unit="degrees",
                is_valid=False,
                is_approximation=True,
                confidence=0.0,
                clinical_significance="Standard deviation of lateral trunk tilt angle during walking.",
                reason_unavailable=reason,
            ),
        }

    def _extract_features(
        self,
        usable_frames: List[Tuple[float, Any, float]],
        duration_sec: float,
        overall_confidence: float,
    ) -> Tuple[Dict[str, MovementFeatureOutput], List[str]]:
        warnings: List[str] = []
        features: Dict[str, MovementFeatureOutput] = {}

        timestamps = [f[0] for f in usable_frames]
        left_ankles_x = [f[1][LEFT_ANKLE].x for f in usable_frames]
        right_ankles_x = [f[1][RIGHT_ANKLE].x for f in usable_frames]
        left_ankles_y = [f[1][LEFT_ANKLE].y for f in usable_frames]
        right_ankles_y = [f[1][RIGHT_ANKLE].y for f in usable_frames]

        # 1. Cadence (steps/min)
        # We track alternating ankle relative position: separation = x_left - x_right
        separations = [l - r for l, r in zip(left_ankles_x, right_ankles_x)]
        peaks = 0
        if len(separations) >= 8 and duration_sec >= 1.5:
            # Count zero-crossings or oscillations
            crossings = 0
            mean_sep = float(np.mean(separations))
            detrended = [s - mean_sep for s in separations]
            for i in range(1, len(detrended)):
                if (detrended[i - 1] > 0 and detrended[i] <= 0) or (detrended[i - 1] < 0 and detrended[i] >= 0):
                    crossings += 1
            peaks = crossings

        if peaks >= 2 and duration_sec > 0:
            cadence_val = float((peaks / duration_sec) * 60.0)
            # Biomechanical validity boundary: 30 to 180 steps/min
            if 30.0 <= cadence_val <= 180.0:
                features["cadence"] = MovementFeatureOutput(
                    name="Step Cadence",
                    value=cadence_val,
                    unit="steps/min",
                    is_valid=True,
                    is_approximation=True,
                    confidence=min(1.0, overall_confidence),
                    clinical_significance="Estimated steps per minute during steady walking.",
                )
            else:
                features["cadence"] = MovementFeatureOutput(
                    name="Step Cadence",
                    value=None,
                    unit="steps/min",
                    is_valid=False,
                    is_approximation=True,
                    confidence=0.0,
                    clinical_significance="Estimated steps per minute during steady walking.",
                    reason_unavailable=f"Computed cadence ({cadence_val:.1f} steps/min) outside plausible biological limits.",
                )
                warnings.append("Computed cadence outside expected range.")
        else:
            features["cadence"] = MovementFeatureOutput(
                name="Step Cadence",
                value=None,
                unit="steps/min",
                is_valid=False,
                is_approximation=True,
                confidence=0.0,
                clinical_significance="Estimated steps per minute during steady walking.",
                reason_unavailable="Fewer than 2 alternating stride cycles detectable in recording duration.",
            )

        # 2. Step Symmetry Index (0 to 1)
        # Compare variance / excursion magnitude of left vs right ankle displacement
        left_disp = float(np.std(left_ankles_y)) if len(left_ankles_y) > 3 else 0.0
        right_disp = float(np.std(right_ankles_y)) if len(right_ankles_y) > 3 else 0.0

        if left_disp > 0.005 and right_disp > 0.005:
            ratio = min(left_disp, right_disp) / max(left_disp, right_disp)
            symmetry_val = float(np.clip(ratio, 0.0, 1.0))
            features["stepSymmetry"] = MovementFeatureOutput(
                name="Bilateral Step Symmetry",
                value=symmetry_val,
                unit="index (0-1)",
                is_valid=True,
                is_approximation=True,
                confidence=min(1.0, overall_confidence * 0.9),
                clinical_significance="Balance of left vs right step excursion. 1.0 represents symmetry.",
            )
        else:
            features["stepSymmetry"] = MovementFeatureOutput(
                name="Bilateral Step Symmetry",
                value=None,
                unit="index (0-1)",
                is_valid=False,
                is_approximation=True,
                confidence=0.0,
                clinical_significance="Balance of left vs right step excursion. 1.0 represents symmetry.",
                reason_unavailable="Insufficient bilateral movement excursion detected on one or both limbs.",
            )

        # 3. Active Knee Flexion Range (degrees)
        knee_angles: List[float] = []
        for _, lm, _ in usable_frames:
            # Calculate for left or right knee (prefer the one with higher visibility)
            l_hip, l_knee, l_ankle = lm[LEFT_HIP], lm[LEFT_KNEE], lm[LEFT_ANKLE]
            r_hip, r_knee, r_ankle = lm[RIGHT_HIP], lm[RIGHT_KNEE], lm[RIGHT_ANKLE]

            l_vis = min(l_hip.visibility, l_knee.visibility, l_ankle.visibility)
            r_vis = min(r_hip.visibility, r_knee.visibility, r_ankle.visibility)

            if max(l_vis, r_vis) >= 0.40:
                if l_vis >= r_vis:
                    h, k, a = (l_hip.x, l_hip.y), (l_knee.x, l_knee.y), (l_ankle.x, l_ankle.y)
                else:
                    h, k, a = (r_hip.x, r_hip.y), (r_knee.x, r_knee.y), (r_ankle.x, r_ankle.y)

                v1 = (h[0] - k[0], h[1] - k[1])
                v2 = (a[0] - k[0], a[1] - k[1])
                norm1 = math.sqrt(v1[0] ** 2 + v1[1] ** 2)
                norm2 = math.sqrt(v2[0] ** 2 + v2[1] ** 2)

                if norm1 > 0.001 and norm2 > 0.001:
                    dot = v1[0] * v2[0] + v1[1] * v2[1]
                    cos_theta = max(-1.0, min(1.0, dot / (norm1 * norm2)))
                    included_angle = math.degrees(math.acos(cos_theta))
                    flexion = 180.0 - included_angle
                    knee_angles.append(flexion)

        if len(knee_angles) >= 6:
            knee_rom = float(np.max(knee_angles) - np.min(knee_angles))
            if 5.0 <= knee_rom <= 110.0:
                features["activeKneeFlexionRange"] = MovementFeatureOutput(
                    name="Active Knee Flexion Range",
                    value=knee_rom,
                    unit="degrees",
                    is_valid=True,
                    is_approximation=True,
                    confidence=min(1.0, overall_confidence * 0.85),
                    clinical_significance="Estimated peak knee flexion angle excursion during stride.",
                )
            else:
                features["activeKneeFlexionRange"] = MovementFeatureOutput(
                    name="Active Knee Flexion Range",
                    value=None,
                    unit="degrees",
                    is_valid=False,
                    is_approximation=True,
                    confidence=0.0,
                    clinical_significance="Estimated peak knee flexion angle excursion during stride.",
                    reason_unavailable=f"Computed flexion range ({knee_rom:.1f}°) outside expected walking bounds.",
                )
        else:
            features["activeKneeFlexionRange"] = MovementFeatureOutput(
                name="Active Knee Flexion Range",
                value=None,
                unit="degrees",
                is_valid=False,
                is_approximation=True,
                confidence=0.0,
                clinical_significance="Estimated peak knee flexion angle excursion during stride.",
                reason_unavailable="Knee landmarks insufficiently visible across stride phases.",
            )

        # 4. Coronal Trunk Sway (degrees)
        trunk_tilts: List[float] = []
        for _, lm, _ in usable_frames:
            s_l, s_r = lm[LEFT_SHOULDER], lm[RIGHT_SHOULDER]
            h_l, h_r = lm[LEFT_HIP], lm[RIGHT_HIP]
            if min(s_l.visibility, s_r.visibility, h_l.visibility, h_r.visibility) >= 0.40:
                s_mid = ((s_l.x + s_r.x) / 2.0, (s_l.y + s_r.y) / 2.0)
                h_mid = ((h_l.x + h_r.x) / 2.0, (h_l.y + h_r.y) / 2.0)
                dx = s_mid[0] - h_mid[0]
                dy = -(s_mid[1] - h_mid[1])  # inverted Y in image coordinates
                tilt_deg = math.degrees(math.atan2(dx, dy if abs(dy) > 1e-4 else 1e-4))
                trunk_tilts.append(tilt_deg)

        if len(trunk_tilts) >= 6:
            sway_std = float(np.std(trunk_tilts))
            features["coronalTrunkSway"] = MovementFeatureOutput(
                name="Coronal Trunk Sway",
                value=sway_std,
                unit="degrees",
                is_valid=True,
                is_approximation=True,
                confidence=min(1.0, overall_confidence * 0.9),
                clinical_significance="Standard deviation of lateral trunk tilt angle during walking.",
            )
        else:
            features["coronalTrunkSway"] = MovementFeatureOutput(
                name="Coronal Trunk Sway",
                value=None,
                unit="degrees",
                is_valid=False,
                is_approximation=True,
                confidence=0.0,
                clinical_significance="Standard deviation of lateral trunk tilt angle during walking.",
                reason_unavailable="Shoulder or hip landmarks occluded during gait sequence.",
            )

        return features, warnings
