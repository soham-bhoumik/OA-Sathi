"""
OA-Sathi Gait Analysis Pipeline Test Suite (Python)
---------------------------------------------------
Tests:
1. Pipeline initialization & model readiness.
2. Missing file handling (rejects gracefully).
3. Empty file handling (rejects gracefully).
4. Unusable / corrupted video handling.
5. Missing features remain None / invalid (never converted to 0.0).
6. Structured output schema compliance.
7. Temporary file cleanup verification in FastAPI endpoint.
8. /health and /api/gait/sample-analysis endpoint responses.
"""

import os
import shutil
import tempfile
import unittest
from fastapi.testclient import TestClient

import cv2
import numpy as np

from backend.app import app
from backend.gait_pipeline import GaitPipeline, PipelineResult


class TestGaitPipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pipeline = GaitPipeline()
        cls.client = TestClient(app)

    def test_01_pipeline_initialization(self):
        """Pipeline initializes and reports ready status with model loaded."""
        self.assertTrue(self.pipeline.is_ready(), "Pipeline should be ready with model loaded.")

    def test_02_missing_file_handling(self):
        """Non-existent file returns failed status with FILE_NOT_FOUND code."""
        result = self.pipeline.process_video_file("non_existent_file.mp4")
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.error_code, "FILE_NOT_FOUND")
        self.assertEqual(result.input_quality_status, "unusable")

    def test_03_empty_file_handling(self):
        """Zero-byte file returns failed status with EMPTY_FILE code."""
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(b"")
            empty_path = f.name

        try:
            result = self.pipeline.process_video_file(empty_path)
            self.assertEqual(result.status, "failed")
            self.assertEqual(result.error_code, "EMPTY_FILE")
        finally:
            if os.path.exists(empty_path):
                os.remove(empty_path)

    def test_04_corrupted_file_handling(self):
        """Invalid non-video content returns DECODE_ERROR."""
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(b"GARBAGE_NOT_A_VIDEO_STREAM_1234567890")
            junk_path = f.name

        try:
            result = self.pipeline.process_video_file(junk_path)
            self.assertEqual(result.status, "failed")
            self.assertEqual(result.error_code, "DECODE_ERROR")
        finally:
            if os.path.exists(junk_path):
                os.remove(junk_path)

    def test_05_blank_video_no_person_detected(self):
        """A video with blank black frames has no detectable pose, returning insufficient-quality."""
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            blank_path = f.name

        try:
            # Create a 2-second blank video (30 frames at 15 fps)
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            out = cv2.VideoWriter(blank_path, fourcc, 15.0, (320, 240))
            blank_frame = np.zeros((240, 320, 3), dtype=np.uint8)
            for _ in range(30):
                out.write(blank_frame)
            out.release()

            result = self.pipeline.process_video_file(blank_path)
            self.assertIn(result.status, ("insufficient-quality", "failed"))
            self.assertEqual(result.usable_frames_count, 0)
            # Crucial check: missing features must NOT be zero
            for feat_name, feat in result.features.items():
                self.assertIsNone(feat.value, f"Feature {feat_name} value must be None when not tracked")
                self.assertFalse(feat.is_valid, f"Feature {feat_name} must have is_valid = False")
                self.assertIsNotNone(feat.reason_unavailable)
        finally:
            if os.path.exists(blank_path):
                os.remove(blank_path)

    def test_06_fastapi_health_endpoint(self):
        """FastAPI /health returns ok status and model readiness."""
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["service"], "oa-sathi-gait-analysis")
        self.assertTrue(data["modelReady"])
        self.assertIn("privacyNotice", data)

    def test_07_fastapi_sample_analysis_endpoint(self):
        """FastAPI /api/gait/sample-analysis returns benchmark gait output schema."""
        response = self.client.get("/api/gait/sample-analysis?recordId=OS-0248")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "completed")
        self.assertEqual(data["recordId"], "OS-0248")
        self.assertIn("cadence", data["features"])
        self.assertIn("stepSymmetry", data["features"])
        self.assertIn("activeKneeFlexionRange", data["features"])
        self.assertIn("coronalTrunkSway", data["features"])
        self.assertTrue(data["features"]["cadence"]["isValid"])
        self.assertIn("disclaimer", data)
        self.assertIn("limitations", data)

    def test_08_fastapi_unsupported_file_extension(self):
        """FastAPI rejects unsupported file formats with 415 error."""
        response = self.client.post(
            "/api/gait/analyze",
            files={"file": ("test.txt", b"plain text", "text/plain")},
        )
        self.assertEqual(response.status_code, 415)

    def test_09_temporary_file_cleanup_on_upload(self):
        """Temporary files created during upload processing are guaranteed to be cleaned up."""
        # Create a dummy blank mp4 file
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            dummy_path = f.name
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            out = cv2.VideoWriter(dummy_path, fourcc, 10.0, (160, 120))
            out.write(np.zeros((120, 160, 3), dtype=np.uint8))
            out.release()

        try:
            with open(dummy_path, "rb") as video_file:
                response = self.client.post(
                    "/api/gait/analyze",
                    files={"file": ("test_clip.mp4", video_file, "video/mp4")},
                    data={"recordId": "OS-TEST"},
                )
            self.assertEqual(response.status_code, 200)

            # Check that no temporary oa_gait_* folders leak in tempdir
            temp_dir = tempfile.gettempdir()
            oa_folders = [f for f in os.listdir(temp_dir) if f.startswith("oa_gait_")]
            self.assertEqual(len(oa_folders), 0, "No oa_gait_* temp directories should remain after request.")
        finally:
            if os.path.exists(dummy_path):
                os.remove(dummy_path)


if __name__ == "__main__":
    unittest.main()
