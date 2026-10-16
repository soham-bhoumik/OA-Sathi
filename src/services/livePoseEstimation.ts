/**
 * OA-Sathi Live Client-Side Pose Estimation Service
 * --------------------------------------------------
 * Powered by Google MediaPipe PoseLandmarker (WASM/WebGL execution in browser).
 *
 * Responsibilities:
 * 1. Initialize local PoseLandmarker in VIDEO mode.
 * 2. Process camera frames with concurrency guards and frame skipping.
 * 3. Render a visible real-time skeleton and joint overlay on an HTML <canvas>.
 * 4. Extract real-time joint angles (e.g. knee flexion, coronal trunk tilt).
 * 5. Provide robust error handling, offline support, and clean resource disposal.
 */

import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

export type LivePoseStatus =
  | "uninitialized"
  | "loading-model"
  | "model-ready"
  | "tracking-active"
  | "no-person-detected"
  | "error";

export interface LiveJointMetrics {
  kneeAngleDeg: number | null;
  trunkTiltDeg: number | null;
  confidenceScore: number;
  landmarksDetected: number;
  leftKneeAngleDeg: number | null;
  rightKneeAngleDeg: number | null;
  shoulderTiltDeg: number | null;
  pelvicTiltDeg: number | null;
  personInView: boolean;
  lowerBodyVisible: boolean;
  trackingQuality: "good" | "fair" | "low" | "none";
}

export interface PosePerformanceTelemetry {
  activeDelegate: "GPU" | "CPU" | "uninitialized";
  cameraFps: number;
  inferenceFps: number;
  renderFps: number;
  processedFrames: number;
  skippedFrames: number;
  recentInferenceMs: number;
  avgInferenceMs: number;
  effectiveFps: number;
  videoWidth: number;
  videoHeight: number;
  schedulingMode: "requestVideoFrameCallback" | "requestAnimationFrameFallback";
}

// MediaPipe Pose Landmark Indices
const NOSE = 0;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

// Anatomical skeleton connections for rendering
export const SKELETON_CONNECTIONS: [number, number][] = [
  // Head & Neck
  [NOSE, LEFT_SHOULDER],
  [NOSE, RIGHT_SHOULDER],
  // Torso
  [LEFT_SHOULDER, RIGHT_SHOULDER],
  [LEFT_SHOULDER, LEFT_HIP],
  [RIGHT_SHOULDER, RIGHT_HIP],
  [LEFT_HIP, RIGHT_HIP],
  // Left arm
  [LEFT_SHOULDER, 13],
  [13, 15],
  // Right arm
  [RIGHT_SHOULDER, 14],
  [14, 16],
  // Left leg
  [LEFT_HIP, LEFT_KNEE],
  [LEFT_KNEE, LEFT_ANKLE],
  [LEFT_ANKLE, 29], // left heel
  [29, 31], // left toe
  [LEFT_ANKLE, 31],
  // Right leg
  [RIGHT_HIP, RIGHT_KNEE],
  [RIGHT_KNEE, RIGHT_ANKLE],
  [RIGHT_ANKLE, 30], // right heel
  [30, 32], // right toe
  [RIGHT_ANKLE, 32],
];

let landmarkerInstance: PoseLandmarker | null = null;
let initializationPromise: Promise<PoseLandmarker> | null = null;
let lastVideoTimestamp = -1;
let lastVideoTimeSec = -1;
let lastResultCache: PoseLandmarkerResult | null = null;
let lastMetricsCache: LiveJointMetrics | null = null;

let activeDelegate: "GPU" | "CPU" | "uninitialized" = "uninitialized";
let schedulingMode: "requestVideoFrameCallback" | "requestAnimationFrameFallback" = "requestAnimationFrameFallback";
let processedFramesCounter = 0;
let skippedFramesCounter = 0;
let recentInferenceMs = 0;
let totalInferenceMs = 0;
let activeVideoWidth = 0;
let activeVideoHeight = 0;

// Camera FPS rolling tracker
let cameraFrameCounter = 0;
let cameraWindowStart = 0;
let rollingCameraFps = 0;

// Inference FPS rolling tracker
let fpsWindowStart = 0;
let framesInWindow = 0;
let rollingEffectiveFps = 0;

// Render FPS rolling tracker
let renderFrameCounter = 0;
let renderWindowStart = 0;
let rollingRenderFps = 0;

let smoothedLandmarksCache: NormalizedLandmark[] | null = null;

const LOCAL_WASM_PATH = "/wasm";
const CDN_WASM_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

const LOCAL_MODEL_PATH = "/models/pose_landmarker_lite.task";
const CDN_MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

function getAbsoluteUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    return `${window.location.origin}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
  }
  return pathOrUrl;
}

/**
 * Resets the video timestamp tracker and cached frame data so new video streams start fresh.
 */
export function resetPoseTimestamp(): void {
  lastVideoTimestamp = -1;
  lastVideoTimeSec = -1;
  lastResultCache = null;
  lastMetricsCache = null;
  resetSmoothing();
}

/**
 * Declares the active frame scheduling mechanism (rVFC vs rAF fallback).
 */
export function setSchedulingMode(mode: "requestVideoFrameCallback" | "requestAnimationFrameFallback"): void {
  schedulingMode = mode;
}

/**
 * Records arrival of an optical frame from the camera stream for camera FPS telemetry.
 */
export function recordCameraFrame(nowMs: number): void {
  if (cameraWindowStart === 0) {
    cameraWindowStart = nowMs;
    cameraFrameCounter = 1;
  } else {
    cameraFrameCounter++;
    const elapsed = nowMs - cameraWindowStart;
    if (elapsed >= 1000) {
      rollingCameraFps = Math.round(((cameraFrameCounter * 1000) / elapsed) * 10) / 10;
      cameraWindowStart = nowMs;
      cameraFrameCounter = 0;
    }
  }
}

/**
 * Records rendering of a visual skeleton overlay on canvas for render FPS telemetry.
 */
export function recordRenderFrame(nowMs: number): void {
  if (renderWindowStart === 0) {
    renderWindowStart = nowMs;
    renderFrameCounter = 1;
  } else {
    renderFrameCounter++;
    const elapsed = nowMs - renderWindowStart;
    if (elapsed >= 1000) {
      rollingRenderFps = Math.round(((renderFrameCounter * 1000) / elapsed) * 10) / 10;
      renderWindowStart = nowMs;
      renderFrameCounter = 0;
    }
  }
}

/**
 * Resets all runtime performance telemetry metrics.
 */
export function resetPoseTelemetry(): void {
  processedFramesCounter = 0;
  skippedFramesCounter = 0;
  recentInferenceMs = 0;
  totalInferenceMs = 0;
  fpsWindowStart = 0;
  framesInWindow = 0;
  rollingEffectiveFps = 0;
  cameraFrameCounter = 0;
  cameraWindowStart = 0;
  rollingCameraFps = 0;
  renderFrameCounter = 0;
  renderWindowStart = 0;
  rollingRenderFps = 0;
}

/**
 * Retrieves the current measured runtime performance telemetry.
 */
export function getPoseTelemetry(): PosePerformanceTelemetry {
  const avg = processedFramesCounter > 0
    ? Math.round((totalInferenceMs / processedFramesCounter) * 10) / 10
    : 0;
  return {
    activeDelegate,
    cameraFps: rollingCameraFps,
    inferenceFps: rollingEffectiveFps,
    renderFps: rollingRenderFps,
    processedFrames: processedFramesCounter,
    skippedFrames: skippedFramesCounter,
    recentInferenceMs,
    avgInferenceMs: avg,
    effectiveFps: rollingEffectiveFps,
    videoWidth: activeVideoWidth,
    videoHeight: activeVideoHeight,
    schedulingMode,
  };
}

/**
 * Returns the currently active execution delegate (GPU WebGL or CPU fallback).
 */
export function getActiveDelegate(): "GPU" | "CPU" | "uninitialized" {
  return activeDelegate;
}

/**
 * Computes a robust composite confidence metric for a landmark by evaluating both visibility and presence.
 */
export function getLandmarkConfidence(lm?: NormalizedLandmark): number {
  if (!lm) return 0;
  const vis = lm.visibility !== undefined ? lm.visibility : (lm.presence !== undefined ? lm.presence : 1.0);
  const pres = lm.presence !== undefined ? lm.presence : 1.0;
  return Math.max(0, Math.min(1, Math.min(vis, pres)));
}

/**
 * Applies an adaptive Exponential Moving Average (EMA) filter to 33 raw MediaPipe pose landmarks.
 * Dynamic alpha:
 * - Low displacement (< 0.01 norm dist): alpha = 0.60 (heavily dampens sensor jitter during standing/resting)
 * - High displacement (> 0.08 norm dist): alpha = 0.92 (tracks rapid joint excursion without perceptible lag)
 *
 * Memory optimization: Updates cached objects in-place to eliminate garbage collection pressure
 * in real-time camera loops.
 */
export function smoothLandmarks(rawLandmarks: NormalizedLandmark[]): NormalizedLandmark[] {
  if (!rawLandmarks || rawLandmarks.length === 0) {
    smoothedLandmarksCache = null;
    return [];
  }
  if (!smoothedLandmarksCache || smoothedLandmarksCache.length !== rawLandmarks.length) {
    smoothedLandmarksCache = rawLandmarks.map((lm) => ({ ...lm }));
    return smoothedLandmarksCache;
  }

  for (let i = 0; i < rawLandmarks.length; i++) {
    const cur = rawLandmarks[i];
    const prev = smoothedLandmarksCache[i];
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Adaptive alpha interpolation between 0.60 (still) and 0.92 (fast transition)
    const normalizedSpeed = Math.min(1, dist / 0.08);
    const alpha = 0.60 + normalizedSpeed * 0.32;

    // Mutate in-place to avoid allocating 33 new heap objects every frame
    prev.x = alpha * cur.x + (1 - alpha) * prev.x;
    prev.y = alpha * cur.y + (1 - alpha) * prev.y;
    prev.z = alpha * (cur.z ?? 0) + (1 - alpha) * (prev.z ?? 0);
    prev.visibility = cur.visibility;
    prev.presence = cur.presence;
  }

  return smoothedLandmarksCache;
}

/**
 * Resets the landmark smoother cache (e.g. between tasks or when user leaves the frame).
 */
export function resetSmoothing(): void {
  smoothedLandmarksCache = null;
}

function recordInferenceTelemetry(durationMs: number, width: number, height: number): void {
  processedFramesCounter++;
  totalInferenceMs += durationMs;
  recentInferenceMs = Math.round(durationMs * 10) / 10;
  activeVideoWidth = width;
  activeVideoHeight = height;

  const now = performance.now();
  if (fpsWindowStart === 0) {
    fpsWindowStart = now;
    framesInWindow = 1;
  } else {
    framesInWindow++;
    const elapsed = now - fpsWindowStart;
    if (elapsed >= 1000) {
      rollingEffectiveFps = Math.round(((framesInWindow * 1000) / elapsed) * 10) / 10;
      fpsWindowStart = now;
      framesInWindow = 0;
    }
  }
}

/**
 * Empty metrics fallback when tracking is inactive, unready, or person not in frame.
 */
export function getEmptyLiveMetrics(): LiveJointMetrics {
  return {
    kneeAngleDeg: null,
    trunkTiltDeg: null,
    confidenceScore: 0,
    landmarksDetected: 0,
    leftKneeAngleDeg: null,
    rightKneeAngleDeg: null,
    shoulderTiltDeg: null,
    pelvicTiltDeg: null,
    personInView: false,
    lowerBodyVisible: false,
    trackingQuality: "none",
  };
}

/**
 * Initializes and caches the PoseLandmarker singleton.
 * Fallback sequence:
 * 1. Local WASM (absolute path) + Local Model (GPU delegate)
 * 2. Local WASM + Local Model (CPU delegate)
 * 3. CDN WASM + CDN Model (CPU delegate)
 * Cleans up promise on failure so retries execute cleanly.
 */
export async function getLivePoseLandmarker(): Promise<PoseLandmarker> {
  if (landmarkerInstance) {
    return landmarkerInstance;
  }
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    let vision;
    const resolvedLocalWasm = getAbsoluteUrl(LOCAL_WASM_PATH);
    const resolvedLocalModel = getAbsoluteUrl(LOCAL_MODEL_PATH);

    try {
      vision = await FilesetResolver.forVisionTasks(resolvedLocalWasm);
    } catch (localWasmErr) {
      console.warn("Local WASM resolver failed, attempting CDN fallback:", localWasmErr);
      vision = await FilesetResolver.forVisionTasks(CDN_WASM_PATH);
    }

    // Attempt 1: Local Model + GPU
    try {
      landmarkerInstance = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: resolvedLocalModel,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
      activeDelegate = "GPU";
      return landmarkerInstance;
    } catch (gpuErr) {
      console.warn("MediaPipe GPU initialization failed, attempting local CPU delegate:", gpuErr);
    }

    // Attempt 2: Local Model + CPU
    try {
      landmarkerInstance = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: resolvedLocalModel,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
      activeDelegate = "CPU";
      return landmarkerInstance;
    } catch (localCpuErr) {
      console.warn("MediaPipe local model failed, attempting CDN fallback:", localCpuErr);
    }

    // Attempt 3: CDN Model + CPU
    try {
      landmarkerInstance = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: CDN_MODEL_PATH,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
      activeDelegate = "CPU";
      return landmarkerInstance;
    } catch (cdnErr) {
      initializationPromise = null;
      throw cdnErr;
    }
  })().catch((err) => {
    initializationPromise = null;
    throw err;
  });

  return initializationPromise;
}

/**
 * Executes pose estimation on the current video frame and draws the skeleton overlay.
 * Features:
 * - Redundant frame skipping when video.currentTime has not advanced.
 * - Measured execution latency & rolling effective inference FPS telemetry.
 * - Adaptive Exponential Moving Average (EMA) landmark smoothing to eliminate jitter.
 * - 1:1 canvas-to-native video aspect ratio scaling without distortion.
 */
export function detectAndDrawPose(
  landmarker: PoseLandmarker,
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  timestampMs: number,
  drawOverlay: boolean = true
): { result: PoseLandmarkerResult | null; metrics: LiveJointMetrics } {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      result: null,
      metrics: getEmptyLiveMetrics(),
    };
  }

  // Guard against unready video element dimensions
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return {
      result: null,
      metrics: getEmptyLiveMetrics(),
    };
  }

  // Ensure canvas matches native video dimensions for 1:1 pixel coordinate alignment
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  // Optimize: Skip inference if video.currentTime has not changed (prevents redundant processing at 60Hz/120Hz)
  if (
    lastVideoTimeSec >= 0 &&
    Math.abs(video.currentTime - lastVideoTimeSec) < 0.0001
  ) {
    skippedFramesCounter++;
    if (!drawOverlay) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    return {
      result: lastResultCache,
      metrics: lastMetricsCache ?? getEmptyLiveMetrics(),
    };
  }
  lastVideoTimeSec = video.currentTime;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Strictly increasing timestamp for MediaPipe VIDEO mode
  const safeTimestampMs = Math.max(timestampMs, lastVideoTimestamp + 0.001);
  lastVideoTimestamp = safeTimestampMs;

  let result: PoseLandmarkerResult | null = null;
  const t0 = performance.now();
  try {
    result = landmarker.detectForVideo(video, safeTimestampMs);
  } catch (err) {
    resetSmoothing();
    lastResultCache = null;
    lastMetricsCache = null;
    return {
      result: null,
      metrics: getEmptyLiveMetrics(),
    };
  }
  const t1 = performance.now();
  recordInferenceTelemetry(t1 - t0, video.videoWidth, video.videoHeight);

  if (!result || !result.landmarks || result.landmarks.length === 0) {
    resetSmoothing();
    lastResultCache = null;
    lastMetricsCache = null;
    return {
      result,
      metrics: getEmptyLiveMetrics(),
    };
  }

  // Apply adaptive EMA smoothing to stabilize landmark positions without latency
  const rawLandmarks = result.landmarks[0];
  const landmarks = smoothLandmarks(rawLandmarks);
  result.landmarks[0] = landmarks;

  const w = canvas.width;
  const h = canvas.height;

  // 1. Draw Skeleton Connectors & Joints if overlay enabled
  if (drawOverlay) {
    recordRenderFrame(performance.now());
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Pass 1: Dark high-contrast outer stroke for visibility across all clothing & lighting
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(15, 23, 42, 0.55)";
    for (const [startIdx, endIdx] of SKELETON_CONNECTIONS) {
      const lmStart = landmarks[startIdx];
      const lmEnd = landmarks[endIdx];

      if (
        lmStart &&
        lmEnd &&
        getLandmarkConfidence(lmStart) >= 0.35 &&
        getLandmarkConfidence(lmEnd) >= 0.35
      ) {
        ctx.beginPath();
        ctx.moveTo(lmStart.x * w, lmStart.y * h);
        ctx.lineTo(lmEnd.x * w, lmEnd.y * h);
        ctx.stroke();
      }
    }

    // Pass 2: Vibrant brand teal inner stroke
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#14b8a6"; // Vibrant teal
    for (const [startIdx, endIdx] of SKELETON_CONNECTIONS) {
      const lmStart = landmarks[startIdx];
      const lmEnd = landmarks[endIdx];

      if (
        lmStart &&
        lmEnd &&
        getLandmarkConfidence(lmStart) >= 0.35 &&
        getLandmarkConfidence(lmEnd) >= 0.35
      ) {
        // Accent lower extremities with cyan
        const isLegBone =
          (startIdx === LEFT_HIP && endIdx === LEFT_KNEE) ||
          (startIdx === LEFT_KNEE && endIdx === LEFT_ANKLE) ||
          (startIdx === RIGHT_HIP && endIdx === RIGHT_KNEE) ||
          (startIdx === RIGHT_KNEE && endIdx === RIGHT_ANKLE);

        ctx.strokeStyle = isLegBone ? "#06b6d4" : "#14b8a6";
        ctx.beginPath();
        ctx.moveTo(lmStart.x * w, lmStart.y * h);
        ctx.lineTo(lmEnd.x * w, lmEnd.y * h);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 2. Draw Landmark Joints with concentric rings
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const confidence = getLandmarkConfidence(lm);
      if (confidence < 0.35) continue;

      const x = lm.x * w;
      const y = lm.y * h;

      // Key lower-extremity screening joints (hips, knees, ankles)
      const isLowerExtremity = [LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE].includes(i);
      const isTorsoOrShoulder = [LEFT_SHOULDER, RIGHT_SHOULDER, NOSE].includes(i);

      ctx.save();
      ctx.beginPath();
      const radius = isLowerExtremity ? 6.5 : isTorsoOrShoulder ? 5.0 : 3.5;
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = isLowerExtremity ? "#0d9488" : "#2dd4bf";
      ctx.fill();
      ctx.lineWidth = isLowerExtremity ? 2.5 : 1.8;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      // Subtle center dot for lower extremity joints to assist goniometric visualization
      if (isLowerExtremity) {
        ctx.beginPath();
        ctx.arc(x, y, 2.0, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // 3. Extract Real-Time Movement Observations
  const metrics = calculateLiveMetrics(landmarks);
  lastResultCache = result;
  lastMetricsCache = metrics;

  return { result, metrics };
}

/**
 * Calculates live joint metrics (bilateral knee angles, coronal trunk tilt, shoulder and pelvic alignment)
 * from normalized landmarks.
 *
 * Formulas:
 * 1. Knee Angle:
 *    v_thigh = Hip - Knee, v_shank = Ankle - Knee
 *    theta = acos((v_thigh · v_shank) / (|v_thigh| * |v_shank|)) * (180 / pi)
 *    When standing upright, angle is approximately 170°-180°.
 *    During knee flexion (squat, sit-to-stand), angle decreases toward 90°.
 *
 * 2. Coronal Trunk Tilt:
 *    Mid-shoulder S = (L_shoulder + R_shoulder) / 2
 *    Mid-hip H = (L_hip + R_hip) / 2
 *    dx = S.x - H.x, dy = -(S.y - H.y)
 *    tilt = |atan2(dx, dy)| * (180 / pi)
 *    0° indicates vertical spinal alignment.
 *
 * 3. Shoulder Tilt (Coronal Level):
 *    tilt = |atan2(R_shoulder.y - L_shoulder.y, R_shoulder.x - L_shoulder.x)| * (180 / pi)
 *    0° indicates horizontal shoulders.
 *
 * 4. Pelvic Tilt (Coronal Level):
 *    tilt = |atan2(R_hip.y - L_hip.y, R_hip.x - L_hip.x)| * (180 / pi)
 *    0° indicates horizontal pelvis.
 */
export function calculateLiveMetrics(landmarks: NormalizedLandmark[]): LiveJointMetrics {
  let kneeAngleDeg: number | null = null;
  let leftKneeAngleDeg: number | null = null;
  let rightKneeAngleDeg: number | null = null;
  let trunkTiltDeg: number | null = null;
  let shoulderTiltDeg: number | null = null;
  let pelvicTiltDeg: number | null = null;

  const lShoulder = landmarks[LEFT_SHOULDER];
  const rShoulder = landmarks[RIGHT_SHOULDER];
  const lHip = landmarks[LEFT_HIP];
  const rHip = landmarks[RIGHT_HIP];
  const lKnee = landmarks[LEFT_KNEE];
  const rKnee = landmarks[RIGHT_KNEE];
  const lAnkle = landmarks[LEFT_ANKLE];
  const rAnkle = landmarks[RIGHT_ANKLE];

  const computeKneeAngle = (
    h?: NormalizedLandmark,
    k?: NormalizedLandmark,
    a?: NormalizedLandmark
  ): number | null => {
    if (!h || !k || !a) return null;
    const minConf = Math.min(
      getLandmarkConfidence(h),
      getLandmarkConfidence(k),
      getLandmarkConfidence(a)
    );
    if (minConf < 0.4) return null;

    // Zero-allocation scalar vector arithmetic
    const v1x = h.x - k.x;
    const v1y = h.y - k.y;
    const v2x = a.x - k.x;
    const v2y = a.y - k.y;
    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
    if (mag1 > 0.001 && mag2 > 0.001) {
      const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
      return Math.round(Math.acos(cosTheta) * (180 / Math.PI));
    }
    return null;
  };

  leftKneeAngleDeg = computeKneeAngle(lHip, lKnee, lAnkle);
  rightKneeAngleDeg = computeKneeAngle(rHip, rKnee, rAnkle);

  // Primary knee angle (prefer the one with higher minimum landmark confidence)
  const lVis = Math.min(getLandmarkConfidence(lHip), getLandmarkConfidence(lKnee), getLandmarkConfidence(lAnkle));
  const rVis = Math.min(getLandmarkConfidence(rHip), getLandmarkConfidence(rKnee), getLandmarkConfidence(rAnkle));
  if (lVis >= 0.4 || rVis >= 0.4) {
    kneeAngleDeg = lVis >= rVis ? leftKneeAngleDeg : rightKneeAngleDeg;
    if (kneeAngleDeg === null) {
      kneeAngleDeg = lVis >= rVis ? rightKneeAngleDeg : leftKneeAngleDeg;
    }
  }

  // Coronal trunk tilt
  if (
    lShoulder &&
    rShoulder &&
    lHip &&
    rHip &&
    Math.min(
      getLandmarkConfidence(lShoulder),
      getLandmarkConfidence(rShoulder),
      getLandmarkConfidence(lHip),
      getLandmarkConfidence(rHip)
    ) >= 0.4
  ) {
    const sMidX = (lShoulder.x + rShoulder.x) / 2;
    const sMidY = (lShoulder.y + rShoulder.y) / 2;
    const hMidX = (lHip.x + rHip.x) / 2;
    const hMidY = (lHip.y + rHip.y) / 2;
    const dx = sMidX - hMidX;
    const dy = -(sMidY - hMidY);
    trunkTiltDeg = Math.round(Math.abs(Math.atan2(dx, dy) * (180 / Math.PI)) * 10) / 10;
  }

  // Coronal shoulder level tilt
  if (
    lShoulder &&
    rShoulder &&
    Math.min(getLandmarkConfidence(lShoulder), getLandmarkConfidence(rShoulder)) >= 0.4
  ) {
    const dx = rShoulder.x - lShoulder.x;
    const dy = rShoulder.y - lShoulder.y;
    shoulderTiltDeg = Math.round(Math.abs(Math.atan2(dy, dx) * (180 / Math.PI)) * 10) / 10;
  }

  // Coronal pelvic level tilt
  if (lHip && rHip && Math.min(getLandmarkConfidence(lHip), getLandmarkConfidence(rHip)) >= 0.4) {
    const dx = rHip.x - lHip.x;
    const dy = rHip.y - lHip.y;
    pelvicTiltDeg = Math.round(Math.abs(Math.atan2(dy, dx) * (180 / Math.PI)) * 10) / 10;
  }

  // Zero-allocation confidence calculation loop
  let totalConfidence = 0;
  const landmarkCount = landmarks.length;
  for (let i = 0; i < landmarkCount; i++) {
    totalConfidence += getLandmarkConfidence(landmarks[i]);
  }
  const confidenceScore = landmarkCount > 0 ? Math.round((totalConfidence / landmarkCount) * 100) : 0;

  const personInView = Boolean(
    lShoulder && rShoulder && getLandmarkConfidence(lShoulder) >= 0.35 && getLandmarkConfidence(rShoulder) >= 0.35
  );
  const lowerBodyVisible = leftKneeAngleDeg !== null || rightKneeAngleDeg !== null;

  let trackingQuality: "good" | "fair" | "low" | "none" = "none";
  if (landmarks.length > 0 && personInView) {
    if (confidenceScore >= 75 && lowerBodyVisible) {
      trackingQuality = "good";
    } else if (confidenceScore >= 50) {
      trackingQuality = "fair";
    } else {
      trackingQuality = "low";
    }
  }

  return {
    kneeAngleDeg,
    trunkTiltDeg,
    confidenceScore,
    landmarksDetected: landmarks.length,
    leftKneeAngleDeg,
    rightKneeAngleDeg,
    shoulderTiltDeg,
    pelvicTiltDeg,
    personInView,
    lowerBodyVisible,
    trackingQuality,
  };
}

/**
 * Releases cached PoseLandmarker resources.
 */
export function disposeLivePoseLandmarker(): void {
  resetPoseTimestamp();
  resetPoseTelemetry();
  activeDelegate = "uninitialized";
  if (landmarkerInstance) {
    try {
      landmarkerInstance.close();
    } catch {
      // non-blocking
    }
    landmarkerInstance = null;
  }
  initializationPromise = null;
}

