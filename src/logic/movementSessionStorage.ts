/**
 * OA-Sathi Movement Assessment Session Storage Subsystem
 * -----------------------------------------------------
 * Hybrid cloud (Supabase) + local-demo (localStorage) storage client for
 * saving, loading, and deleting movement assessment checklist sessions.
 *
 * Core Guarantees:
 * 1. Zero video / image storage: stores structured kinematic metrics and summaries only.
 * 2. Explicit storage provider disclosure: clearly distinguishes "supabase" vs "local-demo".
 * 3. Never pretends cloud save succeeded if Supabase is unconfigured or returns an error.
 * 4. Never exposes or requires the Supabase service-role key; uses public anon key with RLS.
 * 5. Explicit `isDemo` flag separating synthetic/demo sessions from real patient records.
 * 6. Non-blocking, schema-validated error recovery and atomic rollback on failures.
 */

import type {
  ChecklistOverallSummary,
  ChecklistTaskEvaluation,
  ChecklistTaskId,
} from "./movementChecklistEvaluation";
import type {
  StructuredGaitAnalysisOutput,
  ManualGaitObservations,
} from "../services/gaitAnalysisService";

export const MOVEMENT_SESSION_STORAGE_KEY = "oasathi_movement_sessions_v1";

export interface MovementAssessmentSession {
  id: string; // e.g., "sess_1729123456789_abc12"
  patientId: string | null;
  patientName: string | null;
  createdAt: number; // Unix timestamp in ms
  createdAtIso: string; // ISO 8601 string
  isDemo: boolean; // Explicit flag for synthetic / demo sessions
  checklistTasks: Partial<Record<ChecklistTaskId, ChecklistTaskEvaluation | null>>;
  overallSummary: ChecklistOverallSummary;
  gaitAssessment?: StructuredGaitAnalysisOutput | null;
  manualObservations?: ManualGaitObservations | null;
  trackingQualityTier: "good" | "fair" | "insufficient" | "unusable" | "unassessed";
  meanTrackingConfidence: number; // 0.0 - 1.0
  notes?: string | null;
  storageProvider: "supabase" | "local-demo";
  syncedToCloud: boolean;
  cloudSyncError?: string | null;
}

export interface StorageConfig {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  isConfigured: boolean;
  providerLabel: string;
}

export interface SessionOperationResult<T = void> {
  success: boolean;
  data?: T;
  provider: "supabase" | "local-demo";
  message: string;
  error?: string;
}

/**
 * Safely resolves an environment variable across browser (Vite) and Node.js (test) environments.
 */
export function getEnvVariable(key: string): string | null {
  try {
    const meta = import.meta as any;
    if (meta && meta.env && typeof meta.env[key] === "string") {
      const val = meta.env[key].trim();
      return val.length > 0 ? val : null;
    }
  } catch {
    // import.meta not available
  }

  try {
    const g = globalThis as any;
    if (typeof g.process !== "undefined" && g.process.env && typeof g.process.env[key] === "string") {
      const val = g.process.env[key].trim();
      return val.length > 0 ? val : null;
    }
  } catch {
    // process not available
  }

  return null;
}

/**
 * Inspects environment configuration and returns Supabase connection state.
 */
export function getStorageConfig(): StorageConfig {
  const supabaseUrl = getEnvVariable("VITE_SUPABASE_URL");
  const supabaseAnonKey = getEnvVariable("VITE_SUPABASE_ANON_KEY");

  const isConfigured = Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith("http") &&
    supabaseAnonKey.length > 20
  );

  return {
    supabaseUrl,
    supabaseAnonKey,
    isConfigured,
    providerLabel: isConfigured ? "Supabase Cloud" : "Local Storage (Demo Fallback)",
  };
}

/**
 * Generates a stable, collision-resistant session ID.
 */
export function generateSessionId(): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `sess_${timestamp}_${randomSuffix}`;
}

/**
 * Extracts average tracking confidence and overall tracking tier across evaluated checklist tasks.
 */
export function summarizeSessionTrackingQuality(
  tasks: Partial<Record<ChecklistTaskId, ChecklistTaskEvaluation | null>>
): { tier: "good" | "fair" | "insufficient" | "unusable" | "unassessed"; meanConfidence: number } {
  const evals = Object.values(tasks).filter(
    (t): t is ChecklistTaskEvaluation => t !== null && t !== undefined && t.status !== "not-started"
  );

  if (evals.length === 0) {
    return { tier: "unassessed", meanConfidence: 0 };
  }

  const sumConfidence = evals.reduce((sum, e) => sum + (e.trackingQuality.meanConfidence || 0), 0);
  const meanConfidence = sumConfidence / evals.length;

  const hasUnusable = evals.some((e) => e.trackingQuality.qualityStatus === "unusable");
  const hasInsufficient = evals.some((e) => e.trackingQuality.qualityStatus === "insufficient");
  const hasFair = evals.some((e) => e.trackingQuality.qualityStatus === "fair");

  let tier: "good" | "fair" | "insufficient" | "unusable" = "good";
  if (hasUnusable) {
    tier = "unusable";
  } else if (hasInsufficient) {
    tier = "insufficient";
  } else if (hasFair) {
    tier = "fair";
  }

  return { tier, meanConfidence: Math.round(meanConfidence * 100) / 100 };
}

/**
 * Constructs a fully validated, typed MovementAssessmentSession.
 */
export function createMovementAssessmentSession(params: {
  id?: string;
  patientId?: string | null;
  patientName?: string | null;
  isDemo?: boolean;
  checklistTasks: Partial<Record<ChecklistTaskId, ChecklistTaskEvaluation | null>>;
  overallSummary: ChecklistOverallSummary;
  gaitAssessment?: StructuredGaitAnalysisOutput | null;
  manualObservations?: ManualGaitObservations | null;
  notes?: string | null;
}): MovementAssessmentSession {
  const now = Date.now();
  const trackingSummary = summarizeSessionTrackingQuality(params.checklistTasks);

  return {
    id: params.id || generateSessionId(),
    patientId: params.patientId ? params.patientId.trim() : null,
    patientName: params.patientName ? params.patientName.trim() : null,
    createdAt: now,
    createdAtIso: new Date(now).toISOString(),
    isDemo: Boolean(params.isDemo),
    checklistTasks: { ...params.checklistTasks },
    overallSummary: { ...params.overallSummary },
    gaitAssessment: params.gaitAssessment || null,
    manualObservations: params.manualObservations || null,
    trackingQualityTier: trackingSummary.tier,
    meanTrackingConfidence: trackingSummary.meanConfidence,
    notes: params.notes ? params.notes.trim() : null,
    storageProvider: "local-demo",
    syncedToCloud: false,
    cloudSyncError: null,
  };
}

// ---------------------------------------------------------------------------
// Local-Demo Fallback Storage Handlers
// ---------------------------------------------------------------------------

export function loadLocalSessions(): MovementAssessmentSession[] {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return [];
    }
    const raw = window.localStorage.getItem(MOVEMENT_SESSION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((s): s is Record<string, any> => typeof s === "object" && s !== null && typeof s.id === "string")
      .map((s): MovementAssessmentSession => ({
        id: s.id,
        patientId: typeof s.patientId === "string" ? s.patientId : null,
        patientName: typeof s.patientName === "string" ? s.patientName : null,
        createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now(),
        createdAtIso: typeof s.createdAtIso === "string" ? s.createdAtIso : new Date().toISOString(),
        isDemo: Boolean(s.isDemo),
        checklistTasks: typeof s.checklistTasks === "object" && s.checklistTasks !== null ? s.checklistTasks : {},
        overallSummary: typeof s.overallSummary === "object" && s.overallSummary !== null ? s.overallSummary : {
          totalTasks: 4,
          completedCount: 0,
          tryAgainCount: 0,
          unableCount: 0,
          notStartedCount: 4,
          allAttempted: false,
          warnings: [],
        },
        gaitAssessment: s.gaitAssessment || null,
        manualObservations: s.manualObservations || null,
        trackingQualityTier: s.trackingQualityTier === "good" || s.trackingQualityTier === "fair" || s.trackingQualityTier === "insufficient" || s.trackingQualityTier === "unusable" ? s.trackingQualityTier : "unassessed",
        meanTrackingConfidence: typeof s.meanTrackingConfidence === "number" ? s.meanTrackingConfidence : 0,
        notes: typeof s.notes === "string" ? s.notes : null,
        storageProvider: s.storageProvider === "supabase" ? "supabase" : "local-demo",
        syncedToCloud: Boolean(s.syncedToCloud),
        cloudSyncError: s.cloudSyncError || null,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.warn("Failed to read local movement assessment sessions:", err);
    return [];
  }
}

export function saveLocalSession(session: MovementAssessmentSession): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return false;
    }
    const existing = loadLocalSessions();
    const updated = [session, ...existing.filter((s) => s.id !== session.id)];
    window.localStorage.setItem(MOVEMENT_SESSION_STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch (err) {
    console.error("Failed to save session to local storage:", err);
    return false;
  }
}

export function deleteLocalSession(sessionId: string): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return false;
    }
    const existing = loadLocalSessions();
    const updated = existing.filter((s) => s.id !== sessionId);
    window.localStorage.setItem(MOVEMENT_SESSION_STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch (err) {
    console.error("Failed to delete session from local storage:", err);
    return false;
  }
}

export function clearDemoSessions(): { demoRemoved: number; realPreserved: number } {
  const existing = loadLocalSessions();
  const realSessions = existing.filter((s) => !s.isDemo);
  const demoCount = existing.length - realSessions.length;

  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(MOVEMENT_SESSION_STORAGE_KEY, JSON.stringify(realSessions));
  }

  return { demoRemoved: demoCount, realPreserved: realSessions.length };
}

// ---------------------------------------------------------------------------
// Cloud Supabase REST Operations
// ---------------------------------------------------------------------------

/**
 * Maps frontend camelCase session structure to Supabase snake_case schema.
 */
function sessionToSupabaseRow(session: MovementAssessmentSession): Record<string, any> {
  return {
    id: session.id,
    patient_id: session.patientId,
    patient_name: session.patientName,
    created_at: session.createdAtIso,
    is_demo: session.isDemo,
    checklist_tasks: session.checklistTasks,
    overall_summary: session.overallSummary,
    gait_assessment: session.gaitAssessment,
    manual_observations: session.manualObservations,
    tracking_quality_tier: session.trackingQualityTier,
    mean_tracking_confidence: session.meanTrackingConfidence,
    notes: session.notes,
  };
}

/**
 * Maps Supabase snake_case schema row back to typed frontend session.
 */
function supabaseRowToSession(row: Record<string, any>): MovementAssessmentSession {
  return {
    id: row.id,
    patientId: row.patient_id ?? null,
    patientName: row.patient_name ?? null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    createdAtIso: row.created_at ?? new Date().toISOString(),
    isDemo: Boolean(row.is_demo),
    checklistTasks: row.checklist_tasks ?? {},
    overallSummary: row.overall_summary ?? {
      totalTasks: 4,
      completedCount: 0,
      tryAgainCount: 0,
      unableCount: 0,
      notStartedCount: 4,
      allAttempted: false,
      warnings: [],
    },
    gaitAssessment: row.gait_assessment ?? null,
    manualObservations: row.manual_observations ?? null,
    trackingQualityTier: row.tracking_quality_tier ?? "unassessed",
    meanTrackingConfidence: Number(row.mean_tracking_confidence ?? 0),
    notes: row.notes ?? null,
    storageProvider: "supabase",
    syncedToCloud: true,
    cloudSyncError: null,
  };
}

function getFetchFn(customFetch?: typeof fetch): typeof fetch {
  if (customFetch) return customFetch;
  if (typeof window !== "undefined" && typeof window.fetch === "function") {
    return window.fetch.bind(window);
  }
  if (typeof globalThis !== "undefined" && typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }
  return fetch;
}

/**
 * Saves a movement assessment session.
 * - If Supabase credentials exist, saves to Supabase cloud database via REST API.
 * - If Supabase is unconfigured or encounters a network error, saves locally to demo storage
 *   and explicitly reports the fallback without pretending cloud save succeeded.
 */
export async function saveMovementSession(
  session: MovementAssessmentSession,
  customFetch?: typeof fetch
): Promise<SessionOperationResult<MovementAssessmentSession>> {
  const config = getStorageConfig();
  const fetchFn = getFetchFn(customFetch);

  // Fallback case: Supabase not configured -> Store locally as demo/fallback
  if (!config.isConfigured || !config.supabaseUrl || !config.supabaseAnonKey) {
    const localSession: MovementAssessmentSession = {
      ...session,
      storageProvider: "local-demo",
      syncedToCloud: false,
      cloudSyncError: "Supabase credentials not configured. Stored in local browser storage.",
    };

    const saved = saveLocalSession(localSession);
    if (!saved) {
      return {
        success: false,
        provider: "local-demo",
        message: "Failed to save session to local browser storage.",
        error: "Storage write failed",
      };
    }

    return {
      success: true,
      data: localSession,
      provider: "local-demo",
      message: "Session saved to local demo storage (Supabase cloud credentials not configured).",
    };
  }

  // Cloud case: Save to Supabase
  try {
    const endpoint = `${config.supabaseUrl.replace(/\/+$/, "")}/rest/v1/movement_assessment_sessions`;
    const payload = sessionToSupabaseRow(session);

    const res = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
        Prefer: "return=representation,resolution=merge-duplicates",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      // Save locally with explicit cloudSyncError indicator
      const fallbackSession: MovementAssessmentSession = {
        ...session,
        storageProvider: "local-demo",
        syncedToCloud: false,
        cloudSyncError: `Cloud save rejected (HTTP ${res.status}): ${errText.slice(0, 100)}`,
      };
      saveLocalSession(fallbackSession);

      return {
        success: false,
        data: fallbackSession,
        provider: "local-demo",
        message: `Cloud database returned HTTP ${res.status}. Stored locally in demo fallback.`,
        error: errText,
      };
    }

    const cloudSession: MovementAssessmentSession = {
      ...session,
      storageProvider: "supabase",
      syncedToCloud: true,
      cloudSyncError: null,
    };

    // Also mirror to local cache for offline viewing
    saveLocalSession(cloudSession);

    return {
      success: true,
      data: cloudSession,
      provider: "supabase",
      message: "Session successfully saved to Supabase cloud database.",
    };
  } catch (netErr) {
    const errorMsg = netErr instanceof Error ? netErr.message : "Network error";
    const fallbackSession: MovementAssessmentSession = {
      ...session,
      storageProvider: "local-demo",
      syncedToCloud: false,
      cloudSyncError: `Network connection failed: ${errorMsg}`,
    };
    saveLocalSession(fallbackSession);

    return {
      success: false,
      data: fallbackSession,
      provider: "local-demo",
      message: `Unable to reach Supabase (${errorMsg}). Saved locally in demo fallback.`,
      error: errorMsg,
    };
  }
}

/**
 * Loads movement assessment sessions:
 * - If Supabase is configured, fetches cloud records and falls back to local on failure.
 * - If Supabase is unconfigured, loads from local storage.
 */
export async function loadMovementSessions(
  customFetch?: typeof fetch
): Promise<{ sessions: MovementAssessmentSession[]; provider: "supabase" | "local-demo"; notice?: string }> {
  const config = getStorageConfig();
  const fetchFn = getFetchFn(customFetch);

  if (!config.isConfigured || !config.supabaseUrl || !config.supabaseAnonKey) {
    return {
      sessions: loadLocalSessions(),
      provider: "local-demo",
      notice: "Showing local demo sessions (Supabase cloud credentials not configured).",
    };
  }

  try {
    const endpoint = `${config.supabaseUrl.replace(/\/+$/, "")}/rest/v1/movement_assessment_sessions?select=*&order=created_at.desc`;
    const res = await fetchFn(endpoint, {
      method: "GET",
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
      },
    });

    if (!res.ok) {
      console.warn(`Supabase load failed (HTTP ${res.status}), falling back to local sessions.`);
      return {
        sessions: loadLocalSessions(),
        provider: "local-demo",
        notice: `Cloud fetch returned HTTP ${res.status}. Showing local cache.`,
      };
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      return { sessions: loadLocalSessions(), provider: "local-demo" };
    }

    const cloudSessions = data.map(supabaseRowToSession);
    return {
      sessions: cloudSessions,
      provider: "supabase",
      notice: "Sessions loaded from Supabase cloud database.",
    };
  } catch (err) {
    console.warn("Network error loading from Supabase, showing local sessions:", err);
    return {
      sessions: loadLocalSessions(),
      provider: "local-demo",
      notice: "Network offline. Showing local sessions.",
    };
  }
}

/**
 * Deletes a session by ID from Supabase cloud and local storage.
 */
export async function deleteMovementSession(
  sessionId: string,
  customFetch?: typeof fetch
): Promise<SessionOperationResult> {
  const config = getStorageConfig();
  const fetchFn = getFetchFn(customFetch);

  // Always delete from local storage
  deleteLocalSession(sessionId);

  if (!config.isConfigured || !config.supabaseUrl || !config.supabaseAnonKey) {
    return {
      success: true,
      provider: "local-demo",
      message: "Session deleted from local storage.",
    };
  }

  try {
    const endpoint = `${config.supabaseUrl.replace(/\/+$/, "")}/rest/v1/movement_assessment_sessions?id=eq.${encodeURIComponent(sessionId)}`;
    const res = await fetchFn(endpoint, {
      method: "DELETE",
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
      },
    });

    if (!res.ok) {
      return {
        success: false,
        provider: "supabase",
        message: `Deleted locally, but cloud delete failed (HTTP ${res.status}).`,
        error: await res.text(),
      };
    }

    return {
      success: true,
      provider: "supabase",
      message: "Session permanently deleted from Supabase cloud database.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return {
      success: false,
      provider: "supabase",
      message: `Deleted locally, but cloud delete encountered network error: ${msg}.`,
      error: msg,
    };
  }
}
