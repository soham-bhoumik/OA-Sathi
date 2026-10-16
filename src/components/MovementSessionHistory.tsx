import { memo, useState, useEffect, useCallback } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Cloud,
  Database,
  Eye,
  FileText,
  HardDrive,
  Info,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  type MovementAssessmentSession,
  getStorageConfig,
  createMovementAssessmentSession,
  saveMovementSession,
  loadMovementSessions,
  deleteMovementSession,
  clearDemoSessions,
} from "../logic/movementSessionStorage";
import {
  type ChecklistTaskEvaluation,
  type ChecklistTaskId,
  type ChecklistOverallSummary,
  CHECKLIST_TASK_DEFINITIONS,
} from "../logic/movementChecklistEvaluation";
import type { StructuredGaitAnalysisOutput, ManualGaitObservations } from "../services/gaitAnalysisService";

export interface MovementSessionHistoryProps {
  currentEvaluations: Partial<Record<ChecklistTaskId, ChecklistTaskEvaluation | null>>;
  overallSummary: ChecklistOverallSummary;
  patientName?: string | null;
  patientId?: string | null;
  isCurrentSessionDemo?: boolean;
  gaitAssessment?: StructuredGaitAnalysisOutput | null;
  manualObservations?: ManualGaitObservations | null;
}

export const MovementSessionHistory = memo(function MovementSessionHistory({
  currentEvaluations,
  overallSummary,
  patientName: initialPatientName,
  patientId: initialPatientId,
  isCurrentSessionDemo = false,
  gaitAssessment,
  manualObservations,
}: MovementSessionHistoryProps) {
  const [sessions, setSessions] = useState<MovementAssessmentSession[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"all" | "real" | "demo">("all");
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "warn" | "error" | "info";
    text: string;
  } | null>(null);

  const [isHistoryExpanded, setIsHistoryExpanded] = useState<boolean>(false);
  const [viewingSession, setViewingSession] = useState<MovementAssessmentSession | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // Form fields for saving
  const [sessionPatientName, setSessionPatientName] = useState<string>(initialPatientName || "");
  const [sessionNotes, setSessionNotes] = useState<string>("");
  const [isDemoFlag, setIsDemoFlag] = useState<boolean>(isCurrentSessionDemo);

  const storageConfig = getStorageConfig();

  // Load saved sessions on mount
  const refreshSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await loadMovementSessions();
      setSessions(result.sessions);
      if (result.notice && !storageConfig.isConfigured) {
        // Inform user about local demo mode on initial load
      }
    } catch {
      setStatusMessage({
        type: "error",
        text: "Could not load saved sessions. Check browser storage permissions.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [storageConfig.isConfigured]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  // Keep patient name synced if parent form updates
  useEffect(() => {
    if (initialPatientName && !sessionPatientName) {
      setSessionPatientName(initialPatientName);
    }
  }, [initialPatientName, sessionPatientName]);

  const hasAttemptedAnyTask = overallSummary.notStartedCount < overallSummary.totalTasks;

  const handleSaveCurrentSession = async () => {
    if (!hasAttemptedAnyTask) {
      setStatusMessage({
        type: "warn",
        text: "Please record or attempt at least one movement checklist task before saving a session.",
      });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    const newSession = createMovementAssessmentSession({
      patientId: initialPatientId || (sessionPatientName ? `p_${Date.now().toString(36)}` : null),
      patientName: sessionPatientName.trim() || (isDemoFlag ? "Demo Participant" : "Anonymised"),
      isDemo: isDemoFlag,
      checklistTasks: currentEvaluations,
      overallSummary,
      gaitAssessment,
      manualObservations,
      notes: sessionNotes.trim() || null,
    });

    const result = await saveMovementSession(newSession);
    setIsSaving(false);

    if (result.success) {
      setStatusMessage({
        type: result.provider === "supabase" ? "success" : "info",
        text: result.message,
      });
      refreshSessions();
      setIsHistoryExpanded(true); // Automatically open history to show saved record
    } else {
      setStatusMessage({
        type: "warn",
        text: `${result.message} ${result.error ? `(${result.error.slice(0, 80)})` : ""}`,
      });
      refreshSessions();
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    const result = await deleteMovementSession(sessionId);
    setConfirmingDeleteId(null);
    if (result.success) {
      setStatusMessage({
        type: "info",
        text: result.message,
      });
      refreshSessions();
      if (viewingSession?.id === sessionId) {
        setViewingSession(null);
      }
    } else {
      setStatusMessage({
        type: "error",
        text: `Delete failed: ${result.message}`,
      });
    }
  };

  const handleClearDemoSessions = () => {
    const res = clearDemoSessions();
    setStatusMessage({
      type: "info",
      text: `Removed ${res.demoRemoved} demo sessions. Preserved ${res.realPreserved} real records.`,
    });
    refreshSessions();
  };

  const filteredSessions = sessions.filter((s) => {
    if (activeTab === "real") return !s.isDemo;
    if (activeTab === "demo") return s.isDemo;
    return true;
  });

  return (
    <div className="movement-session-history-container" id="movement-session-history">
      {/* Save Session Action Card */}
      <div className="save-session-panel">
        <div className="save-session-header">
          <div className="save-session-title">
            <Save size={16} className="text-teal" />
            <div>
              <h4 className="panel-title">Save Movement Assessment Session</h4>
              <p className="panel-subtitle">
                Store structured kinematic results, completion statuses, and tracking quality indicators.
              </p>
            </div>
          </div>

          <div className="storage-target-badge">
            {storageConfig.isConfigured ? (
              <span className="badge-cloud" title="Supabase project connected via environment variables">
                <Cloud size={12} /> Supabase Cloud Connected
              </span>
            ) : (
              <span className="badge-local" title="Supabase credentials not configured. Using local browser storage demo fallback.">
                <HardDrive size={12} /> Local Demo Storage (Fallback)
              </span>
            )}
          </div>
        </div>

        {/* Save Inputs */}
        <div className="save-session-inputs">
          <div className="input-group">
            <label htmlFor="session-patient-name" className="input-label">
              <User size={13} /> Participant / Patient Ref
            </label>
            <input
              id="session-patient-name"
              type="text"
              className="text-input"
              placeholder="e.g. Participant #42 or John Doe"
              value={sessionPatientName}
              onChange={(e) => setSessionPatientName(e.target.value)}
              disabled={isSaving}
            />
          </div>

          <div className="input-group">
            <label htmlFor="session-notes" className="input-label">
              <FileText size={13} /> Session Notes (Optional)
            </label>
            <input
              id="session-notes"
              type="text"
              className="text-input"
              placeholder="e.g. Performed on standard armless chair"
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              disabled={isSaving}
            />
          </div>

          <div className="demo-toggle-group">
            <label className="checkbox-label" title="Explicitly flags this session as simulated/demo to isolate it from real clinical findings.">
              <input
                type="checkbox"
                checked={isDemoFlag}
                onChange={(e) => setIsDemoFlag(e.target.checked)}
                disabled={isSaving}
              />
              <span>Mark as Demo / Simulated Test</span>
            </label>
          </div>
        </div>

        {/* Save Action Row */}
        <div className="save-session-actions">
          <button
            type="button"
            className="button button-primary save-btn"
            onClick={handleSaveCurrentSession}
            disabled={isSaving || !hasAttemptedAnyTask}
            title={
              !hasAttemptedAnyTask
                ? "Record at least one movement before saving"
                : "Save session results"
            }
          >
            {isSaving ? (
              <>
                <RefreshCw size={14} className="spinning" /> Saving session...
              </>
            ) : (
              <>
                <Save size={14} /> Save Session ({overallSummary.completedCount}/{overallSummary.totalTasks} completed)
              </>
            )}
          </button>

          <button
            type="button"
            className="button button-secondary view-history-toggle"
            onClick={() => setIsHistoryExpanded((v) => !v)}
            aria-expanded={isHistoryExpanded}
          >
            <Database size={13} />
            <span>Session History ({sessions.length})</span>
            {isHistoryExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>

        {/* Status Message Alert */}
        {statusMessage && (
          <div className={`session-status-banner status-${statusMessage.type}`} role="alert">
            {statusMessage.type === "success" && <CheckCircle2 size={15} />}
            {statusMessage.type === "warn" && <AlertTriangle size={15} />}
            {statusMessage.type === "error" && <AlertCircle size={15} />}
            {statusMessage.type === "info" && <Info size={15} />}
            <span className="banner-text">{statusMessage.text}</span>
            <button
              type="button"
              className="banner-close"
              onClick={() => setStatusMessage(null)}
              aria-label="Dismiss alert"
            >
              <X size={12} />
            </button>
          </div>
        )}

        <div className="save-privacy-note">
          <ShieldCheck size={13} />
          <span>
            <strong>Data Integrity:</strong> Zero camera video or image frames are stored. Only structured mathematical angles, frame counts, and completion statuses are preserved.
          </span>
        </div>
      </div>

      {/* Session History Section */}
      {isHistoryExpanded && (
        <div className="session-history-panel" role="region" aria-label="Session History">
          <div className="history-toolbar">
            <div className="history-tabs">
              <button
                type="button"
                className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
                onClick={() => setActiveTab("all")}
              >
                All Sessions ({sessions.length})
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === "real" ? "active" : ""}`}
                onClick={() => setActiveTab("real")}
              >
                Patient Records ({sessions.filter((s) => !s.isDemo).length})
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === "demo" ? "active" : ""}`}
                onClick={() => setActiveTab("demo")}
              >
                Demo / Benchmark ({sessions.filter((s) => s.isDemo).length})
              </button>
            </div>

            <div className="history-actions">
              <button
                type="button"
                className="button button-secondary btn-sm"
                onClick={refreshSessions}
                disabled={isLoading}
                title="Reload sessions from database"
              >
                <RefreshCw size={12} className={isLoading ? "spinning" : ""} /> Refresh
              </button>

              {sessions.some((s) => s.isDemo) && (
                <button
                  type="button"
                  className="button button-secondary btn-sm btn-danger-outline"
                  onClick={handleClearDemoSessions}
                  title="Remove all synthetic demo test runs while keeping real records"
                >
                  <Trash2 size={12} /> Clear Demo Data
                </button>
              )}
            </div>
          </div>

          {/* Sessions List */}
          {filteredSessions.length === 0 ? (
            <div className="history-empty-state">
              <FileText size={28} className="empty-icon" />
              <p className="empty-title">No saved sessions found</p>
              <p className="empty-desc">
                {activeTab === "all"
                  ? "Perform a movement assessment above and click 'Save Session' to record it here."
                  : activeTab === "real"
                    ? "No real patient sessions saved yet. Uncheck 'Mark as Demo' to save clinical records."
                    : "No demo sessions stored."}
              </p>
            </div>
          ) : (
            <div className="sessions-cards-list" role="list">
              {filteredSessions.map((session) => (
                <div
                  key={session.id}
                  className={`session-record-card ${session.isDemo ? "card-demo" : "card-real"}`}
                  role="listitem"
                >
                  <div className="card-top-row">
                    <div className="card-identity">
                      <span className="session-id" title={session.id}>
                        {session.id.slice(0, 16)}...
                      </span>
                      <strong className="session-patient">
                        {session.patientName || (session.isDemo ? "Demo Participant" : "Anonymised")}
                      </strong>
                    </div>

                    <div className="card-badges">
                      {session.isDemo ? (
                        <span className="badge-demo-tag" title="Simulated / Benchmark demonstration record">
                          Demo Session
                        </span>
                      ) : (
                        <span className="badge-real-tag" title="Clinical participant screening record">
                          Patient Record
                        </span>
                      )}

                      {session.storageProvider === "supabase" ? (
                        <span className="badge-cloud-pill" title="Saved to Supabase Cloud">
                          <Cloud size={10} /> Cloud
                        </span>
                      ) : (
                        <span className="badge-local-pill" title="Stored in Local Demo Fallback">
                          <HardDrive size={10} /> Local
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="card-meta-row">
                    <span className="meta-time">
                      <Clock3 size={11} /> {new Date(session.createdAt).toLocaleString()}
                    </span>

                    <span className="meta-tasks">
                      <strong>{session.overallSummary.completedCount}</strong> of{" "}
                      {session.overallSummary.totalTasks} Completed
                    </span>

                    <span
                      className={`tracking-tier-tag tracking-${session.trackingQualityTier}`}
                      title={`Average tracking confidence: ${Math.round(session.meanTrackingConfidence * 100)}%`}
                    >
                      {session.trackingQualityTier.toUpperCase()} TRACKING
                    </span>
                  </div>

                  {session.notes && <div className="card-notes">Note: {session.notes}</div>}

                  {/* Actions Row */}
                  <div className="card-actions-row">
                    <button
                      type="button"
                      className="button button-secondary btn-sm"
                      onClick={() => setViewingSession(session)}
                    >
                      <Eye size={12} /> View Summary
                    </button>

                    {confirmingDeleteId === session.id ? (
                      <div className="delete-confirm-box">
                        <span className="confirm-text">Confirm delete?</span>
                        <button
                          type="button"
                          className="button button-secondary btn-sm btn-danger"
                          onClick={() => handleDeleteSession(session.id)}
                        >
                          Yes, Delete
                        </button>
                        <button
                          type="button"
                          className="button button-secondary btn-sm"
                          onClick={() => setConfirmingDeleteId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="button button-secondary btn-sm btn-delete"
                        onClick={() => setConfirmingDeleteId(session.id)}
                        title="Delete this saved session"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Session Detail Modal */}
      {viewingSession && (
        <div className="session-modal-backdrop" onClick={() => setViewingSession(null)}>
          <div
            className="session-modal-content"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-session-title"
          >
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Activity size={18} className="text-teal" />
                <div>
                  <h4 id="modal-session-title" className="modal-title">
                    Movement Assessment Session Summary
                  </h4>
                  <span className="modal-subtitle">
                    ID: {viewingSession.id} · {new Date(viewingSession.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setViewingSession(null)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {/* Participant & Storage Banner */}
              <div className="modal-meta-grid">
                <div className="meta-tile">
                  <span className="tile-label">Participant / Patient</span>
                  <strong className="tile-val">
                    {viewingSession.patientName || (viewingSession.isDemo ? "Demo Participant" : "Anonymised")}
                  </strong>
                </div>

                <div className="meta-tile">
                  <span className="tile-label">Session Type</span>
                  <span className={`tile-tag ${viewingSession.isDemo ? "tag-demo" : "tag-real"}`}>
                    {viewingSession.isDemo ? "Simulated / Demo Test" : "Real Clinical Record"}
                  </span>
                </div>

                <div className="meta-tile">
                  <span className="tile-label">Storage Provider</span>
                  <span className="tile-val">
                    {viewingSession.storageProvider === "supabase" ? "Supabase Cloud" : "Local Demo Storage"}
                  </span>
                </div>

                <div className="meta-tile">
                  <span className="tile-label">Overall Progress</span>
                  <strong className="tile-val">
                    {viewingSession.overallSummary.completedCount} of {viewingSession.overallSummary.totalTasks} Done
                  </strong>
                </div>
              </div>

              {viewingSession.notes && (
                <div className="modal-notes-box">
                  <strong>Session Notes:</strong> {viewingSession.notes}
                </div>
              )}

              {/* Tasks Breakdown */}
              <h5 className="modal-section-heading">Checklist Tasks Breakdown</h5>
              <div className="modal-tasks-list">
                {(
                  [
                    "seated-knee-extension",
                    "seated-knee-flexion",
                    "sit-to-stand",
                    "supported-weight-shift",
                  ] as ChecklistTaskId[]
                ).map((taskId) => {
                  const def = CHECKLIST_TASK_DEFINITIONS[taskId];
                  const ev = viewingSession.checklistTasks[taskId];

                  return (
                    <div key={taskId} className="modal-task-item">
                      <div className="task-item-header">
                        <strong className="task-item-name">{def.title}</strong>
                        {ev ? (
                          <span
                            className={`status-pill pill-${ev.status}`}
                          >
                            {ev.outcomeLabel}
                          </span>
                        ) : (
                          <span className="status-pill pill-not-started">Not started</span>
                        )}
                      </div>

                      {ev && ev.status !== "not-started" && (
                        <div className="task-item-details">
                          <p className="item-feedback">{ev.feedbackSummary}</p>

                          {ev.observableMetrics && (
                            <div className="item-metrics">
                              {ev.observableMetrics.angleExcursionDeg !== undefined &&
                                ev.observableMetrics.angleExcursionDeg !== null && (
                                  <span>Excursion: <strong>{ev.observableMetrics.angleExcursionDeg}°</strong></span>
                                )}
                              {ev.observableMetrics.verticalDisplacementNorm !== undefined &&
                                ev.observableMetrics.verticalDisplacementNorm !== null && (
                                  <span>Vertical rise: <strong>{(ev.observableMetrics.verticalDisplacementNorm * 100).toFixed(1)}%</strong></span>
                                )}
                              {ev.observableMetrics.lateralDisplacementNorm !== undefined &&
                                ev.observableMetrics.lateralDisplacementNorm !== null && (
                                  <span>Lateral sway: <strong>{(ev.observableMetrics.lateralDisplacementNorm * 100).toFixed(1)}%</strong></span>
                                )}
                              {ev.observableMetrics.activeSide && (
                                <span>Side: <strong style={{ textTransform: "capitalize" }}>{ev.observableMetrics.activeSide}</strong></span>
                              )}
                            </div>
                          )}

                          <div className="item-tracking">
                            Tracking: <strong>{ev.trackingQuality.qualityStatus.toUpperCase()}</strong> ({Math.round(ev.trackingQuality.meanConfidence * 100)}% confidence · {ev.trackingQuality.usableFrames}/{ev.trackingQuality.totalFrames} frames)
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Non-Diagnostic Disclaimer */}
              <div className="modal-disclaimer">
                <Info size={14} />
                <span>
                  <strong>Clinical Notice:</strong> Movement assessment sessions store computer-vision exploratory observations. They do not infer cartilage thickness or diagnose osteoarthritis, and must not replace clinician clinical examination.
                </span>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setViewingSession(null)}
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
