import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHECKLIST_TASK_DEFINITIONS,
  evaluateSeatedKneeExtension,
  evaluateSeatedKneeFlexion,
  evaluateSitToStand,
  evaluateSupportedWeightShift,
  evaluateChecklistTask,
  generateChecklistSummary,
  type ChecklistTaskId,
  type ChecklistTaskEvaluation,
} from "../src/logic/movementChecklistEvaluation.ts";
import {
  validatePoseFrame,
  type RawLandmarkInput,
  type ValidatedPoseFrame,
} from "../src/logic/movementFeatureEvaluation.ts";

/**
 * Creates a synthetic frame with customizable landmark overrides.
 */
function createSyntheticFrame(
  frameIndex: number,
  timestampMs: number,
  overrides: Record<number, Partial<RawLandmarkInput> | undefined> = {}
): ValidatedPoseFrame {
  const raw: (RawLandmarkInput | undefined)[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0.0,
    visibility: 0.9,
  }));

  // Standard seated defaults
  raw[11] = { x: 0.45, y: 0.25, z: 0.0, visibility: 0.95 }; // L Shoulder
  raw[12] = { x: 0.55, y: 0.25, z: 0.0, visibility: 0.95 }; // R Shoulder
  raw[23] = { x: 0.46, y: 0.65, z: 0.0, visibility: 0.95 }; // L Hip
  raw[24] = { x: 0.54, y: 0.65, z: 0.0, visibility: 0.95 }; // R Hip
  raw[25] = { x: 0.46, y: 0.85, z: 0.0, visibility: 0.95 }; // L Knee (seated ~90 deg)
  raw[26] = { x: 0.54, y: 0.85, z: 0.0, visibility: 0.95 }; // R Knee
  raw[27] = { x: 0.46, y: 0.95, z: 0.0, visibility: 0.95 }; // L Ankle
  raw[28] = { x: 0.54, y: 0.95, z: 0.0, visibility: 0.95 }; // R Ankle

  for (const [idxStr, landmark] of Object.entries(overrides)) {
    const idx = Number(idxStr);
    if (landmark === undefined) {
      raw[idx] = undefined;
    } else {
      raw[idx] = {
        x: landmark.x ?? 0.5,
        y: landmark.y ?? 0.5,
        z: landmark.z ?? 0.0,
        visibility: landmark.visibility ?? 0.9,
      };
    }
  }

  return validatePoseFrame(raw, timestampMs, frameIndex);
}

describe("OA-Sathi Movement Checklist - Task Definitions", () => {
  it("defines all 4 requested movement checklist tasks with safety guidance", () => {
    const expectedTasks: ChecklistTaskId[] = [
      "seated-knee-extension",
      "seated-knee-flexion",
      "sit-to-stand",
      "supported-weight-shift",
    ];

    for (const taskId of expectedTasks) {
      const def = CHECKLIST_TASK_DEFINITIONS[taskId];
      assert.ok(def, `Task definition missing for ${taskId}`);
      assert.equal(def.id, taskId);
      assert.ok(def.title.length > 0);
      assert.ok(def.shortInstructions.length > 0);
      assert.ok(def.detailedGuidance.length >= 2);
      assert.ok(def.requiredLandmarks.length >= 2);
      assert.ok(def.recommendedDurationSec >= 4);
    }

    // Safety notices specifically for transfer and standing tasks
    assert.ok(CHECKLIST_TASK_DEFINITIONS["sit-to-stand"].safetyNotice?.toLowerCase().includes("optional"));
    assert.ok(CHECKLIST_TASK_DEFINITIONS["supported-weight-shift"].safetyNotice?.toLowerCase().includes("optional"));
  });
});

describe("OA-Sathi Movement Checklist - Seated Knee Extension Evaluation", () => {
  it("detects knee extension movement when knee angle increases significantly", () => {
    const frames: ValidatedPoseFrame[] = [];
    // 30 frames over 3 seconds (10 fps)
    // Seated posture: Hip is at (0.40, 0.65), Knee is at (0.55, 0.65)
    // Resting ankle is at (0.55, 0.90) -> 90 degree angle
    // Extending ankle moves forward to (0.75, 0.65) -> 180 degree angle
    for (let i = 0; i < 30; i++) {
      const t = Math.min(1, i / 15);
      const ankleX = 0.55 + 0.20 * Math.sin((t * Math.PI) / 2);
      const ankleY = 0.90 - 0.25 * Math.sin((t * Math.PI) / 2);

      frames.push(
        createSyntheticFrame(i, i * 100, {
          23: { x: 0.40, y: 0.65, visibility: 0.95 },
          25: { x: 0.55, y: 0.65, visibility: 0.95 },
          27: { x: 0.55, y: 0.90, visibility: 0.95 }, // resting left
          24: { x: 0.40, y: 0.65, visibility: 0.95 },
          26: { x: 0.55, y: 0.65, visibility: 0.95 },
          28: { x: ankleX, y: ankleY, visibility: 0.95 }, // extending right
        })
      );
    }

    const evalResult = evaluateSeatedKneeExtension(frames);
    assert.equal(evalResult.status, "completed");
    assert.equal(evalResult.outcomeLabel, "Movement detected");
    assert.ok(evalResult.observableMetrics?.angleExcursionDeg! > 20);
    assert.equal(evalResult.observableMetrics?.activeSide, "right");
    assert.ok(evalResult.feedbackSummary.includes("Movement detected"));
    assert.equal(evalResult.trackingQuality.qualityStatus, "good");
  });

  it("returns 'try-again' when knee remains stationary during recording", () => {
    const frames: ValidatedPoseFrame[] = [];
    for (let i = 0; i < 25; i++) {
      frames.push(
        createSyntheticFrame(i, i * 100, {
          24: { x: 0.40, y: 0.65, visibility: 0.95 },
          26: { x: 0.55, y: 0.65, visibility: 0.95 },
          28: { x: 0.55, y: 0.90, visibility: 0.95 }, // stationary foot
        })
      );
    }

    const evalResult = evaluateSeatedKneeExtension(frames);
    assert.equal(evalResult.status, "try-again");
    assert.equal(evalResult.outcomeLabel, "Movement not clearly detected");
    assert.ok(evalResult.observableMetrics?.angleExcursionDeg! < 18);
  });

  it("returns 'unable-to-evaluate' when tracking quality is poor or landmarks are occluded", () => {
    const frames: ValidatedPoseFrame[] = [];
    for (let i = 0; i < 20; i++) {
      // Occluded knees and ankles (low visibility)
      frames.push(
        createSyntheticFrame(i, i * 100, {
          25: { x: 0.46, y: 0.85, visibility: 0.15 },
          26: { x: 0.54, y: 0.85, visibility: 0.10 },
          27: { x: 0.46, y: 0.95, visibility: 0.05 },
          28: { x: 0.54, y: 0.95, visibility: 0.08 },
        })
      );
    }

    const evalResult = evaluateSeatedKneeExtension(frames);
    assert.equal(evalResult.status, "unable-to-evaluate");
    assert.equal(evalResult.outcomeLabel, "Unable to evaluate");
    assert.ok(evalResult.feedbackSummary.includes("visible enough"));
    assert.ok(evalResult.trackingQuality.warning !== undefined);
  });
});

describe("OA-Sathi Movement Checklist - Seated Knee Flexion Evaluation", () => {
  it("detects knee flexion when starting from extended position and bending backwards", () => {
    const frames: ValidatedPoseFrame[] = [];
    // Start with knee extended forward (ankle at (0.75, 0.65)), then bend back toward chair (ankle at (0.50, 0.88))
    for (let i = 0; i < 30; i++) {
      const progress = Math.min(1, i / 20);
      const ankleX = 0.75 - 0.25 * progress;
      const ankleY = 0.65 + 0.23 * progress;

      frames.push(
        createSyntheticFrame(i, i * 100, {
          24: { x: 0.40, y: 0.65, visibility: 0.95 },
          26: { x: 0.55, y: 0.65, visibility: 0.95 },
          28: { x: ankleX, y: ankleY, visibility: 0.95 },
        })
      );
    }

    const evalResult = evaluateSeatedKneeFlexion(frames);
    assert.equal(evalResult.status, "completed");
    assert.equal(evalResult.outcomeLabel, "Movement detected");
    assert.ok(evalResult.observableMetrics?.angleExcursionDeg! > 18);
  });

  it("returns 'try-again' when knee flexion angle change is minimal", () => {
    const frames: ValidatedPoseFrame[] = [];
    for (let i = 0; i < 20; i++) {
      frames.push(createSyntheticFrame(i, i * 100));
    }

    const evalResult = evaluateSeatedKneeFlexion(frames);
    assert.equal(evalResult.status, "try-again");
    assert.equal(evalResult.outcomeLabel, "Movement not clearly detected");
  });
});

describe("OA-Sathi Movement Checklist - Sit-to-Stand Evaluation", () => {
  it("detects sit-to-stand transition when hips rise and knees straighten", () => {
    const frames: ValidatedPoseFrame[] = [];
    // 40 frames: sitting (hip Y=0.68) -> standing up (hip Y=0.42)
    for (let i = 0; i < 40; i++) {
      const t = Math.min(1, i / 25);
      const hipY = 0.68 - 0.26 * t;
      const shoulderY = 0.35 - 0.22 * t;
      // In standing, ankle is directly below knee and knee is extended
      const kneeY = 0.78 - 0.12 * t;
      const ankleY = 0.96;

      frames.push(
        createSyntheticFrame(i, i * 100, {
          11: { x: 0.46, y: shoulderY, visibility: 0.95 },
          12: { x: 0.54, y: shoulderY, visibility: 0.95 },
          23: { x: 0.46, y: hipY, visibility: 0.95 },
          24: { x: 0.54, y: hipY, visibility: 0.95 },
          25: { x: 0.46, y: kneeY, visibility: 0.95 },
          26: { x: 0.54, y: kneeY, visibility: 0.95 },
          27: { x: 0.46, y: ankleY, visibility: 0.95 },
          28: { x: 0.54, y: ankleY, visibility: 0.95 },
        })
      );
    }

    const evalResult = evaluateSitToStand(frames);
    assert.equal(evalResult.status, "completed");
    assert.equal(evalResult.outcomeLabel, "Movement detected");
    assert.ok(evalResult.observableMetrics?.verticalDisplacementNorm! > 0.12);
    assert.ok(evalResult.feedbackSummary.includes("transition observed"));
  });

  it("returns 'try-again' when patient stays seated without rising", () => {
    const frames: ValidatedPoseFrame[] = [];
    for (let i = 0; i < 30; i++) {
      frames.push(createSyntheticFrame(i, i * 100));
    }

    const evalResult = evaluateSitToStand(frames);
    assert.equal(evalResult.status, "try-again");
    assert.equal(evalResult.outcomeLabel, "Movement not clearly detected");
    assert.ok(evalResult.feedbackSummary.includes("Movement not clearly detected"));
  });

  it("returns 'unable-to-evaluate' when lower extremities are cropped out of frame", () => {
    const frames: ValidatedPoseFrame[] = [];
    for (let i = 0; i < 20; i++) {
      // Lower body missing
      frames.push(
        createSyntheticFrame(i, i * 100, {
          25: undefined,
          26: undefined,
          27: undefined,
          28: undefined,
        })
      );
    }

    const evalResult = evaluateSitToStand(frames);
    assert.equal(evalResult.status, "unable-to-evaluate");
    assert.equal(evalResult.outcomeLabel, "Unable to evaluate");
    assert.ok(evalResult.feedbackSummary.includes("visible enough"));
  });
});

describe("OA-Sathi Movement Checklist - Supported Standing Weight Shift", () => {
  it("detects lateral pelvic sway and explicitly discloses monocular force limitation", () => {
    const frames: ValidatedPoseFrame[] = [];
    // Standing pose with lateral shift left and right:
    // Hip X swings between 0.46 and 0.54 (+/- 0.05 from center)
    for (let i = 0; i < 30; i++) {
      const phase = (i / 15) * Math.PI * 2;
      const swayX = 0.05 * Math.sin(phase);

      frames.push(
        createSyntheticFrame(i, i * 100, {
          11: { x: 0.46 + swayX * 0.5, y: 0.20, visibility: 0.95 },
          12: { x: 0.54 + swayX * 0.5, y: 0.20, visibility: 0.95 },
          23: { x: 0.46 + swayX, y: 0.50, visibility: 0.95 },
          24: { x: 0.54 + swayX, y: 0.50, visibility: 0.95 },
          25: { x: 0.46, y: 0.72, visibility: 0.95 },
          26: { x: 0.54, y: 0.72, visibility: 0.95 },
          27: { x: 0.46, y: 0.95, visibility: 0.95 },
          28: { x: 0.54, y: 0.95, visibility: 0.95 },
        })
      );
    }

    const evalResult = evaluateSupportedWeightShift(frames);
    assert.equal(evalResult.status, "completed");
    assert.equal(evalResult.outcomeLabel, "Movement detected");
    assert.ok(evalResult.observableMetrics?.lateralDisplacementNorm! >= 0.035);

    // CRITICAL: Must explicitly disclose that 2D camera cannot measure ground reaction force
    assert.ok(
      evalResult.limitations.some((lim) => lim.toLowerCase().includes("force")),
      "Must state limitation that RGB camera cannot measure ground reaction force"
    );
    assert.ok(evalResult.disclaimer.includes("non-diagnostic"));
  });

  it("returns 'try-again' when lateral displacement is too small", () => {
    const frames: ValidatedPoseFrame[] = [];
    for (let i = 0; i < 25; i++) {
      // Standing perfectly still without sway
      frames.push(
        createSyntheticFrame(i, i * 100, {
          23: { x: 0.46, y: 0.50, visibility: 0.95 },
          24: { x: 0.54, y: 0.50, visibility: 0.95 },
          25: { x: 0.46, y: 0.72, visibility: 0.95 },
          26: { x: 0.54, y: 0.72, visibility: 0.95 },
          27: { x: 0.46, y: 0.95, visibility: 0.95 },
          28: { x: 0.54, y: 0.95, visibility: 0.95 },
        })
      );
    }

    const evalResult = evaluateSupportedWeightShift(frames);
    assert.equal(evalResult.status, "try-again");
    assert.equal(evalResult.outcomeLabel, "Movement not clearly detected");
  });
});

describe("OA-Sathi Movement Checklist - Dispatcher and Aggregated Summary", () => {
  it("dispatches to the correct evaluation handler via evaluateChecklistTask", () => {
    const frames: ValidatedPoseFrame[] = [createSyntheticFrame(0, 0)];
    const result1 = evaluateChecklistTask("seated-knee-extension", frames);
    assert.equal(result1.taskId, "seated-knee-extension");

    const result2 = evaluateChecklistTask("sit-to-stand", frames);
    assert.equal(result2.taskId, "sit-to-stand");
  });

  it("correctly calculates checklist summary metrics and flags warnings", () => {
    const mockCompleted: ChecklistTaskEvaluation = {
      taskId: "seated-knee-extension",
      status: "completed",
      outcomeLabel: "Movement detected",
      feedbackSummary: "Good movement",
      trackingQuality: { totalFrames: 30, usableFrames: 30, meanConfidence: 0.92, qualityStatus: "good" },
      limitations: [],
      disclaimer: "Non-diagnostic",
      evaluatedAt: Date.now(),
    };

    const mockTryAgain: ChecklistTaskEvaluation = {
      taskId: "seated-knee-flexion",
      status: "try-again",
      outcomeLabel: "Movement not clearly detected",
      feedbackSummary: "Try again",
      trackingQuality: { totalFrames: 30, usableFrames: 28, meanConfidence: 0.88, qualityStatus: "good" },
      limitations: [],
      disclaimer: "Non-diagnostic",
      evaluatedAt: Date.now(),
    };

    const mockUnable: ChecklistTaskEvaluation = {
      taskId: "sit-to-stand",
      status: "unable-to-evaluate",
      outcomeLabel: "Unable to evaluate",
      feedbackSummary: "Occluded",
      trackingQuality: {
        totalFrames: 20,
        usableFrames: 5,
        meanConfidence: 0.35,
        qualityStatus: "insufficient",
        warning: "Camera tracking confidence was too low. Please reposition the camera.",
      },
      limitations: [],
      disclaimer: "Non-diagnostic",
      evaluatedAt: Date.now(),
    };

    const summary = generateChecklistSummary({
      "seated-knee-extension": mockCompleted,
      "seated-knee-flexion": mockTryAgain,
      "sit-to-stand": mockUnable,
      "supported-weight-shift": null,
    });

    assert.equal(summary.totalTasks, 4);
    assert.equal(summary.completedCount, 1);
    assert.equal(summary.tryAgainCount, 1);
    assert.equal(summary.unableCount, 1);
    assert.equal(summary.notStartedCount, 1);
    assert.equal(summary.allAttempted, false);
    assert.equal(summary.warnings.length, 1);
    assert.ok(summary.warnings[0].includes("Camera tracking confidence was too low"));
  });
});
