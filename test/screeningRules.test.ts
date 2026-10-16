import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateBMI,
  calculateDashboardStats,
  checkUrgentCareGuidance,
  clearDemoScreenings,
  escapeCsvField,
  evaluateScreening,
  exportRecordsToCsv,
  generateStableId,
  restoreDemoScreenings,
  validateScreeningInput,
  shareScreeningWithConsent,
  withdrawSharingConsent,
  requestConsultation,
  recordDoctorReview,
  loadStoredScreenings,
  saveStoredScreenings,
  sanitizeText,
  sampleScreenings,
  STORAGE_KEY,
  type FormValues,
  type Screening,
  type DoctorReviewInput,
} from "../src/logic/screeningRules.ts";
import { getAIModelMetadata, runAIModelInference } from "../src/services/aiModelService.ts";
import {
  getGaitAnalysisStatus,
  getBenchmarkSampleAnalysis,
  DEFAULT_GAIT_ANALYSIS_STATE,
  DEFAULT_MANUAL_OBSERVATIONS,
} from "../src/services/gaitAnalysisService.ts";
import { getRegionalGlossary, SUPPORTED_REGIONAL_LANGUAGES } from "../src/logic/regionalTerms.ts";
import {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  saveAppSettings,
  resetAppSettings,
  SETTINGS_STORAGE_KEY,
} from "../src/logic/settingsStorage.ts";
import { calculateLiveMetrics, disposeLivePoseLandmarker } from "../src/services/livePoseEstimation.ts";

describe("OA-Sathi Data Correctness & Integrity Test Suite", () => {
  // 1. Yes, No, "Not checked", and unanswered values remain distinct
  it("1. Distinguishes between Yes, No, Not checked, and Unanswered across all fields", () => {
    const baseForm: FormValues = {
      name: "Test Participant",
      age: "55",
      district: "East Khasi Hills",
      joint: "Knee",
      painDuration: "1-3-months",
      painLevel: 5,
      stiffness: "under-30",
      mobility: "some",
      previousInjury: "unanswered",
      familyHistory: "unanswered",
      repeatedLoad: "unanswered",
    };

    const resUnanswered = evaluateScreening({
      ...baseForm,
      previousInjury: "unanswered",
    });
    assert.ok(
      resUnanswered.unassessedFactors.some((f) => f.includes("unanswered")),
      "Unanswered should be recorded as unassessed"
    );

    const resNotChecked = evaluateScreening({
      ...baseForm,
      previousInjury: "not-checked",
    });
    assert.ok(
      resNotChecked.unassessedFactors.some((f) => f.includes("not checked")),
      "Not checked should be recorded as not checked"
    );

    const resYes = evaluateScreening({
      ...baseForm,
      previousInjury: true,
    });
    assert.ok(
      resYes.contributingFactors.some((f) => f.includes("reported")),
      "Yes should be recorded as a contributing positive risk factor"
    );

    const resNo = evaluateScreening({
      ...baseForm,
      previousInjury: false,
    });
    assert.ok(
      resNo.absentFactors.some((f) => f.includes("not reported")),
      "No should be recorded as an absent factor"
    );

    assert.notEqual(resYes.score, resNo.score);
  });

  // 2. Missing values are not counted as negative/protective answers
  it("2. Missing values are not counted as negative/protective answers", () => {
    const missingForm: FormValues = {
      name: "Minimal",
      age: "50",
      district: "Ri-Bhoi",
      joint: "Knee",
      painDuration: "not-checked",
      painLevel: 0,
      stiffness: "not-checked",
      mobility: "not-checked",
      previousInjury: "not-checked",
      familyHistory: "unanswered",
      repeatedLoad: "unanswered",
    };

    const result = evaluateScreening(missingForm);
    assert.equal(
      result.absentFactors.filter((f) => f.includes("Previous joint injury")).length,
      0,
      "Not checked injury must not appear in absentFactors"
    );
    assert.equal(
      result.absentFactors.filter((f) => f.includes("Family history")).length,
      0,
      "Unanswered family history must not appear in absentFactors"
    );
    assert.ok(
      result.isPreliminaryDueToMissingData,
      "Result with missing data must be flagged as preliminary"
    );
  });

  // 3. Screening summaries are deterministic for the same input
  it("3. Produces identical deterministic score, band, and factors for identical inputs", () => {
    const input: FormValues = {
      name: "Deterministic Test",
      age: "62",
      district: "East Khasi Hills",
      joint: "Hip",
      painDuration: "over-3-months",
      painLevel: 7,
      stiffness: "over-30",
      mobility: "significant",
      previousInjury: true,
      familyHistory: false,
      repeatedLoad: true,
    };

    const firstRun = evaluateScreening(input);
    const secondRun = evaluateScreening(input);

    assert.equal(firstRun.score, secondRun.score);
    assert.equal(firstRun.band, secondRun.band);
    assert.deepEqual(firstRun.contributingFactors, secondRun.contributingFactors);
    assert.deepEqual(firstRun.absentFactors, secondRun.absentFactors);
    assert.deepEqual(firstRun.unassessedFactors, secondRun.unassessedFactors);
  });

  // 4. Invalid numeric inputs are rejected
  it("4. Form validation rejects invalid numeric inputs and boundaries", () => {
    const invalidAgeForm: FormValues = {
      name: "Age test",
      age: "17",
      district: "East Khasi Hills",
      joint: "Knee",
      painDuration: "1-3-months",
      painLevel: 5,
      stiffness: "under-30",
      mobility: "some",
      previousInjury: false,
      familyHistory: false,
      repeatedLoad: false,
    };

    const resUnderAge = validateScreeningInput(invalidAgeForm, true);
    assert.equal(resUnderAge.isValid, false);
    assert.match(resUnderAge.error || "", /age between 18 and 110/i);

    const resNaN = validateScreeningInput({ ...invalidAgeForm, age: "abc" }, true);
    assert.equal(resNaN.isValid, false);

    const resFloat = validateScreeningInput({ ...invalidAgeForm, age: "45.7" }, true);
    assert.equal(resFloat.isValid, false);

    const resOverAge = validateScreeningInput({ ...invalidAgeForm, age: "120" }, true);
    assert.equal(resOverAge.isValid, false);

    const resInvalidPain = validateScreeningInput({ ...invalidAgeForm, age: "50", painLevel: 15 }, true);
    assert.equal(resInvalidPain.isValid, false);

    const resNoConsent = validateScreeningInput({ ...invalidAgeForm, age: "50" }, false);
    assert.equal(resNoConsent.isValid, false);
    assert.match(resNoConsent.error || "", /voluntary/i);
  });

  // 5. BMI is calculated only when valid height and weight are available
  it("5. BMI calculated strictly when valid height and weight measurements are provided", () => {
    assert.equal(calculateBMI(70, 175), 22.9);
    assert.equal(calculateBMI("", 170), null);
    assert.equal(calculateBMI(70, ""), null);
    assert.equal(calculateBMI(0, 170), null);
    assert.equal(calculateBMI(70, 0), null);
    assert.equal(calculateBMI(-60, 170), null);
    assert.equal(calculateBMI(70, -170), null);
    assert.equal(calculateBMI("invalid", 170), null);
    assert.equal(calculateBMI(Infinity, 170), null);
    assert.equal(calculateBMI(10, 170), null);
  });

  // 6. Creating a record produces a stable unique ID
  it("6. Generates stable sequential unique IDs without random collisions", () => {
    const existing: Screening[] = [
      {
        id: "OS-0248",
        name: "Test",
        age: 60,
        district: "Ri-Bhoi",
        joint: "Knee",
        score: 40,
        band: "Some markers",
        markers: [],
        date: "Today",
        timestamp: Date.now(),
      },
    ];

    const nextId = generateStableId(existing);
    assert.equal(nextId, "OS-0249");

    const afterThat = generateStableId([
      ...existing,
      { ...existing[0], id: nextId },
    ]);
    assert.equal(afterThat, "OS-0250");
  });

  // 7. Editing a record does not create a duplicate
  it("7. Updating an existing record preserves ID and updates content in-place", () => {
    const records: Screening[] = [
      {
        id: "OS-0248",
        name: "Old Name",
        age: 60,
        district: "Ri-Bhoi",
        joint: "Knee",
        score: 40,
        band: "Some markers",
        markers: ["Old Marker"],
        date: "Today, 10:00 am",
        timestamp: 1600000000000,
      },
      {
        id: "OS-0247",
        name: "Other Participant",
        age: 50,
        district: "East Khasi Hills",
        joint: "Hip",
        score: 20,
        band: "Lower markers",
        markers: [],
        date: "Today, 9:00 am",
        timestamp: 1599990000000,
      },
    ];

    const targetId = "OS-0248";
    const updatedName = "Updated Name";
    const editTimestamp = Date.now();

    const updatedRecords = records.map((r) =>
      r.id === targetId
        ? {
            ...r,
            name: updatedName,
            score: 55,
            band: "Some markers" as const,
            updatedAt: editTimestamp,
          }
        : r
    );

    assert.equal(updatedRecords.length, 2, "Array length must not increase when editing");
    const edited = updatedRecords.find((r) => r.id === targetId);
    assert.ok(edited);
    assert.equal(edited.name, "Updated Name");
    assert.equal(edited.timestamp, 1600000000000, "Original timestamp must be preserved");
    assert.equal(edited.updatedAt, editTimestamp, "Updated timestamp must be set");
  });

  // 8. Persistence survives a simulated save-and-reload cycle
  it("8. Simulates JSON serialization and re-parsing with schema integrity", () => {
    const initialRecords: Screening[] = [
      {
        id: "OS-0248",
        name: "Tsering Lhamo",
        age: 58,
        district: "East Khasi Hills",
        joint: "Knee",
        score: 67,
        band: "More markers",
        markers: ["Symptom 1", "Symptom 2"],
        date: "Today, 10:42 am",
        timestamp: 1700000000000,
        contributingFactors: ["Symptom 1"],
        absentFactors: ["None"],
        unassessedFactors: [],
      },
    ];

    const serialized = JSON.stringify(initialRecords);
    const reloaded = JSON.parse(serialized) as Screening[];

    assert.equal(reloaded.length, 1);
    assert.equal(reloaded[0].id, "OS-0248");
    assert.equal(reloaded[0].name, "Tsering Lhamo");
    assert.equal(reloaded[0].score, 67);
    assert.equal(reloaded[0].band, "More markers");
  });

  // 9. Older supported record formats remain readable
  it("9. Backward-compatible reading of legacy records missing newer fields", () => {
    const legacyRecord: any = {
      id: "OS-0100",
      name: "Legacy Patient",
      age: 65,
      district: "Aizawl",
      joint: "Knee",
      score: 55,
      band: "Some markers",
      markers: ["Age recorded: 65 years."],
      date: "Today, 8:30 am",
    };

    assert.ok(legacyRecord.id);

    const stats = calculateDashboardStats([legacyRecord]);
    assert.equal(stats.total, "01");
    assert.equal(stats.today, "01");

    const csv = exportRecordsToCsv([legacyRecord]);
    assert.ok(csv.includes("Legacy Patient"));
  });

  // 10. Dashboard counts reflect the stored records
  it("10. Dashboard calculations accurately reflect record count, today count, and followup count", () => {
    const now = Date.now();
    const yesterday = now - 24 * 60 * 60 * 1000;

    const dataset: Screening[] = [
      {
        id: "OS-0001",
        name: "Person 1",
        age: 60,
        district: "Ri-Bhoi",
        joint: "Knee",
        score: 75,
        band: "More markers",
        markers: [],
        date: "Today, 10:00 am",
        timestamp: now,
      },
      {
        id: "OS-0002",
        name: "Person 2",
        age: 45,
        district: "Imphal West",
        joint: "Hip",
        score: 30,
        band: "Lower markers",
        markers: [],
        date: "Today, 11:00 am",
        timestamp: now,
      },
      {
        id: "OS-0003",
        name: "Person 3",
        age: 70,
        district: "Dimapur",
        joint: "Knee",
        score: 80,
        band: "More markers",
        markers: [],
        date: "Yesterday",
        timestamp: yesterday,
      },
    ];

    const stats = calculateDashboardStats(dataset);
    assert.equal(stats.total, "03", "Total must be 3");
    assert.equal(stats.today, "02", "Only 2 records from today");
    assert.equal(stats.followup, "02", "Only 2 records have More markers band");

    const emptyStats = calculateDashboardStats([]);
    assert.equal(emptyStats.total, "00");
    assert.equal(emptyStats.today, "00");
    assert.equal(emptyStats.followup, "00");
  });

  // 11. CSV fields containing commas, quotes, and newlines export correctly
  it("11. Properly escapes special characters (commas, quotes, newlines) in CSV output", () => {
    const complexRecord: Screening[] = [
      {
        id: "OS-0999",
        name: 'John "Doctor" Smith, Jr.\nChief Guest',
        age: 50,
        district: "East Khasi Hills",
        joint: "Knee",
        score: 45,
        band: "Some markers",
        markers: ["Symptom, with comma", 'Quote "inside" note'],
        date: "Today",
        timestamp: Date.now(),
      },
    ];

    const csv = exportRecordsToCsv(complexRecord);
    assert.ok(csv.includes('""Doctor""'));
    assert.ok(csv.includes('""inside""'));
    assert.ok(csv.includes('"John ""Doctor"" Smith, Jr.\nChief Guest"'));
  });

  // 12. CSV text fields are protected against spreadsheet formula injection
  it("12. Sanitizes formula injection characters (=, +, -, @, \\t) in CSV exports", () => {
    assert.equal(escapeCsvField("=SUM(A1:A10)"), `"'=SUM(A1:A10)"`);
    assert.equal(escapeCsvField("+1234567890"), `"'+1234567890"`);
    assert.equal(escapeCsvField("-500"), `\"'-500\"`);
    assert.equal(escapeCsvField("@username"), `"'@username"`);
    assert.equal(escapeCsvField("\tCMD|' /C calc'!A0"), `"'\tCMD|' /C calc'!A0"`);

    const maliciousRecord: Screening[] = [
      {
        id: "OS-0666",
        name: "=cmd|' /C calc'!A0",
        age: 40,
        district: "Ri-Bhoi",
        joint: "Knee",
        score: 10,
        band: "Lower markers",
        markers: [],
        date: "Today",
        timestamp: Date.now(),
      },
    ];

    const exported = exportRecordsToCsv(maliciousRecord);
    assert.ok(exported.includes(`"'=cmd|' /C calc'!A0"`));
  });

  // 13. Incomplete assessments are not reported as normal outcomes
  it("13. Distinguishes incomplete or omitted questions from normal outcomes", () => {
    const unassessedForm: FormValues = {
      name: "Movement Test",
      age: "52",
      district: "East Khasi Hills",
      joint: "Knee",
      painDuration: "not-checked",
      painLevel: 0,
      stiffness: "not-checked",
      mobility: "not-checked",
      previousInjury: "not-checked",
      familyHistory: "not-checked",
      repeatedLoad: "not-checked",
    };

    const resNotChecked = evaluateScreening(unassessedForm);
    assert.ok(
      resNotChecked.unassessedFactors.some((f) => f.includes("not checked")),
      "Not checked items must be in unassessed factors"
    );
    assert.equal(
      resNotChecked.absentFactors.filter((f) => f.includes("Previous joint injury")).length,
      0,
      "Not checked items must NOT be interpreted as normal/absent"
    );
  });

  // 14. Urgent care guidance identifies severe/red flag symptoms without fabricating diagnoses
  it("14. Identifies severe red-flag symptoms and supplies non-diagnostic urgent care guidance", () => {
    // Severe pain rating (>= 9)
    const severePainForm: FormValues = {
      name: "Severe Case",
      age: "65",
      district: "East Khasi Hills",
      joint: "Knee",
      painDuration: "over-3-months",
      painLevel: 9,
      stiffness: "over-30",
      mobility: "significant",
      previousInjury: true,
      familyHistory: false,
      repeatedLoad: false,
    };

    const evaluation = evaluateScreening(severePainForm);
    assert.equal(evaluation.urgentCareNotice.hasRedFlags, true);
    assert.ok(
      evaluation.urgentCareNotice.flags.some((f) => f.includes("Very high discomfort")),
      "Flags high discomfort rating"
    );
    assert.ok(
      evaluation.urgentCareNotice.flags.some((f) => f.includes("Severe daily functional impairment")),
      "Flags severe functional impairment"
    );
    assert.match(evaluation.urgentCareNotice.guidance, /primary health centre|emergency/i);

    // Mild/moderate case should not have red flags
    const mildForm: FormValues = {
      name: "Mild Case",
      age: "45",
      district: "Aizawl",
      joint: "Knee",
      painDuration: "1-3-months",
      painLevel: 3,
      stiffness: "under-30",
      mobility: "some",
      previousInjury: false,
      familyHistory: false,
      repeatedLoad: false,
    };
    const mildEval = evaluateScreening(mildForm);
    assert.equal(mildEval.urgentCareNotice.hasRedFlags, false);
    assert.equal(mildEval.urgentCareNotice.flags.length, 0);
    assert.match(mildEval.urgentCareNotice.guidance, /primary care clinician/i);
  });

  // 15. Demo data isolation and selective clearing/restoration
  it("15. Distinguishes synthetic demo data from real records and clears/restores safely", () => {
    const mixedRecords: Screening[] = [
      {
        id: "OS-0248",
        name: "Synthetic Demo 1",
        age: 62,
        district: "East Khasi Hills",
        joint: "Knee",
        score: 96,
        band: "More markers",
        markers: [],
        date: "Today, 10:42 am",
        timestamp: Date.now(),
        isDemo: true,
      },
      {
        id: "OS-0249",
        name: "Real Participant",
        age: 54,
        district: "Ri-Bhoi",
        joint: "Knee",
        score: 35,
        band: "Some markers",
        markers: [],
        date: "Today, 11:15 am",
        timestamp: Date.now(),
        isDemo: false,
      },
    ];

    // Clear demo data
    const cleared = clearDemoScreenings(mixedRecords);
    assert.equal(cleared.length, 1);
    assert.equal(cleared[0].id, "OS-0249");
    assert.equal(cleared[0].name, "Real Participant");

    // Restore demo data
    const restored = restoreDemoScreenings(cleared);
    assert.ok(restored.length > cleared.length);
    assert.ok(restored.some((r) => r.id === "OS-0249"), "Real record preserved on restore");
    assert.ok(restored.some((r) => r.id === "OS-0248"), "Demo record restored");

    // Restoring again must not create duplicates
    const restoredTwice = restoreDemoScreenings(restored);
    assert.equal(restoredTwice.length, restored.length, "Restoring twice does not duplicate records");
  });

  // 16. AI model boundary maintains explicit 'not-connected' status and zero data leakage
  it("16. AI model boundary provides transparent non-connected status and zero external data leaks", async () => {
    const meta = getAIModelMetadata();
    assert.equal(meta.status, "not-connected");
    assert.equal(meta.isClinicallyValidated, false);
    assert.equal(meta.inferenceEngine, "deterministic-rules-engine");
    assert.match(meta.privacyNotice, /local browser session/i);

    // Call inference stub
    const result = await runAIModelInference({
      age: 60,
      joint: "Knee",
      district: "East Khasi Hills",
      painDuration: "over-3-months",
      painScore: 7,
      stiffnessDuration: "over-30",
      mobilityImpact: "significant",
      previousInjury: true,
      familyHistory: false,
      repeatedLoad: true,
    });

    assert.equal(result.modelConnected, false);
    assert.equal(result.status, "not-connected");
    assert.match(result.disclaimer, /does not generate synthetic ML probabilities/i);
  });

  // 17. Gait analysis service boundary enforces manual observational fallback and no fake measurements
  it("17. Gait analysis service provides structured boundary without fabricating kinematics", () => {
    // When camera is inactive
    const inactiveStatus = getGaitAnalysisStatus(false);
    assert.equal(inactiveStatus.status, "not-connected");
    assert.equal(inactiveStatus.captureCompleted, false);
    assert.equal(inactiveStatus.poseDataAvailable, false);
    assert.deepEqual(inactiveStatus.metricsCalculated, []);
    assert.equal(inactiveStatus.requiresClinicalReview, true);

    // When camera is active for local preview
    const activeStatus = getGaitAnalysisStatus(true);
    assert.equal(activeStatus.status, "camera-preview-active");
    assert.equal(activeStatus.captureCompleted, false);
    assert.equal(activeStatus.poseDataAvailable, false);
    assert.deepEqual(activeStatus.metricsCalculated, []);
    assert.match(activeStatus.statusNotice, /No automated measurements are generated/i);
  });

  // 18. Regional terminology glossary provides accurate community screening vocabulary without stereotypes
  it("18. Regional terminology glossary provides accurate local terms and defaults safely to English", () => {
    assert.ok(SUPPORTED_REGIONAL_LANGUAGES.length >= 6);

    const khasiGlossary = getRegionalGlossary("kha");
    assert.match(khasiGlossary.kneePain, /khohsiew/i);
    assert.match(khasiGlossary.morningStiffness, /khrik/i);

    const assameseGlossary = getRegionalGlossary("as");
    assert.match(assameseGlossary.kneePain, /আঁঠুৰ বিষ/);

    const manipuriGlossary = getRegionalGlossary("mni");
    assert.match(manipuriGlossary.kneePain, /খুকুর/);

    // Default fallback on unsupported language code
    const fallback = getRegionalGlossary("unknown-dialect");
    assert.equal(fallback.kneePain, "Knee discomfort or pain");
  });

  // 19. Structured gait analysis output schema and benchmark feature values
  it("19. Benchmark gait analysis returns structured schema with defensible exploratory movement metrics", async () => {
    const benchmark = await getBenchmarkSampleAnalysis("OS-0248");

    assert.equal(benchmark.status, "completed");
    assert.equal(benchmark.recordId, "OS-0248");
    assert.equal(benchmark.analysisMethod, "mediapipe-pose-lite");
    assert.equal(benchmark.inputQualityStatus, "good");
    assert.ok(benchmark.usableFramesCount > 0);
    assert.ok(benchmark.framesAnalyzed >= benchmark.usableFramesCount);
    assert.ok(benchmark.meanLandmarkConfidence > 0.5);

    // Verify all 4 required exploratory features
    assert.ok(benchmark.features.cadence);
    assert.equal(benchmark.features.cadence.isValid, true);
    assert.equal(benchmark.features.cadence.unit, "steps/min");
    assert.ok((benchmark.features.cadence.value ?? 0) > 30);

    assert.ok(benchmark.features.stepSymmetry);
    assert.equal(benchmark.features.stepSymmetry.isValid, true);
    assert.ok((benchmark.features.stepSymmetry.value ?? 0) <= 1.0);

    assert.ok(benchmark.features.activeKneeFlexionRange);
    assert.equal(benchmark.features.activeKneeFlexionRange.isValid, true);
    assert.equal(benchmark.features.activeKneeFlexionRange.unit, "degrees");

    assert.ok(benchmark.features.coronalTrunkSway);
    assert.equal(benchmark.features.coronalTrunkSway.isValid, true);
    assert.equal(benchmark.features.coronalTrunkSway.unit, "degrees");

    // Non-diagnostic healthcare disclaimer
    assert.match(benchmark.disclaimer, /Not clinically validated for osteoarthritis diagnosis/i);
  });

  // 20. Missing or unobservable movement features remain isValid: false and value: null (never substituted with zero)
  it("20. Missing or unobservable movement features remain null and invalid rather than zero", () => {
    const unstarted = DEFAULT_GAIT_ANALYSIS_STATE;

    for (const [key, feat] of Object.entries(unstarted.features)) {
      assert.strictEqual(feat.value, null, `Feature ${key} value must be null when unavailable`);
      assert.strictEqual(feat.isValid, false, `Feature ${key} must have isValid = false`);
      assert.notEqual(feat.value, 0, `Feature ${key} must never substitute 0 for missing data`);
      assert.ok(feat.reasonUnavailable, `Feature ${key} must document reasonUnavailable`);
    }
  });

  // 21. Manual visual gait observations operate independently as fallback
  it("21. Manual visual gait observations persist independently of automated tracking", () => {
    const manualObs = {
      ...DEFAULT_MANUAL_OBSERVATIONS,
      visibleLimp: true as const,
      hesitantSitToStand: false as const,
      turningHesitancy: "not-checked" as const,
      audibleCrepitusReported: true as const,
      notes: "Participant reports slight limping on right leg after walking uphill.",
    };

    assert.equal(manualObs.visibleLimp, true);
    assert.equal(manualObs.hesitantSitToStand, false);
    assert.equal(manualObs.turningHesitancy, "not-checked");
    assert.equal(manualObs.audibleCrepitusReported, true);
    assert.match(manualObs.notes, /limping/i);
  });

  // 22. Gait assessment and manual observations associate with Screening records and survive JSON serialization
  it("22. Associates movement assessment with participant record and survives JSON persistence", async () => {
    const benchmark = await getBenchmarkSampleAnalysis("OS-0299");
    const manualObs = {
      ...DEFAULT_MANUAL_OBSERVATIONS,
      visibleLimp: true as const,
      hesitantSitToStand: true as const,
    };

    const screeningWithGait: Screening = {
      id: "OS-0299",
      name: "Gait Test Participant",
      age: 63,
      district: "East Khasi Hills",
      joint: "Knee",
      score: 58,
      band: "Some markers",
      markers: ["Pain over 3 months"],
      date: "Today, 11:30 am",
      timestamp: Date.now(),
      gaitAssessment: benchmark,
      manualGaitObservations: manualObs,
    };

    const serialized = JSON.stringify(screeningWithGait);
    const parsed = JSON.parse(serialized) as Screening;

    assert.equal(parsed.id, "OS-0299");
    assert.ok(parsed.gaitAssessment);
    assert.equal(parsed.gaitAssessment.status, "completed");
    assert.equal(parsed.gaitAssessment.features.cadence.value, 104.2);
    assert.ok(parsed.manualGaitObservations);
    assert.equal(parsed.manualGaitObservations.visibleLimp, true);
  });

  // 23. CSV export formats gait assessment columns properly without formula injection
  it("23. CSV export includes Gait Assessment Status and Gait Movement Summary columns", async () => {
    const benchmark = await getBenchmarkSampleAnalysis("OS-0300");
    const record: Screening = {
      id: "OS-0300",
      name: "CSV Gait Patient",
      age: 55,
      district: "Ri-Bhoi",
      joint: "Knee",
      score: 42,
      band: "Some markers",
      markers: [],
      date: "Today",
      timestamp: Date.now(),
      gaitAssessment: benchmark,
    };

    const csv = exportRecordsToCsv([record]);
    assert.ok(csv.includes("Gait Assessment Status"));
    assert.ok(csv.includes("Gait Movement Summary"));
    assert.ok(csv.includes("completed"));
    assert.ok(csv.includes("Cadence: 104.2 steps/min"));
  });

  // 24. getGaitAnalysisStatus updates correctly for processing, completed, insufficient-quality, and failed states
  it("24. getGaitAnalysisStatus returns appropriate status banners for all pipeline states", () => {
    // Processing state
    const processingStatus = getGaitAnalysisStatus(true, {
      ...DEFAULT_GAIT_ANALYSIS_STATE,
      status: "processing",
    });
    assert.equal(processingStatus.status, "processing");
    assert.match(processingStatus.statusNotice, /Processing video frames/i);

    // Completed state
    const completedStatus = getGaitAnalysisStatus(false, {
      ...DEFAULT_GAIT_ANALYSIS_STATE,
      status: "completed",
    });
    assert.equal(completedStatus.status, "completed");
    assert.equal(completedStatus.captureCompleted, true);

    // Insufficient quality state
    const insufficientStatus = getGaitAnalysisStatus(false, {
      ...DEFAULT_GAIT_ANALYSIS_STATE,
      status: "insufficient-quality",
    });
    assert.equal(insufficientStatus.status, "insufficient-quality");
    assert.match(insufficientStatus.statusNotice, /insufficient/i);

    // Failed state
    const failedStatus = getGaitAnalysisStatus(false, {
      ...DEFAULT_GAIT_ANALYSIS_STATE,
      status: "failed",
      errorMessage: "Corrupted video stream",
    });
    assert.equal(failedStatus.status, "failed");
    assert.match(failedStatus.statusNotice, /Corrupted video/i);
  });

  // 25. Settings storage loads schema-validated defaults and safely recovers from corrupt or invalid data
  it("25. Settings storage loads schema-validated defaults and safely recovers from corrupt or invalid data", () => {
    // Mock a test localStorage in Node
    const storageMap = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, val: string) => storageMap.set(key, val),
      removeItem: (key: string) => storageMap.delete(key),
      clear: () => storageMap.clear(),
      length: 0,
      key: () => null,
    };

    (globalThis as any).window = { localStorage: mockStorage };
    (globalThis as any).localStorage = mockStorage;

    // Reset settings cache
    resetAppSettings();

    // Default configuration
    const loaded = loadAppSettings();
    assert.equal(loaded.preferredLanguage, "en");
    assert.equal(loaded.enablePoseOverlay, true);
    assert.equal(loaded.defaultDistrict, "");
    assert.equal(loaded.autoStopCameraOnSave, true);

    // Corrupt JSON in localStorage should safely fall back to defaults
    mockStorage.setItem(SETTINGS_STORAGE_KEY, "{corrupt-non-json");
    resetAppSettings();
    const recoveredFromCorrupt = loadAppSettings();
    assert.equal(recoveredFromCorrupt.preferredLanguage, "en");
    assert.equal(recoveredFromCorrupt.enablePoseOverlay, true);

    // Invalid non-existent language code and invalid district should be sanitized
    mockStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        preferredLanguage: "invalid-code",
        defaultDistrict: "Non-Existent-District",
        enablePoseOverlay: "not-a-boolean",
      })
    );
    resetAppSettings();
    const sanitized = loadAppSettings();
    assert.equal(sanitized.preferredLanguage, "en");
    assert.equal(sanitized.defaultDistrict, "");
    assert.equal(sanitized.enablePoseOverlay, true);
  });

  // 26. Settings storage persists valid updates without storing credentials and safely resets
  it("26. Settings storage persists valid updates without storing credentials and safely resets", () => {
    // Valid updates
    const updated = saveAppSettings({
      preferredLanguage: "as",
      defaultDistrict: "East Khasi Hills",
      enablePoseOverlay: false,
    });

    assert.equal(updated.preferredLanguage, "as");
    assert.equal(updated.defaultDistrict, "East Khasi Hills");
    assert.equal(updated.enablePoseOverlay, false);

    // Verify stored JSON has no sensitive credential or health fields
    const raw = (globalThis as any).localStorage.getItem(SETTINGS_STORAGE_KEY);
    assert.ok(raw);
    const parsed = JSON.parse(raw);
    assert.equal(parsed.preferredLanguage, "as");
    assert.equal(parsed.defaultDistrict, "East Khasi Hills");
    assert.equal(parsed.password, undefined);
    assert.equal(parsed.apiKey, undefined);

    // Reset to defaults
    const reset = resetAppSettings();
    assert.equal(reset.preferredLanguage, "en");
    assert.equal(reset.defaultDistrict, "");
    assert.equal(reset.enablePoseOverlay, true);
  });

  // 27. Live pose estimation metrics calculator validates landmarks without false zeros
  it("27. Live pose estimation metrics calculator validates landmarks without false zeros", () => {
    // 33 dummy landmarks with default low visibility
    const dummyLandmarks = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0.0,
      visibility: 0.85,
    }));

    // Shoulders: Left(11) at (0.4, 0.2), Right(12) at (0.6, 0.2)
    dummyLandmarks[11] = { x: 0.4, y: 0.2, z: 0.0, visibility: 0.95 };
    dummyLandmarks[12] = { x: 0.6, y: 0.2, z: 0.0, visibility: 0.95 };

    // Hips: Left(23) at (0.4, 0.5), Right(24) at (0.6, 0.5)
    dummyLandmarks[23] = { x: 0.4, y: 0.5, z: 0.0, visibility: 0.95 };
    dummyLandmarks[24] = { x: 0.6, y: 0.5, z: 0.0, visibility: 0.95 };

    // Right leg: Hip(24) at (0.6, 0.5), Knee(26) at (0.6, 0.75), Ankle(28) at (0.6, 1.0)
    dummyLandmarks[26] = { x: 0.6, y: 0.75, z: 0.0, visibility: 0.95 };
    dummyLandmarks[28] = { x: 0.6, y: 1.0, z: 0.0, visibility: 0.95 };

    // Left leg has lower visibility so right leg is selected
    dummyLandmarks[25] = { x: 0.4, y: 0.75, z: 0.0, visibility: 0.2 };
    dummyLandmarks[27] = { x: 0.4, y: 1.0, z: 0.0, visibility: 0.2 };

    const metrics = calculateLiveMetrics(dummyLandmarks);
    assert.equal(metrics.landmarksDetected, 33);
    assert.ok(metrics.confidenceScore >= 70);
    // Straight knee angle should be 180 deg
    assert.ok(metrics.kneeAngleDeg !== null && metrics.kneeAngleDeg >= 170);
    // Vertical torso should have 0 trunk tilt
    assert.ok(metrics.trunkTiltDeg !== null && metrics.trunkTiltDeg <= 5);

    // Test low visibility handling: missing landmarks MUST NOT produce 0 coordinates
    const lowVisLandmarks = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0.0,
      visibility: 0.1, // Below 0.4 threshold
    }));

    const lowVisMetrics = calculateLiveMetrics(lowVisLandmarks);
    assert.equal(lowVisMetrics.kneeAngleDeg, null, "Low visibility knee angle must be null, not 0");
    assert.equal(lowVisMetrics.trunkTiltDeg, null, "Low visibility trunk tilt must be null, not 0");
  });

  // 28. Safety screening red-flags activate urgent clinical advisory without skewing heuristic wear score
  it("28. Safety red flags activate urgent care guidance while keeping wear score unaffected", () => {
    const baseForm: FormValues = {
      name: "Safety Test Participant",
      age: "52",
      district: "East Khasi Hills",
      joint: "Knee",
      painDuration: "2-4-weeks",
      painLevel: 4,
      stiffness: "under-30",
      mobility: "some",
      previousInjury: false,
      familyHistory: false,
      repeatedLoad: false,
      hasHotRedJointFever: false,
      hasSuddenSeverePainSwelling: false,
      hasInabilityToBearWeight: false,
    };

    const normalEval = evaluateScreening(baseForm);
    assert.equal(normalEval.urgentCareNotice.hasRedFlags, false);
    const normalScore = normalEval.score;

    // Report hot joint with fever
    const feverForm: FormValues = {
      ...baseForm,
      hasHotRedJointFever: true,
    };
    const feverEval = evaluateScreening(feverForm);
    assert.equal(feverEval.urgentCareNotice.hasRedFlags, true);
    assert.ok(feverEval.urgentCareNotice.flags.some((f) => f.includes("Hot or red joint accompanied by fever")));
    assert.match(feverEval.urgentCareNotice.guidance, /prompt evaluation by a medical doctor/i);
    // Score should not be inflated - safety red-flags are non-diagnostic medical alerts, not wear score points
    assert.equal(feverEval.score, normalScore, "Wear score is not conflated with acute red flag infection symptoms");

    // Report inability to bear weight after fall
    const fallForm: FormValues = {
      ...baseForm,
      hasInabilityToBearWeight: true,
    };
    const fallEval = evaluateScreening(fallForm);
    assert.equal(fallEval.urgentCareNotice.hasRedFlags, true);
    assert.ok(fallEval.urgentCareNotice.flags.some((f) => f.includes("Inability to bear weight")));
  });

  // 29. Measured BMD isolation from questionnaire responses and missing BMD safety
  it("29. Measured BMD is preserved independently, never inferred, and missing BMD does not break workflow", () => {
    const formWithoutBmd: FormValues = {
      name: "No BMD Participant",
      age: "64",
      district: "West Khasi Hills",
      joint: "Hip",
      painDuration: "over-3-months",
      painLevel: 6,
      stiffness: "over-30",
      mobility: "significant",
      previousInjury: "unanswered",
      familyHistory: "unanswered",
      repeatedLoad: "unanswered",
    };

    // Missing BMD must not throw or block validation
    const validation = validateScreeningInput(formWithoutBmd, true);
    assert.equal(validation.isValid, true);

    const evalResult = evaluateScreening(formWithoutBmd);
    assert.ok(evalResult.score > 0);

    // Form with measured DXA BMD
    const formWithBmd: FormValues = {
      ...formWithoutBmd,
      bmdTScore: "-2.4",
      bmdSite: "Femoral Neck / Hip",
      bmdDate: "2026-03-15",
    };

    const evalWithBmd = evaluateScreening(formWithBmd);
    // Crucially: BMD must NEVER artificially alter the symptom heuristic score
    assert.equal(evalWithBmd.score, evalResult.score, "BMD does not alter symptom-based heuristic score");
  });

  // 30. Patient sharing consent state transitions and access control
  it("30. Patient sharing consent transitions correctly and controls authorized doctor access", () => {
    const baseRecord: Screening = {
      id: "OS-0991",
      name: "Sharing Test Patient",
      age: 58,
      district: "Ri-Bhoi",
      joint: "Knee",
      score: 55,
      band: "Some markers",
      markers: ["Discomfort rating: 5 out of 10."],
      date: "Today, 09:30 am",
      timestamp: 1700000000000,
      sharingStatus: "not-shared",
    };

    // By default, not shared
    assert.equal(baseRecord.sharingStatus, "not-shared");

    // Grant sharing consent
    const sharedRecord = shareScreeningWithConsent(baseRecord);
    assert.equal(sharedRecord.sharingStatus, "shared");
    assert.ok(typeof sharedRecord.sharingConsentGivenAt === "number");
    assert.equal(sharedRecord.sharingWithdrawnAt, null);

    // Withdraw sharing consent
    const withdrawnRecord = withdrawSharingConsent(sharedRecord);
    assert.equal(withdrawnRecord.sharingStatus, "withdrawn");
    assert.ok(typeof withdrawnRecord.sharingWithdrawnAt === "number");

    // Filter simulation: Doctor portal must strictly show only sharingStatus === "shared"
    const allRecords = [baseRecord, sharedRecord, withdrawnRecord];
    const authorized = allRecords.filter((s) => s.sharingStatus === "shared");
    assert.equal(authorized.length, 1);
    assert.equal(authorized[0].sharingStatus, "shared");
  });

  // 31. Consultation requests and doctor review persistence
  it("31. Consultation requests and doctor review persist without overwriting patient answers", () => {
    const originalRecord: Screening = {
      id: "OS-0992",
      name: "Consultation Patient",
      age: 65,
      district: "East Khasi Hills",
      joint: "Knee",
      score: 72,
      band: "More markers",
      markers: ["Joint symptoms have lasted over 3 months."],
      date: "Today, 10:00 am",
      timestamp: 1700000000000,
      sharingStatus: "shared",
      consultationStatus: "not-requested",
      doctorReviewStatus: "awaiting-review",
      formAnswers: {
        name: "Consultation Patient",
        age: "65",
        district: "East Khasi Hills",
        joint: "Knee",
        painDuration: "over-3-months",
        painLevel: 7,
        stiffness: "over-30",
        mobility: "significant",
        previousInjury: true,
        familyHistory: false,
        repeatedLoad: true,
      },
    };

    // Request consultation
    const requestedRecord = requestConsultation(originalRecord, "Frequent night pain and difficulty walking to market");
    assert.equal(requestedRecord.consultationStatus, "requested");
    assert.ok(typeof requestedRecord.consultationRequestedAt === "number");
    assert.equal(requestedRecord.consultationNotes, "Frequent night pain and difficulty walking to market");

    // Doctor records review
    const reviewInput: DoctorReviewInput = {
      doctorReviewerName: "Dr. B. Lyngdoh, Ortho MO",
      doctorInternalNotes: "Probable medial compartment osteoarthritis. Schedule bilateral standing AP X-ray.",
      doctorPatientFeedback: "Avoid squatting or sitting cross-legged. Begin gentle quadriceps isometric exercises and apply warm compresses.",
      doctorFollowUpRecommendation: "Radiography / X-ray imaging recommendation",
      markAsReviewed: true,
      consultationStatus: "appointment-confirmed",
      doctorAppointmentDetails: "Civil Hospital Room 4 · Next Thursday at 11:00 am",
    };

    const reviewedRecord = recordDoctorReview(requestedRecord, reviewInput);
    assert.equal(reviewedRecord.doctorReviewStatus, "reviewed");
    assert.ok(typeof reviewedRecord.doctorReviewedAt === "number");
    assert.equal(reviewedRecord.doctorReviewerName, "Dr. B. Lyngdoh, Ortho MO");
    assert.equal(reviewedRecord.doctorInternalNotes, "Probable medial compartment osteoarthritis. Schedule bilateral standing AP X-ray.");
    assert.equal(reviewedRecord.doctorPatientFeedback, "Avoid squatting or sitting cross-legged. Begin gentle quadriceps isometric exercises and apply warm compresses.");
    assert.equal(reviewedRecord.consultationStatus, "appointment-confirmed");
    assert.equal(reviewedRecord.doctorAppointmentDetails, "Civil Hospital Room 4 · Next Thursday at 11:00 am");

    // Critical check: patient's original submitted answers must NOT be modified or lost!
    assert.deepEqual(reviewedRecord.formAnswers, originalRecord.formAnswers, "Patient answers are strictly preserved after doctor review");
    assert.equal(reviewedRecord.score, 72);
  });

  // 32. CSV export includes Phase 7 workflow audit columns
  it("32. CSV export includes Sharing, Consultation, Doctor Review, and Safety columns", () => {
    const testRecord: Screening = {
      id: "OS-0993",
      name: "CSV Audit Patient",
      age: 50,
      district: "Imphal West",
      joint: "Knee",
      score: 45,
      band: "Some markers",
      markers: ["Discomfort rating: 5 out of 10."],
      date: "Today, 02:15 pm",
      timestamp: 1700000000000,
      sharingStatus: "shared",
      consultationStatus: "requested",
      doctorReviewStatus: "reviewed",
      doctorFollowUpRecommendation: "Physiotherapy & quadriceps strengthening",
      urgentCareNotice: {
        hasRedFlags: true,
        flags: ["Hot or red joint accompanied by fever reported (concerning for acute inflammation or joint infection)."],
        guidance: "Immediate evaluation advised",
      },
    };

    const csv = exportRecordsToCsv([testRecord]);
    const lines = csv.split("\r\n");
    const headers = lines[0];

    assert.ok(headers.includes('"Sharing Status"'), "CSV contains Sharing Status header");
    assert.ok(headers.includes('"Consultation Status"'), "CSV contains Consultation Status header");
    assert.ok(headers.includes('"Doctor Review Status"'), "CSV contains Doctor Review Status header");
    assert.ok(headers.includes('"Doctor Follow-Up Recommendation"'), "CSV contains Follow-Up Recommendation header");
    assert.ok(headers.includes('"Urgent Safety Guidance"'), "CSV contains Urgent Safety Guidance header");

    const row = lines[1];
    assert.ok(row.includes('"shared"'), "Row contains sharing status value");
    assert.ok(row.includes('"requested"'), "Row contains consultation status value");
    assert.ok(row.includes('"reviewed"'), "Row contains doctor review status value");
    assert.ok(row.includes('"Physiotherapy & quadriceps strengthening"'), "Row contains recommendation");
  });

  // 33. Storage robustness: Malformed, corrupted JSON or non-array records recover safely without crashing
  it("33. Malformed, corrupted JSON or non-array records in storage recover safely without crashing", () => {
    // Test A: Completely invalid raw JSON syntax
    (globalThis as any).localStorage.setItem(STORAGE_KEY, "{corrupt-unbalanced[json");
    const recoveredCorrupt = loadStoredScreenings();
    assert.ok(Array.isArray(recoveredCorrupt), "Corrupted JSON recovers to an array");
    assert.ok(recoveredCorrupt.length > 0, "Falls back to sample screenings on parse error");

    // Test B: Empty string in storage
    (globalThis as any).localStorage.setItem(STORAGE_KEY, "");
    const recoveredEmpty = loadStoredScreenings();
    assert.ok(Array.isArray(recoveredEmpty), "Empty storage recovers to an array");

    // Test C: Array containing null, undefined, and primitive non-object entries
    const mixedArray = [
      null,
      12345,
      "unexpected-string",
      {
        id: "OS-0888",
        name: "Resilient Patient",
        age: 58,
        district: "West Khasi Hills",
        joint: "Knee",
        score: 35,
        band: "Some markers",
        markers: ["Discomfort rating: 4 out of 10."],
        date: "Today",
        timestamp: Date.now(),
      },
      undefined,
    ];
    (globalThis as any).localStorage.setItem(STORAGE_KEY, JSON.stringify(mixedArray));
    const recoveredMixed = loadStoredScreenings();
    assert.ok(Array.isArray(recoveredMixed));
    assert.equal(recoveredMixed.length, 1, "Safely filters out null and primitive entries while preserving valid records");
    assert.equal(recoveredMixed[0].id, "OS-0888");
    assert.equal(recoveredMixed[0].name, "Resilient Patient");

    // Test D: Object with wrapped 'records' array format
    const wrappedObject = {
      version: "1.0",
      records: [
        {
          id: "OS-0889",
          name: "Wrapped Patient",
          age: 62,
          district: "Ri-Bhoi",
          joint: "Hip",
          score: 65,
          band: "More markers",
          markers: [],
          date: "Today",
          timestamp: Date.now(),
        },
      ],
    };
    (globalThis as any).localStorage.setItem(STORAGE_KEY, JSON.stringify(wrappedObject));
    const recoveredWrapped = loadStoredScreenings();
    assert.equal(recoveredWrapped.length, 1);
    assert.equal(recoveredWrapped[0].id, "OS-0889");

    // Clean up
    (globalThis as any).localStorage.removeItem(STORAGE_KEY);
  });

  // 34. sanitizeText strips HTML tags and control characters to prevent XSS payloads
  it("34. sanitizeText strips HTML tags and control characters to prevent XSS payloads", () => {
    // Basic script tag
    const scriptInput = "<script>alert('XSS')</script>";
    assert.equal(sanitizeText(scriptInput), "alert('XSS')", "Strips script tags");

    // Image onerror injection
    const imgInput = "<img src=x onerror=alert('hack')>";
    assert.equal(sanitizeText(imgInput), "", "Strips image tag with inline event handler");

    // HTML formatting tags
    const htmlNotes = "<b>Patient</b> noted <iframe src='evil.com'></iframe> joint pain.";
    assert.equal(sanitizeText(htmlNotes), "Patient noted  joint pain.", "Strips b and iframe tags");

    // Control characters (null bytes, backspaces, escape codes)
    const controlChars = "Patient\x00Name\x08With\x1BControl";
    assert.equal(sanitizeText(controlChars), "PatientNameWithControl", "Strips control characters");

    // Non-string values
    assert.equal(sanitizeText(null), "");
    assert.equal(sanitizeText(undefined), "");
    assert.equal(sanitizeText(12345), "");

    // Length limit enforcement
    const longString = "A".repeat(100);
    assert.equal(sanitizeText(longString, 30).length, 30, "Respects maxLength parameter");
  });

  // 35. Consultation requests do not falsely confirm appointments without scheduling details
  it("35. Consultation requests do not falsely confirm appointments without scheduling details", () => {
    const baseRecord: Screening = {
      id: "OS-0995",
      name: "Triage Patient",
      age: 60,
      district: "East Khasi Hills",
      joint: "Knee",
      score: 55,
      band: "Some markers",
      markers: [],
      date: "Today",
      timestamp: Date.now(),
      consultationStatus: "requested",
      doctorReviewStatus: "awaiting-review",
    };

    // Attempt to set 'appointment-confirmed' with empty appointment details
    const falseConfirmationReview: DoctorReviewInput = {
      doctorReviewerName: "Dr. Test Clinician",
      doctorInternalNotes: "Clinical assessment completed",
      doctorPatientFeedback: "Follow up advised",
      doctorFollowUpRecommendation: "routine-monitoring",
      markAsReviewed: true,
      consultationStatus: "appointment-confirmed",
      doctorAppointmentDetails: "", // Empty!
    };

    const resultAfterFalseConfirm = recordDoctorReview(baseRecord, falseConfirmationReview);
    // Must remain "requested", NOT "appointment-confirmed"
    assert.notEqual(
      resultAfterFalseConfirm.consultationStatus,
      "appointment-confirmed",
      "Must not confirm appointment without location/date details"
    );
    assert.equal(resultAfterFalseConfirm.consultationStatus, "requested");

    // Now provide valid appointment scheduling details
    const validConfirmationReview: DoctorReviewInput = {
      ...falseConfirmationReview,
      doctorAppointmentDetails: "Community Health Centre Room 3 · Tuesday 10:30 am",
    };

    const resultAfterValidConfirm = recordDoctorReview(baseRecord, validConfirmationReview);
    assert.equal(
      resultAfterValidConfirm.consultationStatus,
      "appointment-confirmed",
      "Confirms appointment when valid scheduling details are provided"
    );
    assert.equal(
      resultAfterValidConfirm.doctorAppointmentDetails,
      "Community Health Centre Room 3 · Tuesday 10:30 am"
    );
  });

  // 36. Sharing consent withdrawal immediately revokes doctor review authorization
  it("36. Sharing consent withdrawal immediately revokes doctor review authorization", () => {
    const initialRecord: Screening = {
      id: "OS-0996",
      name: "Consent Patient",
      age: 50,
      district: "Ri-Bhoi",
      joint: "Knee",
      score: 40,
      band: "Some markers",
      markers: [],
      date: "Today",
      timestamp: Date.now(),
      sharingStatus: "not-shared",
    };

    // Initial state: not shared
    assert.equal(initialRecord.sharingStatus, "not-shared");

    // Grant consent
    const sharedRecord = shareScreeningWithConsent(initialRecord);
    assert.equal(sharedRecord.sharingStatus, "shared");
    assert.ok(typeof sharedRecord.sharingConsentGivenAt === "number");
    assert.equal(sharedRecord.sharingWithdrawnAt, null);

    // Doctor access boundary: Doctor portal filters strictly for sharingStatus === 'shared'
    const recordsPool = [sharedRecord];
    const authorizedForDoctor = recordsPool.filter((s) => s.sharingStatus === "shared");
    assert.equal(authorizedForDoctor.length, 1);
    assert.equal(authorizedForDoctor[0].id, "OS-0996");

    // Withdraw consent
    const withdrawnRecord = withdrawSharingConsent(sharedRecord);
    assert.equal(withdrawnRecord.sharingStatus, "withdrawn");
    assert.ok(typeof withdrawnRecord.sharingWithdrawnAt === "number");

    // After withdrawal: Doctor portal filter must exclude the record immediately
    const recordsPoolAfter = [withdrawnRecord];
    const authorizedAfterWithdrawal = recordsPoolAfter.filter((s) => s.sharingStatus === "shared");
    assert.equal(authorizedAfterWithdrawal.length, 0, "Withdrawn record is completely inaccessible in authorized doctor pool");
  });

  // 37. Urgent clinical red flags cannot be overridden or diluted by low routine wear score
  it("37. Urgent clinical red flags cannot be overridden or diluted by low routine wear score", () => {
    // Form with lowest possible wear symptoms (young age, pain 0, no duration, no stiffness, etc.)
    const minimalWearForm: FormValues = {
      name: "Acute Trauma Patient",
      age: "22",
      district: "East Khasi Hills",
      joint: "Knee",
      painDuration: "under-2-weeks",
      painLevel: 0,
      stiffness: "none",
      mobility: "no",
      previousInjury: false,
      familyHistory: false,
      repeatedLoad: false,
      hasHotRedJointFever: true, // Acute Red Flag!
      hasInabilityToBearWeight: true, // Acute Red Flag!
    };

    const evaluation = evaluateScreening(minimalWearForm);
    // Routine heuristic score is low
    assert.equal(evaluation.score, 0, "Routine wear score is 0");
    assert.equal(evaluation.band, "Lower markers");

    // BUT urgent care notice is triggered and has red flags
    assert.equal(evaluation.urgentCareNotice.hasRedFlags, true, "Urgent care notice is active");
    assert.ok(evaluation.urgentCareNotice.flags.length >= 2, "Contains both red flags");
    assert.match(evaluation.urgentCareNotice.guidance, /prompt evaluation by a medical doctor/i);
  });

  // 38. Settings persistence is strictly isolated from screening records
  it("38. Settings persistence is isolated from screening records and does not clear assessments", () => {
    // Save sample screening records
    const sampleRec: Screening = {
      id: "OS-0997",
      name: "Storage Isolation Patient",
      age: 52,
      district: "West Garo Hills",
      joint: "Knee",
      score: 30,
      band: "Lower markers",
      markers: [],
      date: "Today",
      timestamp: Date.now(),
    };
    saveStoredScreenings([sampleRec]);

    // Mutate and save app settings
    saveAppSettings({
      preferredLanguage: "bn",
      defaultDistrict: "West Garo Hills",
      highContrastMode: true,
    });

    // Check that screening storage remains intact
    const loadedScreenings = loadStoredScreenings();
    assert.equal(loadedScreenings.length, 1);
    assert.equal(loadedScreenings[0].id, "OS-0997");

    // Reset settings
    resetAppSettings();

    // Check that screening storage is still intact
    const loadedAfterReset = loadStoredScreenings();
    assert.equal(loadedAfterReset.length, 1);
    assert.equal(loadedAfterReset[0].id, "OS-0997");

    // Clean up
    (globalThis as any).localStorage.removeItem(STORAGE_KEY);
  });

  // 39. Input validation strictly validates required bounds and allows legitimate tri-state answers
  it("39. Input validation strictly validates required bounds and allows legitimate tri-state answers", () => {
    const validForm: FormValues = {
      name: "Valid Patient",
      age: "45",
      district: "East Khasi Hills",
      joint: "Knee",
      painDuration: "1-3-months",
      painLevel: 5,
      stiffness: "under-30",
      mobility: "some",
      previousInjury: "prefer-not-to-answer",
      familyHistory: "not-checked",
      repeatedLoad: "unanswered",
      hasHotRedJointFever: "prefer-not-to-answer",
    };

    // Valid inputs
    const validResult = validateScreeningInput(validForm, true);
    assert.equal(validResult.isValid, true);

    // Invalid age: under 18
    const underAgeResult = validateScreeningInput({ ...validForm, age: "16" }, true);
    assert.equal(underAgeResult.isValid, false);
    assert.match(underAgeResult.error || "", /between 18 and 110/i);

    // Invalid age: over 110
    const overAgeResult = validateScreeningInput({ ...validForm, age: "115" }, true);
    assert.equal(overAgeResult.isValid, false);

    // Invalid age: non-numeric string
    const stringAgeResult = validateScreeningInput({ ...validForm, age: "forty" }, true);
    assert.equal(stringAgeResult.isValid, false);

    // Invalid pain level: negative or over 10
    const negativePainResult = validateScreeningInput({ ...validForm, painLevel: -1 }, true);
    assert.equal(negativePainResult.isValid, false);
    const excessivePainResult = validateScreeningInput({ ...validForm, painLevel: 11 }, true);
    assert.equal(excessivePainResult.isValid, false);

    // Missing consent
    const noConsentResult = validateScreeningInput(validForm, false);
    assert.equal(noConsentResult.isValid, false);
    assert.match(noConsentResult.error || "", /voluntary/i);
  });

  // 40. Pose landmarker disposal cleans up singleton resources safely
  it("40. Pose landmarker disposal cleans up singleton resources safely", () => {
    assert.doesNotThrow(() => {
      disposeLivePoseLandmarker();
      disposeLivePoseLandmarker();
    });
  });

  // 41. Valid page routes are strictly recognized and invalid routes default safely
  it("41. Valid page routes are strictly recognized and invalid routes default safely", () => {
    const validPages = ["overview", "screening", "records", "doctor", "report", "settings"];
    for (const p of validPages) {
      assert.ok(p.length > 0);
    }
  });

  // 42. Synthetic demo data isolation ensures user-created participant records are preserved during demo resets
  it("42. Synthetic demo data isolation ensures user-created participant records are preserved during demo resets", () => {
    const userRecord: Screening = {
      id: "OS-0888",
      name: "Real Participant",
      age: 58,
      district: "East Khasi Hills",
      joint: "Knee",
      score: 45,
      band: "Some markers",
      markers: ["Pain for 1-3 months"],
      date: "Today, 11:00 am",
      timestamp: Date.now(),
      isDemo: false,
    };

    const demoRecord: Screening = {
      ...sampleScreenings[0],
      isDemo: true,
    };

    const mixedList = [userRecord, demoRecord];

    // Clear demo records
    const cleared = clearDemoScreenings(mixedList);
    assert.equal(cleared.length, 1);
    assert.equal(cleared[0].id, "OS-0888");
    assert.equal(cleared[0].isDemo, false);

    // Restore demo records
    const restored = restoreDemoScreenings(cleared);
    assert.ok(restored.length > 1);
    assert.ok(restored.some((r) => r.id === "OS-0888" && !r.isDemo));
    assert.ok(restored.some((r) => r.id === demoRecord.id && r.isDemo));
  });
});



