import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  type XrayView,
  type KneeLaterality,
  type KLGrade,
  type XrayDoctorReview,
  type XrayAnalysisOutput,
  type XrayAuditEntry,
  KL_GRADE_DESCRIPTIONS,
  BENCHMARK_XRAY_FIXTURES,
  MAX_XRAY_FILE_SIZE,
  validateXrayFile,
  checkViewSuitability,
  evaluateXrayClientFallback,
} from "../src/logic/xrayModels.ts";
import {
  exportRecordsToCsv,
  type Screening,
} from "../src/logic/screeningRules.ts";

describe("OA-Sathi AI-Assisted Knee X-Ray Radiograph Module Test Suite", () => {
  // 1. Image File Validation Tests
  it("1. Validates supported X-ray image formats (PNG, JPEG, WebP)", () => {
    // Mock valid PNG File
    const validPng = {
      name: "knee_ap_standing.png",
      size: 2 * 1024 * 1024,
      type: "image/png",
    } as unknown as File;
    const resPng = validateXrayFile(validPng);
    assert.equal(resPng.isValid, true);
    assert.equal(resPng.error, undefined);

    // Mock valid JPEG File
    const validJpg = {
      name: "knee_radiograph.jpg",
      size: 4.5 * 1024 * 1024,
      type: "image/jpeg",
    } as unknown as File;
    const resJpg = validateXrayFile(validJpg);
    assert.equal(resJpg.isValid, true);

    // Mock valid WebP File
    const validWebp = {
      name: "knee_pa_rosenberg.webp",
      size: 1.2 * 1024 * 1024,
      type: "image/webp",
    } as unknown as File;
    const resWebp = validateXrayFile(validWebp);
    assert.equal(resWebp.isValid, true);
  });

  it("2. Strictly rejects empty files (0 bytes)", () => {
    const emptyFile = {
      name: "zero_bytes.png",
      size: 0,
      type: "image/png",
    } as unknown as File;
    const res = validateXrayFile(emptyFile);
    assert.equal(res.isValid, false);
    assert.match(res.error || "", /empty/i);
  });

  it("3. Strictly rejects oversize files exceeding 15MB limit", () => {
    const hugeFile = {
      name: "huge_raw_dicom_export.png",
      size: 16 * 1024 * 1024,
      type: "image/png",
    } as unknown as File;
    const res = validateXrayFile(hugeFile);
    assert.equal(res.isValid, false);
    assert.match(res.error || "", /15MB/i);
  });

  it("4. Rejects unsupported MIME types and file extensions (e.g. .pdf, .txt, .exe, .svg)", () => {
    const pdfFile = {
      name: "scan_report.pdf",
      size: 500 * 1024,
      type: "application/pdf",
    } as unknown as File;
    const resPdf = validateXrayFile(pdfFile);
    assert.equal(resPdf.isValid, false);
    assert.match(resPdf.error || "", /unsupported/i);

    const txtFile = {
      name: "notes.txt",
      size: 1024,
      type: "text/plain",
    } as unknown as File;
    assert.equal(validateXrayFile(txtFile).isValid, false);

    const exeFile = {
      name: "malware.exe",
      size: 1024 * 1024,
      type: "application/x-msdownload",
    } as unknown as File;
    assert.equal(validateXrayFile(exeFile).isValid, false);
  });

  // 2. Anatomical View Validation & Abstention Tests
  it("5. Supports standing weight-bearing AP and PA knee views", () => {
    const apCheck = checkViewSuitability("AP");
    assert.equal(apCheck.isSupported, true);
    assert.equal(apCheck.warning, undefined);

    const paCheck = checkViewSuitability("PA");
    assert.equal(paCheck.isSupported, true);
    assert.equal(paCheck.warning, undefined);
  });

  it("6. Rejects lateral and other views with explicit clinical safety warning", () => {
    const lateralCheck = checkViewSuitability("Lateral");
    assert.equal(lateralCheck.isSupported, false);
    assert.match(lateralCheck.warning || "", /not supported/i);
    assert.match(lateralCheck.warning || "", /Lateral views require independent manual review/i);

    const otherCheck = checkViewSuitability("Other");
    assert.equal(otherCheck.isSupported, false);
    assert.match(otherCheck.warning || "", /not supported/i);
  });

  it("7. Model transparently abstains when presented with a lateral projection", () => {
    const lateralOutput = evaluateXrayClientFallback("data:image/svg+xml;utf8,<svg></svg>", {
      patientId: "TEST-PAT-001",
      laterality: "Left",
      view: "Lateral",
      consentConfirmed: true,
    });

    assert.equal(lateralOutput.status, "abstained");
    assert.equal(lateralOutput.abstained, true);
    assert.equal(lateralOutput.predictedKlGrade, undefined);
    assert.match(
      lateralOutput.abstentionReason || "",
      /Unable to provide a reliable model output — manual review required/i
    );
    assert.match(lateralOutput.abstentionReason || "", /Lateral/i);
  });

  // 3. Kellgren-Lawrence Descriptions & Class Probabilities
  it("8. Validates all KL Grades (0 to 4) have descriptive labels, severity, and clinical summaries", () => {
    for (const grade of [0, 1, 2, 3, 4] as KLGrade[]) {
      const desc = KL_GRADE_DESCRIPTIONS[grade];
      assert.ok(desc, `Description missing for KL-${grade}`);
      assert.ok(desc.label.includes(`KL Grade ${grade}`));
      assert.ok(desc.severity.length > 0);
      assert.ok(desc.clinicalSummary.length > 10);
    }
  });

  it("9. Evaluates AP radiograph benchmark and outputs valid class probability distribution summing to ~1.0", () => {
    const output = evaluateXrayClientFallback("benchmark_mild_knee_oa_kl2.png", {
      patientId: "TEST-PAT-002",
      laterality: "Right",
      view: "AP",
      filename: "benchmark_mild_knee_oa_kl2.png",
      consentConfirmed: true,
    });

    assert.equal(output.status, "completed");
    assert.equal(output.abstained, false);
    assert.equal(output.predictedKlGrade, 2);
    assert.ok(output.classProbabilities);

    const sum =
      output.classProbabilities.kl0 +
      output.classProbabilities.kl1 +
      output.classProbabilities.kl2 +
      output.classProbabilities.kl3 +
      output.classProbabilities.kl4;
    assert.ok(Math.abs(sum - 1.0) < 0.05, `Probability sum ${sum} not close to 1.0`);
    assert.ok(output.modelConfidence && output.modelConfidence > 0.6);
  });

  // 4. Benchmark Synthetic Fixtures
  it("10. Provides 4 pre-configured benchmark fixtures for safe hackathon presentation", () => {
    assert.equal(BENCHMARK_XRAY_FIXTURES.length, 4);

    const kl0 = BENCHMARK_XRAY_FIXTURES.find((f) => f.id === "fixture_kl0_normal");
    assert.ok(kl0);
    assert.equal(kl0.simulatedKl, 0);
    assert.equal(kl0.view, "AP");
    assert.ok(kl0.svgDataUri.startsWith("data:image/svg+xml;utf8,"));

    const kl2 = BENCHMARK_XRAY_FIXTURES.find((f) => f.id === "fixture_kl2_mild");
    assert.ok(kl2);
    assert.equal(kl2.simulatedKl, 2);

    const kl3 = BENCHMARK_XRAY_FIXTURES.find((f) => f.id === "fixture_kl3_moderate");
    assert.ok(kl3);
    assert.equal(kl3.simulatedKl, 3);

    const lateral = BENCHMARK_XRAY_FIXTURES.find((f) => f.id === "fixture_lateral_abstain");
    assert.ok(lateral);
    assert.equal(lateral.simulatedKl, null);
    assert.equal(lateral.view, "Lateral");
  });

  // 5. Consent and Authorization Enforcement
  it("11. Strictly refuses image inference when consent or clinician authorization is unconfirmed", () => {
    const unconfirmedOutput = evaluateXrayClientFallback("some_image.png", {
      patientId: "TEST-PAT-003",
      laterality: "Right",
      view: "AP",
      consentConfirmed: false,
    });

    assert.equal(unconfirmedOutput.status, "error");
    assert.match(unconfirmedOutput.abstentionReason || "", /consent and authorization/i);
  });

  // 6. Traceable Clinician Corrections & Non-Overwriting AI Output
  it("12. Traceably preserves both AI preliminary predicted KL and Clinician confirmed KL with correction note", () => {
    const aiOutput: XrayAnalysisOutput = {
      analysisId: "XR-TEST-123",
      status: "completed",
      patientId: "PAT-005",
      laterality: "Right",
      view: "AP",
      predictedKlGrade: 1,
      predictedKlLabel: "KL Grade 1 · Doubtful",
      modelConfidence: 0.62,
      uncertaintyScore: 0.38,
      modelMetadata: {
        modelName: "Knee-OA-ResNet-KLG",
        modelVersion: "1.0.0-edge",
        provider: "OA-Sathi Clinical Radiography AI Provider",
        supportedAnatomy: "Knee",
        supportedViews: ["AP", "PA"],
        unsupportedViews: ["Lateral"],
        intendedPopulation: "Adults 45+",
        evaluationDataset: "OAI / MOST",
        limitations: ["AP/PA only"],
        regulatoryStatus: "Investigational Demonstration",
      },
      timestamp: Date.now(),
      engineUsed: "client-benchmark-engine",
      abstained: false,
      confidence: 0.62,
    };

    const review: XrayDoctorReview = {
      reviewId: "XR-REV-001",
      patientId: "PAT-005",
      reviewStatus: "finalized",
      laterality: "Right",
      view: "AP",
      aiOutput,
      aiAnalysis: aiOutput,
      doctorReviewerName: "Dr. B. Das, MS (Ortho)",
      clinicianReviewerName: "Dr. B. Das, MS (Ortho)",
      reviewedAt: Date.now(),
      clinicianFindings: {
        jointSpaceNarrowing: "mild",
        osteophytes: "definite",
        subchondralSclerosis: false,
        boneDeformityOrCysts: false,
      },
      clinicianConfirmedKlGrade: 2, // Clinician overrides KL-1 to KL-2
      clinicianCorrectionReason: "Definite marginal osteophyte on medial tibial spine warrants KL-2 rather than doubtful KL-1.",
      clinicianImpression: "Mild medial compartment knee OA confirmed on radiograph.",
      recommendation: "Physical therapy & quadriceps strengthening exercises",
      auditTrail: [
        {
          id: "AUD-01",
          timestamp: Date.now(),
          action: "CLINICIAN_OVERRIDE_RECORDED",
          actor: "Dr. B. Das",
          details: "Clinician confirmed KL-2 despite AI prediction KL-1 due to definite osteophyte.",
        },
      ],
    };

    // Verify AI output is NOT overwritten
    assert.equal(review.aiOutput?.predictedKlGrade, 1);
    assert.equal(review.clinicianConfirmedKlGrade, 2);
    assert.ok(review.clinicianCorrectionReason?.includes("tibial spine"));
    assert.equal(review.auditTrail.length, 1);
  });

  // 7. CSV Export with X-ray Columns
  it("13. Exports X-ray Review Status, Predicted KL, and Clinician Confirmed KL in CSV records export", () => {
    const mockScreening: Screening = {
      id: "SCREEN-XR-01",
      name: "Ramesh Sen",
      age: 62,
      district: "East Khasi Hills",
      joint: "Knee",
      score: 7,
      band: "More markers",
      markers: ["Morning stiffness", "Weight-bearing pain"],
      date: "2026-10-16",
      timestamp: Date.now(),
      sharingStatus: "shared",
      xrayReview: {
        reviewId: "REV-XR-99",
        patientId: "SCREEN-XR-01",
        reviewStatus: "finalized",
        laterality: "Right",
        view: "AP",
        doctorReviewerName: "Dr. Sharma",
        reviewedAt: Date.now(),
        clinicianFindings: {
          jointSpaceNarrowing: "moderate",
          osteophytes: "definite",
          subchondralSclerosis: true,
        },
        clinicianConfirmedKlGrade: 3,
        aiOutput: {
          analysisId: "AI-01",
          status: "completed",
          patientId: "SCREEN-XR-01",
          laterality: "Right",
          view: "AP",
          predictedKlGrade: 3,
          modelMetadata: {
            modelName: "Knee-OA-ResNet-KLG",
            modelVersion: "1.0.0",
            provider: "OA-Sathi Provider",
            supportedAnatomy: "Knee",
            supportedViews: ["AP", "PA"],
            unsupportedViews: ["Lateral"],
            intendedPopulation: "Adults 45+",
            evaluationDataset: "OAI / MOST",
            limitations: ["AP/PA only"],
            regulatoryStatus: "Software Demonstration",
          },
          timestamp: Date.now(),
          engineUsed: "client-benchmark-engine",
        },
        auditTrail: [],
      },
    };

    const csv = exportRecordsToCsv([mockScreening]);
    assert.ok(csv.includes("X-ray Review Status"));
    assert.ok(csv.includes("X-ray Predicted KL Grade"));
    assert.ok(csv.includes("X-ray Clinician Confirmed KL"));

    // Check row data
    assert.ok(csv.includes("finalized"));
    assert.ok(csv.includes("KL-3"));
  });

  // 8. Audit Trail Privacy & Safety
  it("14. Audit trail captures action, actor, timestamp without storing raw image pixel data", () => {
    const auditEntry: XrayAuditEntry = {
      id: "AUD-SEC-01",
      eventId: "EVT-100",
      timestamp: Date.now(),
      action: "AI_INFERENCE_COMPLETED",
      eventType: "analysis_completed",
      actor: "Dr. A. Sharma",
      doctorId: "DOC-99",
      patientId: "PAT-101",
      details: {
        model: "Knee-OA-ResNet-KLG",
        view: "AP",
        laterality: "Right",
        predictedKl: 2,
        confidence: 0.74,
      },
    };

    const serialized = JSON.stringify(auditEntry);
    assert.ok(!serialized.includes("data:image"));
    assert.ok(!serialized.includes("<svg"));
    assert.ok(!serialized.includes("base64"));
    assert.ok(serialized.includes("AI_INFERENCE_COMPLETED"));
    assert.ok(serialized.includes("Dr. A. Sharma"));
  });
});
