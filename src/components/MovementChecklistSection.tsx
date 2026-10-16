import { memo, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Info,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
} from "lucide-react";
import {
  CHECKLIST_TASK_DEFINITIONS,
  type ChecklistOverallSummary,
  type ChecklistTaskDefinition,
  type ChecklistTaskEvaluation,
  type ChecklistTaskId,
} from "../logic/movementChecklistEvaluation";
import type { LivePoseStatus } from "../services/livePoseEstimation";
import type { StructuredGaitAnalysisOutput, ManualGaitObservations } from "../services/gaitAnalysisService";
import { MovementSessionHistory } from "./MovementSessionHistory";

export interface MovementChecklistSectionProps {
  cameraStatus: "idle" | "requesting" | "ready" | "unsupported" | "denied" | "error";
  cameraMessage: string;
  onStartCamera: () => void;
  livePoseStatus: LivePoseStatus;
  isAnyRecordingActive: boolean; // gait recording or other task
  activeRecordingTaskId: ChecklistTaskId | null;
  recordingSecondsRemaining: number;
  recordedFramesCount: number;
  taskEvaluations: Partial<Record<ChecklistTaskId, ChecklistTaskEvaluation | null>>;
  onStartTaskRecording: (taskId: ChecklistTaskId, durationSec: number) => void;
  onStopTaskEarly: () => void;
  onRepeatTask: (taskId: ChecklistTaskId) => void;
  onResetAllTasks: () => void;
  overallSummary: ChecklistOverallSummary;
  patientName?: string | null;
  patientId?: string | null;
  isDemo?: boolean;
  gaitAssessment?: StructuredGaitAnalysisOutput | null;
  manualObservations?: ManualGaitObservations | null;
}

const TASK_ORDER: ChecklistTaskId[] = [
  "seated-knee-extension",
  "seated-knee-flexion",
  "sit-to-stand",
  "supported-weight-shift",
];

export const MovementChecklistSection = memo(function MovementChecklistSection({
  cameraStatus,
  cameraMessage,
  onStartCamera,
  livePoseStatus,
  isAnyRecordingActive,
  activeRecordingTaskId,
  recordingSecondsRemaining,
  recordedFramesCount,
  taskEvaluations,
  onStartTaskRecording,
  onStopTaskEarly,
  onRepeatTask,
  onResetAllTasks,
  overallSummary,
  patientName,
  patientId,
  isDemo,
  gaitAssessment,
  manualObservations,
}: MovementChecklistSectionProps) {
  // Allow user to expand/collapse individual task details
  const [expandedTaskId, setExpandedTaskId] = useState<ChecklistTaskId | null>(
    "seated-knee-extension"
  );

  const toggleTaskExpansion = (taskId: ChecklistTaskId) => {
    setExpandedTaskId((curr) => (curr === taskId ? null : taskId));
  };

  const getStatusBadge = (
    evaluation: ChecklistTaskEvaluation | null | undefined,
    isCurrentlyRecording: boolean
  ) => {
    if (isCurrentlyRecording) {
      return (
        <span className="checklist-status-pill pill-recording" role="status">
          <span className="recording-live-pulse" />
          Recording ({recordingSecondsRemaining}s)
        </span>
      );
    }

    if (!evaluation || evaluation.status === "not-started") {
      return <span className="checklist-status-pill pill-not-started">Not started</span>;
    }

    if (evaluation.status === "completed") {
      return (
        <span className="checklist-status-pill pill-completed">
          <CheckCircle2 size={12} />
          Movement detected
        </span>
      );
    }

    if (evaluation.status === "try-again") {
      return (
        <span className="checklist-status-pill pill-try-again">
          <RotateCcw size={12} />
          Try again
        </span>
      );
    }

    if (evaluation.status === "unable-to-evaluate") {
      return (
        <span className="checklist-status-pill pill-unable">
          <AlertTriangle size={12} />
          Unable to evaluate
        </span>
      );
    }

    return null;
  };

  return (
    <div className="movement-checklist-section" id="movement-checklist">
      {/* Header with Title and Progress */}
      <div className="checklist-header">
        <div className="checklist-title-area">
          <span className="checklist-header-icon">
            <Activity size={18} />
          </span>
          <div>
            <h3 className="checklist-heading">Movement Checklist</h3>
            <p className="checklist-subheading">
              Guided video-based functional movement observations using local body landmark tracking.
            </p>
          </div>
        </div>

        {/* Progress Tracker */}
        <div className="checklist-progress-box">
          <div className="checklist-progress-meta">
            <span className="progress-label">Checklist Progress</span>
            <span className="progress-numbers">
              <strong>{overallSummary.completedCount}</strong> of {overallSummary.totalTasks} Completed
            </span>
          </div>
          <div className="checklist-progress-track" role="progressbar" aria-valuenow={overallSummary.completedCount} aria-valuemin={0} aria-valuemax={overallSummary.totalTasks}>
            <div
              className="checklist-progress-fill"
              style={{
                width: `${Math.round((overallSummary.completedCount / overallSummary.totalTasks) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Global Camera / Model State Alerts */}
      {cameraStatus !== "ready" && (
        <div className="checklist-camera-banner" role="alert">
          <AlertCircle size={16} />
          <div className="banner-content">
            <strong>Camera inactive:</strong>{" "}
            {cameraStatus === "denied"
              ? "Camera permission was denied. Please allow camera access to evaluate movements."
              : cameraStatus === "error"
                ? cameraMessage || "Camera initialization failed."
                : cameraStatus === "requesting"
                  ? "Awaiting camera permission..."
                  : "Start the camera above to begin recording checklist movements with live pose tracking."}
          </div>
          {cameraStatus === "idle" && (
            <button
              type="button"
              className="button button-primary"
              style={{ padding: "4px 10px", fontSize: "11px" }}
              onClick={onStartCamera}
            >
              <Camera size={13} /> Turn on camera
            </button>
          )}
        </div>
      )}

      {cameraStatus === "ready" && livePoseStatus === "error" && (
        <div className="checklist-camera-banner banner-warning" role="alert">
          <AlertTriangle size={16} />
          <div className="banner-content">
            <strong>Pose model offline:</strong> Video-based landmark evaluation is unavailable. Movement checklist cannot evaluate kinematic motion without active pose tracking.
          </div>
        </div>
      )}

      {/* Active Recording Notice Banner */}
      {activeRecordingTaskId && (
        <div className="checklist-recording-banner" role="status">
          <span className="recording-live-pulse" />
          <div style={{ flex: 1 }}>
            <strong>
              Recording movement in progress: {CHECKLIST_TASK_DEFINITIONS[activeRecordingTaskId].title}
            </strong>
            <div style={{ fontSize: "11.5px", marginTop: "2px" }}>
              {recordingSecondsRemaining}s remaining · {recordedFramesCount} frames captured locally · Perform the guided motion smoothly.
            </div>
          </div>
          <button
            type="button"
            className="button button-secondary checklist-stop-btn"
            onClick={onStopTaskEarly}
            title="Stop recording immediately and evaluate captured frames"
          >
            <Square size={12} /> Stop & Evaluate
          </button>
        </div>
      )}

      {/* Task Cards List */}
      <div className="checklist-tasks-grid" role="list">
        {TASK_ORDER.map((taskId, index) => {
          const def: ChecklistTaskDefinition = CHECKLIST_TASK_DEFINITIONS[taskId];
          const evaluation = taskEvaluations[taskId];
          const isThisTaskRecording = activeRecordingTaskId === taskId;
          const isAnotherTaskRecording = activeRecordingTaskId !== null && !isThisTaskRecording;
          const isExpanded = expandedTaskId === taskId || isThisTaskRecording;
          const prefixLetter = String.fromCharCode(65 + index); // 'A', 'B', 'C', 'D'

          const canStart =
            cameraStatus === "ready" &&
            livePoseStatus !== "error" &&
            !isAnyRecordingActive &&
            !activeRecordingTaskId;

          return (
            <div
              key={taskId}
              className={`checklist-task-card ${
                evaluation?.status ? `card-${evaluation.status}` : "card-not-started"
              } ${isThisTaskRecording ? "card-recording-active" : ""}`}
              role="listitem"
            >
              {/* Task Header Row */}
              <div
                className="task-header-row"
                onClick={() => toggleTaskExpansion(taskId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleTaskExpansion(taskId);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                aria-controls={`task-body-${taskId}`}
              >
                <div className="task-header-left">
                  <span className="task-letter-badge">{prefixLetter}</span>
                  <div>
                    <h4 className="task-title">
                      {def.title}
                      {def.category !== "seated" && (
                        <span className="task-optional-tag">Optional</span>
                      )}
                    </h4>
                    <p className="task-summary-preview">{def.shortInstructions}</p>
                  </div>
                </div>

                <div className="task-header-right">
                  {getStatusBadge(evaluation, isThisTaskRecording)}
                  <button
                    type="button"
                    className="task-expand-btn"
                    aria-label={isExpanded ? "Collapse task details" : "Expand task details"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTaskExpansion(taskId);
                    }}
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* Task Expanded Body */}
              {isExpanded && (
                <div className="task-card-body" id={`task-body-${taskId}`}>
                  {/* Safety Notice if applicable */}
                  {def.safetyNotice && (
                    <div className="task-safety-notice" role="note">
                      <ShieldCheck size={14} />
                      <span>{def.safetyNotice}</span>
                    </div>
                  )}

                  {/* Step Guidance */}
                  <div className="task-guidance-box">
                    <strong className="guidance-title">Guided Movement Steps:</strong>
                    <ul className="guidance-list">
                      {def.detailedGuidance.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Required Body Landmarks Indicator */}
                  <div className="task-landmarks-req">
                    <span className="req-label">Required Landmarks:</span>
                    <div className="req-tags">
                      {def.requiredLandmarks.map((lm, idx) => (
                        <span key={idx} className="landmark-tag">
                          {lm}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Action Controls */}
                  <div className="task-actions-row">
                    {!isThisTaskRecording && (
                      <>
                        {(!evaluation || evaluation.status === "not-started") ? (
                          <button
                            type="button"
                            className="button button-primary"
                            disabled={!canStart}
                            onClick={() => onStartTaskRecording(taskId, def.recommendedDurationSec)}
                            title={
                              cameraStatus !== "ready"
                                ? "Turn on camera above to start"
                                : isAnotherTaskRecording || isAnyRecordingActive
                                  ? "Another recording is currently active"
                                  : "Start recording this movement"
                            }
                          >
                            <Play size={13} /> Start movement ({def.recommendedDurationSec}s)
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={!canStart}
                            onClick={() => onRepeatTask(taskId)}
                            title="Repeat this movement recording"
                          >
                            <RotateCcw size={13} /> Repeat movement
                          </button>
                        )}
                      </>
                    )}

                    {isThisTaskRecording && (
                      <button
                        type="button"
                        className="button button-secondary checklist-stop-btn"
                        onClick={onStopTaskEarly}
                      >
                        <Square size={12} /> Finish early & Evaluate
                      </button>
                    )}
                  </div>

                  {/* Evaluation Result & Feedback Card */}
                  {evaluation && evaluation.status !== "not-started" && !isThisTaskRecording && (
                    <div
                      className={`task-feedback-card feedback-${evaluation.status}`}
                      role="region"
                      aria-label="Movement feedback"
                    >
                      <div className="feedback-header">
                        <div className="feedback-outcome">
                          {evaluation.status === "completed" ? (
                            <CheckCircle2 size={16} className="text-teal" />
                          ) : evaluation.status === "try-again" ? (
                            <RotateCcw size={16} className="text-amber" />
                          ) : (
                            <AlertTriangle size={16} className="text-rose" />
                          )}
                          <strong className="outcome-text">{evaluation.outcomeLabel}</strong>
                        </div>
                        <span className="feedback-time">
                          <Clock3 size={11} /> {new Date(evaluation.evaluatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                      </div>

                      <p className="feedback-summary-msg">{evaluation.feedbackSummary}</p>

                      {/* Observable Kinematic Metrics if Available */}
                      {evaluation.observableMetrics && (
                        <div className="feedback-metrics-strip">
                          {evaluation.observableMetrics.angleExcursionDeg !== undefined &&
                            evaluation.observableMetrics.angleExcursionDeg !== null && (
                              <div className="metric-chip">
                                <span className="chip-label">Observed Excursion</span>
                                <span className="chip-val">{evaluation.observableMetrics.angleExcursionDeg}°</span>
                              </div>
                            )}

                          {evaluation.observableMetrics.peakAngleDeg !== undefined &&
                            evaluation.observableMetrics.peakAngleDeg !== null && (
                              <div className="metric-chip">
                                <span className="chip-label">Peak Angle</span>
                                <span className="chip-val">{evaluation.observableMetrics.peakAngleDeg}°</span>
                              </div>
                            )}

                          {evaluation.observableMetrics.verticalDisplacementNorm !== undefined &&
                            evaluation.observableMetrics.verticalDisplacementNorm !== null && (
                              <div className="metric-chip">
                                <span className="chip-label">Vertical Rise</span>
                                <span className="chip-val">
                                  {(evaluation.observableMetrics.verticalDisplacementNorm * 100).toFixed(1)}% frame
                                </span>
                              </div>
                            )}

                          {evaluation.observableMetrics.lateralDisplacementNorm !== undefined &&
                            evaluation.observableMetrics.lateralDisplacementNorm !== null && (
                              <div className="metric-chip">
                                <span className="chip-label">Lateral Sway</span>
                                <span className="chip-val">
                                  {(evaluation.observableMetrics.lateralDisplacementNorm * 100).toFixed(1)}% frame
                                </span>
                              </div>
                            )}

                          {evaluation.observableMetrics.activeSide && (
                            <div className="metric-chip">
                              <span className="chip-label">Active Side</span>
                              <span className="chip-val" style={{ textTransform: "capitalize" }}>
                                {evaluation.observableMetrics.activeSide}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Real Model Tracking Quality */}
                      <div className="feedback-tracking-row">
                        <div className="tracking-score-info">
                          <span className="tracking-label">Camera Tracking Quality:</span>
                          <span
                            className={`tracking-badge tracking-${evaluation.trackingQuality.qualityStatus}`}
                          >
                            {evaluation.trackingQuality.qualityStatus.toUpperCase()} (
                            {Math.round(evaluation.trackingQuality.meanConfidence * 100)}% confidence ·{" "}
                            {evaluation.trackingQuality.usableFrames}/{evaluation.trackingQuality.totalFrames} frames)
                          </span>
                        </div>
                        <span className="tracking-disclaimer-pill" title="Computer-vision landmark visibility only; does not reflect clinical health">
                          CV Tracking Quality (Not Clinical Diagnostic Confidence)
                        </span>
                      </div>

                      {/* Tracking Quality Warning if Present */}
                      {evaluation.trackingQuality.warning && (
                        <div className="feedback-quality-warning">
                          <AlertTriangle size={13} />
                          <span>{evaluation.trackingQuality.warning}</span>
                        </div>
                      )}

                      {/* Technical Limitations */}
                      {evaluation.limitations && evaluation.limitations.length > 0 && (
                        <div className="feedback-limitations">
                          <strong>Measurement Limitations:</strong>
                          <ul>
                            {evaluation.limitations.map((lim, i) => (
                              <li key={i}>{lim}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Non-Diagnostic Disclaimer */}
                      <div className="feedback-disclaimer-card">
                        <Info size={12} />
                        <span>{evaluation.disclaimer}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* End-of-Checklist Summary Card */}
      <div className="checklist-summary-card">
        <div className="summary-card-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Activity size={17} style={{ color: "#0f766e" }} />
            <div>
              <h4 className="summary-title">Movement Checklist Summary</h4>
              <p className="summary-subtitle">
                Overall status of guided functional movement observations.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="button button-secondary reset-checklist-btn"
            onClick={onResetAllTasks}
            disabled={isAnyRecordingActive || activeRecordingTaskId !== null}
            title="Reset all checklist items to start fresh"
          >
            <RotateCcw size={13} /> Reset Checklist
          </button>
        </div>

        {/* Counts Row */}
        <div className="summary-stats-grid">
          <div className="summary-stat-box stat-completed">
            <span className="stat-num">{overallSummary.completedCount}</span>
            <span className="stat-label">Movements Completed</span>
          </div>

          <div className="summary-stat-box stat-try-again">
            <span className="stat-num">{overallSummary.tryAgainCount}</span>
            <span className="stat-label">Needing Another Attempt</span>
          </div>

          <div className="summary-stat-box stat-unable">
            <span className="stat-num">{overallSummary.unableCount}</span>
            <span className="stat-label">Unable to Evaluate</span>
          </div>

          <div className="summary-stat-box stat-not-started">
            <span className="stat-num">{overallSummary.notStartedCount}</span>
            <span className="stat-label">Not Started</span>
          </div>
        </div>

        {/* Aggregated Warnings */}
        {overallSummary.warnings.length > 0 && (
          <div className="summary-warnings-box">
            <strong>
              <AlertTriangle size={14} /> Tracking-Quality Warnings Encountered:
            </strong>
            <ul>
              {overallSummary.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Non-Diagnostic Integrity Notice */}
        <div className="summary-integrity-notice">
          <ShieldCheck size={14} />
          <div>
            <strong>Clinical Safety Guarantee:</strong> Movement checklist completion is not converted into an osteoarthritis risk score. These computer-vision observations are exploratory and are never automatically entered into clinician-confirmed findings or patient medical records without independent clinician examination.
          </div>
        </div>
      </div>

      {/* Movement Assessment Session Storage & History Subsystem */}
      <MovementSessionHistory
        currentEvaluations={taskEvaluations}
        overallSummary={overallSummary}
        patientName={patientName}
        patientId={patientId}
        isCurrentSessionDemo={isDemo}
        gaitAssessment={gaitAssessment}
        manualObservations={manualObservations}
      />
    </div>
  );
});
