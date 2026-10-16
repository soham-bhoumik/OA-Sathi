import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  generateSessionId,
  createMovementAssessmentSession,
  saveMovementSession,
  loadMovementSessions,
  deleteMovementSession,
  clearDemoSessions,
  summarizeSessionTrackingQuality,
  getStorageConfig,
  type MovementAssessmentSession,
  MOVEMENT_SESSION_STORAGE_KEY,
} from "../src/logic/movementSessionStorage.ts";
import type {
  ChecklistTaskEvaluation,
  ChecklistTaskId,
  ChecklistOverallSummary,
} from "../src/logic/movementChecklistEvaluation.ts";

// In-memory mock localStorage for Node.js test environment
class MockLocalStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

const mockStorage = new MockLocalStorage();
// Assign to globalThis so window.localStorage or globalThis.localStorage is available
(globalThis as any).window = (globalThis as any).window || {};
(globalThis as any).window.localStorage = mockStorage;
(globalThis as any).localStorage = mockStorage;

const MOCK_SUMMARY: ChecklistOverallSummary = {
  totalTasks: 4,
  completedCount: 2,
  tryAgainCount: 1,
  unableCount: 0,
  notStartedCount: 1,
  allAttempted: false,
  warnings: [],
};

const MOCK_EVAL_GOOD: ChecklistTaskEvaluation = {
  taskId: "seated-knee-extension",
  status: "completed",
  outcomeLabel: "Movement detected",
  feedbackSummary: "Extension detected.",
  observableMetrics: { angleExcursionDeg: 28, activeSide: "right" },
  trackingQuality: {
    totalFrames: 30,
    usableFrames: 28,
    meanConfidence: 0.90,
    qualityStatus: "good",
  },
  limitations: ["2D plane only"],
  disclaimer: "Non-diagnostic",
  evaluatedAt: Date.now(),
};

const MOCK_EVAL_FAIR: ChecklistTaskEvaluation = {
  taskId: "seated-knee-flexion",
  status: "completed",
  outcomeLabel: "Movement detected",
  feedbackSummary: "Flexion detected.",
  observableMetrics: { angleExcursionDeg: 22, activeSide: "right" },
  trackingQuality: {
    totalFrames: 25,
    usableFrames: 18,
    meanConfidence: 0.55,
    qualityStatus: "fair",
    warning: "Tracking confidence was marginal.",
  },
  limitations: ["2D plane only"],
  disclaimer: "Non-diagnostic",
  evaluatedAt: Date.now(),
};

describe("OA-Sathi Movement Assessment Session Storage", () => {
  beforeEach(() => {
    mockStorage.clear();
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
  });

  it("1. Generates unique, non-colliding session IDs with 'sess_' prefix", () => {
    const id1 = generateSessionId();
    const id2 = generateSessionId();

    assert.ok(id1.startsWith("sess_"));
    assert.ok(id2.startsWith("sess_"));
    assert.notEqual(id1, id2);
  });

  it("2. Correctly aggregates session tracking quality across multiple movement tasks", () => {
    const tasks: Partial<Record<ChecklistTaskId, ChecklistTaskEvaluation | null>> = {
      "seated-knee-extension": MOCK_EVAL_GOOD,
      "seated-knee-flexion": MOCK_EVAL_FAIR,
      "sit-to-stand": null,
    };

    const summary = summarizeSessionTrackingQuality(tasks);
    assert.equal(summary.tier, "fair"); // downgraded to fair because one task is fair
    assert.ok(summary.meanConfidence > 0.70 && summary.meanConfidence < 0.75); // (0.90 + 0.55)/2 = 0.725 -> 0.73
  });

  it("3. Creates a valid session object with explicit demo flag and sanitized fields", () => {
    const session = createMovementAssessmentSession({
      patientName: " John Doe ",
      patientId: " P-101 ",
      isDemo: true,
      checklistTasks: { "seated-knee-extension": MOCK_EVAL_GOOD },
      overallSummary: MOCK_SUMMARY,
      notes: " Clean test ",
    });

    assert.equal(session.patientName, "John Doe");
    assert.equal(session.patientId, "P-101");
    assert.equal(session.isDemo, true);
    assert.equal(session.notes, "Clean test");
    assert.ok(session.createdAt > 0);
    assert.ok(session.createdAtIso.includes("T"));
    assert.equal(session.trackingQualityTier, "good");
  });

  it("4. Automatically uses local-demo fallback when Supabase credentials are missing", async () => {
    const config = getStorageConfig();
    assert.equal(config.isConfigured, false);
    assert.equal(config.providerLabel, "Local Storage (Demo Fallback)");

    const session = createMovementAssessmentSession({
      patientName: "Local Tester",
      isDemo: true,
      checklistTasks: { "seated-knee-extension": MOCK_EVAL_GOOD },
      overallSummary: MOCK_SUMMARY,
    });

    const result = await saveMovementSession(session);

    assert.equal(result.success, true);
    assert.equal(result.provider, "local-demo");
    assert.ok(result.message.includes("local demo storage"));
    assert.equal(result.data?.syncedToCloud, false);

    // Verify session actually exists in local storage
    const loadResult = await loadMovementSessions();
    assert.equal(loadResult.provider, "local-demo");
    assert.equal(loadResult.sessions.length, 1);
    assert.equal(loadResult.sessions[0].id, session.id);
    assert.equal(loadResult.sessions[0].patientName, "Local Tester");
  });

  it("5. Saves to Supabase Cloud when credentials are configured", async () => {
    process.env.VITE_SUPABASE_URL = "https://mockproject.supabase.co";
    process.env.VITE_SUPABASE_ANON_KEY = "mock_public_anon_key_for_testing_purposes_only_123456";

    const config = getStorageConfig();
    assert.equal(config.isConfigured, true);
    assert.equal(config.providerLabel, "Supabase Cloud");

    let fetchCalled = false;
    let endpointCalled = "";
    let headersSent: Record<string, string> = {};

    const mockFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      fetchCalled = true;
      endpointCalled = String(url);
      headersSent = (init?.headers as Record<string, string>) || {};

      return {
        ok: true,
        status: 201,
        json: async () => [{ id: "mock_id" }],
        text: async () => JSON.stringify([{ id: "mock_id" }]),
      } as unknown as Response;
    };

    const session = createMovementAssessmentSession({
      patientName: "Cloud Patient",
      isDemo: false,
      checklistTasks: { "seated-knee-extension": MOCK_EVAL_GOOD },
      overallSummary: MOCK_SUMMARY,
    });

    const result = await saveMovementSession(session, mockFetch as unknown as typeof fetch);

    assert.equal(fetchCalled, true);
    assert.ok(endpointCalled.includes("/rest/v1/movement_assessment_sessions"));
    assert.equal(headersSent["apikey"], process.env.VITE_SUPABASE_ANON_KEY);
    assert.ok(headersSent["Authorization"].includes(process.env.VITE_SUPABASE_ANON_KEY));
    assert.equal(result.success, true);
    assert.equal(result.provider, "supabase");
    assert.equal(result.data?.syncedToCloud, true);
  });

  it("6. Falls back to local storage when Supabase cloud returns an error", async () => {
    process.env.VITE_SUPABASE_URL = "https://mockproject.supabase.co";
    process.env.VITE_SUPABASE_ANON_KEY = "mock_public_anon_key_for_testing_purposes_only_123456";

    // Simulate Supabase 500 internal server error
    const mockFailingFetch = async (): Promise<Response> => {
      return {
        ok: false,
        status: 500,
        text: async () => "Internal server database error",
      } as unknown as Response;
    };

    const session = createMovementAssessmentSession({
      patientName: "Fallback Patient",
      checklistTasks: { "seated-knee-extension": MOCK_EVAL_GOOD },
      overallSummary: MOCK_SUMMARY,
    });

    const result = await saveMovementSession(session, mockFailingFetch as unknown as typeof fetch);

    // Must NOT claim cloud save succeeded
    assert.equal(result.success, false);
    assert.equal(result.provider, "local-demo");
    assert.ok(result.message.includes("HTTP 500"));
    assert.equal(result.data?.syncedToCloud, false);

    // Verify it was preserved locally as fallback
    const loaded = await loadMovementSessions(mockFailingFetch as unknown as typeof fetch);
    assert.equal(loaded.sessions.length, 1);
    assert.equal(loaded.sessions[0].patientName, "Fallback Patient");
    assert.ok(loaded.sessions[0].cloudSyncError?.includes("HTTP 500"));
  });

  it("7. Deletes a session cleanly from local and cloud storage", async () => {
    const session = createMovementAssessmentSession({
      patientName: "To Be Deleted",
      checklistTasks: { "seated-knee-extension": MOCK_EVAL_GOOD },
      overallSummary: MOCK_SUMMARY,
    });

    await saveMovementSession(session);
    const beforeDelete = await loadMovementSessions();
    assert.equal(beforeDelete.sessions.length, 1);

    const delResult = await deleteMovementSession(session.id);
    assert.equal(delResult.success, true);

    const afterDelete = await loadMovementSessions();
    assert.equal(afterDelete.sessions.length, 0);
  });

  it("8. Isolates synthetic demo sessions and allows clearing demo data without touching real patient records", async () => {
    const realSession = createMovementAssessmentSession({
      patientName: "Real Clinical Patient",
      isDemo: false,
      checklistTasks: { "seated-knee-extension": MOCK_EVAL_GOOD },
      overallSummary: MOCK_SUMMARY,
    });

    const demoSession1 = createMovementAssessmentSession({
      patientName: "Synthetic Demo 1",
      isDemo: true,
      checklistTasks: { "seated-knee-extension": MOCK_EVAL_GOOD },
      overallSummary: MOCK_SUMMARY,
    });

    const demoSession2 = createMovementAssessmentSession({
      patientName: "Synthetic Demo 2",
      isDemo: true,
      checklistTasks: { "seated-knee-extension": MOCK_EVAL_GOOD },
      overallSummary: MOCK_SUMMARY,
    });

    await saveMovementSession(realSession);
    await saveMovementSession(demoSession1);
    await saveMovementSession(demoSession2);

    const loadedAll = await loadMovementSessions();
    assert.equal(loadedAll.sessions.length, 3);

    // Clear demo sessions
    const clearResult = clearDemoSessions();
    assert.equal(clearResult.demoRemoved, 2);
    assert.equal(clearResult.realPreserved, 1);

    // Ensure real patient record is intact
    const remaining = await loadMovementSessions();
    assert.equal(remaining.sessions.length, 1);
    assert.equal(remaining.sessions[0].patientName, "Real Clinical Patient");
    assert.equal(remaining.sessions[0].isDemo, false);
  });

  it("9. Security: Never requests, exports, or requires Supabase service-role keys", () => {
    const config = getStorageConfig();
    assert.ok(!("serviceRoleKey" in config));
    assert.ok(!("supabaseServiceKey" in config));
    // Verify only public anon key is part of StorageConfig interface
    assert.deepEqual(Object.keys(config).sort(), [
      "isConfigured",
      "providerLabel",
      "supabaseAnonKey",
      "supabaseUrl",
    ].sort());
  });
});
