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
}

// MediaPipe Pose Landmark Indices
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

const LOCAL_WASM_PATH = "/wasm";
const CDN_WASM_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

const LOCAL_MODEL_PATH = "/models/pose_landmarker_lite.task";
const CDN_MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

/**
 * Resets the video timestamp tracker so new video streams start fresh.
 */
export function resetPoseTimestamp(): void {
  lastVideoTimestamp = -1;
}

/**
 * Initializes and caches the PoseLandmarker singleton.
 * Fallback sequence:
 * 1. Local WASM + Local Model (GPU delegate)
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
    try {
      vision = await FilesetResolver.forVisionTasks(LOCAL_WASM_PATH);
    } catch {
      vision = await FilesetResolver.forVisionTasks(CDN_WASM_PATH);
    }

    // Attempt 1: Local Model + GPU
    try {
      landmarkerInstance = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: LOCAL_MODEL_PATH,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
      return landmarkerInstance;
    } catch (gpuErr) {
      console.warn("MediaPipe GPU initialization failed, attempting local CPU delegate:", gpuErr);
    }

    // Attempt 2: Local Model + CPU
    try {
      landmarkerInstance = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: LOCAL_MODEL_PATH,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
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
      metrics: { kneeAngleDeg: null, trunkTiltDeg: null, confidenceScore: 0, landmarksDetected: 0 },
    };
  }

  // Ensure canvas matches video display dimensions
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Ensure strictly increasing timestamp for MediaPipe VIDEO mode
  const safeTimestampMs = Math.max(timestampMs, lastVideoTimestamp + 1);
  lastVideoTimestamp = safeTimestampMs;

  let result: PoseLandmarkerResult | null = null;
  try {
    result = landmarker.detectForVideo(video, safeTimestampMs);
  } catch {
    // Drop frame on timing or WebGL busy error
    return {
      result: null,
      metrics: { kneeAngleDeg: null, trunkTiltDeg: null, confidenceScore: 0, landmarksDetected: 0 },
    };
  }

  if (!result || !result.landmarks || result.landmarks.length === 0) {
    return {
      result,
      metrics: { kneeAngleDeg: null, trunkTiltDeg: null, confidenceScore: 0, landmarksDetected: 0 },
    };
  }

  const landmarks = result.landmarks[0];
  const w = canvas.width;
  const h = canvas.height;

  // 1. Draw Skeleton Connectors & Joints if overlay enabled
  if (drawOverlay) {
    ctx.save();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "rgba(20, 127, 115, 0.85)"; // Brand teal
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const [startIdx, endIdx] of SKELETON_CONNECTIONS) {
      const lmStart = landmarks[startIdx];
      const lmEnd = landmarks[endIdx];

      if (
        lmStart &&
        lmEnd &&
        (lmStart.visibility ?? 1) >= 0.35 &&
        (lmEnd.visibility ?? 1) >= 0.35
      ) {
        ctx.beginPath();
        ctx.moveTo(lmStart.x * w, lmStart.y * h);
        ctx.lineTo(lmEnd.x * w, lmEnd.y * h);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 2. Draw Landmark Joints
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const visibility = lm.visibility ?? 1;
      if (visibility < 0.35) continue;

      const x = lm.x * w;
      const y = lm.y * h;

      // Accent key lower-extremity screening joints (hips, knees, ankles)
      const isLowerExtremity = [LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE].includes(i);

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, isLowerExtremity ? 5.5 : 4.0, 0, 2 * Math.PI);
      ctx.fillStyle = isLowerExtremity ? "#0d9488" : "#2dd4bf";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.restore();
    }
  }

  // 3. Extract Real-Time Movement Metrics
  const metrics = calculateLiveMetrics(landmarks);

  return { result, metrics };
}

/**
 * Calculates live joint metrics (knee angle and coronal trunk sway) from normalized landmarks.
 */
export function calculateLiveMetrics(landmarks: NormalizedLandmark[]): LiveJointMetrics {
  let kneeAngleDeg: number | null = null;
  let trunkTiltDeg: number | null = null;

  // Evaluate left or right knee (prefer the one with higher visibility)
  const lHip = landmarks[LEFT_HIP];
  const lKnee = landmarks[LEFT_KNEE];
  const lAnkle = landmarks[LEFT_ANKLE];

  const rHip = landmarks[RIGHT_HIP];
  const rKnee = landmarks[RIGHT_KNEE];
  const rAnkle = landmarks[RIGHT_ANKLE];

  const lVis = Math.min(lHip?.visibility ?? 0, lKnee?.visibility ?? 0, lAnkle?.visibility ?? 0);
  const rVis = Math.min(rHip?.visibility ?? 0, rKnee?.visibility ?? 0, rAnkle?.visibility ?? 0);

  if (Math.max(lVis, rVis) >= 0.4) {
    const [h, k, a] = lVis >= rVis ? [lHip, lKnee, lAnkle] : [rHip, rKnee, rAnkle];
    const v1 = { x: h.x - k.x, y: h.y - k.y };
    const v2 = { x: a.x - k.x, y: a.y - k.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    if (mag1 > 0.001 && mag2 > 0.001) {
      const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
      kneeAngleDeg = Math.round(Math.acos(cosTheta) * (180 / Math.PI));
    }
  }

  // Coronal trunk tilt
  const lShoulder = landmarks[LEFT_SHOULDER];
  const rShoulder = landmarks[RIGHT_SHOULDER];
  if (
    lShoulder &&
    rShoulder &&
    lHip &&
    rHip &&
    Math.min(
      lShoulder.visibility ?? 0,
      rShoulder.visibility ?? 0,
      lHip.visibility ?? 0,
      rHip.visibility ?? 0
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

  const visibilities = landmarks.map((l) => l.visibility ?? 1);
  const confidenceScore = Math.round((visibilities.reduce((a, b) => a + b, 0) / landmarks.length) * 100);

  return {
    kneeAngleDeg,
    trunkTiltDeg,
    confidenceScore,
    landmarksDetected: landmarks.length,
  };
}

/**
 * Releases cached PoseLandmarker resources.
 */
export function disposeLivePoseLandmarker(): void {
  lastVideoTimestamp = -1;
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
