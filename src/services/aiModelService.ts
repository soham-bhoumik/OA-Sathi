/**
 * OA-Sathi AI Model Integration Service Boundary
 *
 * This module defines the architectural boundary for future validated machine-learning
 * / deep-learning inference models (e.g., local WebAssembly / ONNX Runtime Web).
 *
 * CURRENT STATUS: NOT CONNECTED (Rules-based heuristic screening active).
 *
 * Responsible Healthcare Guarantees:
 * 1. No simulated or fabricated AI inferences.
 * 2. Transparent distinction between rules-based summaries and machine-learning scores.
 * 3. Zero transmission of participant health records to third-party or paid external APIs.
 * 4. Local browser execution boundary.
 */

export type AIModelStatus =
  | "not-connected"
  | "initializing"
  | "ready"
  | "inference-error"
  | "disabled";

export interface AIModelMetadata {
  readonly modelName: string;
  readonly modelVersion: string;
  readonly status: AIModelStatus;
  readonly statusLabel: string;
  readonly statusDescription: string;
  readonly inferenceEngine: "deterministic-rules-engine" | "onnx-runtime-web-local" | "edge-service";
  readonly isClinicallyValidated: boolean;
  readonly privacyNotice: string;
}

export interface ModelInferenceInput {
  age: number;
  joint: string;
  district: string;
  painDuration: string;
  painScore: number;
  stiffnessDuration: string;
  mobilityImpact: string;
  previousInjury: boolean | "not-checked" | "unanswered";
  familyHistory: boolean | "not-checked" | "unanswered";
  repeatedLoad: boolean | "not-checked" | "unanswered";
  heightCm?: number | null;
  weightKg?: number | null;
}

export interface ModelInferenceOutput {
  readonly modelConnected: false;
  readonly status: AIModelStatus;
  readonly message: string;
  readonly disclaimer: string;
}

export const AI_MODEL_METADATA: AIModelMetadata = {
  modelName: "OA-Sathi Clinical Marker Inference Model (Future)",
  modelVersion: "0.0.0-unconnected",
  status: "not-connected",
  statusLabel: "AI model not connected",
  statusDescription:
    "A machine-learning model is not currently running. Screening relies on a transparent, deterministic rules-based heuristic.",
  inferenceEngine: "deterministic-rules-engine",
  isClinicallyValidated: false,
  privacyNotice: "Zero participant data leaves the local browser session.",
};

/**
 * Returns current metadata and connectivity status of the AI inference subsystem.
 */
export function getAIModelMetadata(): AIModelMetadata {
  return { ...AI_MODEL_METADATA };
}

/**
 * Service stub for future local edge / WASM inference.
 * Explicitly rejects data fabrication and informs caller that heuristics are active.
 */
export async function runAIModelInference(
  _input: ModelInferenceInput
): Promise<ModelInferenceOutput> {
  return {
    modelConnected: false,
    status: "not-connected",
    message: "Automated AI model is not connected. Deterministic rules-based summary is active.",
    disclaimer:
      "This prototype does not generate synthetic ML probabilities or fake AI confidence scores.",
  };
}
