import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import {
  smoothLandmarks,
  resetSmoothing,
  getPoseTelemetry,
  resetPoseTelemetry,
  getActiveDelegate,
  resetPoseTimestamp,
  disposeLivePoseLandmarker,
  detectAndDrawPose,
  calculateLiveMetrics,
  getLandmarkConfidence,
  recordCameraFrame,
  recordRenderFrame,
  setSchedulingMode,
} from "../src/services/livePoseEstimation.ts";

function createDummyLandmark(x: number, y: number, z: number = 0, visibility: number = 0.9): NormalizedLandmark {
  return { x, y, z, visibility, presence: 0.9 };
}

function create33DummyLandmarks(baseX: number = 0.5, baseY: number = 0.5): NormalizedLandmark[] {
  return Array.from({ length: 33 }, (_, i) => createDummyLandmark(baseX + (i * 0.005), baseY + (i * 0.005)));
}

describe("OA-Sathi MediaPipe Pose Optimization & Telemetry Test Suite", () => {
  beforeEach(() => {
    resetSmoothing();
    resetPoseTelemetry();
    resetPoseTimestamp();
  });

  it("1. smoothLandmarks safely handles empty or null landmark arrays", () => {
    const emptyResult = smoothLandmarks([]);
    assert.deepEqual(emptyResult, []);
  });

  it("2. smoothLandmarks initializes baseline state on first frame without displacement delay", () => {
    const raw = create33DummyLandmarks(0.5, 0.5);
    const smoothed = smoothLandmarks(raw);

    assert.equal(smoothed.length, 33);
    assert.equal(smoothed[0].x, raw[0].x);
    assert.equal(smoothed[0].y, raw[0].y);
    assert.equal(smoothed[0].visibility, raw[0].visibility);
  });

  it("3. smoothLandmarks dampens small jitter during stationary pose", () => {
    const frame1 = create33DummyLandmarks(0.5, 0.5);
    smoothLandmarks(frame1);

    // Subtle 0.004 jitter on frame 2 (simulating webcam pixel noise)
    const frame2 = create33DummyLandmarks(0.504, 0.504);
    const smoothed2 = smoothLandmarks(frame2);

    // Expected: alpha = 0.60 for tiny motion, so smoothed2[0].x = 0.60 * 0.504 + 0.40 * 0.5 = 0.5024
    assert.ok(smoothed2[0].x > 0.5 && smoothed2[0].x < 0.504, "Smoothed x is dampened between prev and cur");
    assert.ok(Math.abs(smoothed2[0].x - 0.5024) < 0.001, "Smoothed x follows adaptive low-velocity EMA formula");
  });

  it("4. smoothLandmarks dynamically increases alpha during rapid limb transitions to avoid lag", () => {
    const frame1 = create33DummyLandmarks(0.5, 0.5);
    smoothLandmarks(frame1);

    // Large 0.15 excursion on frame 2 (simulating rapid knee extension)
    const frame2 = create33DummyLandmarks(0.65, 0.5);
    const smoothed2 = smoothLandmarks(frame2);

    // High speed (> 0.08 distance) uses alpha = 0.92 to prevent perceptual lag
    assert.ok(smoothed2[0].x >= 0.63, "Smoothed position closely tracks rapid movement (> 90% adaptation)");
  });

  it("5. resetSmoothing clears previous state for fresh movement recording", () => {
    const frame1 = create33DummyLandmarks(0.2, 0.2);
    smoothLandmarks(frame1);

    resetSmoothing();

    // After reset, a frame at 0.8 should not blend with 0.2
    const frameNew = create33DummyLandmarks(0.8, 0.8);
    const smoothedNew = smoothLandmarks(frameNew);

    assert.equal(smoothedNew[0].x, 0.8, "New movement baseline initialized fresh after resetSmoothing");
  });

  it("6. Telemetry tracks processed and skipped frames with zero hardcoded defaults", () => {
    const initialTelemetry = getPoseTelemetry();
    assert.equal(initialTelemetry.processedFrames, 0);
    assert.equal(initialTelemetry.skippedFrames, 0);
    assert.equal(initialTelemetry.recentInferenceMs, 0);
    assert.equal(initialTelemetry.effectiveFps, 0);
  });

  it("7. getActiveDelegate reflects initial state and disposal cleanup", () => {
    assert.equal(getActiveDelegate(), "uninitialized");

    disposeLivePoseLandmarker();
    assert.equal(getActiveDelegate(), "uninitialized");
  });

  it("8. detectAndDrawPose skips identical video frames and increments skippedFrames counter", () => {
    const mockLandmarker = {
      detectForVideo: () => ({
        landmarks: [create33DummyLandmarks(0.5, 0.5)],
      }),
    } as any;

    const mockVideo = {
      videoWidth: 640,
      videoHeight: 480,
      readyState: 4,
      currentTime: 1.25,
      paused: false,
      ended: false,
    } as any;

    const mockCanvas = {
      width: 640,
      height: 480,
      getContext: () => ({
        clearRect: () => {},
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        arc: () => {},
        fill: () => {},
      }),
    } as any;

    // First call: processes frame
    const res1 = detectAndDrawPose(mockLandmarker, mockVideo, mockCanvas, 1000, true);
    assert.ok(res1.result !== null, "First frame is processed");
    let t = getPoseTelemetry();
    assert.equal(t.processedFrames, 1, "Processed frames incremented to 1");
    assert.equal(t.skippedFrames, 0, "No frames skipped yet");

    // Second call with IDENTICAL currentTime (video has not advanced)
    const res2 = detectAndDrawPose(mockLandmarker, mockVideo, mockCanvas, 1016, true);
    assert.ok(res2.result !== null, "Returns cached result on identical frame");
    t = getPoseTelemetry();
    assert.equal(t.processedFrames, 1, "Inference was not run again on identical frame");
    assert.equal(t.skippedFrames, 1, "Identical frame skipped successfully");

    // Third call with ADVANCED currentTime (video delivered new frame)
    mockVideo.currentTime = 1.283;
    const res3 = detectAndDrawPose(mockLandmarker, mockVideo, mockCanvas, 1033, true);
    assert.ok(res3.result !== null, "Processed advanced video frame");
    t = getPoseTelemetry();
    assert.equal(t.processedFrames, 2, "Processed frames incremented to 2");
    assert.equal(t.skippedFrames, 1, "Skipped frames remains 1");
  });

  it("9. resetPoseTimestamp clears frame caches and timestamps cleanly", () => {
    resetPoseTimestamp();
    const t = getPoseTelemetry();
    assert.equal(t.processedFrames, 0);
    assert.equal(t.skippedFrames, 0);
  });

  it("10. Landmark smoothing preserves lower-extremity angle calculations", () => {
    const raw = create33DummyLandmarks(0.5, 0.5);
    // Explicitly place left hip, knee, and ankle at an upright angle (approx 180 deg)
    raw[23] = createDummyLandmark(0.45, 0.5); // left hip
    raw[25] = createDummyLandmark(0.45, 0.7); // left knee
    raw[27] = createDummyLandmark(0.45, 0.9); // left ankle

    const smoothed = smoothLandmarks(raw);
    const metrics = calculateLiveMetrics(smoothed);

    assert.ok(metrics.leftKneeAngleDeg !== null, "Left knee angle calculated from smoothed landmarks");
    assert.ok(metrics.leftKneeAngleDeg >= 170 && metrics.leftKneeAngleDeg <= 180, "Standing knee is approximately straight");
  });

  it("11. getLandmarkConfidence evaluates visibility and presence bounds safely", () => {
    assert.equal(getLandmarkConfidence(undefined), 0);
    assert.equal(getLandmarkConfidence({ x: 0.5, y: 0.5, z: 0, visibility: 0.85, presence: 0.95 }), 0.85);
    assert.equal(getLandmarkConfidence({ x: 0.5, y: 0.5, z: 0, visibility: 0.95, presence: 0.70 }), 0.70);
    // When fields are omitted, safely defaults to 1.0
    assert.equal(getLandmarkConfidence({ x: 0.5, y: 0.5, z: 0 } as any), 1.0);
  });

  it("12. recordCameraFrame and recordRenderFrame accurately compute rolling rates", () => {
    resetPoseTelemetry();

    // Simulate 30 camera frames arriving over 1000ms
    const t0 = 10000;
    recordCameraFrame(t0);
    for (let i = 1; i <= 30; i++) {
      recordCameraFrame(t0 + i * (1000 / 30));
    }

    // Simulate 30 overlay render passes over 1000ms
    recordRenderFrame(t0);
    for (let i = 1; i <= 30; i++) {
      recordRenderFrame(t0 + i * (1000 / 30));
    }

    const t = getPoseTelemetry();
    assert.ok(t.cameraFps >= 29 && t.cameraFps <= 31, `Camera FPS is ~30 (measured: ${t.cameraFps})`);
    assert.ok(t.renderFps >= 29 && t.renderFps <= 31, `Render FPS is ~30 (measured: ${t.renderFps})`);
  });

  it("13. setSchedulingMode switches active scheduling telemetry cleanly", () => {
    setSchedulingMode("requestVideoFrameCallback");
    assert.equal(getPoseTelemetry().schedulingMode, "requestVideoFrameCallback");

    setSchedulingMode("requestAnimationFrameFallback");
    assert.equal(getPoseTelemetry().schedulingMode, "requestAnimationFrameFallback");
  });

  it("14. In-place smoothing mutates pre-allocated cache without re-allocating new objects", () => {
    resetSmoothing();
    const frame1 = create33DummyLandmarks(0.5, 0.5);
    const smoothed1 = smoothLandmarks(frame1);

    const frame2 = create33DummyLandmarks(0.52, 0.52);
    const smoothed2 = smoothLandmarks(frame2);

    // Identity check: cache array reference is reused to eliminate GC allocations
    assert.equal(smoothed1, smoothed2, "Smoothed array memory reference is reused across frames");
    assert.ok(smoothed2[0].x > 0.5 && smoothed2[0].x < 0.52, "Values are correctly updated in-place");
  });

  it("15. calculateLiveMetrics handles occluded landmarks without throwing NaN or crashing", () => {
    const landmarksWithOcclusion = create33DummyLandmarks(0.5, 0.5);
    // Explicitly set knees to 0 visibility (occluded)
    landmarksWithOcclusion[25].visibility = 0.1;
    landmarksWithOcclusion[26].visibility = 0.1;

    const metrics = calculateLiveMetrics(landmarksWithOcclusion);
    assert.equal(metrics.leftKneeAngleDeg, null, "Occluded left knee returns null instead of false zero or NaN");
    assert.equal(metrics.rightKneeAngleDeg, null, "Occluded right knee returns null instead of false zero or NaN");
    assert.equal(metrics.lowerBodyVisible, false, "Correctly identifies lower body as not visible");
  });
});

