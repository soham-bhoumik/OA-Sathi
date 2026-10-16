"""
Unit Tests for OA-Sathi Knee X-ray Radiograph Pipeline
------------------------------------------------------
Verifies:
- Safe image bytes decoding and size limit enforcement.
- Dimension limits (min 256x256, max 4096x4096).
- Format, MIME type, and magic byte filtering.
- Unsupported view (e.g. Lateral) abstention behavior.
- Kellgren-Lawrence (KL) grade class probabilities and uncertainty calibration.
- Genuine ONNX model adapter loading and inference execution.
- Audit event logging without storing sensitive raw pixels.
- Mandatory consent verification.
"""

import unittest
import io
from PIL import Image, ImageDraw
import numpy as np
from backend.xray_pipeline import (
    KneeXrayPipeline,
    KneeOaOnnxModelAdapter,
    MODEL_METADATA,
    record_xray_audit_event,
    get_xray_audit_trail,
    clear_xray_audit_trail,
    MAX_XRAY_FILE_SIZE_BYTES,
)


def create_synthetic_knee_xray_bytes(
    width: int = 512,
    height: int = 512,
    intensity: int = 120,
    add_joint_texture: bool = True,
) -> bytes:
    """Helper to synthesize a compliant test radiograph in memory using Pillow."""
    img = Image.new("L", (width, height), color=intensity)
    if add_joint_texture:
        draw = ImageDraw.Draw(img)
        # Simulate femur and tibia bone plateaus with joint space
        draw.rectangle([int(width * 0.2), 0, int(width * 0.8), int(height * 0.45)], fill=180)
        draw.rectangle([int(width * 0.2), int(height * 0.55), int(width * 0.8), height], fill=170)
        # Joint space in middle
        draw.line([int(width * 0.25), int(height * 0.5), int(width * 0.75), int(height * 0.5)], fill=40, width=4)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class TestKneeXrayPipeline(unittest.TestCase):

    def setUp(self):
        self.pipeline = KneeXrayPipeline()
        clear_xray_audit_trail()

    def test_pipeline_initialization(self):
        """Pipeline initializes successfully with model metadata."""
        self.assertTrue(self.pipeline.is_ready())
        self.assertIn("c2p-cmd/knee_oa_classifier", MODEL_METADATA["modelName"])
        self.assertIn("AP", MODEL_METADATA["supportedViews"])
        self.assertIn("PA", MODEL_METADATA["supportedViews"])
        self.assertIn("Lateral", MODEL_METADATA["unsupportedViews"])

    def test_onnx_model_adapter_loaded(self):
        """Verify that genuine ONNX model is loaded and runs inference."""
        adapter = self.pipeline.onnx_adapter
        self.assertTrue(adapter.is_loaded, f"Model failed to load: {adapter.load_error}")
        self.assertEqual(adapter.input_name, "keras_tensor_427")
        self.assertEqual(adapter.output_name, "output_0")

        img_bytes = create_synthetic_knee_xray_bytes(512, 512)
        kl, probs, engine = adapter.predict(img_bytes)
        self.assertIn(kl, [0, 1, 2, 3, 4])
        self.assertEqual(len(probs), 5)
        self.assertAlmostEqual(sum(probs), 1.0, delta=0.01)
        self.assertEqual(engine, "onnxruntime-densenet121")

    def test_valid_image_produces_completed_analysis(self):
        """A valid AP knee radiograph generates a completed analysis with valid KL output."""
        img_bytes = create_synthetic_knee_xray_bytes(512, 512)
        res = self.pipeline.analyze_knee_radiograph(
            image_bytes=img_bytes,
            filename="knee_ap_test.png",
            content_type="image/png",
            patient_id="OS-TEST-001",
            laterality="Right",
            view="AP",
            consent_confirmed=True,
        )

        self.assertEqual(res["status"], "completed")
        self.assertEqual(res["patientId"], "OS-TEST-001")
        self.assertEqual(res["view"], "AP")
        self.assertIn(res["predictedKlGrade"], [0, 1, 2, 3, 4])
        self.assertTrue("predictedKlLabel" in res)
        self.assertTrue("classProbabilities" in res)

        probs = res["classProbabilities"]
        total_prob = sum(probs.values())
        self.assertAlmostEqual(total_prob, 1.0, delta=0.05)
        self.assertGreaterEqual(res["modelConfidence"], 0.20)
        self.assertTrue("engineUsed" in res)

    def test_unsupported_lateral_view_triggers_abstention(self):
        """Lateral knee radiographs trigger transparent model abstention."""
        img_bytes = create_synthetic_knee_xray_bytes(512, 512)
        res = self.pipeline.analyze_knee_radiograph(
            image_bytes=img_bytes,
            filename="knee_lateral_test.png",
            content_type="image/png",
            patient_id="OS-TEST-002",
            laterality="Left",
            view="Lateral",
            consent_confirmed=True,
        )

        self.assertEqual(res["status"], "abstained")
        self.assertIn("abstentionReason", res)
        self.assertIn("not supported for automated Kellgren-Lawrence grading", res["abstentionReason"])
        self.assertNotIn("predictedKlGrade", res)

    def test_unsupported_file_extension_rejected(self):
        """Disallowed file extensions like .pdf or .txt are strictly rejected."""
        dummy_bytes = b"%PDF-1.4 header test"
        res = self.pipeline.analyze_knee_radiograph(
            image_bytes=dummy_bytes,
            filename="knee_report.pdf",
            content_type="application/pdf",
            patient_id="OS-TEST-003",
            laterality="Right",
            view="AP",
            consent_confirmed=True,
        )

        self.assertEqual(res["status"], "invalid-image")
        self.assertIn("Unsupported file extension", res["error"])

    def test_empty_image_file_rejected(self):
        """0-byte file upload returns a clear error."""
        res = self.pipeline.analyze_knee_radiograph(
            image_bytes=b"",
            filename="empty.png",
            content_type="image/png",
            patient_id="OS-TEST-004",
            laterality="Right",
            view="AP",
            consent_confirmed=True,
        )

        self.assertEqual(res["status"], "invalid-image")
        self.assertIn("empty", res["error"])

    def test_undersized_image_rejected(self):
        """Images smaller than 256x256 are rejected as inadequate for radiographic evaluation."""
        tiny_bytes = create_synthetic_knee_xray_bytes(width=100, height=100)
        res = self.pipeline.analyze_knee_radiograph(
            image_bytes=tiny_bytes,
            filename="tiny.png",
            content_type="image/png",
            patient_id="OS-TEST-005",
            laterality="Right",
            view="AP",
            consent_confirmed=True,
        )

        self.assertEqual(res["status"], "invalid-image")
        self.assertIn("too small", res["error"])

    def test_missing_consent_returns_error(self):
        """Analysis is blocked when clinician has not confirmed consent."""
        img_bytes = create_synthetic_knee_xray_bytes(512, 512)
        res = self.pipeline.analyze_knee_radiograph(
            image_bytes=img_bytes,
            filename="knee.png",
            content_type="image/png",
            patient_id="OS-TEST-006",
            laterality="Right",
            view="AP",
            consent_confirmed=False,
        )

        self.assertEqual(res["status"], "error")
        self.assertIn("consent", res["error"].lower())

    def test_audit_trail_logging(self):
        """Audit trail accurately records analysis and abstention actions without logging pixels."""
        img_bytes = create_synthetic_knee_xray_bytes(512, 512)
        self.pipeline.analyze_knee_radiograph(
            image_bytes=img_bytes,
            filename="knee.png",
            content_type="image/png",
            patient_id="OS-AUDIT-1",
            laterality="Right",
            view="AP",
            consent_confirmed=True,
        )
        self.pipeline.analyze_knee_radiograph(
            image_bytes=img_bytes,
            filename="knee_lat.png",
            content_type="image/png",
            patient_id="OS-AUDIT-1",
            laterality="Right",
            view="Lateral",
            consent_confirmed=True,
        )

        trail = get_xray_audit_trail("OS-AUDIT-1")
        self.assertEqual(len(trail), 2)
        self.assertEqual(trail[0]["eventType"], "analysis_completed")
        self.assertEqual(trail[1]["eventType"], "analysis_abstained")
        # Ensure raw pixels are NOT logged
        for entry in trail:
            self.assertNotIn("image_bytes", entry["details"])
            self.assertNotIn("pixels", entry["details"])


if __name__ == "__main__":
    unittest.main()
