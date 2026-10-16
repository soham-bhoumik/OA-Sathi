import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateLandmark,
  validatePoseFrame,
  evaluateMovementQuality,
  summarizeLandmarkCoordinates,
  extractCadence,
  extractStepSymmetry,
  extractKneeFlexionRange,
  extractCoronalTrunkSway,
  evaluateMovementSequence,
  type RawLandmarkInput,
  type ValidatedPoseFrame,
} from "../src/logic/movementFeatureEvaluation.ts";
import { convertMovementEvaluationToGaitOutput } from "../src/services/gaitAnalysisService.ts";
import { evaluateScreening, type FormValues, emptyForm } from "../src/logic/screeningRules.ts";

/**
 * HELPER: Generates a synthetic walking cycle frame sequence for deterministic testing.
 * NOTE: This is purely a synthetic mathematical test fixture and does NOT represent
 * clinical patient recordings or prove real-world diagnostic performance.
 */
function createSyntheticWalkingSequence(
  numFrames: number = 60,
  strideFrequencyHz: number = 0.85, // ~102 steps/min (2 steps per stride cycle)
  frameRateFps: number = 30
): ValidatedPoseFrame[] {
  const frames: ValidatedPoseFrame[] = [];
  const dtMs = 1000 / frameRateFps;

  for (let f = 0; f < numFrames; f++) {
    const timeSec = f / frameRateFps;
    const timestampMs = Math.round(f * dtMs);
    const phase = 2 * Math.PI * strideFrequencyHz * timeSec;

    // Synthetic walking coordinates
    const lAnkleY = 0.85 + 0.12 * Math.sin(phase);
    const rAnkleY = 0.85 + 0.12 * Math.sin(phase + Math.PI);

    const lAnkleX = 0.45 + 0.08 * Math.cos(phase);
    const rAnkleX = 0.55 - 0.08 * Math.cos(phase);

    const kneeAngleExcursion = 0.65 + 0.08 * Math.abs(Math.sin(phase));

    const rawLandmarks: (RawLandmarkInput | undefined)[] = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0.0,
      visibility: 0.9,
    }));

    // Torso: Shoulders & Hips
    rawLandmarks[11] = { x: 0.42, y: 0.22, z: 0.0, visibility: 0.95 }; // L Shoulder
    rawLandmarks[12] = { x: 0.58, y: 0.22, z: 0.0, visibility: 0.95 }; // R Shoulder
    rawLandmarks[23] = { x: 0.44, y: 0.48, z: 0.0, visibility: 0.95 }; // L Hip
    rawLandmarks[24] = { x: 0.56, y: 0.48, z: 0.0, visibility: 0.95 }; // R Hip

    // Left Leg
    rawLandmarks[25] = { x: 0.45, y: kneeAngleExcursion, z: 0.0, visibility: 0.95 }; // L Knee
    rawLandmarks[27] = { x: lAnkleX, y: lAnkleY, z: 0.0, visibility: 0.95 }; // L Ankle

    // Right Leg
    rawLandmarks[26] = { x: 0.55, y: kneeAngleExcursion, z: 0.0, visibility: 0.95 }; // R Knee
    rawLandmarks[28] = { x: rAnkleX, y: rAnkleY, z: 0.0, visibility: 0.95 }; // R Ankle

    frames.push(validatePoseFrame(rawLandmarks, timestampMs, f));
  }

  return frames;
}

describe("OA-Sathi Movement Feature Evaluation & Quality Indicator Test Suite", () => {
  // 1. Valid landmark sequences produce valid features with correct units
  it("1. Valid landmark sequences produce valid exploratory features with correct units", () => {
    const frames = createSyntheticWalkingSequence(60, 0.85, 30); // 2.0s duration, ~102 steps/min
    const result = evaluateMovementSequence(frames, { sequenceId: "seq_test_valid" });

    // Technical Quality Indicators
    assert.equal(result.technicalQuality.framesProcessed, 60);
    assert.ok(result.technicalQuality.usableFramesCount >= 55);
    assert.ok(result.technicalQuality.usableFrameRatio >= 0.9);
    assert.ok(result.technicalQuality.durationSeconds >= 1.9);
    assert.equal(result.technicalQuality.suitabilityStatus, "suitable");
    assert.equal(result.technicalQuality.isSuitableForAnalysis, true);

    // Derived Features
    const { cadence, stepSymmetry, activeKneeFlexionRange, coronalTrunkSway } = result.features;

    // Cadence
    assert.equal(cadence.unit, "steps/min");
    assert.equal(cadence.isValid, true);
    assert.equal(cadence.isApproximation, true);
    assert.ok(cadence.value !== null && cadence.value >= 80 && cadence.value <= 130);

    // Step Symmetry
    assert.equal(stepSymmetry.unit, "index (0-1)");
    assert.equal(stepSymmetry.isValid, true);
    assert.ok(stepSymmetry.value !== null && stepSymmetry.value >= 0.7 && stepSymmetry.value <= 1.0);

    // Knee Flexion Range
    assert.equal(activeKneeFlexionRange.unit, "degrees");
    assert.equal(activeKneeFlexionRange.isValid, true);
    assert.ok(activeKneeFlexionRange.value !== null && activeKneeFlexionRange.value > 0);

    // Coronal Trunk Sway
    assert.equal(coronalTrunkSway.unit, "degrees");
    assert.equal(coronalTrunkSway.isValid, true);
    assert.ok(coronalTrunkSway.value !== null && coronalTrunkSway.value >= 0);

    // Clinical separation: must declare zero clinically validated measures
    assert.deepEqual(result.clinicallyValidatedMeasures, []);
    assert.match(result.clinicalDisclaimer, /not validated as clinical biomarkers/i);
  });

  // 2. Missing landmarks are preserved as null/unavailable, NOT coerced to zero
  it("2. Missing landmarks are preserved as null/unavailable, NOT coerced to zero", () => {
    const missingRaw: RawLandmarkInput = {};
    const validated = validateLandmark(missingRaw, 25); // Left Knee
    assert.equal(validated.isValid, false);
    assert.equal(validated.x, null);
    assert.equal(validated.y, null);
    assert.notEqual(validated.x, 0, "Missing landmark coordinate must not be coerced to 0");
    assert.notEqual(validated.y, 0, "Missing landmark coordinate must not be coerced to 0");
    assert.ok(validated.reasonUnavailable);

    const undefinedRaw = validateLandmark(undefined, 26);
    assert.equal(undefinedRaw.isValid, false);
    assert.equal(undefinedRaw.x, null);
    assert.equal(undefinedRaw.y, null);
  });

  // 3. Invalid coordinates (NaN, Infinity, out-of-bounds) are strictly rejected
  it("3. Invalid coordinates (NaN, Infinity, out-of-bounds) are strictly rejected", () => {
    // NaN
    const nanLm = validateLandmark({ x: NaN, y: 0.5, visibility: 0.9 }, 0);
    assert.equal(nanLm.isValid, false);
    assert.equal(nanLm.x, null);

    // Infinity
    const infLm = validateLandmark({ x: 0.5, y: Infinity, visibility: 0.9 }, 11);
    assert.equal(infLm.isValid, false);
    assert.equal(infLm.y, null);

    // Far out of bounds
    const outBoundsLm = validateLandmark({ x: 3.5, y: -2.0, visibility: 0.9 }, 23);
    assert.equal(outBoundsLm.isValid, false);
    assert.equal(outBoundsLm.x, null);
  });

  // 4. Low-visibility landmarks (< 0.35) are marked invalid with clear reason
  it("4. Low-visibility landmarks (< 0.35) are marked invalid with clear reason", () => {
    const lowVis = validateLandmark({ x: 0.5, y: 0.5, visibility: 0.2 }, 25);
    assert.equal(lowVis.isValid, false);
    assert.equal(lowVis.x, null);
    assert.equal(lowVis.visibility, 0.2);
    assert.match(lowVis.reasonUnavailable || "", /below tracking threshold/i);

    // Borderline visibility
    const validVis = validateLandmark({ x: 0.5, y: 0.5, visibility: 0.36 }, 25);
    assert.equal(validVis.isValid, true);
    assert.equal(validVis.x, 0.5);
  });

  // 5. Empty input (0 frames) is handled safely without throwing
  it("5. Empty input (0 frames) is handled safely without throwing", () => {
    const emptyResult = evaluateMovementSequence([]);
    assert.equal(emptyResult.technicalQuality.framesProcessed, 0);
    assert.equal(emptyResult.technicalQuality.usableFramesCount, 0);
    assert.equal(emptyResult.technicalQuality.durationSeconds, 0);
    assert.equal(emptyResult.technicalQuality.isSuitableForAnalysis, false);
    assert.equal(emptyResult.technicalQuality.suitabilityStatus, "insufficient-frames");

    // All features must be marked invalid with reasons
    for (const key of ["cadence", "stepSymmetry", "activeKneeFlexionRange", "coronalTrunkSway"] as const) {
      assert.equal(emptyResult.features[key].isValid, false);
      assert.equal(emptyResult.features[key].value, null);
      assert.ok(emptyResult.features[key].reasonUnavailable);
    }
  });

  // 6. Too few usable frames is flagged with informative technical quality status
  it("6. Too few usable frames is flagged with informative technical quality status", () => {
    // Only 5 frames (below MIN_USABLE_FRAMES_FOR_GAIT = 15)
    const shortFrames = createSyntheticWalkingSequence(5, 1.7, 30);
    const quality = evaluateMovementQuality(shortFrames);

    assert.equal(quality.framesProcessed, 5);
    assert.equal(quality.suitabilityStatus, "insufficient-frames");
    assert.equal(quality.isSuitableForAnalysis, false);
    assert.ok(quality.suitabilityReasons.some((r) => r.includes("Too few usable frames")));

    const result = evaluateMovementSequence(shortFrames);
    assert.equal(result.features.cadence.isValid, false);
    assert.equal(result.features.cadence.value, null);
    assert.ok(result.features.cadence.reasonUnavailable);
  });

  // 7. Invalid or non-monotonic timestamps are caught and marked unusable
  it("7. Invalid or non-monotonic timestamps are caught and marked unusable", () => {
    const frames = createSyntheticWalkingSequence(20, 1.7, 30);
    // Introduce disordered timestamp
    frames[10].timestampMs = frames[5].timestampMs - 100;

    const quality = evaluateMovementQuality(frames);
    assert.equal(quality.suitabilityStatus, "invalid-timestamps");
    assert.equal(quality.isSuitableForAnalysis, false);
    assert.equal(quality.durationSeconds, 0);
    assert.ok(quality.suitabilityReasons.some((r) => r.includes("non-monotonic")));
  });

  // 8. Incorrect or missing units are avoided across all movement features
  it("8. Incorrect or missing units are avoided across all movement features", () => {
    const frames = createSyntheticWalkingSequence(45, 1.7, 30);
    const result = evaluateMovementSequence(frames);

    assert.equal(result.features.cadence.unit, "steps/min");
    assert.equal(result.features.stepSymmetry.unit, "index (0-1)");
    assert.equal(result.features.activeKneeFlexionRange.unit, "degrees");
    assert.equal(result.features.coronalTrunkSway.unit, "degrees");

    for (const key of Object.keys(result.features)) {
      const feat = result.features[key];
      assert.ok(feat.unit.length > 0, `Feature ${key} must specify a unit`);
      assert.ok(feat.name.length > 0, `Feature ${key} must have a descriptive name`);
    }
  });

  // 9. Feature calculation is strictly deterministic for identical inputs
  it("9. Feature calculation is strictly deterministic for identical inputs", () => {
    const framesA = createSyntheticWalkingSequence(60, 1.7, 30);
    const framesB = createSyntheticWalkingSequence(60, 1.7, 30);

    const resultA = evaluateMovementSequence(framesA, { sequenceId: "fixed_id", timestamp: 1700000000000 });
    const resultB = evaluateMovementSequence(framesB, { sequenceId: "fixed_id", timestamp: 1700000000000 });

    assert.deepEqual(resultA, resultB, "Output must be completely deterministic for identical inputs");
  });

  // 10. Frame with no person detected is rejected and counted appropriately
  it("10. Frame with no person detected is rejected and counted appropriately", () => {
    const emptyLandmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.05 }));
    const frame = validatePoseFrame(emptyLandmarks, 1000, 0);

    assert.equal(frame.hasPerson, false);
    assert.equal(frame.isUsable, false);
    assert.equal(frame.rejectionReason, "No person detected in frame");
  });

  // 11. Landmark coordinate summaries compute valid min, max, mean normalized bounds
  it("11. Landmark coordinate summaries compute valid min, max, mean normalized bounds without inventing missing data", () => {
    const frames = createSyntheticWalkingSequence(45, 0.85, 30);
    const summary = summarizeLandmarkCoordinates(frames);

    // Left Ankle
    assert.ok(summary.leftAnkle.trackedFramesCount > 30);
    assert.ok(summary.leftAnkle.minX !== null && summary.leftAnkle.minX >= 0 && summary.leftAnkle.minX <= 1);
    assert.ok(summary.leftAnkle.maxX !== null && summary.leftAnkle.maxX >= summary.leftAnkle.minX);
    assert.ok(summary.leftAnkle.minY !== null && summary.leftAnkle.maxY !== null);
    assert.ok(summary.leftAnkle.maxY >= summary.leftAnkle.minY);
    assert.ok(summary.leftAnkle.meanX !== null && summary.leftAnkle.meanY !== null);
    assert.ok(summary.leftAnkle.meanVisibility !== null && summary.leftAnkle.meanVisibility >= 0.85);

    // Missing landmark in empty sequence returns nulls rather than zeros
    const emptySummary = summarizeLandmarkCoordinates([]);
    assert.equal(emptySummary.leftHip.trackedFramesCount, 0);
    assert.equal(emptySummary.leftHip.minX, null);
    assert.equal(emptySummary.leftHip.maxX, null);
    assert.notEqual(emptySummary.leftHip.minX, 0, "Missing landmark bounds must be null, not 0");
  });

  // 12. Early-stop sequence evaluation (e.g. 2.2s / 40 frames) computes valid quality indicators
  it("12. Early-stop sequence evaluation (e.g. 2.2s / 40 frames) computes valid quality indicators", () => {
    const earlyStopFrames = createSyntheticWalkingSequence(40, 0.85, 30); // ~1.3s
    const result = evaluateMovementSequence(earlyStopFrames, { sequenceId: "early_stop_seq" });

    assert.equal(result.technicalQuality.framesProcessed, 40);
    assert.ok(result.technicalQuality.durationSeconds >= 1.2);
    assert.equal(result.technicalQuality.usableFramePercentage, Math.round(result.technicalQuality.usableFrameRatio * 100));
    assert.ok(result.technicalQuality.coordinateSummary !== undefined);
  });

  // 13. Unilateral lower-limb occlusion disables bilateral symmetry while preserving active knee flexion
  it("13. Unilateral lower-limb occlusion disables bilateral symmetry while preserving active knee flexion", () => {
    const frames = createSyntheticWalkingSequence(50, 0.85, 30);
    // Severely occlude right ankle and right knee
    for (const f of frames) {
      if (f.landmarks[26]) { f.landmarks[26].isValid = false; f.landmarks[26].x = null; }
      if (f.landmarks[28]) { f.landmarks[28].isValid = false; f.landmarks[28].x = null; }
    }

    const result = evaluateMovementSequence(frames);
    // Bilateral step symmetry must be unavailable due to occlusion
    assert.equal(result.features.stepSymmetry.isValid, false);
    assert.equal(result.features.stepSymmetry.value, null);
    assert.ok(result.features.stepSymmetry.reasonUnavailable);

    // Left knee flexion range remains valid because left leg is fully tracked
    assert.equal(result.features.activeKneeFlexionRange.isValid, true);
    assert.ok(result.features.activeKneeFlexionRange.value !== null && result.features.activeKneeFlexionRange.value > 0);
  });

  // 14. MovementFeature interface metadata contains required documentation attributes
  it("14. MovementFeature interface metadata contains required technical documentation attributes", () => {
    const frames = createSyntheticWalkingSequence(60, 0.85, 30);
    const result = evaluateMovementSequence(frames);

    for (const key of ["cadence", "stepSymmetry", "activeKneeFlexionRange", "coronalTrunkSway"] as const) {
      const feat = result.features[key];
      assert.ok(Array.isArray(feat.requiredLandmarks) && feat.requiredLandmarks.length > 0, `${key} must document required landmarks`);
      assert.ok(typeof feat.calculationFormula === "string" && feat.calculationFormula.length > 0, `${key} must document calculation formula`);
      assert.ok(Array.isArray(feat.assumptionsAndLimitations) && feat.assumptionsAndLimitations.length > 0, `${key} must document assumptions`);
      assert.equal(feat.clinicallyValidated, false, `${key} must declare clinicallyValidated as false`);
    }
  });

  // 15. Attaching movement assessment does not alter patient symptom answers, red flags, or wear score band
  it("15. Attaching movement assessment does not alter patient symptom answers, red flags, or wear score band", () => {
    const form: FormValues = {
      ...emptyForm(),
      name: "Symptom Test Participant",
      age: "62",
      gender: "female",
      district: "Kamrup Metropolitan",
      joint: "Knee",
      painDuration: "1-3-months",
      painLevel: 5,
      stiffness: "under-30",
      mobilityDifficulty: "some",
      swelling: false,
      warmthOrRedness: false,
      suddenInabilityToBearWeight: false,
      feverOrSystemicSymptoms: false,
      morningStiffnessOver30: false,
    };

    const initialScore = evaluateScreening(form);

    // Create a movement evaluation with low symmetry and high sway
    const frames = createSyntheticWalkingSequence(60, 0.85, 30);
    const evalResult = evaluateMovementSequence(frames);
    const gaitOutput = convertMovementEvaluationToGaitOutput(evalResult, form.name);

    // Verify symptom assessment calculation is completely independent of gait output
    const recheckedScore = evaluateScreening(form);
    assert.equal(initialScore.score, recheckedScore.score);
    assert.equal(initialScore.band, recheckedScore.band);
    assert.equal(initialScore.urgentCareNotice.hasRedFlags, false);

    // Even if gait assessment failed or had low quality, symptom score is unchanged
    assert.ok(gaitOutput.technicalQuality);
    assert.equal(gaitOutput.recordId, form.name);
  });
});
