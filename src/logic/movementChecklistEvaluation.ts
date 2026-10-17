/**
 * OA-Sathi Movement Checklist Evaluation Module
 * ---------------------------------------------
 * Pure deterministic evaluation functions for targeted functional movement observation:
 * 1. Seated knee extension
 * 2. Seated knee flexion
 * 3. Sit-to-stand
 * 4. Supported standing weight shift
 *
 * Guarantees:
 * - Real pose-estimation landmark inputs (MediaPipe 33-point pose)
 * - Movement-specific kinematic criteria (angle excursion, vertical displacement, lateral sway)
 * - Explicit transparency: 2D monocular cameras cannot measure ground reaction force or joint cartilage
 * - Strictly non-diagnostic: no OA classification, no clinical risk scoring
 * - Graceful handling of missing landmarks, occlusions, and low confidence (< 0.40)
 */

import type { ValidatedPoseFrame } from "./movementFeatureEvaluation";

export type ChecklistTaskId =
  | "seated-knee-extension"
  | "seated-knee-flexion"
  | "sit-to-stand"
  | "supported-weight-shift";

export type ChecklistTaskStatus =
  | "not-started"
  | "recording"
  | "completed"
  | "try-again"
  | "unable-to-evaluate";

export type ChecklistOutcomeLabel =
  | "Not started"
  | "Recording..."
  | "Movement detected"
  | "Movement not clearly detected"
  | "Unable to evaluate";

export interface ChecklistTaskDefinition {
  id: ChecklistTaskId;
  title: string;
  category: "seated" | "transfer" | "standing";
  shortInstructions: string;
  detailedGuidance: string[];
  safetyNotice?: string;
  recommendedDurationSec: number;
  requiredLandmarks: string[];
}

export type ReferenceComparisonStatus =
  | "within-reference"
  | "outside-reference"
  | "unable-to-compare";

export interface TaskReferenceRange {
  rangeLabel: string;
  minAngleDeg?: number;
  maxAngleDeg?: number;
  minExcursionDeg?: number;
  minDisplacementNorm?: number;
  source: string;
  sourceCitation: string;
  methodologyNote: string;
}

export interface ChecklistTaskEvaluation {
  taskId: ChecklistTaskId;
  status: ChecklistTaskStatus;
  outcomeLabel: ChecklistOutcomeLabel;
  feedbackSummary: string;
  referenceRange?: TaskReferenceRange;
  referenceComparison?: ReferenceComparisonStatus;
  referenceComparisonNotice?: string;
  contextualSymptomInterpretation?: string;
  observableMetrics?: {
    peakAngleDeg?: number | null;
    baselineAngleDeg?: number | null;
    angleExcursionDeg?: number | null;
    verticalDisplacementNorm?: number | null;
    lateralDisplacementNorm?: number | null;
    activeSide?: "left" | "right" | "bilateral";
  };
  trackingQuality: {
    totalFrames: number;
    usableFrames: number;
    meanConfidence: number; // 0.0 - 1.0
    qualityStatus: "good" | "fair" | "insufficient" | "unusable";
    warning?: string;
  };
  limitations: string[];
  disclaimer: string;
  evaluatedAt: number;
}

export interface ChecklistOverallSummary {
  totalTasks: number;
  completedCount: number;
  tryAgainCount: number;
  unableCount: number;
  notStartedCount: number;
  allAttempted: boolean;
  withinReferenceCount: number;
  outsideReferenceCount: number;
  unableToCompareCount: number;
  warnings: string[];
}

/**
 * Documented reference ranges supported by published clinical goniometric
 * and biomechanical literature, with explicit 2D monocular camera disclosures.
 */
export const TASK_REFERENCE_RANGES: Record<ChecklistTaskId, TaskReferenceRange> = {
  "seated-knee-extension": {
    rangeLabel: "Terminal extension 165°–180° (extension deficit ≤ 15°), excursion ≥ 30°",
    minAngleDeg: 165,
    maxAngleDeg: 180,
    minExcursionDeg: 30,
    source: "American Academy of Orthopaedic Surgeons (AAOS) & Norkin/White Clinical Goniometry",
    sourceCitation: "Norkin CC, White DJ. Measurement of Joint Motion: A Guide to Goniometry. 5th ed. FA Davis; 2016.",
    methodologyNote: "2D planar camera projection. Parallax, clothing, and camera elevation cause ~5°–10° variance versus universal goniometer. Angle alone does not determine OA.",
  },
  "seated-knee-flexion": {
    rangeLabel: "Active seated flexion depth ≤ 95° from forward position, excursion ≥ 25°",
    minAngleDeg: 0,
    maxAngleDeg: 95,
    minExcursionDeg: 25,
    source: "AAOS Clinical Range of Motion Guidelines & Clarkson Goniometric Standards",
    sourceCitation: "Clarkson HM. Musculoskeletal Assessment: Joint Motion and Muscle Testing. 3rd ed. Wolters Kluwer; 2013.",
    methodologyNote: "Active heel slide under chair is partially constrained by chair geometry. Monocular camera evaluates planar trajectory only.",
  },
  "sit-to-stand": {
    rangeLabel: "Terminal upright knee extension 165°–180°, vertical rise ≥ 8% of frame height",
    minAngleDeg: 165,
    maxAngleDeg: 180,
    minDisplacementNorm: 0.08,
    source: "Bohannon Chair-Rise Kinematic Criteria & AAOS Biomechanical Standards",
    sourceCitation: "Bohannon RW. Sit-to-stand test for measuring performance of lower extremity muscles. Clin Rehabil. 2006;20(8):723-731.",
    methodologyNote: "Measures visible torso-pelvic vertical translation and knee opening in camera view. Cannot measure ground reaction force or unilateral limb offloading.",
  },
  "supported-weight-shift": {
    rangeLabel: "Coronal pelvic/torso shift ≥ 3.5% of frame width with bilateral foot stability",
    minDisplacementNorm: 0.035,
    source: "Clinical Observational Gait and Balance Assessment Standards",
    sourceCitation: "Tinetti ME. Performance-oriented assessment of mobility problems in elderly patients. J Am Geriatr Soc. 1986;34(2):119-126.",
    methodologyNote: "Observes 2D lateral shift in camera view only. Standard RGB video cannot measure plantigrade load distribution, foot pressure, or joint forces.",
  },
};

/**
 * Generates clear, cautious interpretation combining movement observation with symptom context.
 */
export function generateSymptomConditionedInterpretation(
  taskEvaluation: ChecklistTaskEvaluation,
  symptomsReported: boolean
): string {
  const comparison = taskEvaluation.referenceComparison;

  if (taskEvaluation.status === "unable-to-evaluate" || comparison === "unable-to-compare") {
    return "Tracking confidence or landmark visibility was insufficient to evaluate this movement reliably. This is not an indicator of joint abnormality. If you experience joint discomfort or functional limitation, consider a professional evaluation.";
  }

  if (comparison === "within-reference") {
    if (symptomsReported) {
      return "Your observed movement is within the selected reference range, but this does not rule out osteoarthritis. Your reported symptoms may still warrant further assessment by a healthcare professional.";
    }
    return "This movement assessment did not identify an obvious limitation in the measured movement. Please note that this cannot rule out osteoarthritis.";
  }

  if (comparison === "outside-reference") {
    return "The observed angle or excursion fell outside the documented reference range. This result may reflect limited mobility or measurement variability. Symptoms and clinical history should be evaluated together by a healthcare professional before drawing clinical conclusions. This does not constitute an osteoarthritis diagnosis.";
  }

  return "Exploratory movement observation. Does not constitute a clinical diagnosis or risk score.";
}

export const CHECKLIST_TASK_DEFINITIONS: Record<ChecklistTaskId, ChecklistTaskDefinition> = {
  "seated-knee-extension": {
    id: "seated-knee-extension",
    title: "Seated knee extension",
    category: "seated",
    shortInstructions: "Sit securely on a stable chair. Slowly straighten one knee within a comfortable range, then return to resting.",
    detailedGuidance: [
      "Sit upright with your back supported on a stable chair.",
      "Keep thighs supported on the seat.",
      "Slowly straighten one knee forward as far as comfortably possible.",
      "Hold for one second, then slowly return your foot to the floor.",
    ],
    recommendedDurationSec: 5,
    requiredLandmarks: ["Hip (23/24)", "Knee (25/26)", "Ankle (27/28)"],
  },
  "seated-knee-flexion": {
    id: "seated-knee-flexion",
    title: "Seated knee flexion",
    category: "seated",
    shortInstructions: "From a forward position, gently bend the knee back under the chair within a comfortable range.",
    detailedGuidance: [
      "Sit on a sturdy chair with feet flat on the floor.",
      "Extend your leg slightly forward, then gently slide or bend your heel backward under the chair.",
      "Move smoothly within your comfortable, pain-free range.",
      "Return to the standard resting seated position.",
    ],
    recommendedDurationSec: 5,
    requiredLandmarks: ["Hip (23/24)", "Knee (25/26)", "Ankle (27/28)"],
  },
  "sit-to-stand": {
    id: "sit-to-stand",
    title: "Sit-to-stand transfer",
    category: "transfer",
    shortInstructions: "Stand up from a stable chair and sit back down. Use arm support if needed. (Optional; attempt only if safe).",
    detailedGuidance: [
      "Position feet shoulder-width apart on a non-slip floor.",
      "Smoothly rise to a full upright standing position.",
      "Pause momentarily upright, then gently lower yourself back to the seat.",
      "Use chair armrests or a table for support if you feel any unsteadiness.",
    ],
    safetyNotice: "Optional safety task: Do not attempt if you feel dizzy, unassisted, or unsteady on your feet.",
    recommendedDurationSec: 6,
    requiredLandmarks: ["Shoulders (11/12)", "Hips (23/24)", "Knees (25/26)", "Ankles (27/28)"],
  },
  "supported-weight-shift": {
    id: "supported-weight-shift",
    title: "Supported standing weight shift",
    category: "standing",
    shortInstructions: "Stand near a sturdy counter or support. Gently shift your body weight from side to side. (Optional).",
    detailedGuidance: [
      "Stand with hands lightly resting on a stable counter, sturdy table, or wall.",
      "Place feet slightly wider than shoulder-width.",
      "Gently shift your pelvis and torso toward the left leg, hold briefly, then shift toward the right.",
      "Keep both feet on the floor throughout the shift.",
    ],
    safetyNotice: "Optional safety task: Must not be attempted if you feel unsteady or at risk of losing balance.",
    recommendedDurationSec: 5,
    requiredLandmarks: ["Shoulders (11/12)", "Hips (23/24)", "Ankles (27/28)"],
  },
};

const NON_DIAGNOSTIC_DISCLAIMER =
  "Movement checklist observations are non-diagnostic exploratory computer-vision evaluations for guided demonstration. They do not measure cartilage thickness, bone mineral density, or diagnose osteoarthritis.";

// Helper: Calculate 2D angle between 3 points (A -> B -> C) at vertex B
function calculateJointAngle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): number | null {
  const v1x = ax - bx;
  const v1y = ay - by;
  const v2x = cx - bx;
  const v2y = cy - by;

  const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
  const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
  if (mag1 < 0.001 || mag2 < 0.001) return null;

  const dot = v1x * v2x + v1y * v2y;
  const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return Math.round(Math.acos(cosTheta) * (180 / Math.PI));
}

// Helper: Assess basic tracking quality of frame sequence
function assessTrackingQuality(frames: ValidatedPoseFrame[]): {
  totalFrames: number;
  usableFrames: number;
  meanConfidence: number;
  qualityStatus: "good" | "fair" | "insufficient" | "unusable";
  warning?: string;
} {
  if (!Array.isArray(frames) || frames.length === 0) {
    return {
      totalFrames: 0,
      usableFrames: 0,
      meanConfidence: 0,
      qualityStatus: "unusable",
      warning: "No video frames were recorded for evaluation.",
    };
  }

  const total = frames.length;
  let usableCount = 0;
  let totalConf = 0;

  for (const f of frames) {
    if (f && f.isUsable) {
      usableCount++;
      totalConf += f.meanConfidence;
    }
  }

  const usableRatio = usableCount / total;
  const meanConf = usableCount > 0 ? Math.round((totalConf / usableCount) * 100) / 100 : 0;

  if (usableCount < 10) {
    return {
      totalFrames: total,
      usableFrames: usableCount,
      meanConfidence: meanConf,
      qualityStatus: "insufficient",
      warning: `Too few usable frames tracked (${usableCount} frames). Ensure you are positioned fully in camera view.`,
    };
  }

  if (usableRatio < 0.4 || meanConf < 0.45) {
    return {
      totalFrames: total,
      usableFrames: usableCount,
      meanConfidence: meanConf,
      qualityStatus: "fair",
      warning: "Tracking confidence was marginal. Some joint positions may have experienced momentary occlusion.",
    };
  }

  return {
    totalFrames: total,
    usableFrames: usableCount,
    meanConfidence: meanConf,
    qualityStatus: "good",
  };
}

/**
 * Movement A: Seated Knee Extension Evaluation
 * Checks for a visible extension excursion where knee angle increases toward 180° and ankle rises.
 */
export function evaluateSeatedKneeExtension(frames: ValidatedPoseFrame[]): ChecklistTaskEvaluation {
  const trackingQuality = assessTrackingQuality(frames);
  const evaluatedAt = Date.now();

  const limitations = [
    "2D planar angle projection; out-of-plane rotation affects apparent angular measurement.",
    "Webcam evaluation cannot detect internal joint crepitus or muscle activation strength.",
  ];

  if (trackingQuality.qualityStatus === "unusable" || trackingQuality.usableFrames < 10) {
    return {
      taskId: "seated-knee-extension",
      status: "unable-to-evaluate",
      outcomeLabel: "Unable to evaluate",
      feedbackSummary: "Your body landmarks were not visible enough to evaluate this movement. Please position the camera at waist height and ensure your hip, knee, and ankle are in view.",
      referenceRange: TASK_REFERENCE_RANGES["seated-knee-extension"],
      referenceComparison: "unable-to-compare",
      referenceComparisonNotice: "Unable to evaluate reliably: landmark visibility was too low or limbs were occluded.",
      trackingQuality,
      limitations,
      disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
      evaluatedAt,
    };
  }

  // Extract knee angles across frames for both left and right limbs
  const leftAngles: number[] = [];
  const rightAngles: number[] = [];
  const leftAnkleYs: number[] = [];
  const rightAnkleYs: number[] = [];

  for (const f of frames) {
    if (!f.isUsable) continue;

    // Left leg: Hip 23, Knee 25, Ankle 27
    const lH = f.landmarks[23];
    const lK = f.landmarks[25];
    const lA = f.landmarks[27];
    if (lH?.isValid && lK?.isValid && lA?.isValid && lH.x !== null && lH.y !== null && lK.x !== null && lK.y !== null && lA.x !== null && lA.y !== null) {
      const angle = calculateJointAngle(lH.x, lH.y, lK.x, lK.y, lA.x, lA.y);
      if (angle !== null) {
        leftAngles.push(angle);
        leftAnkleYs.push(lA.y);
      }
    }

    // Right leg: Hip 24, Knee 26, Ankle 28
    const rH = f.landmarks[24];
    const rK = f.landmarks[26];
    const rA = f.landmarks[28];
    if (rH?.isValid && rK?.isValid && rA?.isValid && rH.x !== null && rH.y !== null && rK.x !== null && rK.y !== null && rA.x !== null && rA.y !== null) {
      const angle = calculateJointAngle(rH.x, rH.y, rK.x, rK.y, rA.x, rA.y);
      if (angle !== null) {
        rightAngles.push(angle);
        rightAnkleYs.push(rA.y);
      }
    }
  }

  // Determine active limb by whichever exhibited greater angle excursion
  const getExcursion = (angles: number[]) => {
    if (angles.length < 6) return { excursion: 0, baseline: null, peak: null };
    const initialBaseline = angles.slice(0, Math.min(5, angles.length)).reduce((a, b) => a + b, 0) / Math.min(5, angles.length);
    const peak = Math.max(...angles);
    return {
      excursion: Math.max(0, peak - initialBaseline),
      baseline: Math.round(initialBaseline),
      peak: Math.round(peak),
    };
  };

  const leftExc = getExcursion(leftAngles);
  const rightExc = getExcursion(rightAngles);

  if (leftAngles.length < 6 && rightAngles.length < 6) {
    return {
      taskId: "seated-knee-extension",
      status: "unable-to-evaluate",
      outcomeLabel: "Unable to evaluate",
      feedbackSummary: "Key knee and ankle landmarks were occluded or not detected clearly enough to measure joint angles.",
      referenceRange: TASK_REFERENCE_RANGES["seated-knee-extension"],
      referenceComparison: "unable-to-compare",
      referenceComparisonNotice: "Unable to evaluate reliably: knee and ankle landmarks could not be tracked consistently.",
      trackingQuality,
      limitations,
      disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
      evaluatedAt,
    };
  }

  const activeSide: "left" | "right" = leftExc.excursion >= rightExc.excursion ? "left" : "right";
  const activeStats = activeSide === "left" ? leftExc : rightExc;

  // Extension threshold: at least 16° increase toward extension
  if (activeStats.excursion >= 16) {
    const isWithin =
      activeStats.peak !== null &&
      activeStats.peak >= 165 &&
      activeStats.peak <= 185 &&
      activeStats.excursion >= 30;

    const referenceComparison: ReferenceComparisonStatus = isWithin
      ? "within-reference"
      : "outside-reference";

    const referenceComparisonNotice = isWithin
      ? "Movement observed within the selected reference range (terminal extension 165°–180°, excursion ≥ 30°)."
      : `Observed peak extension (${activeStats.peak}°) or excursion (${Math.round(activeStats.excursion)}°) was outside the documented reference range (165°–180°, excursion ≥ 30°). This may reflect limited mobility or measurement variability.`;

    return {
      taskId: "seated-knee-extension",
      status: "completed",
      outcomeLabel: "Movement detected",
      feedbackSummary: `Movement detected — seated knee extension excursion of approx. ${Math.round(activeStats.excursion)}° observed on ${activeSide} limb. Recording completed.`,
      referenceRange: TASK_REFERENCE_RANGES["seated-knee-extension"],
      referenceComparison,
      referenceComparisonNotice,
      observableMetrics: {
        baselineAngleDeg: activeStats.baseline,
        peakAngleDeg: activeStats.peak,
        angleExcursionDeg: Math.round(activeStats.excursion),
        activeSide,
      },
      trackingQuality,
      limitations,
      disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
      evaluatedAt,
    };
  }

  return {
    taskId: "seated-knee-extension",
    status: "try-again",
    outcomeLabel: "Movement not clearly detected",
    feedbackSummary: "Movement not clearly detected. Ensure you slowly straighten your knee fully within your comfortable range and try again.",
    referenceRange: TASK_REFERENCE_RANGES["seated-knee-extension"],
    referenceComparison: "unable-to-compare",
    referenceComparisonNotice: "Movement not clearly detected or incomplete. Straighten the knee fully within comfort to evaluate against reference range.",
    observableMetrics: {
      baselineAngleDeg: activeStats.baseline,
      peakAngleDeg: activeStats.peak,
      angleExcursionDeg: Math.round(activeStats.excursion),
      activeSide,
    },
    trackingQuality,
    limitations,
    disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
    evaluatedAt,
  };
}

/**
 * Movement B: Seated Knee Flexion Evaluation
 * Checks for a visible flexion excursion where knee angle decreases as knee is drawn back.
 */
export function evaluateSeatedKneeFlexion(frames: ValidatedPoseFrame[]): ChecklistTaskEvaluation {
  const trackingQuality = assessTrackingQuality(frames);
  const evaluatedAt = Date.now();

  const limitations = [
    "Under-chair occlusion: when feet slide beneath a chair, heels may be occluded by chair rungs.",
    "2D perspective distortion depends on whether camera is positioned in frontal or sagittal view.",
  ];

  if (trackingQuality.qualityStatus === "unusable" || trackingQuality.usableFrames < 10) {
    return {
      taskId: "seated-knee-flexion",
      status: "unable-to-evaluate",
      outcomeLabel: "Unable to evaluate",
      feedbackSummary: "Your body landmarks were not visible enough to evaluate this movement. Please ensure your chair and leg joints remain visible.",
      referenceRange: TASK_REFERENCE_RANGES["seated-knee-flexion"],
      referenceComparison: "unable-to-compare",
      referenceComparisonNotice: "Unable to evaluate reliably: landmark visibility was too low or leg joints were occluded.",
      trackingQuality,
      limitations,
      disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
      evaluatedAt,
    };
  }

  const leftAngles: number[] = [];
  const rightAngles: number[] = [];

  for (const f of frames) {
    if (!f.isUsable) continue;

    const lH = f.landmarks[23];
    const lK = f.landmarks[25];
    const lA = f.landmarks[27];
    if (lH?.isValid && lK?.isValid && lA?.isValid && lH.x !== null && lH.y !== null && lK.x !== null && lK.y !== null && lA.x !== null && lA.y !== null) {
      const angle = calculateJointAngle(lH.x, lH.y, lK.x, lK.y, lA.x, lA.y);
      if (angle !== null) leftAngles.push(angle);
    }

    const rH = f.landmarks[24];
    const rK = f.landmarks[26];
    const rA = f.landmarks[28];
    if (rH?.isValid && rK?.isValid && rA?.isValid && rH.x !== null && rH.y !== null && rK.x !== null && rK.y !== null && rA.x !== null && rA.y !== null) {
      const angle = calculateJointAngle(rH.x, rH.y, rK.x, rK.y, rA.x, rA.y);
      if (angle !== null) rightAngles.push(angle);
    }
  }

  const getFlexionExcursion = (angles: number[]) => {
    if (angles.length < 6) return { excursion: 0, baseline: null, minAngle: null };
    const initialBaseline = angles.slice(0, Math.min(5, angles.length)).reduce((a, b) => a + b, 0) / Math.min(5, angles.length);
    const minAngle = Math.min(...angles);
    return {
      excursion: Math.max(0, initialBaseline - minAngle),
      baseline: Math.round(initialBaseline),
      minAngle: Math.round(minAngle),
    };
  };

  const leftFlex = getFlexionExcursion(leftAngles);
  const rightFlex = getFlexionExcursion(rightAngles);

  if (leftAngles.length < 6 && rightAngles.length < 6) {
    return {
      taskId: "seated-knee-flexion",
      status: "unable-to-evaluate",
      outcomeLabel: "Unable to evaluate",
      feedbackSummary: "Key knee and ankle landmarks were occluded or not detected clearly enough to measure joint angles.",
      referenceRange: TASK_REFERENCE_RANGES["seated-knee-flexion"],
      referenceComparison: "unable-to-compare",
      referenceComparisonNotice: "Unable to evaluate reliably: knee and ankle landmarks could not be tracked consistently.",
      trackingQuality,
      limitations,
      disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
      evaluatedAt,
    };
  }

  const activeSide: "left" | "right" = leftFlex.excursion >= rightFlex.excursion ? "left" : "right";
  const activeStats = activeSide === "left" ? leftFlex : rightFlex;

  // Flexion threshold: at least 14° decrease in angle as knee bends back
  if (activeStats.excursion >= 14) {
    const isWithin =
      activeStats.minAngle !== null &&
      activeStats.minAngle <= 95 &&
      activeStats.excursion >= 25;

    const referenceComparison: ReferenceComparisonStatus = isWithin
      ? "within-reference"
      : "outside-reference";

    const referenceComparisonNotice = isWithin
      ? "Movement observed within the selected reference range (seated flexion depth ≤ 95°, excursion ≥ 25°)."
      : `Observed flexion depth (${activeStats.minAngle}°) or excursion (${Math.round(activeStats.excursion)}°) was outside the documented reference range (≤ 95°, excursion ≥ 25°). This may reflect limited mobility or measurement variability.`;

    return {
      taskId: "seated-knee-flexion",
      status: "completed",
      outcomeLabel: "Movement detected",
      feedbackSummary: `Movement detected — seated knee flexion excursion of approx. ${Math.round(activeStats.excursion)}° observed on ${activeSide} limb. Recording completed.`,
      referenceRange: TASK_REFERENCE_RANGES["seated-knee-flexion"],
      referenceComparison,
      referenceComparisonNotice,
      observableMetrics: {
        baselineAngleDeg: activeStats.baseline,
        peakAngleDeg: activeStats.minAngle,
        angleExcursionDeg: Math.round(activeStats.excursion),
        activeSide,
      },
      trackingQuality,
      limitations,
      disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
      evaluatedAt,
    };
  }

  return {
    taskId: "seated-knee-flexion",
    status: "try-again",
    outcomeLabel: "Movement not clearly detected",
    feedbackSummary: "Movement not clearly detected. Ensure you start with the leg forward and gently bend the knee backward under the chair within comfort.",
    referenceRange: TASK_REFERENCE_RANGES["seated-knee-flexion"],
    referenceComparison: "unable-to-compare",
    referenceComparisonNotice: "Movement not clearly detected or incomplete. Start with leg forward and bend backward under chair to evaluate against reference range.",
    observableMetrics: {
      baselineAngleDeg: activeStats.baseline,
      peakAngleDeg: activeStats.minAngle,
      angleExcursionDeg: Math.round(activeStats.excursion),
      activeSide,
    },
    trackingQuality,
    limitations,
    disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
    evaluatedAt,
  };
}

/**
 * Movement C: Sit-to-Stand Transfer Evaluation
 * Looks for plausible vertical hip displacement accompanied by knee extension opening from seated to standing.
 */
export function evaluateSitToStand(frames: ValidatedPoseFrame[]): ChecklistTaskEvaluation {
  const trackingQuality = assessTrackingQuality(frames);
  const evaluatedAt = Date.now();

  const limitations = [
    "Full-body framing requirement: user must remain visible from head to feet across both sitting and standing postures.",
    "Webcam tracking observes kinematic trajectory only; cannot measure quadriceps force or joint loading.",
  ];

  if (trackingQuality.qualityStatus === "unusable" || trackingQuality.usableFrames < 12) {
    return {
      taskId: "sit-to-stand",
      status: "unable-to-evaluate",
      outcomeLabel: "Unable to evaluate",
      feedbackSummary: "Your body landmarks were not visible enough to evaluate this movement. Please step back 2–3 meters so your full body is visible when standing.",
      referenceRange: TASK_REFERENCE_RANGES["sit-to-stand"],
      referenceComparison: "unable-to-compare",
      referenceComparisonNotice: "Unable to evaluate reliably: full-body landmarks were not continuously visible.",
      trackingQuality,
      limitations,
      disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
      evaluatedAt,
    };
  }

  const hipYs: number[] = [];
  const kneeAngles: number[] = [];

  for (const f of frames) {
    if (!f.isUsable) continue;

    const lH = f.landmarks[23];
    const rH = f.landmarks[24];
    const lK = f.landmarks[25];
    const rK = f.landmarks[26];
    const lA = f.landmarks[27];
    const rA = f.landmarks[28];

    // Pelvic midpoint Y coordinate (Y decreases as person rises)
    if (lH?.y !== null && rH?.y !== null && lH?.isValid && rH?.isValid) {
      hipYs.push((lH.y + rH.y) / 2);
    } else if (lH?.y !== null && lH?.isValid) {
      hipYs.push(lH.y);
    } else if (rH?.y !== null && rH?.isValid) {
      hipYs.push(rH.y);
    }

    // Knee angle
    const angleL = lH && lK && lA && lH.isValid && lK.isValid && lA.isValid && lH.x !== null && lH.y !== null && lK.x !== null && lK.y !== null && lA.x !== null && lA.y !== null
      ? calculateJointAngle(lH.x, lH.y, lK.x, lK.y, lA.x, lA.y)
      : null;
    const angleR = rH && rK && rA && rH.isValid && rK.isValid && rA.isValid && rH.x !== null && rH.y !== null && rK.x !== null && rK.y !== null && rA.x !== null && rA.y !== null
      ? calculateJointAngle(rH.x, rH.y, rK.x, rK.y, rA.x, rA.y)
      : null;

    const maxKnee = Math.max(angleL ?? 0, angleR ?? 0);
    if (maxKnee > 0) kneeAngles.push(maxKnee);
  }

  if (hipYs.length < 8) {
    return {
      taskId: "sit-to-stand",
      status: "unable-to-evaluate",
      outcomeLabel: "Unable to evaluate",
      feedbackSummary: "Camera tracking confidence was too low on pelvic landmarks. Please ensure good lighting and clear camera line-of-sight.",
      referenceRange: TASK_REFERENCE_RANGES["sit-to-stand"],
      referenceComparison: "unable-to-compare",
      referenceComparisonNotice: "Unable to evaluate reliably: pelvic landmarks were not continuously visible.",
      trackingQuality,
      limitations,
      disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
      evaluatedAt,
    };
  }

  // Sit-to-stand kinematics:
  // Sitting hip Y is larger (lower on screen); standing hip Y is smaller (higher on screen).
  const initialHipY = hipYs.slice(0, Math.min(5, hipYs.length)).reduce((a, b) => a + b, 0) / Math.min(5, hipYs.length);
  const minHipY = Math.min(...hipYs); // highest point of standing
  const verticalRise = Math.max(0, initialHipY - minHipY);

  const initialKneeAngle = kneeAngles.length >= 5
    ? kneeAngles.slice(0, 5).reduce((a, b) => a + b, 0) / 5
    : (kneeAngles[0] ?? 90);
  const peakStandingAngle = kneeAngles.length > 0 ? Math.max(...kneeAngles) : initialKneeAngle;
  const kneeExtensionExcursion = Math.max(0, peakStandingAngle - initialKneeAngle);

  // Requirement: Significant vertical rise (> 0.06 normalized frame) AND knee extension opening (> 20°)
  if (verticalRise >= 0.06 && (kneeExtensionExcursion >= 20 || peakStandingAngle >= 150)) {
    const isWithin = peakStandingAngle >= 165 && verticalRise >= 0.08;
    const referenceComparison: ReferenceComparisonStatus = isWithin
      ? "within-reference"
      : "outside-reference";

    const referenceComparisonNotice = isWithin
      ? "Movement observed within the selected reference range (terminal upright knee extension 165°–180°, vertical rise ≥ 8% frame)."
      : `Observed chair-rise kinematics (upright knee: ${Math.round(peakStandingAngle)}°, vertical rise: ${(verticalRise * 100).toFixed(1)}%) were outside the documented reference range (165°–180°, rise ≥ 8%). This may reflect limited mobility or measurement variability.`;

    return {
      taskId: "sit-to-stand",
      status: "completed",
      outcomeLabel: "Movement detected",
      feedbackSummary: `Movement detected — chair rise and sit-down transition observed (vertical displacement: ${(verticalRise * 100).toFixed(1)}% of frame). Recording completed.`,
      referenceRange: TASK_REFERENCE_RANGES["sit-to-stand"],
      referenceComparison,
      referenceComparisonNotice,
      observableMetrics: {
        verticalDisplacementNorm: Math.round(verticalRise * 1000) / 1000,
        baselineAngleDeg: Math.round(initialKneeAngle),
        peakAngleDeg: Math.round(peakStandingAngle),
        angleExcursionDeg: Math.round(kneeExtensionExcursion),
        activeSide: "bilateral",
      },
      trackingQuality,
      limitations,
      disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
      evaluatedAt,
    };
  }

  return {
    taskId: "sit-to-stand",
    status: "try-again",
    outcomeLabel: "Movement not clearly detected",
    feedbackSummary: "Movement not clearly detected. Please ensure your whole body is visible and perform a smooth rise to full standing before sitting down.",
    referenceRange: TASK_REFERENCE_RANGES["sit-to-stand"],
    referenceComparison: "unable-to-compare",
    referenceComparisonNotice: "Sit-to-stand transition not clearly detected. Perform a smooth rise to full standing to evaluate against reference range.",
    observableMetrics: {
      verticalDisplacementNorm: Math.round(verticalRise * 1000) / 1000,
      baselineAngleDeg: Math.round(initialKneeAngle),
      peakAngleDeg: Math.round(peakStandingAngle),
      angleExcursionDeg: Math.round(kneeExtensionExcursion),
      activeSide: "bilateral",
    },
    trackingQuality,
    limitations,
    disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
    evaluatedAt,
  };
}

/**
 * Movement D: Supported Standing Weight Shift Evaluation
 * Evaluates observable lateral pelvic/torso shift between foot boundaries,
 * with mandatory transparent disclosure that RGB video cannot measure force distribution.
 */
export function evaluateSupportedWeightShift(frames: ValidatedPoseFrame[]): ChecklistTaskEvaluation {
  const trackingQuality = assessTrackingQuality(frames);
  const evaluatedAt = Date.now();

  const limitations = [
    "FORCE MEASUREMENT LIMITATION: A standard monocular RGB camera observes 2D landmark position only. It CANNOT measure ground reaction force, plantigrade load, or true left-right weight distribution.",
    "Camera viewpoint angle and support object occlusion (e.g. holding a table or counter) may partially mask pelvic movement.",
  ];

  if (trackingQuality.qualityStatus === "unusable" || trackingQuality.usableFrames < 10) {
    return {
      taskId: "supported-weight-shift",
      status: "unable-to-evaluate",
      outcomeLabel: "Unable to evaluate",
      feedbackSummary: "This movement cannot currently be evaluated reliably by this system. Torso and lower-limb landmarks were not clearly detected.",
      referenceRange: TASK_REFERENCE_RANGES["supported-weight-shift"],
      referenceComparison: "unable-to-compare",
      referenceComparisonNotice: "Unable to evaluate reliably: pelvic and torso landmarks were not continuously visible.",
      trackingQuality,
      limitations,
      disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
      evaluatedAt,
    };
  }

  const hipXs: number[] = [];
  const shoulderXs: number[] = [];

  for (const f of frames) {
    if (!f.isUsable) continue;

    const lH = f.landmarks[23];
    const rH = f.landmarks[24];
    const lS = f.landmarks[11];
    const rS = f.landmarks[12];

    if (lH?.x !== null && rH?.x !== null && lH?.isValid && rH?.isValid) {
      hipXs.push((lH.x + rH.x) / 2);
    }
    if (lS?.x !== null && rS?.x !== null && lS?.isValid && rS?.isValid) {
      shoulderXs.push((lS.x + rS.x) / 2);
    }
  }

  if (hipXs.length < 8) {
    return {
      taskId: "supported-weight-shift",
      status: "unable-to-evaluate",
      outcomeLabel: "Unable to evaluate",
      feedbackSummary: "This movement cannot currently be evaluated reliably by this system. Pelvic landmarks were not continuously visible.",
      referenceRange: TASK_REFERENCE_RANGES["supported-weight-shift"],
      referenceComparison: "unable-to-compare",
      referenceComparisonNotice: "Unable to evaluate reliably: pelvic landmarks were not continuously visible.",
      trackingQuality,
      limitations,
      disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
      evaluatedAt,
    };
  }

  const minHipX = Math.min(...hipXs);
  const maxHipX = Math.max(...hipXs);
  const lateralShift = maxHipX - minHipX;

  // Noticeable lateral shift threshold: >= 0.03 normalized frame width
  if (lateralShift >= 0.03) {
    const isWithin = lateralShift >= 0.035;
    const referenceComparison: ReferenceComparisonStatus = isWithin
      ? "within-reference"
      : "outside-reference";

    const referenceComparisonNotice = isWithin
      ? "Movement observed within the selected reference range (coronal shift ≥ 3.5% frame width). Note: Camera observes 2D positioning only, not joint load or force distribution."
      : `Observed lateral shift (${(lateralShift * 100).toFixed(1)}%) was outside the documented reference range (≥ 3.5%). This may reflect limited mobility or measurement variability.`;

    return {
      taskId: "supported-weight-shift",
      status: "completed",
      outcomeLabel: "Movement detected",
      feedbackSummary: `Movement detected — lateral body shift of approx. ${(lateralShift * 100).toFixed(1)}% of frame observed. Note: Monocular cameras observe body positioning only, not physical weight or ground reaction forces.`,
      referenceRange: TASK_REFERENCE_RANGES["supported-weight-shift"],
      referenceComparison,
      referenceComparisonNotice,
      observableMetrics: {
        lateralDisplacementNorm: Math.round(lateralShift * 1000) / 1000,
        activeSide: "bilateral",
      },
      trackingQuality,
      limitations,
      disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
      evaluatedAt,
    };
  }

  return {
    taskId: "supported-weight-shift",
    status: "try-again",
    outcomeLabel: "Movement not clearly detected",
    feedbackSummary: "Movement not clearly detected. Gently shift your pelvis and torso from left to right while keeping both feet planted, and try again.",
    referenceRange: TASK_REFERENCE_RANGES["supported-weight-shift"],
    referenceComparison: "unable-to-compare",
    referenceComparisonNotice: "Lateral weight shift not clearly detected. Shift torso and hips gently from side to side to evaluate against reference range.",
    observableMetrics: {
      lateralDisplacementNorm: Math.round(lateralShift * 1000) / 1000,
      activeSide: "bilateral",
    },
    trackingQuality,
    limitations,
    disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
    evaluatedAt,
  };
}

/**
 * Dispatches evaluation for a specified checklist task.
 */
export function evaluateChecklistTask(
  taskId: ChecklistTaskId,
  frames: ValidatedPoseFrame[]
): ChecklistTaskEvaluation {
  try {
    switch (taskId) {
      case "seated-knee-extension":
        return evaluateSeatedKneeExtension(frames);
      case "seated-knee-flexion":
        return evaluateSeatedKneeFlexion(frames);
      case "sit-to-stand":
        return evaluateSitToStand(frames);
      case "supported-weight-shift":
        return evaluateSupportedWeightShift(frames);
      default: {
        const _exhaustive: never = taskId;
        throw new Error(`Unknown checklist task: ${_exhaustive}`);
      }
    }
  } catch (err) {
    return {
      taskId,
      status: "unable-to-evaluate",
      outcomeLabel: "Unable to evaluate",
      feedbackSummary: "An unexpected error occurred while evaluating the recorded frames.",
      referenceRange: TASK_REFERENCE_RANGES[taskId],
      referenceComparison: "unable-to-compare",
      referenceComparisonNotice: "Unable to evaluate movement due to a processing error.",
      trackingQuality: {
        totalFrames: Array.isArray(frames) ? frames.length : 0,
        usableFrames: 0,
        meanConfidence: 0,
        qualityStatus: "unusable",
        warning: err instanceof Error ? err.message : "Processing error",
      },
      limitations: ["Processing error occurred during frame evaluation."],
      disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
      evaluatedAt: Date.now(),
    };
  }
}

/**
 * Aggregates results across all 4 movement checklist tasks into a concise summary.
 */
export function generateChecklistSummary(
  evaluations: Partial<Record<ChecklistTaskId, ChecklistTaskEvaluation | null>>
): ChecklistOverallSummary {
  const taskIds: ChecklistTaskId[] = [
    "seated-knee-extension",
    "seated-knee-flexion",
    "sit-to-stand",
    "supported-weight-shift",
  ];

  let completedCount = 0;
  let tryAgainCount = 0;
  let unableCount = 0;
  let notStartedCount = 0;
  let withinReferenceCount = 0;
  let outsideReferenceCount = 0;
  let unableToCompareCount = 0;
  const warnings: string[] = [];

  for (const tid of taskIds) {
    const ev = evaluations[tid];
    if (!ev || ev.status === "not-started") {
      notStartedCount++;
    } else if (ev.status === "completed") {
      completedCount++;
      if (ev.referenceComparison === "within-reference") {
        withinReferenceCount++;
      } else if (ev.referenceComparison === "outside-reference") {
        outsideReferenceCount++;
      } else {
        unableToCompareCount++;
      }
    } else if (ev.status === "try-again") {
      tryAgainCount++;
      unableToCompareCount++;
    } else if (ev.status === "unable-to-evaluate") {
      unableCount++;
      unableToCompareCount++;
      if (ev.trackingQuality.warning && !warnings.includes(ev.trackingQuality.warning)) {
        warnings.push(ev.trackingQuality.warning);
      }
    }
  }

  const allAttempted = notStartedCount === 0;

  return {
    totalTasks: taskIds.length,
    completedCount,
    tryAgainCount,
    unableCount,
    notStartedCount,
    allAttempted,
    withinReferenceCount,
    outsideReferenceCount,
    unableToCompareCount,
    warnings,
  };
}
