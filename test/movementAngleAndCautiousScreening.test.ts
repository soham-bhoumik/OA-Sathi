import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TASK_REFERENCE_RANGES,
  CHECKLIST_TASK_DEFINITIONS,
  evaluateSeatedKneeExtension,
  evaluateSeatedKneeFlexion,
  evaluateSitToStand,
  evaluateSupportedWeightShift,
  evaluateChecklistTask,
  generateSymptomConditionedInterpretation,
  generateChecklistSummary,
  type ChecklistTaskId,
  type ChecklistTaskEvaluation,
} from "../src/logic/movementChecklistEvaluation.ts";
import {
  determineCautiousScreeningCategory,
  evaluateScreening,
  exportRecordsToCsv,
  type FormValues,
  type Screening,
  NOT_CHECKED,
} from "../src/logic/screeningRules.ts";
import {
  validatePoseFrame,
  type RawLandmarkInput,
  type ValidatedPoseFrame,
} from "../src/logic/movementFeatureEvaluation.ts";

/**
 * Creates deterministic synthetic frames with customizable lower-limb landmarks.
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
    visibility: 0.95,
  }));

  // Standard landmarks: Seated neutral pose with horizontal thigh (0.40, 0.65) -> (0.55, 0.65)
  raw[11] = { x: 0.45, y: 0.25, z: 0.0, visibility: 0.95 }; // L Shoulder
  raw[12] = { x: 0.55, y: 0.25, z: 0.0, visibility: 0.95 }; // R Shoulder
  raw[23] = { x: 0.40, y: 0.65, z: 0.0, visibility: 0.95 }; // L Hip
  raw[24] = { x: 0.40, y: 0.65, z: 0.0, visibility: 0.95 }; // R Hip
  raw[25] = { x: 0.55, y: 0.65, z: 0.0, visibility: 0.95 }; // L Knee
  raw[26] = { x: 0.55, y: 0.65, z: 0.0, visibility: 0.95 }; // R Knee
  raw[27] = { x: 0.55, y: 0.90, z: 0.0, visibility: 0.95 }; // L Ankle (90° resting)
  raw[28] = { x: 0.55, y: 0.90, z: 0.0, visibility: 0.95 }; // R Ankle (90° resting)

  for (const [idxStr, landmark] of Object.entries(overrides)) {
    const idx = Number(idxStr);
    if (landmark === undefined) {
      raw[idx] = undefined;
    } else {
      raw[idx] = { ...raw[idx], ...landmark } as RawLandmarkInput;
    }
  }

  return validatePoseFrame(raw, timestampMs, frameIndex);
}

/**
 * Generates an active knee extension sequence.
 * Full extension reaches 175°–180° (within reference range).
 * Limited extension reaches only ~125° (outside reference range).
 */
function generateExtensionSequence(
  extensionType: "full" | "limited",
  frameCount: number = 30
): ValidatedPoseFrame[] {
  const frames: ValidatedPoseFrame[] = [];

  for (let i = 0; i < frameCount; i++) {
    const t = Math.min(1, i / (frameCount / 2));
    const factor = Math.sin((t * Math.PI) / 2);

    let ankleX: number;
    let ankleY: number;

    if (extensionType === "full") {
      // Moves from (0.55, 0.90) [90°] forward to (0.75, 0.65) [180°]
      ankleX = 0.55 + 0.20 * factor;
      ankleY = 0.90 - 0.25 * factor;
    } else {
      // Limited excursion: moves only slightly forward to (0.61, 0.81) [~125° peak, lag]
      ankleX = 0.55 + 0.06 * factor;
      ankleY = 0.90 - 0.09 * factor;
    }

    frames.push(
      createSyntheticFrame(i, i * 100, {
        24: { x: 0.40, y: 0.65, visibility: 0.95 },
        26: { x: 0.55, y: 0.65, visibility: 0.95 },
        28: { x: ankleX, y: ankleY, visibility: 0.95 },
      })
    );
  }
  return frames;
}

describe("OA-Sathi Movement Angle Interpretation & Cautious Screening Test Suite", () => {
  it("1. Documented reference ranges are defined with published clinical sources and 2D goniometric caveats", () => {
    assert.ok(TASK_REFERENCE_RANGES["seated-knee-extension"]);
    assert.ok(TASK_REFERENCE_RANGES["seated-knee-flexion"]);
    assert.ok(TASK_REFERENCE_RANGES["sit-to-stand"]);
    assert.ok(TASK_REFERENCE_RANGES["supported-weight-shift"]);

    const extRange = TASK_REFERENCE_RANGES["seated-knee-extension"];
    assert.match(extRange.sourceCitation, /American Academy of Orthopaedic Surgeons|AAOS|Norkin/);
    assert.match(extRange.methodologyNote, /2D planar camera projection|variance/i);
    assert.equal(typeof extRange.minAngleDeg, "number");
    assert.equal(typeof extRange.maxAngleDeg, "number");
  });

  it("2. Measured angle inside supported reference range with no symptoms -> category 'no-obvious-limitation-observed' and cannot rule out OA", () => {
    const frames = generateExtensionSequence("full", 30);
    const evalResult = evaluateSeatedKneeExtension(frames);

    assert.equal(evalResult.status, "completed");
    assert.equal(evalResult.referenceComparison, "within-reference");
    assert.match(evalResult.referenceComparisonNotice || "", /within the selected reference range/i);

    const formValues: Partial<FormValues> = {
      name: "Participant Normal",
      age: "45",
      district: "East Khasi Hills",
      joint: "Knee",
      painDuration: "under-2-weeks",
      painLevel: 1,
      stiffness: "none",
      mobility: "no",
      previousInjury: false,
      familyHistory: false,
      repeatedLoad: false,
    };

    const taskMap: Partial<Record<ChecklistTaskId, ChecklistTaskEvaluation>> = {
      "seated-knee-extension": evalResult,
    };

    const synthesis = determineCautiousScreeningCategory(formValues, taskMap);

    assert.equal(synthesis.category, "no-obvious-limitation-observed");
    assert.equal(synthesis.categoryLabel, "No obvious limitation observed");
    assert.match(synthesis.summary, /did not identify an obvious limitation/i);
    assert.match(synthesis.summary, /cannot rule out osteoarthritis/i);
    // Crucial rule: Never label as "OA-free", "healthy", or "no risk"
    assert.doesNotMatch(synthesis.summary, /OA-free|completely healthy|no risk|zero risk/i);
    assert.doesNotMatch(synthesis.screeningOutcome, /OA-free|completely healthy|no risk/i);
  });

  it("3. Measured angle inside supported reference range WITH reported symptoms -> 'further-assessment-may-be-helpful' with exact disclaimer", () => {
    const frames = generateExtensionSequence("full", 30);
    const evalResult = evaluateSeatedKneeExtension(frames);
    assert.equal(evalResult.referenceComparison, "within-reference");

    const formValues: Partial<FormValues> = {
      name: "Participant In Pain",
      age: "58",
      district: "Ri-Bhoi",
      joint: "Knee",
      painDuration: "over-3-months",
      painLevel: 6,
      stiffness: "over-30",
      mobility: "some",
      previousInjury: true,
      familyHistory: false,
      repeatedLoad: false,
    };

    const taskMap: Partial<Record<ChecklistTaskId, ChecklistTaskEvaluation>> = {
      "seated-knee-extension": evalResult,
    };

    const synthesis = determineCautiousScreeningCategory(formValues, taskMap);

    assert.equal(synthesis.category, "further-assessment-may-be-helpful");
    // Must contain the specific mandated text
    assert.match(
      synthesis.summary,
      /Your observed movement is within the selected reference range, but this does not rule out osteoarthritis\. Your reported symptoms may still warrant further assessment by a healthcare professional\./
    );

    // Verify task-level symptom-conditioned interpretation
    const interp = generateSymptomConditionedInterpretation(evalResult, true);
    assert.match(
      interp,
      /Your observed movement is within the selected reference range, but this does not rule out osteoarthritis\. Your reported symptoms may still warrant further assessment by a healthcare professional\./
    );
  });

  it("4. Measured angle outside documented reference range -> explains limited mobility or measurement variability and does NOT label OA-positive", () => {
    // Limited knee extension reaches only ~125° (outside 165°–180° reference range)
    const frames = generateExtensionSequence("limited", 30);
    const evalResult = evaluateSeatedKneeExtension(frames);

    assert.equal(evalResult.status, "completed");
    assert.equal(evalResult.referenceComparison, "outside-reference");
    assert.match(evalResult.referenceComparisonNotice || "", /outside the documented reference range/i);
    assert.match(evalResult.referenceComparisonNotice || "", /limited mobility or measurement variability/i);

    const formValues: Partial<FormValues> = {
      name: "Participant Limited ROM",
      age: "52",
      district: "Imphal West",
      joint: "Knee",
      painDuration: "under-2-weeks",
      painLevel: 2,
      stiffness: "none",
      mobility: "no",
      previousInjury: false,
      familyHistory: false,
      repeatedLoad: false,
    };

    const taskMap: Partial<Record<ChecklistTaskId, ChecklistTaskEvaluation>> = {
      "seated-knee-extension": evalResult,
    };

    const synthesis = determineCautiousScreeningCategory(formValues, taskMap);

    assert.equal(synthesis.category, "further-assessment-may-be-helpful");
    assert.match(synthesis.summary, /outside the documented reference range/i);
    assert.match(synthesis.summary, /limited mobility or measurement variability/i);
    assert.match(synthesis.summary, /does not label you as OA-positive/i);
    assert.doesNotMatch(synthesis.screeningOutcome, /OA-positive|diagnosed with OA|has osteoarthritis/i);
  });

  it("5. Low confidence landmarks (< 0.55) -> marks result 'unable-to-evaluate' rather than abnormal", () => {
    const lowConfFrames: ValidatedPoseFrame[] = [];
    for (let i = 0; i < 30; i++) {
      lowConfFrames.push(
        createSyntheticFrame(i, i * 100, {
          25: { x: 0.55, y: 0.65, visibility: 0.3 }, // Poor visibility L knee
          26: { x: 0.55, y: 0.65, visibility: 0.3 }, // Poor visibility R knee
          27: { x: 0.55, y: 0.90, visibility: 0.25 }, // Poor visibility L ankle
          28: { x: 0.55, y: 0.90, visibility: 0.25 }, // Poor visibility R ankle
        })
      );
    }

    const evalResult = evaluateSeatedKneeExtension(lowConfFrames);
    assert.equal(evalResult.status, "unable-to-evaluate");
    assert.equal(evalResult.referenceComparison, "unable-to-compare");
    assert.equal(evalResult.outcomeLabel, "Unable to evaluate");
    assert.match(evalResult.feedbackSummary, /occluded|not detected clearly|visible enough/i);

    const interp = generateSymptomConditionedInterpretation(evalResult, false);
    assert.match(interp, /Tracking confidence or landmark visibility was insufficient to evaluate this movement reliably/i);
  });

  it("6. Missing landmarks (occluded knee or hip) -> marks result 'unable-to-evaluate' rather than abnormal", () => {
    const missingLandmarkFrames: ValidatedPoseFrame[] = [];
    for (let i = 0; i < 30; i++) {
      missingLandmarkFrames.push(
        createSyntheticFrame(i, i * 100, {
          23: undefined, // Hip completely missing from frame
          24: undefined,
        })
      );
    }

    const evalResult = evaluateSeatedKneeExtension(missingLandmarkFrames);
    assert.equal(evalResult.status, "unable-to-evaluate");
    assert.equal(evalResult.referenceComparison, "unable-to-compare");
    assert.match(evalResult.feedbackSummary, /visible enough|position the camera/i);
  });

  it("7. Incomplete movements (under 10 usable frames) -> returns 'unable-to-evaluate' and never treats as abnormal", () => {
    const tooFewFrames = [
      createSyntheticFrame(0, 0),
      createSyntheticFrame(1, 100),
      createSyntheticFrame(2, 200),
    ];

    const evalResult = evaluateSeatedKneeExtension(tooFewFrames);
    assert.equal(evalResult.status, "unable-to-evaluate");
    assert.equal(evalResult.outcomeLabel, "Unable to evaluate");
    assert.equal(evalResult.referenceComparison, "unable-to-compare");
    assert.doesNotMatch(evalResult.feedbackSummary, /abnormal|disease|osteoarthritis/i);
  });

  it("8. Incomplete movement duration / excursion -> returns 'try-again' and never treats as abnormal", () => {
    // 30 frames with stationary knee (excursion < 16°)
    const stationaryFrames: ValidatedPoseFrame[] = [];
    for (let i = 0; i < 30; i++) {
      stationaryFrames.push(createSyntheticFrame(i, i * 100));
    }

    const evalResult = evaluateSeatedKneeExtension(stationaryFrames);
    assert.equal(evalResult.status, "try-again");
    assert.equal(evalResult.outcomeLabel, "Movement not clearly detected");
    assert.equal(evalResult.referenceComparison, "unable-to-compare");
    assert.doesNotMatch(evalResult.feedbackSummary, /abnormal|disease|osteoarthritis/i);
  });

  it("9. Camera and model errors -> defensive fallback marks result 'unable-to-evaluate' with non-crashing summary", () => {
    // Malformed input frames array containing invalid types
    const malformedFrames = [null, undefined, {}] as unknown as ValidatedPoseFrame[];
    const evalResult = evaluateChecklistTask("seated-knee-extension", malformedFrames);

    assert.equal(evalResult.status, "unable-to-evaluate");
    assert.equal(evalResult.outcomeLabel, "Unable to evaluate");
    assert.equal(evalResult.referenceComparison, "unable-to-compare");
  });

  it("10. Urgent safety red flags -> given absolute priority and NEVER overridden by reassuring angles", () => {
    const perfectFrames = generateExtensionSequence("full", 30);
    const evalResult = evaluateSeatedKneeExtension(perfectFrames);
    assert.equal(evalResult.referenceComparison, "within-reference");

    // Red flag: hot, red, swollen joint with fever
    const formWithRedFlag: Partial<FormValues> = {
      name: "Emergency Patient",
      age: "62",
      district: "Kohima",
      joint: "Knee",
      painDuration: "under-2-weeks",
      painLevel: 9,
      stiffness: "none",
      mobility: "no",
      hasHotRedJointFever: true,
      hasSuddenSeverePainSwelling: false,
      hasInabilityToBearWeight: false,
    };

    const taskMap: Partial<Record<ChecklistTaskId, ChecklistTaskEvaluation>> = {
      "seated-knee-extension": evalResult,
    };

    const synthesis = determineCautiousScreeningCategory(formWithRedFlag, taskMap);

    assert.equal(synthesis.category, "further-assessment-may-be-helpful");
    assert.equal(synthesis.urgentCareGuidanceActive, true);
    assert.match(synthesis.summary, /Acute red-flag symptoms were reported/i);
    assert.match(synthesis.summary, /Reassuring movement angles do NOT override these warnings/i);
    assert.match(synthesis.summary, /PHC or hospital emergency/i);
  });

  it("11. Incomplete intake questionnaire -> category 'assessment-incomplete'", () => {
    const formIncomplete: Partial<FormValues> = {
      name: "Incomplete Participant",
      age: "", // Missing age
      district: "East Khasi Hills",
      joint: "Knee",
      painDuration: NOT_CHECKED,
    };

    const synthesis = determineCautiousScreeningCategory(formIncomplete);
    assert.equal(synthesis.category, "assessment-incomplete");
    assert.equal(synthesis.categoryLabel, "Assessment incomplete");
    assert.match(synthesis.summary, /Insufficient reliable measurements or questionnaire answers/i);
  });

  it("12. Decoupling: Zero numeric OA probabilities or diagnostic accuracy claims invented", () => {
    const fullForm: FormValues = {
      name: "Valid User",
      age: "55",
      district: "Ri-Bhoi",
      joint: "Knee",
      painDuration: "1-3-months",
      painLevel: 5,
      stiffness: "under-30",
      mobility: "some",
      previousInjury: "unanswered",
      familyHistory: "unanswered",
      repeatedLoad: "unanswered",
      heightCm: "165",
      weightKg: "68",
      hasHotRedJointFever: "unanswered",
      hasSuddenSeverePainSwelling: "unanswered",
      hasInabilityToBearWeight: "unanswered",
      bmdTScore: "",
      bmdSite: "",
      bmdDate: "",
    };

    const frames = generateExtensionSequence("full", 30);
    const evalResult = evaluateSeatedKneeExtension(frames);
    const taskMap = { "seated-knee-extension": evalResult };

    const evaluation = evaluateScreening(fullForm, taskMap);

    assert.ok(evaluation.cautiousSynthesis);
    assert.equal(evaluation.cautiousSynthesis.category, "further-assessment-may-be-helpful");

    // Must not claim diagnostic accuracy percentages or clinical probability
    const allText = JSON.stringify(evaluation.cautiousSynthesis);
    assert.doesNotMatch(allText, /%\s*probability of OA|accuracy rate|\b9[0-9]% accurate\b|diagnostic sensitivity/i);
    assert.match(evaluation.cautiousSynthesis.disclaimer, /not a diagnosis/i);
  });

  it("13. CSV records export includes Cautious Screening Category and Movement Reference Summary", () => {
    const frames = generateExtensionSequence("full", 30);
    const evalResult = evaluateSeatedKneeExtension(frames);

    const fullForm: FormValues = {
      name: "CSV Test Patient",
      age: "50",
      district: "Aizawl",
      joint: "Knee",
      painDuration: "under-2-weeks",
      painLevel: 1,
      stiffness: "none",
      mobility: "no",
      previousInjury: false,
      familyHistory: false,
      repeatedLoad: false,
      heightCm: "170",
      weightKg: "70",
      hasHotRedJointFever: false,
      hasSuddenSeverePainSwelling: false,
      hasInabilityToBearWeight: false,
    };

    const evalRes = evaluateScreening(fullForm, { "seated-knee-extension": evalResult });

    const screeningRecord: Screening = {
      id: "TEST-001",
      name: "CSV Test Patient",
      age: 50,
      district: "Aizawl",
      joint: "Knee",
      score: evalRes.score,
      band: evalRes.band,
      markers: evalRes.markers,
      date: "Today, 10:00 am",
      timestamp: Date.now(),
      contributingFactors: evalRes.contributingFactors,
      absentFactors: evalRes.absentFactors,
      unassessedFactors: evalRes.unassessedFactors,
      assessedCount: evalRes.assessedCount,
      totalQuestions: evalRes.totalQuestions,
      cautiousSynthesis: evalRes.cautiousSynthesis,
      movementChecklist: { "seated-knee-extension": evalResult },
    };

    const csvOutput = exportRecordsToCsv([screeningRecord]);
    assert.match(csvOutput, /Cautious Screening Category/);
    assert.match(csvOutput, /Movement Reference Comparison Summary/);
    assert.match(csvOutput, /No obvious limitation observed/);
    assert.match(csvOutput, /within reference/i);
  });
});
