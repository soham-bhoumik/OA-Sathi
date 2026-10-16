import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateBMI,
  calculateDashboardStats,
  escapeCsvField,
  evaluateScreening,
  exportRecordsToCsv,
  generateStableId,
  validateScreeningInput,
  type FormValues,
  type Screening,
} from "../src/logic/screeningRules.ts";

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
});
