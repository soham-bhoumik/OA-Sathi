/**
 * OA-Sathi Gait Analysis & Pose Estimation Service Boundary (v1.0.0)
 *
 * Provides typed, versioned schema and client communication for local pose estimation
 * using MediaPipe Pose (via local FastAPI backend at http://127.0.0.1:8000 or client fallback).
 *
 * Responsible Healthcare Guarantees:
 * 1. Zero external cloud transmissions — all processing runs locally on the device.
 * 2. Exploratory movement features only — strictly non-diagnostic.
 * 3. Never converts missing landmarks to zero measurements.
 * 4. Full manual observational checklist fallback when camera or ML model is unavailable.
 * 5. Clear distinction between:
 *    - not-started
 *    - processing
 *    - completed
 *    - insufficient-quality
 *    - failed
 *    - model-unavailable
 */

import type {
  MovementEvaluationResult,
  TechnicalQualityIndicators,
} from "../logic/movementFeatureEvaluation.ts";

export type GaitProcessingStatus =
  | "not-started"
  | "processing"
  | "completed"
  | "insufficient-quality"
  | "failed"
  | "model-unavailable";

export type InputQualityStatus = "good" | "fair" | "insufficient" | "unusable";

export type TriStateAnswer = boolean | "not-checked" | "unanswered";

export interface MovementFeature<T = number> {
  name: string;
  value: T | null;
  unit: string;
  isValid: boolean;
  isApproximation: boolean;
  confidence: number; // 0.0 - 1.0
  clinicalSignificance: string;
  reasonUnavailable?: string;
}

export interface ManualGaitObservations {
  visibleLimp: TriStateAnswer;
  hesitantSitToStand: TriStateAnswer;
  turningHesitancy: TriStateAnswer;
  audibleCrepitusReported: TriStateAnswer;
  notes: string;
}

export interface StructuredGaitAnalysisOutput {
  analysisId: string;
  recordId?: string;
  status: GaitProcessingStatus;
  analysisMethod: string;
  modelVersion: string;
  inputQualityStatus: InputQualityStatus;
  timestamp: number;
  durationSeconds: number;
  framesAnalyzed: number;
  usableFramesCount: number;
  meanLandmarkConfidence: number;
  technicalQuality?: TechnicalQualityIndicators;
  clinicallyValidatedMeasures?: string[];
  features: {
    cadence: MovementFeature<number>;
    stepSymmetry: MovementFeature<number>;
    activeKneeFlexionRange: MovementFeature<number>;
    coronalTrunkSway: MovementFeature<number>;
    [key: string]: MovementFeature<number>;
  };
  manualObservations?: ManualGaitObservations;
  limitations: string[];
  warnings: string[];
  disclaimer: string;
  errorCode?: string;
  errorMessage?: string;
}

export const DEFAULT_MANUAL_OBSERVATIONS: ManualGaitObservations = {
  visibleLimp: "unanswered",
  hesitantSitToStand: "unanswered",
  turningHesitancy: "unanswered",
  audibleCrepitusReported: "unanswered",
  notes: "",
};

export const DEFAULT_GAIT_ANALYSIS_STATE: StructuredGaitAnalysisOutput = {
  analysisId: "gait-pending",
  status: "not-started",
  analysisMethod: "mediapipe-pose-lite",
  modelVersion: "1.1.1",
  inputQualityStatus: "unusable",
  timestamp: 0,
  durationSeconds: 0,
  framesAnalyzed: 0,
  usableFramesCount: 0,
  meanLandmarkConfidence: 0,
  technicalQuality: {
    framesProcessed: 0,
    usableFramesCount: 0,
    usableFrameRatio: 0,
    durationSeconds: 0,
    personPresenceRatio: 0,
    meanLandmarkConfidence: 0,
    suitabilityStatus: "no-person-detected",
    suitabilityReasons: ["Movement analysis not started."],
    isSuitableForAnalysis: false,
  },
  clinicallyValidatedMeasures: [],
  features: {
    cadence: {
      name: "Step Cadence",
      value: null,
      unit: "steps/min",
      isValid: false,
      isApproximation: true,
      confidence: 0,
      clinicalSignificance: "Estimated steps per minute during steady walking.",
      reasonUnavailable: "Analysis has not been started.",
    },
    stepSymmetry: {
      name: "Bilateral Step Symmetry",
      value: null,
      unit: "index (0-1)",
      isValid: false,
      isApproximation: true,
      confidence: 0,
      clinicalSignificance: "Balance of left vs right step excursion. 1.0 represents symmetry.",
      reasonUnavailable: "Analysis has not been started.",
    },
    activeKneeFlexionRange: {
      name: "Active Knee Flexion Range",
      value: null,
      unit: "degrees",
      isValid: false,
      isApproximation: true,
      confidence: 0,
      clinicalSignificance: "Estimated peak knee flexion angle excursion during stride.",
      reasonUnavailable: "Analysis has not been started.",
    },
    coronalTrunkSway: {
      name: "Coronal Trunk Sway",
      value: null,
      unit: "degrees",
      isValid: false,
      isApproximation: true,
      confidence: 0,
      clinicalSignificance: "Standard deviation of lateral trunk tilt angle during walking.",
      reasonUnavailable: "Analysis has not been started.",
    },
  },
  manualObservations: { ...DEFAULT_MANUAL_OBSERVATIONS },
  limitations: [
    "2D monocular video projection does not substitute for 3D marker-based clinical gait analysis.",
    "Exploratory screening markers; not an OA diagnosis or cartilage integrity test.",
  ],
  warnings: [],
  disclaimer:
    "Exploratory movement features for clinician discussion only. Not clinically validated for osteoarthritis diagnosis, grading, or treatment decisions.",
};

const metaEnv = typeof import.meta !== "undefined" ? (import.meta as any).env : undefined;
const LOCAL_BACKEND_URL: string =
  metaEnv && metaEnv.VITE_GAIT_BACKEND_URL
    ? String(metaEnv.VITE_GAIT_BACKEND_URL)
    : "http://127.0.0.1:8000";

/**
 * Checks whether the optional local Python/FastAPI gait analysis backend is online.
 */
export async function checkGaitServiceHealth(): Promise<{
  isOnline: boolean;
  modelReady: boolean;
  message: string;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${LOCAL_BACKEND_URL}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        isOnline: true,
        modelReady: Boolean(data.modelReady),
        message: "Local gait analysis service online (MediaPipe Pose ready)",
      };
    }
  } catch {
    // Service offline
  }

  return {
    isOnline: false,
    modelReady: false,
    message: "Local gait backend offline (optional). Manual observational checklist active.",
  };
}

/**
 * Uploads a recorded video blob to the local backend pipeline for pose estimation.
 */
export async function analyzeGaitVideo(
  videoBlob: Blob,
  recordId?: string
): Promise<StructuredGaitAnalysisOutput> {
  try {
    const formData = new FormData();
    formData.append("file", videoBlob, "walking_clip.webm");
    if (recordId) {
      formData.append("recordId", recordId);
    }

    const res = await fetch(`${LOCAL_BACKEND_URL}/api/gait/analyze`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      return {
        ...DEFAULT_GAIT_ANALYSIS_STATE,
        status: "failed",
        errorCode: `HTTP_${res.status}`,
        errorMessage: `Server error: ${errorText || res.statusText}`,
      };
    }

    const data = (await res.json()) as StructuredGaitAnalysisOutput;
    return data;
  } catch (err) {
    const isNetworkErr = err instanceof TypeError || (err as any)?.name === "AbortError";
    return {
      ...DEFAULT_GAIT_ANALYSIS_STATE,
      status: "model-unavailable",
      errorCode: isNetworkErr ? "BACKEND_OFFLINE" : "CLIENT_ERROR",
      errorMessage:
        "Local Python backend is not reachable at http://127.0.0.1:8000. Start the backend with 'python backend/app.py' or use the manual observation checklist.",
    };
  }
}

/**
 * Loads a benchmark demonstration analysis for offline evaluation and testing without a camera.
 */
export async function getBenchmarkSampleAnalysis(
  recordId: string = "OS-BENCHMARK"
): Promise<StructuredGaitAnalysisOutput> {
  try {
    const res = await fetch(`${LOCAL_BACKEND_URL}/api/gait/sample-analysis?recordId=${encodeURIComponent(recordId)}`);
    if (res.ok) {
      return (await res.json()) as StructuredGaitAnalysisOutput;
    }
  } catch {
    // If backend is offline, return the validated static benchmark client-side
  }

  return {
    analysisId: "gait-benchmark-demo",
    recordId,
    status: "completed",
    analysisMethod: "mediapipe-pose-lite",
    modelVersion: "1.1.1",
    inputQualityStatus: "good",
    timestamp: Date.now(),
    durationSeconds: 5.4,
    framesAnalyzed: 64,
    usableFramesCount: 61,
    meanLandmarkConfidence: 0.88,
    technicalQuality: {
      framesProcessed: 64,
      usableFramesCount: 61,
      usableFrameRatio: 0.953,
      durationSeconds: 5.4,
      personPresenceRatio: 0.984,
      meanLandmarkConfidence: 0.88,
      suitabilityStatus: "suitable",
      suitabilityReasons: [],
      isSuitableForAnalysis: true,
    },
    clinicallyValidatedMeasures: [],
    features: {
      cadence: {
        name: "Step Cadence",
        value: 104.2,
        unit: "steps/min",
        isValid: true,
        isApproximation: true,
        confidence: 0.88,
        clinicalSignificance: "Estimated steps per minute during steady walking.",
      },
      stepSymmetry: {
        name: "Bilateral Step Symmetry",
        value: 0.92,
        unit: "index (0-1)",
        isValid: true,
        isApproximation: true,
        confidence: 0.85,
        clinicalSignificance: "Balance of left vs right step excursion. 1.0 represents symmetry.",
      },
      activeKneeFlexionRange: {
        name: "Active Knee Flexion Range",
        value: 52.4,
        unit: "degrees",
        isValid: true,
        isApproximation: true,
        confidence: 0.82,
        clinicalSignificance: "Estimated peak knee flexion angle excursion during stride.",
      },
      coronalTrunkSway: {
        name: "Coronal Trunk Sway",
        value: 3.8,
        unit: "degrees",
        isValid: true,
        isApproximation: true,
        confidence: 0.86,
        clinicalSignificance: "Standard deviation of lateral trunk tilt angle during walking.",
      },
    },
    limitations: [
      "2D monocular video projection does not substitute for 3D marker-based clinical gait analysis.",
      "Exploratory screening markers; not an OA diagnosis or cartilage integrity test.",
    ],
    warnings: [],
    disclaimer:
      "Exploratory movement features for clinician discussion only. Not clinically validated for osteoarthritis diagnosis, grading, or treatment decisions.",
  };
}

/**
 * Converts a pure, deterministic MovementEvaluationResult into the application's
 * StructuredGaitAnalysisOutput schema.
 */
export function convertMovementEvaluationToGaitOutput(
  evalResult: MovementEvaluationResult,
  recordId?: string,
  manualObservations?: ManualGaitObservations
): StructuredGaitAnalysisOutput {
  const q = evalResult.technicalQuality;

  let status: GaitProcessingStatus = "completed";
  if (q.suitabilityStatus === "invalid-timestamps") {
    status = "failed";
  } else if (!q.isSuitableForAnalysis) {
    status = "insufficient-quality";
  }

  let inputQualityStatus: InputQualityStatus = "unusable";
  if (q.suitabilityStatus === "suitable") {
    inputQualityStatus = "good";
  } else if (q.suitabilityStatus === "marginal") {
    inputQualityStatus = "fair";
  } else if (q.suitabilityStatus === "no-person-detected" || q.suitabilityStatus === "invalid-timestamps") {
    inputQualityStatus = "unusable";
  } else {
    inputQualityStatus = "insufficient";
  }

  return {
    analysisId: evalResult.evaluationId,
    recordId: recordId || "PARTICIPANT",
    status,
    analysisMethod: "mediapipe-pose-lite (client-side deterministic)",
    modelVersion: evalResult.pipelineVersion,
    inputQualityStatus,
    timestamp: evalResult.timestamp,
    durationSeconds: q.durationSeconds,
    framesAnalyzed: q.framesProcessed,
    usableFramesCount: q.usableFramesCount,
    meanLandmarkConfidence: q.meanLandmarkConfidence,
    technicalQuality: q,
    clinicallyValidatedMeasures: [],
    features: {
      cadence: {
        name: evalResult.features.cadence.name,
        value: evalResult.features.cadence.value,
        unit: evalResult.features.cadence.unit,
        isValid: evalResult.features.cadence.isValid,
        isApproximation: evalResult.features.cadence.isApproximation,
        confidence: evalResult.features.cadence.confidence,
        clinicalSignificance: evalResult.features.cadence.description,
        reasonUnavailable: evalResult.features.cadence.reasonUnavailable,
      },
      stepSymmetry: {
        name: evalResult.features.stepSymmetry.name,
        value: evalResult.features.stepSymmetry.value,
        unit: evalResult.features.stepSymmetry.unit,
        isValid: evalResult.features.stepSymmetry.isValid,
        isApproximation: evalResult.features.stepSymmetry.isApproximation,
        confidence: evalResult.features.stepSymmetry.confidence,
        clinicalSignificance: evalResult.features.stepSymmetry.description,
        reasonUnavailable: evalResult.features.stepSymmetry.reasonUnavailable,
      },
      activeKneeFlexionRange: {
        name: evalResult.features.activeKneeFlexionRange.name,
        value: evalResult.features.activeKneeFlexionRange.value,
        unit: evalResult.features.activeKneeFlexionRange.unit,
        isValid: evalResult.features.activeKneeFlexionRange.isValid,
        isApproximation: evalResult.features.activeKneeFlexionRange.isApproximation,
        confidence: evalResult.features.activeKneeFlexionRange.confidence,
        clinicalSignificance: evalResult.features.activeKneeFlexionRange.description,
        reasonUnavailable: evalResult.features.activeKneeFlexionRange.reasonUnavailable,
      },
      coronalTrunkSway: {
        name: evalResult.features.coronalTrunkSway.name,
        value: evalResult.features.coronalTrunkSway.value,
        unit: evalResult.features.coronalTrunkSway.unit,
        isValid: evalResult.features.coronalTrunkSway.isValid,
        isApproximation: evalResult.features.coronalTrunkSway.isApproximation,
        confidence: evalResult.features.coronalTrunkSway.confidence,
        clinicalSignificance: evalResult.features.coronalTrunkSway.description,
        reasonUnavailable: evalResult.features.coronalTrunkSway.reasonUnavailable,
      },
    },
    manualObservations: manualObservations || { ...DEFAULT_MANUAL_OBSERVATIONS },
    limitations: evalResult.limitations,
    warnings: evalResult.warnings,
    disclaimer: evalResult.clinicalDisclaimer,
    errorMessage: !q.isSuitableForAnalysis ? q.suitabilityReasons.join("; ") : undefined,
  };
}

export interface GaitStatusBannerOutput {
  status: string;
  statusNotice: string;
  captureCompleted: boolean;
  poseDataAvailable: boolean;
  metricsCalculated: string[];
  requiresClinicalReview: boolean;
}

/**
 * Backward-compatible helper for MovementCard banner status.
 */
export function getGaitAnalysisStatus(
  isCameraActive: boolean,
  pipelineResult?: StructuredGaitAnalysisOutput | null
): GaitStatusBannerOutput {
  if (pipelineResult && pipelineResult.status === "completed") {
    return {
      status: "completed",
      statusNotice: "Automated analysis completed. Review exploratory kinematic features below.",
      captureCompleted: true,
      poseDataAvailable: true,
      metricsCalculated: ["cadence", "stepSymmetry", "activeKneeFlexionRange", "coronalTrunkSway"],
      requiresClinicalReview: true,
    };
  }

  if (pipelineResult && pipelineResult.status === "processing") {
    return {
      status: "processing",
      statusNotice: "Processing video frames through MediaPipe Pose...",
      captureCompleted: false,
      poseDataAvailable: false,
      metricsCalculated: [],
      requiresClinicalReview: true,
    };
  }

  if (pipelineResult && pipelineResult.status === "insufficient-quality") {
    return {
      status: "insufficient-quality",
      statusNotice: "Input video quality was insufficient for reliable pose landmarks. Metrics withheld.",
      captureCompleted: true,
      poseDataAvailable: false,
      metricsCalculated: [],
      requiresClinicalReview: true,
    };
  }

  if (pipelineResult && pipelineResult.status === "failed") {
    return {
      status: "failed",
      statusNotice: pipelineResult.errorMessage || "Analysis failed. Please retry with clearer framing.",
      captureCompleted: false,
      poseDataAvailable: false,
      metricsCalculated: [],
      requiresClinicalReview: true,
    };
  }

  if (pipelineResult && pipelineResult.status === "model-unavailable") {
    return {
      status: "model-unavailable",
      statusNotice: "Gait analysis model offline. Manual observation checklist is fully operational.",
      captureCompleted: false,
      poseDataAvailable: false,
      metricsCalculated: [],
      requiresClinicalReview: true,
    };
  }

  if (isCameraActive) {
    return {
      status: "camera-preview-active",
      statusNotice: "Camera stream is rendered locally for visual reference only. No automated measurements are generated.",
      captureCompleted: false,
      poseDataAvailable: false,
      metricsCalculated: [],
      requiresClinicalReview: true,
    };
  }

  return {
    status: "not-connected",
    statusNotice: "Automated pose-estimation is not connected. Use the manual observation checklist below.",
    captureCompleted: false,
    poseDataAvailable: false,
    metricsCalculated: [],
    requiresClinicalReview: true,
  };
}
