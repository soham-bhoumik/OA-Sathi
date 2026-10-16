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
 * Resets the video timestamp tracker so new video streams start fresh.
 */
export function resetPoseTimestamp(): void {
  lastVideoTimestamp = -1;
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

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Strictly increasing timestamp for MediaPipe VIDEO mode
  const safeTimestampMs = Math.max(timestampMs, lastVideoTimestamp + 0.001);
  lastVideoTimestamp = safeTimestampMs;

  let result: PoseLandmarkerResult | null = null;
  try {
    result = landmarker.detectForVideo(video, safeTimestampMs);
  } catch (err) {
    // Drop frame on timing error or WebGL context recovery
    return {
      result: null,
      metrics: getEmptyLiveMetrics(),
    };
  }

  if (!result || !result.landmarks || result.landmarks.length === 0) {
    return {
      result,
      metrics: getEmptyLiveMetrics(),
    };
  }

  const landmarks = result.landmarks[0];
  const w = canvas.width;
  const h = canvas.height;

  // 1. Draw Skeleton Connectors & Joints if overlay enabled
  if (drawOverlay) {
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
        (lmStart.visibility ?? 1) >= 0.35 &&
        (lmEnd.visibility ?? 1) >= 0.35
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
        (lmStart.visibility ?? 1) >= 0.35 &&
        (lmEnd.visibility ?? 1) >= 0.35
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
      const visibility = lm.visibility ?? 1;
      if (visibility < 0.35) continue;

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
    const minVis = Math.min(h.visibility ?? 0, k.visibility ?? 0, a.visibility ?? 0);
    if (minVis < 0.4) return null;

    const v1 = { x: h.x - k.x, y: h.y - k.y };
    const v2 = { x: a.x - k.x, y: a.y - k.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    if (mag1 > 0.001 && mag2 > 0.001) {
      const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
      return Math.round(Math.acos(cosTheta) * (180 / Math.PI));
    }
    return null;
  };

  leftKneeAngleDeg = computeKneeAngle(lHip, lKnee, lAnkle);
  rightKneeAngleDeg = computeKneeAngle(rHip, rKnee, rAnkle);

  // Primary knee angle (prefer the one with higher minimum landmark visibility)
  const lVis = Math.min(lHip?.visibility ?? 0, lKnee?.visibility ?? 0, lAnkle?.visibility ?? 0);
  const rVis = Math.min(rHip?.visibility ?? 0, rKnee?.visibility ?? 0, rAnkle?.visibility ?? 0);
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

  // Coronal shoulder level tilt
  if (
    lShoulder &&
    rShoulder &&
    Math.min(lShoulder.visibility ?? 0, rShoulder.visibility ?? 0) >= 0.4
  ) {
    const dx = rShoulder.x - lShoulder.x;
    const dy = rShoulder.y - lShoulder.y;
    shoulderTiltDeg = Math.round(Math.abs(Math.atan2(dy, dx) * (180 / Math.PI)) * 10) / 10;
  }

  // Coronal pelvic level tilt
  if (lHip && rHip && Math.min(lHip.visibility ?? 0, rHip.visibility ?? 0) >= 0.4) {
    const dx = rHip.x - lHip.x;
    const dy = rHip.y - lHip.y;
    pelvicTiltDeg = Math.round(Math.abs(Math.atan2(dy, dx) * (180 / Math.PI)) * 10) / 10;
  }

  const visibilities = landmarks.map((l) => l.visibility ?? 1);
  const confidenceScore = Math.round((visibilities.reduce((a, b) => a + b, 0) / Math.max(1, landmarks.length)) * 100);

  const personInView = Boolean(
    lShoulder && rShoulder && (lShoulder.visibility ?? 0) >= 0.35 && (rShoulder.visibility ?? 0) >= 0.35
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

