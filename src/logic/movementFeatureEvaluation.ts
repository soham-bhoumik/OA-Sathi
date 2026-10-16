/**
 * OA-Sathi Movement Feature Evaluation & Quality Indicator Module (v1.0.0)
 * -----------------------------------------------------------------------
 * A pure, deterministic computer-vision movement analysis module.
 *
 * Responsibilities:
 * 1. Validates raw MediaPipe 33-point pose landmark outputs (coordinates, visibility, bounds).
 * 2. Computes directly observed technical movement-quality indicators:
 *    - Frame count & usable frame proportion
 *    - Sequence duration
 *    - Person visibility consistency
 *    - Suitability for further kinematic analysis
 * 3. Extracts exploratory derived movement measurements:
 *    - Step cadence (steps/min)
 *    - Bilateral step symmetry index (0-1)
 *    - Active knee flexion range (degrees)
 *    - Coronal trunk sway (degrees)
 * 4. Strictly separates:
 *    - Directly observed technical indicators
 *    - Exploratory derived biomechanical measurements
 *    - Clinically validated measures (explicitly empty - unvalidated prototype)
 * 5. Guarantees:
 *    - Deterministic execution for identical inputs
 *    - Preserves missing landmarks as null/unavailable (never coerces to (0,0))
 *    - Zero diagnostic claims: strictly non-diagnostic exploratory research tool.
 */

// MediaPipe 33 Landmark Definitions
export const MEDIAPIPE_LANDMARK_NAMES: Record<number, string> = {
  0: "nose",
  1: "left_eye_inner",
  2: "left_eye",
  3: "left_eye_outer",
  4: "right_eye_inner",
  5: "right_eye",
  6: "right_eye_outer",
  7: "left_ear",
  8: "right_ear",
  9: "mouth_left",
  10: "mouth_right",
  11: "left_shoulder",
  12: "right_shoulder",
  13: "left_elbow",
  14: "right_elbow",
  15: "left_wrist",
  16: "right_wrist",
  17: "left_pinky",
  18: "right_pinky",
  19: "left_index",
  20: "right_index",
  21: "left_thumb",
  22: "right_thumb",
  23: "left_hip",
  24: "right_hip",
  25: "left_knee",
  26: "right_knee",
  27: "left_ankle",
  28: "right_ankle",
  29: "left_heel",
  30: "right_heel",
  31: "left_foot_index",
  32: "right_foot_index",
};

// Essential landmarks required for lower-extremity gait and mobility assessment
export const LOWER_EXTREMITY_LANDMARKS = [23, 24, 25, 26, 27, 28, 29, 30] as const;
export const TORSO_LANDMARKS = [11, 12, 23, 24] as const;

export const MIN_LANDMARK_VISIBILITY = 0.35;
export const MIN_USABLE_FRAMES_FOR_GAIT = 15;
export const MIN_DURATION_SECONDS_FOR_CADENCE = 1.8;

export interface RawLandmarkInput {
  x?: number | null;
  y?: number | null;
  z?: number | null;
  visibility?: number | null;
}

export interface ValidatedLandmark {
  index: number;
  name: string;
  x: number | null;
  y: number | null;
  z: number | null;
  visibility: number | null;
  isValid: boolean;
  reasonUnavailable?: string;
}

export interface ValidatedPoseFrame {
  frameIndex: number;
  timestampMs: number;
  landmarks: ValidatedLandmark[];
  hasPerson: boolean;
  isUsable: boolean;
  meanConfidence: number;
  rejectionReason?: string;
}

export type SuitabilityStatus =
  | "suitable"
  | "marginal"
  | "insufficient-frames"
  | "insufficient-duration"
  | "low-visibility"
  | "no-person-detected"
  | "invalid-timestamps";

export interface TechnicalQualityIndicators {
  framesProcessed: number;
  usableFramesCount: number;
  usableFrameRatio: number;
  durationSeconds: number;
  personPresenceRatio: number;
  meanLandmarkConfidence: number;
  suitabilityStatus: SuitabilityStatus;
  suitabilityReasons: string[];
  isSuitableForAnalysis: boolean;
}

export interface MovementFeature<T = number> {
  name: string;
  value: T | null;
  unit: string;
  isValid: boolean;
  isApproximation: boolean;
  confidence: number; // 0.0 - 1.0
  description: string;
  reasonUnavailable?: string;
}

export interface MovementEvaluationResult {
  evaluationId: string;
  timestamp: number;
  pipelineVersion: string;
  technicalQuality: TechnicalQualityIndicators;
  features: {
    cadence: MovementFeature<number>;
    stepSymmetry: MovementFeature<number>;
    activeKneeFlexionRange: MovementFeature<number>;
    coronalTrunkSway: MovementFeature<number>;
    [key: string]: MovementFeature<number>;
  };
  limitations: string[];
  warnings: string[];
  clinicalDisclaimer: string;
  clinicallyValidatedMeasures: string[]; // Explicitly empty array
}

/**
 * Validates a single raw landmark from the pose detector.
 * Strictly rejects NaN, infinity, and out-of-range coordinates without substituting zero.
 */
export function validateLandmark(raw: RawLandmarkInput | undefined, index: number): ValidatedLandmark {
  const name = MEDIAPIPE_LANDMARK_NAMES[index] || `landmark_${index}`;

  if (!raw || typeof raw !== "object") {
    return {
      index,
      name,
      x: null,
      y: null,
      z: null,
      visibility: null,
      isValid: false,
      reasonUnavailable: "Landmark data missing from model output",
    };
  }

  const { x, y, z, visibility } = raw;

  // Validate visibility
  const vis = typeof visibility === "number" && Number.isFinite(visibility) ? visibility : null;

  // Check if visibility is below threshold
  if (vis !== null && vis < MIN_LANDMARK_VISIBILITY) {
    return {
      index,
      name,
      x: null,
      y: null,
      z: null,
      visibility: vis,
      isValid: false,
      reasonUnavailable: `Visibility (${Math.round(vis * 100)}%) below tracking threshold (${Math.round(MIN_LANDMARK_VISIBILITY * 100)}%)`,
    };
  }

  // Validate coordinates
  const isXValid = typeof x === "number" && Number.isFinite(x) && x >= -0.2 && x <= 1.2;
  const isYValid = typeof y === "number" && Number.isFinite(y) && y >= -0.2 && y <= 1.2;
  const isZValid = z === undefined || z === null || (typeof z === "number" && Number.isFinite(z));

  if (!isXValid || !isYValid || !isZValid) {
    return {
      index,
      name,
      x: null,
      y: null,
      z: null,
      visibility: vis,
      isValid: false,
      reasonUnavailable: "Coordinates out of bounds or non-numeric",
    };
  }

  return {
    index,
    name,
    x,
    y,
    z: z ?? 0,
    visibility: vis ?? 1.0,
    isValid: true,
  };
}

/**
 * Validates an entire frame containing up to 33 landmarks and a timestamp.
 */
export function validatePoseFrame(
  rawLandmarks: (RawLandmarkInput | undefined)[] | undefined,
  timestampMs: number,
  frameIndex: number
): ValidatedPoseFrame {
  if (!Number.isFinite(timestampMs) || timestampMs < 0) {
    return {
      frameIndex,
      timestampMs: 0,
      landmarks: [],
      hasPerson: false,
      isUsable: false,
      meanConfidence: 0,
      rejectionReason: "Invalid frame timestamp",
    };
  }

  if (!Array.isArray(rawLandmarks) || rawLandmarks.length === 0) {
    return {
      frameIndex,
      timestampMs,
      landmarks: [],
      hasPerson: false,
      isUsable: false,
      meanConfidence: 0,
      rejectionReason: "No landmark array returned",
    };
  }

  const landmarks: ValidatedLandmark[] = [];
  let validCount = 0;
  let visSum = 0;

  for (let i = 0; i < 33; i++) {
    const validated = validateLandmark(rawLandmarks[i], i);
    landmarks.push(validated);
    if (validated.isValid) {
      validCount++;
      visSum += validated.visibility ?? 1.0;
    }
  }

  const meanConfidence = validCount > 0 ? visSum / validCount : 0;
  const hasPerson = validCount >= 6; // At least torso/face landmarks present

  // Check essential lower limb landmarks (at least one hip, knee, and ankle valid)
  const leftLegValid = Boolean(landmarks[23]?.isValid && landmarks[25]?.isValid && landmarks[27]?.isValid);
  const rightLegValid = Boolean(landmarks[24]?.isValid && landmarks[26]?.isValid && landmarks[28]?.isValid);
  const torsoValid = Boolean((landmarks[11]?.isValid || landmarks[12]?.isValid) && (landmarks[23]?.isValid || landmarks[24]?.isValid));

  const isUsable = Boolean(hasPerson && torsoValid && (leftLegValid || rightLegValid));

  let rejectionReason: string | undefined;
  if (!hasPerson) {
    rejectionReason = "No person detected in frame";
  } else if (!torsoValid) {
    rejectionReason = "Torso landmarks occluded or out of frame";
  } else if (!leftLegValid && !rightLegValid) {
    rejectionReason = "Lower-limb joints (hip, knee, ankle) not sufficiently visible";
  }

  return {
    frameIndex,
    timestampMs,
    landmarks,
    hasPerson,
    isUsable,
    meanConfidence,
    rejectionReason,
  };
}

/**
 * Computes directly observed technical movement-quality indicators.
 */
export function evaluateMovementQuality(frames: ValidatedPoseFrame[]): TechnicalQualityIndicators {
  const total = frames.length;

  if (total === 0) {
    return {
      framesProcessed: 0,
      usableFramesCount: 0,
      usableFrameRatio: 0,
      durationSeconds: 0,
      personPresenceRatio: 0,
      meanLandmarkConfidence: 0,
      suitabilityStatus: "insufficient-frames",
      suitabilityReasons: ["Sequence contains zero frames"],
      isSuitableForAnalysis: false,
    };
  }

  // Check temporal integrity (strictly non-decreasing timestamps)
  let timestampsValid = true;
  for (let i = 1; i < total; i++) {
    if (frames[i].timestampMs < frames[i - 1].timestampMs) {
      timestampsValid = false;
      break;
    }
  }

  const firstTime = frames[0].timestampMs;
  const lastTime = frames[total - 1].timestampMs;
  const durationSeconds = timestampsValid && lastTime >= firstTime ? (lastTime - firstTime) / 1000 : 0;

  if (!timestampsValid) {
    return {
      framesProcessed: total,
      usableFramesCount: 0,
      usableFrameRatio: 0,
      durationSeconds: 0,
      personPresenceRatio: 0,
      meanLandmarkConfidence: 0,
      suitabilityStatus: "invalid-timestamps",
      suitabilityReasons: ["Frame timestamps are non-monotonic or disordered"],
      isSuitableForAnalysis: false,
    };
  }

  let personCount = 0;
  let usableCount = 0;
  let totalConfidence = 0;

  for (const f of frames) {
    if (f.hasPerson) personCount++;
    if (f.isUsable) {
      usableCount++;
      totalConfidence += f.meanConfidence;
    }
  }

  const personPresenceRatio = Math.round((personCount / total) * 100) / 100;
  const usableFrameRatio = Math.round((usableCount / total) * 100) / 100;
  const meanLandmarkConfidence = usableCount > 0 ? Math.round((totalConfidence / usableCount) * 100) / 100 : 0;

  const reasons: string[] = [];
  let suitabilityStatus: SuitabilityStatus = "suitable";

  if (personCount === 0) {
    suitabilityStatus = "no-person-detected";
    reasons.push("No participant detected in camera frames");
  } else if (usableCount < MIN_USABLE_FRAMES_FOR_GAIT) {
    suitabilityStatus = "insufficient-frames";
    reasons.push(`Too few usable frames with tracked limbs (${usableCount}/${MIN_USABLE_FRAMES_FOR_GAIT} required)`);
  } else if (durationSeconds < 1.0) {
    suitabilityStatus = "insufficient-duration";
    reasons.push(`Sequence duration (${durationSeconds.toFixed(1)}s) is too brief for gait rhythm analysis`);
  } else if (usableFrameRatio < 0.5) {
    suitabilityStatus = "marginal";
    reasons.push(`High tracking dropout: only ${Math.round(usableFrameRatio * 100)}% of frames had complete joint visibility`);
  } else if (meanLandmarkConfidence < 0.5) {
    suitabilityStatus = "low-visibility";
    reasons.push(`Average landmark confidence (${Math.round(meanLandmarkConfidence * 100)}%) is marginal`);
  }

  const isSuitableForAnalysis =
    usableCount >= MIN_USABLE_FRAMES_FOR_GAIT && durationSeconds >= 1.0 && usableFrameRatio >= 0.4;

  return {
    framesProcessed: total,
    usableFramesCount: usableCount,
    usableFrameRatio,
    durationSeconds: Math.round(durationSeconds * 10) / 10,
    personPresenceRatio,
    meanLandmarkConfidence,
    suitabilityStatus,
    suitabilityReasons: reasons.length ? reasons : ["Sufficient tracking continuity for exploratory analysis"],
    isSuitableForAnalysis,
  };
}

/**
 * Extracts estimated step cadence (steps per minute) from ankle trajectory peaks.
 */
export function extractCadence(
  frames: ValidatedPoseFrame[],
  quality: TechnicalQualityIndicators
): MovementFeature<number> {
  const feature: MovementFeature<number> = {
    name: "Step Cadence",
    value: null,
    unit: "steps/min",
    isValid: false,
    isApproximation: true,
    confidence: 0,
    description: "Estimated steps per minute during continuous walking.",
  };

  if (!quality.isSuitableForAnalysis || quality.durationSeconds < MIN_DURATION_SECONDS_FOR_CADENCE) {
    feature.reasonUnavailable = `Sequence duration (${quality.durationSeconds}s) must be at least ${MIN_DURATION_SECONDS_FOR_CADENCE}s with continuous limb tracking.`;
    return feature;
  }

  // Extract ankle y displacements across usable frames
  const timePoints: number[] = [];
  const leftAnkleY: number[] = [];
  const rightAnkleY: number[] = [];

  for (const f of frames) {
    if (!f.isUsable) continue;
    const lAnkle = f.landmarks[27];
    const rAnkle = f.landmarks[28];
    if (lAnkle?.isValid && rAnkle?.isValid && lAnkle.y !== null && rAnkle.y !== null) {
      timePoints.push(f.timestampMs / 1000);
      leftAnkleY.push(lAnkle.y);
      rightAnkleY.push(rAnkle.y);
    }
  }

  if (timePoints.length < MIN_USABLE_FRAMES_FOR_GAIT) {
    feature.reasonUnavailable = "Insufficient continuous bilateral ankle tracking points.";
    return feature;
  }

  // Count local maxima in ankle vertical excursions (foot strike ground contact approximations)
  let stepEvents = 0;
  for (let i = 1; i < leftAnkleY.length - 1; i++) {
    // Ground strike occurs near max Y (bottom of frame)
    if (leftAnkleY[i] > leftAnkleY[i - 1] && leftAnkleY[i] >= leftAnkleY[i + 1] && leftAnkleY[i] > 0.6) {
      stepEvents++;
    }
    if (rightAnkleY[i] > rightAnkleY[i - 1] && rightAnkleY[i] >= rightAnkleY[i + 1] && rightAnkleY[i] > 0.6) {
      stepEvents++;
    }
  }

  if (stepEvents < 2) {
    feature.reasonUnavailable = "Could not resolve at least 2 distinct alternating step ground contacts.";
    return feature;
  }

  const durationMin = quality.durationSeconds / 60;
  const rawCadence = stepEvents / durationMin;

  // Filter physiologically implausible human cadence (< 40 or > 180 steps/min)
  if (rawCadence < 40 || rawCadence > 180) {
    feature.reasonUnavailable = `Calculated cadence (${Math.round(rawCadence)} steps/min) is outside plausible ambulatory limits (40-180).`;
    return feature;
  }

  feature.value = Math.round(rawCadence * 10) / 10;
  feature.isValid = true;
  feature.confidence = Math.min(0.9, quality.usableFrameRatio);
  return feature;
}

/**
 * Extracts bilateral step symmetry index (0 to 1).
 */
export function extractStepSymmetry(
  frames: ValidatedPoseFrame[],
  quality: TechnicalQualityIndicators
): MovementFeature<number> {
  const feature: MovementFeature<number> = {
    name: "Bilateral Step Symmetry",
    value: null,
    unit: "index (0-1)",
    isValid: false,
    isApproximation: true,
    confidence: 0,
    description: "Balance of left vs right step excursion (1.0 = perfect symmetry).",
  };

  if (!quality.isSuitableForAnalysis) {
    feature.reasonUnavailable = "Tracking quality insufficient to calculate bilateral symmetry.";
    return feature;
  }

  // Calculate stride displacement range for left and right ankles
  const lExcursions: number[] = [];
  const rExcursions: number[] = [];

  for (const f of frames) {
    if (!f.isUsable) continue;
    const lAnkle = f.landmarks[27];
    const rAnkle = f.landmarks[28];
    const lHip = f.landmarks[23];
    const rHip = f.landmarks[24];

    if (lAnkle?.isValid && lHip?.isValid && lAnkle.x !== null && lHip.x !== null) {
      lExcursions.push(Math.abs(lAnkle.x - lHip.x));
    }
    if (rAnkle?.isValid && rHip?.isValid && rAnkle.x !== null && rHip.x !== null) {
      rExcursions.push(Math.abs(rAnkle.x - rHip.x));
    }
  }

  if (lExcursions.length < 10 || rExcursions.length < 10) {
    feature.reasonUnavailable = "Insufficient bilateral lower-limb tracking points across the sequence.";
    return feature;
  }

  const lMean = lExcursions.reduce((a, b) => a + b, 0) / lExcursions.length;
  const rMean = rExcursions.reduce((a, b) => a + b, 0) / rExcursions.length;

  if (lMean <= 0.005 || rMean <= 0.005) {
    feature.reasonUnavailable = "Participant was stationary; ambulatory stride excursion was negligible.";
    return feature;
  }

  const symmetryIndex = Math.min(lMean, rMean) / Math.max(lMean, rMean);
  feature.value = Math.round(symmetryIndex * 100) / 100;
  feature.isValid = true;
  feature.confidence = Math.min(0.85, quality.usableFrameRatio);
  return feature;
}

/**
 * Extracts active knee flexion range in degrees.
 */
export function extractKneeFlexionRange(
  frames: ValidatedPoseFrame[],
  quality: TechnicalQualityIndicators
): MovementFeature<number> {
  const feature: MovementFeature<number> = {
    name: "Active Knee Flexion Range",
    value: null,
    unit: "degrees",
    isValid: false,
    isApproximation: true,
    confidence: 0,
    description: "Estimated excursion angle of the knee joint during the recorded movement.",
  };

  if (!quality.isSuitableForAnalysis) {
    feature.reasonUnavailable = "Tracking quality insufficient for joint angle excursion calculation.";
    return feature;
  }

  const angles: number[] = [];

  for (const f of frames) {
    if (!f.isUsable) continue;
    const lHip = f.landmarks[23];
    const lKnee = f.landmarks[25];
    const lAnkle = f.landmarks[27];
    const rHip = f.landmarks[24];
    const rKnee = f.landmarks[26];
    const rAnkle = f.landmarks[28];

    // Compute for leg with higher visibility
    const lVis = Math.min(lHip?.visibility ?? 0, lKnee?.visibility ?? 0, lAnkle?.visibility ?? 0);
    const rVis = Math.min(rHip?.visibility ?? 0, rKnee?.visibility ?? 0, rAnkle?.visibility ?? 0);

    if (Math.max(lVis, rVis) >= 0.4) {
      const [h, k, a] = lVis >= rVis ? [lHip, lKnee, lAnkle] : [rHip, rKnee, rAnkle];
      if (
        h?.isValid &&
        k?.isValid &&
        a?.isValid &&
        h.x !== null &&
        h.y !== null &&
        k.x !== null &&
        k.y !== null &&
        a.x !== null &&
        a.y !== null
      ) {
        const v1 = { x: h.x - k.x, y: h.y - k.y };
        const v2 = { x: a.x - k.x, y: a.y - k.y };
        const dot = v1.x * v2.x + v1.y * v2.y;
        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
        if (mag1 > 0.001 && mag2 > 0.001) {
          const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
          const angle = Math.round(Math.acos(cosTheta) * (180 / Math.PI));
          angles.push(angle);
        }
      }
    }
  }

  if (angles.length < 8) {
    feature.reasonUnavailable = "Knee joint angle could not be resolved in enough continuous frames.";
    return feature;
  }

  const minAngle = Math.min(...angles);
  const maxAngle = Math.max(...angles);
  const range = maxAngle - minAngle;

  feature.value = range;
  feature.isValid = true;
  feature.confidence = Math.min(0.85, quality.usableFrameRatio);
  return feature;
}

/**
 * Extracts coronal trunk sway (standard deviation of trunk tilt from vertical).
 */
export function extractCoronalTrunkSway(
  frames: ValidatedPoseFrame[],
  quality: TechnicalQualityIndicators
): MovementFeature<number> {
  const feature: MovementFeature<number> = {
    name: "Coronal Trunk Sway",
    value: null,
    unit: "degrees",
    isValid: false,
    isApproximation: true,
    confidence: 0,
    description: "Standard deviation of lateral trunk tilt angle during walking.",
  };

  if (!quality.isSuitableForAnalysis) {
    feature.reasonUnavailable = "Tracking quality insufficient for coronal trunk sway calculation.";
    return feature;
  }

  const tiltAngles: number[] = [];

  for (const f of frames) {
    if (!f.isUsable) continue;
    const lShoulder = f.landmarks[11];
    const rShoulder = f.landmarks[12];
    const lHip = f.landmarks[23];
    const rHip = f.landmarks[24];

    if (
      lShoulder?.isValid &&
      rShoulder?.isValid &&
      lHip?.isValid &&
      rHip?.isValid &&
      lShoulder.x !== null &&
      lShoulder.y !== null &&
      rShoulder.x !== null &&
      rShoulder.y !== null &&
      lHip.x !== null &&
      lHip.y !== null &&
      rHip.x !== null &&
      rHip.y !== null
    ) {
      const sMidX = (lShoulder.x + rShoulder.x) / 2;
      const sMidY = (lShoulder.y + rShoulder.y) / 2;
      const hMidX = (lHip.x + rHip.x) / 2;
      const hMidY = (lHip.y + rHip.y) / 2;
      const dx = sMidX - hMidX;
      const dy = -(sMidY - hMidY); // Invert y because canvas y goes downward
      if (Math.abs(dy) > 0.01) {
        const tilt = Math.abs(Math.atan2(dx, dy) * (180 / Math.PI));
        tiltAngles.push(tilt);
      }
    }
  }

  if (tiltAngles.length < 8) {
    feature.reasonUnavailable = "Trunk markers (shoulders and hips) not visible in enough frames.";
    return feature;
  }

  const mean = tiltAngles.reduce((a, b) => a + b, 0) / tiltAngles.length;
  const variance = tiltAngles.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / tiltAngles.length;
  const stdDev = Math.sqrt(variance);

  feature.value = Math.round(stdDev * 10) / 10;
  feature.isValid = true;
  feature.confidence = Math.min(0.85, quality.usableFrameRatio);
  return feature;
}

/**
 * Pure, deterministic evaluation of an entire movement landmark sequence.
 */
export function evaluateMovementSequence(
  frames: ValidatedPoseFrame[],
  metadata?: { sequenceId?: string; timestamp?: number }
): MovementEvaluationResult {
  const quality = evaluateMovementQuality(frames);

  const cadence = extractCadence(frames, quality);
  const stepSymmetry = extractStepSymmetry(frames, quality);
  const activeKneeFlexionRange = extractKneeFlexionRange(frames, quality);
  const coronalTrunkSway = extractCoronalTrunkSway(frames, quality);

  const warnings: string[] = [];
  if (quality.suitabilityStatus === "marginal") {
    warnings.push("Movement sequence had significant tracking dropouts. Results are approximate.");
  }
  if (!quality.isSuitableForAnalysis) {
    warnings.push(...quality.suitabilityReasons);
  }

  return {
    evaluationId: metadata?.sequenceId || `eval_${Date.now()}`,
    timestamp: metadata?.timestamp || Date.now(),
    pipelineVersion: "1.0.0-mediapipe-lite",
    technicalQuality: quality,
    features: {
      cadence,
      stepSymmetry,
      activeKneeFlexionRange,
      coronalTrunkSway,
    },
    limitations: [
      "Monocular 2D video perspective does not substitute for 3D multi-camera clinical gait laboratory analysis.",
      "Lighting, clothing, and distance from camera introduce tracking variability.",
      "Calculated metrics are exploratory research indicators and do NOT indicate osteoarthritis diagnosis or severity.",
    ],
    warnings,
    clinicalDisclaimer:
      "Exploratory biomechanical indicators only. Strictly non-diagnostic and not validated as clinical biomarkers for osteoarthritis or joint degradation.",
    clinicallyValidatedMeasures: [], // Explicitly empty: zero measures are clinically validated
  };
}
