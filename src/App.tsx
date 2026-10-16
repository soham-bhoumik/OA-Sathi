import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileEdit,
  FileHeart,
  FilePlus2,
  HeartPulse,
  HelpCircle,
  Info,
  Languages,
  LayoutDashboard,
  Leaf,
  Lock,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Play,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Square,
  Search,
  Send,
  Settings as SettingsIcon,
  Share2,
  ShieldCheck,
  Sliders,
  Sparkles,
  Stethoscope,
  Trash2,
  Users,
  X,
} from "lucide-react";

import {
  calculateDashboardStats,
  clearDemoScreenings,
  restoreDemoScreenings,
  districts,
  emptyForm,
  evaluateScreening,
  exportRecordsToCsv,
  generateStableId,
  loadStoredScreenings,
  saveStoredScreenings,
  sanitizeText,
  validateScreeningInput,
  shareScreeningWithConsent,
  withdrawSharingConsent,
  requestConsultation,
  recordDoctorReview,
  calculateBMI,
  type FormValues,
  type Joint,
  type Page,
  type RiskBand,
  type Screening,
  type TriStateAnswer,
  type ConsultationStatus,
  type FollowUpRecommendation,
  type DoctorReviewInput,
  NOT_CHECKED,
  PREFER_NOT_TO_ANSWER,
  DURATION_LABELS,
  STIFFNESS_LABELS,
  MOBILITY_LABELS,
} from "./logic/screeningRules";
import { getAIModelMetadata } from "./services/aiModelService";
import {
  getGaitAnalysisStatus,
  analyzeGaitVideo,
  getBenchmarkSampleAnalysis,
  convertMovementEvaluationToGaitOutput,
  DEFAULT_MANUAL_OBSERVATIONS,
  type StructuredGaitAnalysisOutput,
  type ManualGaitObservations,
} from "./services/gaitAnalysisService";
import {
  evaluateMovementSequence,
  validatePoseFrame,
  type ValidatedPoseFrame,
} from "./logic/movementFeatureEvaluation";
import {
  SUPPORTED_REGIONAL_LANGUAGES,
  getRegionalGlossary,
  type NERLanguageCode,
} from "./logic/regionalTerms";
import {
  loadAppSettings,
  saveAppSettings,
  resetAppSettings,
  type AppSettings,
} from "./logic/settingsStorage";
import {
  getLivePoseLandmarker,
  detectAndDrawPose,
  type LivePoseStatus,
  type LiveJointMetrics,
} from "./services/livePoseEstimation";

const PAIN_DURATION_CHOICES = [
  ["under-2-weeks", "Less than 2 weeks"],
  ["2-4-weeks", "2–4 weeks"],
  ["1-3-months", "1–3 months"],
  ["over-3-months", "Over 3 months"],
  [NOT_CHECKED, "Not checked"],
] as const;

const STIFFNESS_CHOICES = [
  ["none", "No stiffness"],
  ["under-30", "Less than 30 min"],
  ["over-30", "30 min or more"],
  [NOT_CHECKED, "Not checked"],
] as const;

const MOBILITY_CHOICES = [
  ["no", "Not at the moment"],
  ["some", "A little"],
  ["significant", "Quite a bit"],
  [NOT_CHECKED, "Not checked"],
] as const;

const VALID_PAGES = new Set<Page>([
  "overview",
  "screening",
  "records",
  "doctor",
  "report",
  "settings",
]);

function getInitialPageFromHash(): Page {
  if (typeof window !== "undefined" && window.location.hash) {
    const raw = window.location.hash.replace(/^#\/?/, "").toLowerCase() as Page;
    if (VALID_PAGES.has(raw)) {
      return raw;
    }
  }
  return "overview";
}

function App() {
  const [page, setPage] = useState<Page>(getInitialPageFromHash);
  const [appSettings, setAppSettings] = useState<AppSettings>(loadAppSettings);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [screenings, setScreenings] = useState<Screening[]>(loadStoredScreenings);
  const [result, setResult] = useState<Screening | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cameraStatus, setCameraStatus] = useState<"idle" | "ready" | "unsupported" | "denied" | "error">("idle");
  const [cameraMessage, setCameraMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gaitAssessment, setGaitAssessment] = useState<StructuredGaitAnalysisOutput | null>(null);
  const [manualObservations, setManualObservations] = useState<ManualGaitObservations>(DEFAULT_MANUAL_OBSERVATIONS);
  const [isRecordingClip, setIsRecordingClip] = useState(false);
  const [recordingCountDown, setRecordingCountDown] = useState(5);
  const [isAnalyzingGait, setIsAnalyzingGait] = useState(false);
  const [activeReportRecord, setActiveReportRecord] = useState<Screening | null>(null);

  const authorizedScreenings = useMemo(() => {
    return screenings.filter((s) => s.sharingStatus === "shared");
  }, [screenings]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const liveRecordedFramesRef = useRef<ValidatedPoseFrame[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const isRequestingCameraRef = useRef<boolean>(false);
  const isInitialMount = useRef<boolean>(true);
  const lastSavedRef = useRef<string>("");

  // Persist records to storage safely without duplicate writes and skipping initial mount write
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      try {
        lastSavedRef.current = JSON.stringify(screenings);
      } catch {
        // Non-blocking
      }
      return;
    }

    try {
      const serialized = JSON.stringify(screenings);
      if (serialized !== lastSavedRef.current) {
        lastSavedRef.current = serialized;
        const saved = saveStoredScreenings(screenings, serialized);
        if (!saved) {
          setNotice("Note: Local browser storage limit reached. Session records remain active in memory.");
        }
      }
    } catch {
      // Non-blocking quota error handling
    }
  }, [screenings]);

  const stopCamera = useCallback(() => {
    isRequestingCameraRef.current = false;
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
      mediaRecorderRef.current = null;
    }
    setIsRecordingClip(false);

    const stream = cameraStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track: MediaStreamTrack) => {
        try {
          track.enabled = false;
          track.stop();
        } catch {
          // ignore
        }
      });
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStatus("idle");
    setCameraMessage("");
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && cameraStreamRef.current) {
        stopCamera();
      }
    };
    const handleBeforeUnload = () => {
      if (cameraStreamRef.current) {
        stopCamera();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      stopCamera();
    };
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    if (isRequestingCameraRef.current || cameraStreamRef.current) {
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraStatus("unsupported");
      setCameraMessage(
        "This browser does not support camera access. Try a modern Chromium or Edge browser over HTTPS or localhost."
      );
      return;
    }

    isRequestingCameraRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      if (!isRequestingCameraRef.current) {
        stream.getTracks().forEach((track) => {
          try {
            track.enabled = false;
            track.stop();
          } catch {
            // ignore
          }
        });
        return;
      }

      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => undefined);
      }
      setCameraStatus("ready");
      setCameraMessage("");
    } catch (err) {
      const isDenied = err instanceof DOMException && err.name === "NotAllowedError";
      const isNotFound = err instanceof DOMException && err.name === "NotFoundError";
      const message = isDenied
        ? "Camera permission was blocked. Allow access to the camera and try again."
        : isNotFound
          ? "No camera is available on this device."
          : "Unable to start the camera. Please check permissions or try another browser.";
      setCameraStatus(isDenied ? "denied" : "error");
      setCameraMessage(message);
      stopCamera();
    } finally {
      isRequestingCameraRef.current = false;
    }
  }, [stopCamera]);

  useEffect(() => {
    if (cameraStatus === "ready" && cameraStreamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== cameraStreamRef.current) {
        videoRef.current.srcObject = cameraStreamRef.current;
        videoRef.current.play().catch(() => undefined);
      }
    }
  }, [cameraStatus]);

  const updateForm = useCallback(<K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError((prev) => (prev ? "" : prev));
  }, []);

  const navigate = useCallback(
    (nextPage: Page) => {
      if (page === "screening" && nextPage !== "screening") {
        stopCamera();
      }
      setPage(nextPage);
      if (typeof window !== "undefined") {
        const targetHash = `#${nextPage}`;
        if (window.location.hash !== targetHash) {
          window.history.pushState(null, "", targetHash);
        }
      }
      setMobileNavOpen(false);
      setNotice("");
    },
    [page, stopCamera]
  );

  // Browser back/forward navigation (popstate & hashchange) handling
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === "undefined") return;
      const candidate = window.location.hash.replace(/^#\/?/, "").toLowerCase() as Page;
      if (VALID_PAGES.has(candidate)) {
        setPage((curr) => {
          if (curr === "screening" && candidate !== "screening") {
            stopCamera();
          }
          return candidate;
        });
        setMobileNavOpen(false);
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("hashchange", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("hashchange", handlePopState);
    };
  }, [stopCamera]);

  // Resilient Report View: If refreshing on #report without an active record in memory, load the first available record or fallback to records
  useEffect(() => {
    if (page === "report" && !activeReportRecord) {
      if (screenings.length > 0) {
        setActiveReportRecord(screenings[0]);
      } else {
        navigate("records");
      }
    }
  }, [page, activeReportRecord, screenings, navigate]);

  const handleUpdateSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setAppSettings(() => {
        return saveAppSettings({ [key]: value });
      });
      setNotice("Application settings saved.");
    },
    []
  );

  const handleResetSettings = useCallback(() => {
    const reset = resetAppSettings();
    setAppSettings(reset);
    setNotice("Settings restored to factory defaults.");
  }, []);

  const handleStartRecordingClip = useCallback(() => {
    if (isRecordingClip || isAnalyzingGait) return;
    const stream = cameraStreamRef.current;
    if (!stream || stream.getVideoTracks().length === 0) {
      setNotice("Camera stream is not active. Please open camera first.");
      return;
    }

    try {
      recordedChunksRef.current = [];
      const options: MediaRecorderOptions = {};
      if (typeof MediaRecorder.isTypeSupported === "function") {
        if (MediaRecorder.isTypeSupported("video/webm")) {
          options.mimeType = "video/webm";
        } else if (MediaRecorder.isTypeSupported("video/mp4")) {
          options.mimeType = "video/mp4";
        }
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecordingClip(false);
        const chunks = recordedChunksRef.current;
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
        setIsAnalyzingGait(true);
        try {
          const analysis = await analyzeGaitVideo(blob, form.name || "PARTICIPANT");
          if (analysis.status === "completed") {
            analysis.manualObservations = manualObservations;
            setGaitAssessment(analysis);
            setNotice("Automated gait analysis completed. Movement metrics recorded.");
          } else if (analysis.status === "model-unavailable" && liveRecordedFramesRef.current.length > 0) {
            // Client-side pure deterministic evaluation fallback
            const evalResult = evaluateMovementSequence(liveRecordedFramesRef.current, {
              sequenceId: `live_${Date.now()}`,
              timestamp: Date.now(),
            });
            const clientOutput = convertMovementEvaluationToGaitOutput(
              evalResult,
              form.name || "PARTICIPANT",
              manualObservations
            );
            setGaitAssessment(clientOutput);
            if (clientOutput.status === "completed") {
              setNotice("Live client-side pose evaluation completed. Movement metrics recorded.");
            } else {
              setNotice("Movement sequence had insufficient tracking fidelity for gait metrics. Manual checklist active.");
            }
          } else {
            analysis.manualObservations = manualObservations;
            setGaitAssessment(analysis);
            if (analysis.status === "insufficient-quality") {
              setNotice("Video quality insufficient for automated gait metrics. Manual checklist active.");
            } else {
              setNotice(analysis.errorMessage || "Gait service offline. Manual checklist active.");
            }
          }
        } catch {
          if (liveRecordedFramesRef.current.length > 0) {
            const evalResult = evaluateMovementSequence(liveRecordedFramesRef.current, {
              sequenceId: `live_${Date.now()}`,
              timestamp: Date.now(),
            });
            const clientOutput = convertMovementEvaluationToGaitOutput(
              evalResult,
              form.name || "PARTICIPANT",
              manualObservations
            );
            setGaitAssessment(clientOutput);
            setNotice("Live client-side pose evaluation completed. Movement metrics recorded.");
          }
        } finally {
          setIsAnalyzingGait(false);
        }
      };

      setIsRecordingClip(true);
      setRecordingCountDown(5);
      recorder.start(250);

      let timeLeft = 5;
      const interval = window.setInterval(() => {
        timeLeft -= 1;
        setRecordingCountDown(timeLeft);
        if (timeLeft <= 0) {
          clearInterval(interval);
          recordingTimerRef.current = null;
          if (recorder.state === "recording") {
            recorder.stop();
          }
        }
      }, 1000);
      recordingTimerRef.current = interval;
    } catch {
      setIsRecordingClip(false);
      setNotice("Unable to record video clip in this browser. Try testing with the benchmark clip option.");
    }
  }, [isRecordingClip, isAnalyzingGait, form.name, manualObservations]);

  const handleRunBenchmarkClip = useCallback(async () => {
    if (isAnalyzingGait) return;
    setIsAnalyzingGait(true);
    try {
      const sample = await getBenchmarkSampleAnalysis(form.name || "BENCHMARK");
      sample.manualObservations = manualObservations;
      setGaitAssessment(sample);
      setNotice("Benchmark walking analysis loaded for demonstration and camera-less testing.");
    } finally {
      setIsAnalyzingGait(false);
    }
  }, [isAnalyzingGait, form.name, manualObservations]);

  const handleClearGaitAssessment = useCallback(() => {
    setGaitAssessment(null);
    setNotice("Gait analysis cleared.");
  }, []);

  const handleLiveClipRecorded = useCallback((frames: ValidatedPoseFrame[]) => {
    liveRecordedFramesRef.current = frames;
  }, []);

  const handleManualObservationChange = useCallback(
    (field: keyof ManualGaitObservations, val: TriStateAnswer | string) => {
      setManualObservations((prev) => ({
        ...prev,
        [field]: val,
      }));
    },
    []
  );

  const startScreening = useCallback(() => {
    stopCamera();
    setResult(null);
    setEditingRecordId(null);
    const initialForm = emptyForm();
    if (appSettings.defaultDistrict) {
      initialForm.district = appSettings.defaultDistrict;
    }
    setForm(initialForm);
    setGaitAssessment(null);
    setManualObservations({ ...DEFAULT_MANUAL_OBSERVATIONS });
    setConsent(false);
    setError("");
    setNotice("");
    navigate("screening");
  }, [appSettings.defaultDistrict, navigate, stopCamera]);

  const handleOpenScreeningTab = useCallback(() => {
    stopCamera();
    // If viewing a completed result, reset so the screening form appears
    if (result) {
      setResult(null);
      setEditingRecordId(null);
      const initialForm = emptyForm();
      if (appSettings.defaultDistrict) {
        initialForm.district = appSettings.defaultDistrict;
      }
      setForm(initialForm);
      setGaitAssessment(null);
      setManualObservations({ ...DEFAULT_MANUAL_OBSERVATIONS });
      setConsent(false);
    }
    navigate("screening");
  }, [appSettings.defaultDistrict, navigate, result, stopCamera]);

  const handleEditScreening = useCallback(
    (recordToEdit: Screening) => {
      stopCamera();
      if (recordToEdit.formAnswers) {
        setForm({ ...recordToEdit.formAnswers });
      } else {
        setForm({
          name: recordToEdit.name.startsWith("Anonymised") ? "" : recordToEdit.name,
          age: String(recordToEdit.age),
          district: recordToEdit.district,
          joint: recordToEdit.joint,
          painDuration: "1-3-months",
          painLevel: 5,
          stiffness: "under-30",
          mobility: "some",
          previousInjury: "unanswered",
          familyHistory: "unanswered",
          repeatedLoad: "unanswered",
          heightCm: "",
          weightKg: "",
          hasHotRedJointFever: "unanswered",
          hasSuddenSeverePainSwelling: "unanswered",
          hasInabilityToBearWeight: "unanswered",
          bmdTScore: recordToEdit.bmdTScore || "",
          bmdSite: recordToEdit.bmdSite || "",
          bmdDate: recordToEdit.bmdDate || "",
        });
      }
      setGaitAssessment(recordToEdit.gaitAssessment || null);
      setManualObservations(recordToEdit.manualGaitObservations || { ...DEFAULT_MANUAL_OBSERVATIONS });
      setEditingRecordId(recordToEdit.id);
      setConsent(true);
      setResult(null);
      setError("");
      navigate("screening");
      setNotice(`Editing record ${recordToEdit.id}. Modify answers and click update.`);
    },
    [navigate, stopCamera]
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) return;

      const validation = validateScreeningInput(form, consent);
      if (!validation.isValid) {
        setError(validation.error || "Please complete each required field before generating the screening summary.");
        return;
      }

      setIsSubmitting(true);
      stopCamera();

      const evaluation = evaluateScreening(form);
      const now = new Date();
      const timeFormatter = new Intl.DateTimeFormat("en-IN", { timeStyle: "short" });
      const ageNum = Number(form.age);
      const cleanName = sanitizeText(form.name) || `Anonymised · ${ageNum} yrs`;

      if (editingRecordId) {
        // Update existing record without creating a duplicate
        const targetId = editingRecordId;
        const existing = screenings.find((item) => item.id === targetId);

        const updatedScreening: Screening = {
          id: targetId,
          name: cleanName,
          age: ageNum,
          district: form.district,
          joint: form.joint as Joint,
          score: evaluation.score,
          band: evaluation.band,
          markers: evaluation.markers,
          date: `Today, ${timeFormatter.format(now)}`,
          timestamp: now.getTime(),
          updatedAt: now.getTime(),
          isDemo: existing?.isDemo,
          formAnswers: { ...form },
          contributingFactors: evaluation.contributingFactors,
          absentFactors: evaluation.absentFactors,
          unassessedFactors: evaluation.unassessedFactors,
          assessedCount: evaluation.assessedCount,
          totalQuestions: evaluation.totalQuestions,
          bmi: evaluation.bmi,
          urgentCareNotice: evaluation.urgentCareNotice,
          gaitAssessment: gaitAssessment || existing?.gaitAssessment || undefined,
          manualGaitObservations: manualObservations || existing?.manualGaitObservations,
          sharingStatus: existing?.sharingStatus || "not-shared",
          sharingConsentGivenAt: existing?.sharingConsentGivenAt || null,
          sharingWithdrawnAt: existing?.sharingWithdrawnAt || null,
          consultationStatus: existing?.consultationStatus || "not-requested",
          consultationRequestedAt: existing?.consultationRequestedAt || null,
          consultationNotes: existing?.consultationNotes || null,
          doctorReviewStatus: existing?.doctorReviewStatus || "awaiting-review",
          doctorReviewedAt: existing?.doctorReviewedAt || null,
          doctorReviewerName: existing?.doctorReviewerName || null,
          doctorInternalNotes: existing?.doctorInternalNotes || null,
          doctorPatientFeedback: existing?.doctorPatientFeedback || null,
          doctorFollowUpRecommendation: existing?.doctorFollowUpRecommendation || null,
          doctorAppointmentDetails: existing?.doctorAppointmentDetails || null,
          bmdTScore: form.bmdTScore || existing?.bmdTScore,
          bmdSite: form.bmdSite || existing?.bmdSite,
          bmdDate: form.bmdDate || existing?.bmdDate,
        };

        setScreenings((current) =>
          current.map((item) => (item.id === targetId ? updatedScreening : item))
        );
        setResult(updatedScreening);
        setEditingRecordId(null);
        setError("");
        setNotice(`Screening record ${targetId} updated successfully.`);
      } else {
        // Create a new record with a unique stable ID
        const newId = generateStableId(screenings);
        const nextResult: Screening = {
          id: newId,
          name: cleanName,
          age: ageNum,
          district: form.district,
          joint: form.joint as Joint,
          score: evaluation.score,
          band: evaluation.band,
          markers: evaluation.markers,
          date: `Today, ${timeFormatter.format(now)}`,
          timestamp: now.getTime(),
          formAnswers: { ...form },
          contributingFactors: evaluation.contributingFactors,
          absentFactors: evaluation.absentFactors,
          unassessedFactors: evaluation.unassessedFactors,
          assessedCount: evaluation.assessedCount,
          totalQuestions: evaluation.totalQuestions,
          bmi: evaluation.bmi,
          urgentCareNotice: evaluation.urgentCareNotice,
          gaitAssessment: gaitAssessment || undefined,
          manualGaitObservations: manualObservations,
          sharingStatus: "not-shared",
          consultationStatus: "not-requested",
          doctorReviewStatus: "awaiting-review",
          bmdTScore: form.bmdTScore || undefined,
          bmdSite: form.bmdSite || undefined,
          bmdDate: form.bmdDate || undefined,
        };

        setScreenings((current) => [nextResult, ...current]);
        setResult(nextResult);
        setError("");
        setNotice("Screening summary created. It is stored only for this browser session.");
      }

      setIsSubmitting(false);
    },
    [consent, editingRecordId, form, gaitAssessment, isSubmitting, manualObservations, screenings, stopCamera]
  );

  const handleOpenMedicalReport = useCallback((record: Screening) => {
    setActiveReportRecord(record);
    navigate("report");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [navigate]);

  const handleShareConsent = useCallback((record: Screening) => {
    const updated = shareScreeningWithConsent(record);
    setScreenings((current) => current.map((item) => (item.id === record.id ? updated : item)));
    setResult(updated);
    if (activeReportRecord?.id === record.id) {
      setActiveReportRecord(updated);
    }
    setNotice(`Assessment ${record.id} shared with consent. It is now authorized for clinical review in the Doctor Demo Portal.`);
  }, [activeReportRecord]);

  const handleWithdrawConsent = useCallback((record: Screening) => {
    const updated = withdrawSharingConsent(record);
    setScreenings((current) => current.map((item) => (item.id === record.id ? updated : item)));
    setResult(updated);
    if (activeReportRecord?.id === record.id) {
      setActiveReportRecord(updated);
    }
    setNotice(`Sharing consent withdrawn for ${record.id}. Clinicians in the Doctor Demo Portal can no longer access this record.`);
  }, [activeReportRecord]);

  const handleRequestConsultation = useCallback((record: Screening, notes?: string) => {
    let currentRec = record;
    if (record.sharingStatus !== "shared") {
      currentRec = shareScreeningWithConsent(record);
    }
    const updated = requestConsultation(currentRec, notes);
    setScreenings((current) => current.map((item) => (item.id === record.id ? updated : item)));
    setResult(updated);
    if (activeReportRecord?.id === record.id) {
      setActiveReportRecord(updated);
    }
    setNotice(`Consultation request submitted for assessment ${record.id}. Clinicians have been notified in the Doctor Demo Portal.`);
  }, [activeReportRecord]);

  const handleUpdateRecordFromDoctor = useCallback((updated: Screening) => {
    setScreenings((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    if (result?.id === updated.id) {
      setResult(updated);
    }
    if (activeReportRecord?.id === updated.id) {
      setActiveReportRecord(updated);
    }
    setNotice(`Doctor review for patient ${updated.id} saved successfully. Patient-intended guidance is now active.`);
  }, [activeReportRecord, result]);

  const handleClearDemoRecords = useCallback(() => {
    const confirmed = window.confirm(
      "Remove synthetic demonstration records? Real participant records will be preserved."
    );
    if (confirmed) {
      setScreenings((current) => clearDemoScreenings(current));
      setNotice("Demonstration records removed. Real participant records are preserved.");
    }
  }, []);

  const handleRestoreDemoRecords = useCallback(() => {
    setScreenings((current) => restoreDemoScreenings(current));
    setNotice("Demonstration records restored for presentation.");
  }, []);

  const exportSummary = useCallback(() => {
    if (!result) return;
    const text = [
      "OA-Sathi — Screening summary",
      `Reference: ${result.id}`,
      `Profile: ${result.name}`,
      `Age: ${result.age}`,
      `District: ${result.district}`,
      `Joint: ${result.joint}`,
      `Screening markers: ${result.band} (${result.score}/100 demo score)`,
      "",
      "This illustrative screening aid is not a diagnosis or a validated clinical prediction. Please consult a qualified health professional for assessment.",
    ].join("\n");

    const link = document.createElement("a");
    const downloadUrl = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    link.href = downloadUrl;
    link.download = `oa-sathi-${result.id}.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  }, [result]);

  const handleExportCsv = useCallback(() => {
    const csvData = exportRecordsToCsv(screenings);
    const link = document.createElement("a");
    const downloadUrl = URL.createObjectURL(new Blob([csvData], { type: "text/csv;charset=utf-8;" }));
    link.href = downloadUrl;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `oa-sathi-screenings-${dateStr}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    setNotice("Screening records exported to CSV successfully.");
  }, [screenings]);

  const handleOpenScreening = useCallback((item: Screening) => {
    setResult(item);
    navigate("screening");
  }, [navigate]);

  const handleGoToRecords = useCallback(() => {
    navigate("records");
  }, [navigate]);

  return (
    <div className={`app ${appSettings.highContrastMode ? "high-contrast" : ""}`}>
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-symbol">
            <HeartPulse size={21} strokeWidth={2.4} />
          </div>
          <div>
            <span className="brand-name">OA-Sathi</span>
            <span className="brand-caption">COMMUNITY JOINT HEALTH</span>
          </div>
          <button
            className="mobile-close icon-button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <button
            className={`nav-item ${page === "overview" ? "active" : ""}`}
            onClick={() => navigate("overview")}
          >
            <LayoutDashboard size={18} />
            <span>Overview</span>
          </button>
          <button
            className={`nav-item ${page === "screening" ? "active" : ""}`}
            onClick={handleOpenScreeningTab}
          >
            <FilePlus2 size={18} />
            <span>New screening</span>
            <span
              className="nav-plus"
              onClick={(e) => {
                e.stopPropagation();
                startScreening();
              }}
              title="Start a new blank screening"
            >
              <Plus size={14} />
            </span>
          </button>
          <button
            className={`nav-item ${page === "records" ? "active" : ""}`}
            onClick={handleGoToRecords}
          >
            <ClipboardCheck size={18} />
            <span>Screening records</span>
            <span className="nav-count">{screenings.length}</span>
          </button>
          <button
            className={`nav-item ${page === "doctor" ? "active" : ""}`}
            onClick={() => navigate("doctor")}
          >
            <Stethoscope size={18} />
            <span>Doctor Demo Portal</span>
            {authorizedScreenings.length > 0 && (
              <span className="nav-count" title={`${authorizedScreenings.length} authorized patient submissions`}>
                {authorizedScreenings.length}
              </span>
            )}
          </button>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <SettingsIcon size={18} />
            <span>Settings</span>
          </button>
        </nav>

        <div className="sidebar-divider" />
        <div className="workspace-label">FOR YOUR COMMUNITY</div>
        <div className="community-card">
          <div className="community-icon">
            <Users size={17} />
          </div>
          <div>
            <strong>NER health initiative</strong>
            <span>Community-first care</span>
          </div>
          <ChevronRight size={15} className="community-chevron" />
        </div>
        <div className="sidebar-spacer" />
        <div className="privacy-card">
          <div className="privacy-icon">
            <ShieldCheck size={17} />
          </div>
          <div>
            <strong>Privacy comes first</strong>
            <p>Demo records stay in this browser session. No data is sent to a server.</p>
          </div>
        </div>
        <div className="profile">
          <div className="avatar">AS</div>
          <div className="profile-copy">
            <strong>Community health worker</strong>
            <span>Demo workspace</span>
          </div>
          <button
            className="icon-button profile-more"
            aria-label="More profile options"
            onClick={() => navigate("settings")}
          >
            <MoreHorizontal size={19} />
          </button>
        </div>
      </aside>

      {mobileNavOpen && (
        <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />
      )}

      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            <span>OA-Sathi</span>
            <ChevronRight size={14} />
            <strong>
              {page === "overview"
                ? "Overview"
                : page === "screening"
                  ? "New screening"
                  : page === "records"
                    ? "Screening records"
                    : page === "doctor"
                      ? "Doctor Demo Portal"
                      : page === "report"
                        ? "Medical Screening Report"
                        : "Settings"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              <span /> DEMO MODE
            </span>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() => setNotice("You're all caught up—there are no new notifications.")}
            >
              <Bell size={18} />
              <span />
            </button>
            <div className="topbar-avatar">AS</div>
          </div>
        </header>

        {notice && (
          <div className="toast" role="status">
            <CheckCircle2 size={17} />
            {notice}
            <button className="icon-button" onClick={() => setNotice("")} aria-label="Dismiss notification">
              <X size={15} />
            </button>
          </div>
        )}

        {page === "overview" && (
          <Overview
            screenings={screenings}
            onNew={startScreening}
            onRecords={handleGoToRecords}
            onOpenScreening={handleOpenScreening}
            onViewReport={handleOpenMedicalReport}
            onDoctorPortal={() => navigate("doctor")}
          />
        )}
        {page === "screening" && (
          <ScreeningPage
            form={form}
            result={result}
            editingRecordId={editingRecordId}
            consent={consent}
            error={error}
            onChange={updateForm}
            onConsent={setConsent}
            onSubmit={handleSubmit}
            onExport={exportSummary}
            onStartNew={startScreening}
            onEdit={handleEditScreening}
            onViewReport={handleOpenMedicalReport}
            onShareConsent={handleShareConsent}
            onWithdrawConsent={handleWithdrawConsent}
            onRequestConsultation={handleRequestConsultation}
            cameraStatus={cameraStatus}
            cameraMessage={cameraMessage}
            onStartCamera={startCamera}
            onStopCamera={stopCamera}
            videoRef={videoRef}
            enablePoseOverlay={appSettings.enablePoseOverlay}
            preferredLanguage={appSettings.preferredLanguage}
            isSubmitting={isSubmitting}
            gaitAssessment={gaitAssessment}
            manualObservations={manualObservations}
            onManualObservationChange={handleManualObservationChange}
            isRecordingClip={isRecordingClip}
            recordingCountDown={recordingCountDown}
            isAnalyzingGait={isAnalyzingGait}
            onStartRecording={handleStartRecordingClip}
            onRunBenchmark={handleRunBenchmarkClip}
            onClearGait={handleClearGaitAssessment}
            onLiveClipRecorded={handleLiveClipRecorded}
            onCommitObservation={setGaitAssessment}
          />
        )}
        {page === "records" && (
          <RecordsPage
            screenings={screenings}
            onNew={startScreening}
            onOpen={handleOpenScreening}
            onViewReport={handleOpenMedicalReport}
            onExportCsv={handleExportCsv}
            onClearDemo={handleClearDemoRecords}
            onRestoreDemo={handleRestoreDemoRecords}
          />
        )}
        {page === "doctor" && (
          <DoctorPortalPage
            screenings={screenings}
            onUpdateScreening={handleUpdateRecordFromDoctor}
            onViewReport={handleOpenMedicalReport}
            onNavigate={navigate}
          />
        )}
        {page === "report" && activeReportRecord && (
          <MedicalReportView
            record={activeReportRecord}
            onBack={() => {
              if (result && activeReportRecord.id === result.id) {
                navigate("screening");
              } else {
                navigate("records");
              }
            }}
            onEdit={
              activeReportRecord.formAnswers
                ? () => handleEditScreening(activeReportRecord)
                : undefined
            }
          />
        )}
        {page === "settings" && (
          <SettingsPage
            settings={appSettings}
            onUpdateSetting={handleUpdateSetting}
            onResetSettings={handleResetSettings}
            screenings={screenings}
            onClearDemoScreenings={handleClearDemoRecords}
            onRestoreDemoScreenings={handleRestoreDemoRecords}
            onExportCsv={handleExportCsv}
          />
        )}
      </main>
    </div>
  );
}

const Overview = memo(function Overview({
  screenings,
  onNew,
  onRecords,
  onOpenScreening,
  onViewReport,
  onDoctorPortal,
}: {
  screenings: Screening[];
  onNew: () => void;
  onRecords: () => void;
  onOpenScreening: (item: Screening) => void;
  onViewReport?: (item: Screening) => void;
  onDoctorPortal?: () => void;
}) {
  const stats = useMemo(() => calculateDashboardStats(screenings), [screenings]);
  const recentScreenings = useMemo(() => screenings.slice(0, 4), [screenings]);
  const sharedCount = useMemo(() => screenings.filter((s) => s.sharingStatus === "shared").length, [screenings]);

  return (
    <div className="page-content">
      <div className="welcome-row">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" /> COMMUNITY SCREENING · NER, INDIA
          </div>
          <h1>
            Good morning, Sathi <span className="wave">✳</span>
          </h1>
          <p className="page-subtitle">A little care today can make a real difference tomorrow.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          {onDoctorPortal && (
            <button className="button button-secondary" onClick={onDoctorPortal} title="Open Doctor Review Portal">
              <Stethoscope size={16} /> Doctor Portal ({sharedCount})
            </button>
          )}
          <button className="button button-primary" onClick={onNew}>
            <Plus size={17} /> Start a screening
          </button>
        </div>
      </div>

      <section className="hero-banner">
        <div className="hero-pattern pattern-one" />
        <div className="hero-pattern pattern-two" />
        <div className="hero-copy">
          <span className="hero-kicker">
            <Sparkles size={14} /> YOUR COMMUNITY, IN FOCUS
          </span>
          <h2>
            Small steps. Stronger joints.
            <br />
            <em>Healthier communities.</em>
          </h2>
          <p>
            Use a guided conversation to notice joint-health markers early and help people find the right next step.
          </p>
          <button className="hero-link" onClick={onNew}>
            Begin a guided screening <ArrowRight size={16} />
          </button>
        </div>
        <HeroIllustration />
      </section>

      <div className="stats-grid">
        <StatCard
          icon={<Users size={18} />}
          label="People screened"
          value={stats.total}
          note="Across your workspace"
          tone="blue"
          trend={
            <>
              <ArrowUpRight size={13} /> Active records
            </>
          }
        />
        <StatCard
          icon={<CalendarDays size={18} />}
          label="Screenings today"
          value={stats.today}
          note="Keep the conversation going"
          tone="green"
          trend={
            <>
              <Activity size={13} /> Live session
            </>
          }
        />
        <StatCard
          icon={<FileHeart size={18} />}
          label="Follow-up suggested"
          value={stats.followup}
          note="Encourage clinical review"
          tone="amber"
          trend={
            <>
              <Info size={13} /> Not a diagnosis
            </>
          }
        />
        <StatCard
          icon={<Stethoscope size={18} />}
          label="Shared with Doctor"
          value={String(sharedCount).padStart(2, "0")}
          note="Patient-consented records"
          tone="teal"
          trend={
            <>
              <ShieldCheck size={13} /> Doctor Portal
            </>
          }
        />
      </div>

      <div className="section-header">
        <div>
          <div className="eyebrow">YOUR WORKSPACE</div>
          <h2>Recent screenings</h2>
        </div>
        <button className="text-button" onClick={onRecords}>
          View all <ArrowRight size={15} />
        </button>
      </div>
      <ScreeningTable
        screenings={recentScreenings}
        onOpen={onOpenScreening}
        onViewReport={onViewReport}
      />

      <div className="lower-grid">
        <section className="info-panel">
          <div className="info-panel-icon">
            <MessageCircle size={18} />
          </div>
          <div className="info-panel-copy">
            <span className="eyebrow">A GENTLE REMINDER</span>
            <h3>Listen first. Screen together.</h3>
            <p>
              Ask permission, use familiar words, and let each person guide the conversation. Screening should always
              feel respectful and voluntary.
            </p>
          </div>
          <ArrowUpRight size={17} className="info-arrow" />
        </section>
        <section className="regional-card">
          <div className="regional-top">
            <span className="regional-icon">
              <Leaf size={17} />
            </span>
            <span className="regional-label">BUILT WITH THE NER IN MIND</span>
          </div>
          <h3>Care that's closer to home.</h3>
          <p>A community-first tool designed to support—not replace—local health workers and clinicians.</p>
          <div className="regional-tags">
            <span>Accessible</span>
            <span>Community-led</span>
            <span>Respectful</span>
          </div>
        </section>
      </div>
      <Disclaimer />
    </div>
  );
});

const HeroIllustration = memo(function HeroIllustration() {
  return (
    <div className="hero-illustration" aria-hidden="true">
      <div className="illustration-sun" />
      <div className="illustration-ring ring-a" />
      <div className="illustration-ring ring-b" />
      <div className="illustration-leaf leaf-a">
        <Leaf size={36} />
      </div>
      <div className="illustration-leaf leaf-b">
        <Leaf size={27} />
      </div>
      <div className="illustration-person">
        <div className="person-head" />
        <div className="person-body" />
        <div className="person-arm" />
        <div className="person-leg leg-a" />
        <div className="person-leg leg-b" />
      </div>
      <div className="illustration-joint">
        <Activity size={18} />
      </div>
    </div>
  );
});

const StatCard = memo(function StatCard({
  icon,
  label,
  value,
  note,
  tone,
  trend,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  tone: string;
  trend: ReactNode;
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span className={`stat-icon ${tone}`}>{icon}</span>
        <span className={`stat-trend ${tone}`}>{trend}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-note">{note}</div>
    </article>
  );
});

const ScreeningTable = memo(function ScreeningTable({
  screenings,
  onOpen,
  onViewReport,
}: {
  screenings: Screening[];
  onOpen: (item: Screening) => void;
  onViewReport?: (item: Screening) => void;
}) {
  if (!screenings.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <FileHeart size={22} />
        </div>
        <strong>No screenings yet</strong>
        <p>Start a guided screening to see records here.</p>
      </div>
    );
  }

  return (
    <div className="table-card">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>PERSON / REF</th>
              <th>SCREENED</th>
              <th>JOINT</th>
              <th>SCREENING MARKERS</th>
              <th>CARE &amp; REVIEW STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {screenings.map((item) => (
              <tr
                key={item.id}
                onClick={() => onOpen(item)}
                tabIndex={0}
                role="button"
                aria-label={`Open screening ${item.id} for ${item.name}`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(item);
                  }
                }}
              >
                <td>
                  <div className="person-cell">
                    <span className="table-avatar">
                      {item.name.startsWith("Anonymised") ? "A" : item.name.split(" ").slice(-2)[0]?.[0] || "S"}
                    </span>
                    <span>
                      <strong>
                        {item.name}
                        {item.isDemo && <span className="demo-badge">Synthetic demo</span>}
                      </strong>
                      <small>
                        {item.id} · {item.district}
                      </small>
                    </span>
                  </div>
                </td>
                <td className="date-cell">{item.date}</td>
                <td>
                  <span className="joint-chip">{item.joint}</span>
                </td>
                <td>
                  <RiskBadge band={item.band} />
                </td>
                <td>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {item.sharingStatus === "shared" ? (
                      <span className="care-badge shared" title="Shared with Doctor Consent">
                        <Share2 size={9} /> Shared
                      </span>
                    ) : item.sharingStatus === "withdrawn" ? (
                      <span className="care-badge withdrawn" title="Sharing Withdrawn">
                        Withdrawn
                      </span>
                    ) : (
                      <span className="care-badge not-shared" title="Private to local session">
                        Private
                      </span>
                    )}

                    {item.doctorReviewStatus === "reviewed" ? (
                      <span className="care-badge reviewed" title="Reviewed by clinician">
                        <BadgeCheck size={9} /> Reviewed
                      </span>
                    ) : (
                      <span className="care-badge pending" title="Awaiting doctor review">
                        Pending
                      </span>
                    )}

                    {item.consultationStatus === "requested" && (
                      <span className="care-badge requested" title="Consultation requested">
                        Consult Req
                      </span>
                    )}
                    {item.consultationStatus === "appointment-confirmed" && (
                      <span className="care-badge confirmed" title="Appointment scheduled">
                        Scheduled
                      </span>
                    )}
                    {item.urgentCareNotice?.hasRedFlags && (
                      <span className="care-badge alert" style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }} title="Concerning symptom flagged">
                        <AlertTriangle size={9} /> Red Flag
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {onViewReport && (
                      <button
                        type="button"
                        className="button button-secondary"
                        style={{ padding: "4px 8px", fontSize: "7.5px", height: "26px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewReport(item);
                        }}
                        title="View printable medical screening report"
                      >
                        <Printer size={12} /> Report
                      </button>
                    )}
                    <button
                      className="row-open"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(item);
                      }}
                      aria-label={`Open screening ${item.id}`}
                      tabIndex={-1}
                    >
                      <ChevronRight size={17} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          Showing <strong>{screenings.length}</strong> records
        </span>
        <span>
          <span className="footer-dot" /> Verified session records
        </span>
      </div>
    </div>
  );
});

const RiskBadge = memo(function RiskBadge({ band }: { band: RiskBand }) {
  const className = band === "More markers" ? "risk-high" : band === "Some markers" ? "risk-medium" : "risk-low";
  return (
    <span className={`risk-badge ${className}`}>
      <span />
      {band}
    </span>
  );
});

const ScreeningPage = memo(function ScreeningPage({
  form,
  result,
  editingRecordId,
  consent,
  error,
  onChange,
  onConsent,
  onSubmit,
  onExport,
  onStartNew,
  onEdit,
  onViewReport,
  onShareConsent,
  onWithdrawConsent,
  onRequestConsultation,
  cameraStatus,
  cameraMessage,
  onStartCamera,
  onStopCamera,
  videoRef,
  enablePoseOverlay,
  preferredLanguage,
  isSubmitting,
  gaitAssessment,
  manualObservations,
  onManualObservationChange,
  isRecordingClip,
  recordingCountDown,
  isAnalyzingGait,
  onStartRecording,
  onRunBenchmark,
  onClearGait,
  onLiveClipRecorded,
  onCommitObservation,
}: {
  form: FormValues;
  result: Screening | null;
  editingRecordId: string | null;
  consent: boolean;
  error: string;
  onChange: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void;
  onConsent: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onExport: () => void;
  onStartNew: () => void;
  onEdit: (record: Screening) => void;
  onViewReport: (record: Screening) => void;
  onShareConsent: (record: Screening) => void;
  onWithdrawConsent: (record: Screening) => void;
  onRequestConsultation: (record: Screening, notes?: string) => void;
  cameraStatus: "idle" | "ready" | "unsupported" | "denied" | "error";
  cameraMessage: string;
  onStartCamera: () => void;
  onStopCamera: () => void;
  videoRef: RefObject<HTMLVideoElement>;
  enablePoseOverlay?: boolean;
  preferredLanguage?: NERLanguageCode;
  isSubmitting: boolean;
  gaitAssessment: StructuredGaitAnalysisOutput | null;
  manualObservations: ManualGaitObservations;
  onManualObservationChange: (field: keyof ManualGaitObservations, val: TriStateAnswer | string) => void;
  isRecordingClip: boolean;
  recordingCountDown: number;
  isAnalyzingGait: boolean;
  onStartRecording: () => void;
  onRunBenchmark: () => void;
  onClearGait: () => void;
  onLiveClipRecorded?: (frames: ValidatedPoseFrame[]) => void;
  onCommitObservation?: (observation: StructuredGaitAnalysisOutput) => void;
}) {
  const [regionalLang, setRegionalLang] = useState<NERLanguageCode>(preferredLanguage || "en");
  useEffect(() => {
    if (preferredLanguage) {
      setRegionalLang(preferredLanguage);
    }
  }, [preferredLanguage]);
  const glossary = getRegionalGlossary(regionalLang);

  const handlePainDurationChange = useCallback((value: string) => onChange("painDuration", value), [onChange]);
  const handleStiffnessChange = useCallback((value: string) => onChange("stiffness", value), [onChange]);
  const handleMobilityChange = useCallback((value: string) => onChange("mobility", value), [onChange]);
  const handlePreviousInjuryChange = useCallback((value: TriStateAnswer) => onChange("previousInjury", value), [onChange]);
  const handleFamilyHistoryChange = useCallback((value: TriStateAnswer) => onChange("familyHistory", value), [onChange]);
  const handleRepeatedLoadChange = useCallback((value: TriStateAnswer) => onChange("repeatedLoad", value), [onChange]);
  const handlePainLevelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange("painLevel", Number(e.target.value)),
    [onChange]
  );

  const liveBmi = useMemo(() => {
    return calculateBMI(form.weightKg, form.heightCm);
  }, [form.weightKg, form.heightCm]);

  const hasSafetyRedFlag = useMemo(() => {
    return (
      form.hasHotRedJointFever === true ||
      form.hasSuddenSeverePainSwelling === true ||
      form.hasInabilityToBearWeight === true ||
      Number(form.painLevel) >= 9
    );
  }, [form.hasHotRedJointFever, form.hasSuddenSeverePainSwelling, form.hasInabilityToBearWeight, form.painLevel]);

  const unassessedCount = useMemo(() => {
    let count = 0;
    if (form.painDuration === NOT_CHECKED || !form.painDuration) count++;
    if (form.stiffness === NOT_CHECKED || !form.stiffness) count++;
    if (form.mobility === NOT_CHECKED || !form.mobility) count++;
    if (form.previousInjury === NOT_CHECKED || form.previousInjury === "unanswered") count++;
    if (form.familyHistory === NOT_CHECKED || form.familyHistory === "unanswered") count++;
    if (form.repeatedLoad === NOT_CHECKED || form.repeatedLoad === "unanswered") count++;
    return count;
  }, [form]);

  return (
    <div className="page-content">
      <div className="page-title-row">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" /> GUIDED COMMUNITY SCREENING
          </div>
          <h1>
            {result
              ? "Screening summary"
              : editingRecordId
                ? `Edit screening (${editingRecordId})`
                : "A conversation about joint health"}
          </h1>
          <p className="page-subtitle">
            {result
              ? "A clear, explainable summary to support the next conversation."
              : editingRecordId
                ? "Update previously collected participant responses without creating duplicates."
                : "Take your time. There are no right or wrong answers."}
          </p>
        </div>
        {!result && (
          <div className="step-indicator">
            <span className="step-current">{editingRecordId ? "ED" : "01"}</span>
            <span className="step-line" />
            <span>{editingRecordId ? "EDITING" : "SCREENING"}</span>
          </div>
        )}
      </div>

      {result ? (
        <ResultSummary
          result={result}
          onExport={onExport}
          onStartNew={onStartNew}
          onEdit={() => onEdit(result)}
          onViewReport={onViewReport}
          onShareConsent={onShareConsent}
          onWithdrawConsent={onWithdrawConsent}
          onRequestConsultation={onRequestConsultation}
        />
      ) : (
        <form className="screening-form" onSubmit={onSubmit} noValidate>
          <div className="screening-main">
            <div className="regional-guide-bar">
              <span className="regional-guide-label">
                <Languages size={15} /> Local phrasing aid:
              </span>
              <select
                className="regional-select"
                value={regionalLang}
                onChange={(e) => setRegionalLang(e.target.value as NERLanguageCode)}
                aria-label="Select North Eastern Region phrasing assistance"
              >
                {SUPPORTED_REGIONAL_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name} ({lang.nativeName})
                  </option>
                ))}
              </select>
              {regionalLang !== "en" && (
                <span className="regional-phrase-hint">
                  {glossary.kneePain} · {glossary.morningStiffness}
                </span>
              )}
            </div>

            <section className="form-card">
              <div className="form-section-heading">
                <span className="form-section-icon">
                  <Users size={18} />
                </span>
                <div>
                  <h2>A little about the person</h2>
                  <p>Only the essentials for a helpful screening.</p>
                </div>
                <span className="required-note">* Required</span>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>
                    Name or reference <small>Optional</small>
                  </span>
                  <input
                    value={form.name}
                    onChange={(e) => onChange("name", e.target.value)}
                    placeholder="e.g. initials or a reference"
                    maxLength={60}
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  <span>
                    Age <b>*</b>
                  </span>
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      min="18"
                      max="110"
                      value={form.age}
                      onChange={(e) => onChange("age", e.target.value)}
                      placeholder="Enter age"
                      required
                    />
                    <span>years</span>
                  </div>
                </label>
                <label className="field">
                  <span>
                    District <b>*</b>
                  </span>
                  <div className="select-wrap">
                    <select
                      value={form.district}
                      onChange={(e) => onChange("district", e.target.value)}
                      aria-required="true"
                    >
                      <option value="">Choose a district</option>
                      {districts.slice(1).map((district) => (
                        <option key={district} value={district}>
                          {district}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} />
                  </div>
                </label>
                <label className="field">
                  <span>
                    Joint being discussed <b>*</b>
                  </span>
                  <div className="select-wrap">
                    <select
                      value={form.joint}
                      onChange={(e) => onChange("joint", e.target.value as Joint | "")}
                      aria-required="true"
                    >
                      <option value="">Choose a joint</option>
                      <option value="Knee">Knee</option>
                      <option value="Hip">Hip</option>
                      <option value="Hand">Hand</option>
                      <option value="Other">Other</option>
                    </select>
                    <ChevronDown size={16} />
                  </div>
                </label>
              </div>
            </section>

            <section className="form-card">
              <div className="form-section-heading">
                <span className="form-section-icon symptom-icon">
                  <Activity size={18} />
                </span>
                <div>
                  <h2>What have they been noticing?</h2>
                  <p>These questions help surface patterns worth discussing.</p>
                </div>
              </div>

              <fieldset className="question-block">
                <legend>
                  How long has the joint been bothering them? <b>*</b>
                </legend>
                <div className="choice-grid four-choice">
                  {PAIN_DURATION_CHOICES.map(([value, label]) => (
                    <Choice
                      key={value}
                      name="pain-duration"
                      value={value}
                      checked={form.painDuration === value}
                      onChange={handlePainDurationChange}
                    >
                      {label}
                    </Choice>
                  ))}
                </div>
              </fieldset>

              <fieldset className="question-block pain-question">
                <legend>
                  On a scale of 0 to 10, how much pain or discomfort do they usually feel? <b>*</b>
                </legend>
                <div className="range-labels">
                  <span>No discomfort</span>
                  <strong>
                    {form.painLevel} <small>/ 10</small>
                  </strong>
                  <span>Most discomfort</span>
                </div>
                <input
                  aria-label="Pain or discomfort level, from zero to ten"
                  className="pain-range"
                  type="range"
                  min="0"
                  max="10"
                  step="1"
                  aria-valuemin={0}
                  aria-valuemax={10}
                  aria-valuenow={form.painLevel}
                  value={form.painLevel}
                  onChange={handlePainLevelChange}
                  style={{ "--range-progress": `${Number(form.painLevel) * 10}%` } as CSSProperties}
                />
                <div className="range-scale">
                  <span>0</span>
                  <span>2</span>
                  <span>4</span>
                  <span>6</span>
                  <span>8</span>
                  <span>10</span>
                </div>
              </fieldset>

              <fieldset className="question-block">
                <legend>
                  How long does stiffness last after resting or waking? <b>*</b>
                </legend>
                <div className="choice-grid three-choice">
                  {STIFFNESS_CHOICES.map(([value, label]) => (
                    <Choice
                      key={value}
                      name="stiffness"
                      value={value}
                      checked={form.stiffness === value}
                      onChange={handleStiffnessChange}
                    >
                      {label}
                    </Choice>
                  ))}
                </div>
              </fieldset>

              <fieldset className="question-block">
                <legend>
                  Does joint discomfort affect everyday activities? <b>*</b>
                </legend>
                <div className="choice-grid three-choice">
                  {MOBILITY_CHOICES.map(([value, label]) => (
                    <Choice
                      key={value}
                      name="mobility"
                      value={value}
                      checked={form.mobility === value}
                      onChange={handleMobilityChange}
                    >
                      {label}
                    </Choice>
                  ))}
                </div>
              </fieldset>
            </section>

            <section className="form-card">
              <div className="form-section-heading">
                <span className="form-section-icon history-icon">
                  <Clock3 size={18} />
                </span>
                <div>
                  <h2>Health and daily life</h2>
                  <p>A few more things that can shape joint health.</p>
                </div>
              </div>
              <div className="toggle-list">
                <TriStateRow
                  title="Previous injury to this joint"
                  description="A past injury or operation involving this joint."
                  value={form.previousInjury}
                  onChange={handlePreviousInjuryChange}
                />
                <TriStateRow
                  title="Family history of joint problems"
                  description="A close family member has experienced similar issues."
                  value={form.familyHistory}
                  onChange={handleFamilyHistoryChange}
                />
                <TriStateRow
                  title="Frequent heavy or repetitive activity"
                  description="Daily work or activities put repeated strain on this joint."
                  value={form.repeatedLoad}
                  onChange={handleRepeatedLoadChange}
                />
              </div>
            </section>

            <section className="form-card safety-card">
              <div className="form-section-heading">
                <span className="form-section-icon" style={{ background: "#faece7", color: "#c8411b" }}>
                  <AlertTriangle size={18} />
                </span>
                <div>
                  <h2>Safety & Urgent Red-Flag Symptoms</h2>
                  <p>Critical clinical red flags that require urgent medical evaluation.</p>
                </div>
              </div>
              <p className="safety-card-desc">
                Please check each symptom directly with the participant. These symptoms alert health workers to acute conditions (such as septic arthritis or acute fracture) requiring prompt clinical attention.
              </p>
              <div className="safety-questions-list">
                <SafetyQuestionRow
                  title="Hot or red joint with fever / chills"
                  description="A joint that is noticeably warm or red to touch accompanied by body fever or chills (concerning for acute inflammation or joint infection)."
                  value={form.hasHotRedJointFever}
                  onChange={(val) => onChange("hasHotRedJointFever", val)}
                />
                <SafetyQuestionRow
                  title="Sudden severe joint pain or rapid swelling"
                  description="Severe acute pain or rapid joint swelling developing over just a few hours."
                  value={form.hasSuddenSeverePainSwelling}
                  onChange={(val) => onChange("hasSuddenSeverePainSwelling", val)}
                />
                <SafetyQuestionRow
                  title="Inability to bear weight after an injury or fall"
                  description="Completely unable to put weight on the affected limb following an acute fall, trauma, or twist."
                  value={form.hasInabilityToBearWeight}
                  onChange={(val) => onChange("hasInabilityToBearWeight", val)}
                />
              </div>

              {hasSafetyRedFlag && (
                <div className="safety-warning-banner" role="alert">
                  <AlertTriangle size={20} />
                  <div>
                    <strong>Urgent clinical guidance indicated</strong>
                    <p>
                      One or more potential red flags have been reported. While you may still save this voluntary preliminary screening, the participant should be directed to a medical doctor or primary health centre immediately.
                    </p>
                  </div>
                </div>
              )}
            </section>

            <section className="form-card">
              <div className="form-section-heading">
                <span className="form-section-icon" style={{ background: "#f0fdf4", color: "#15803d" }}>
                  <Activity size={18} />
                </span>
                <div>
                  <h2>Optional Clinical Measurements</h2>
                  <p>Laboratory or physical measurements if already available. Strictly optional; never inferred.</p>
                </div>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>
                    Height <small>Optional</small>
                  </span>
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      min="50"
                      max="250"
                      value={form.heightCm || ""}
                      onChange={(e) => onChange("heightCm", e.target.value)}
                      placeholder="e.g. 165"
                    />
                    <span>cm</span>
                  </div>
                </label>
                <label className="field">
                  <span>
                    Weight <small>Optional</small>
                  </span>
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      min="20"
                      max="300"
                      value={form.weightKg || ""}
                      onChange={(e) => onChange("weightKg", e.target.value)}
                      placeholder="e.g. 68"
                    />
                    <span>kg</span>
                  </div>
                </label>
                <div className="field">
                  <span>Calculated Body Mass Index (BMI)</span>
                  <div
                    style={{
                      background: "#f7faf9",
                      border: "1px solid #dce8e3",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      minHeight: "42px",
                    }}
                  >
                    <strong style={{ fontSize: "10.5px", color: "#1b372f" }}>
                      {liveBmi !== null ? `${liveBmi} kg/m²` : "Not calculated"}
                    </strong>
                    <small style={{ fontSize: "7.5px", color: "#627b73" }}>
                      {liveBmi !== null
                        ? liveBmi >= 30
                          ? "Higher joint loading range (BMI ≥ 30)"
                          : liveBmi >= 25
                            ? "Overweight range (BMI 25–29.9)"
                            : "Standard reference range"
                        : "Requires both valid height & weight"}
                    </small>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px dashed #d5e3dc" }}>
                <div style={{ marginBottom: "10px" }}>
                  <strong style={{ fontSize: "9.5px", color: "#1f3830" }}>Measured Bone Mineral Density (BMD)</strong>
                  <div className="bmd-callout-note">
                    BMD is strictly recorded from prior laboratory DXA/QUS reports. OA-Sathi NEVER estimates or infers BMD from questionnaires, BMI, age, or camera movement.
                  </div>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>
                      BMD T-Score <small>Prior DXA / QUS</small>
                    </span>
                    <input
                      value={form.bmdTScore || ""}
                      onChange={(e) => onChange("bmdTScore", e.target.value)}
                      placeholder="e.g. -1.8 or -2.5"
                      maxLength={10}
                    />
                  </label>
                  <label className="field">
                    <span>
                      Skeletal Scan Site <small>Optional</small>
                    </span>
                    <div className="select-wrap">
                      <select value={form.bmdSite || ""} onChange={(e) => onChange("bmdSite", e.target.value)}>
                        <option value="">None / Not recorded</option>
                        <option value="Lumbar Spine (L1-L4)">Lumbar Spine (L1-L4)</option>
                        <option value="Femoral Neck / Hip">Femoral Neck / Hip</option>
                        <option value="Distal Radius">Distal Radius</option>
                        <option value="Calcaneus (QUS)">Calcaneus (QUS)</option>
                      </select>
                      <ChevronDown size={16} />
                    </div>
                  </label>
                  <label className="field">
                    <span>
                      Scan / Report Date <small>Optional</small>
                    </span>
                    <input
                      type="date"
                      value={form.bmdDate || ""}
                      onChange={(e) => onChange("bmdDate", e.target.value)}
                    />
                  </label>
                </div>
              </div>
            </section>

            <MovementCard
              cameraStatus={cameraStatus}
              cameraMessage={cameraMessage}
              onStartCamera={onStartCamera}
              onStopCamera={onStopCamera}
              videoRef={videoRef}
              enablePoseOverlay={enablePoseOverlay}
              gaitAssessment={gaitAssessment}
              manualObservations={manualObservations}
              onManualObservationChange={onManualObservationChange}
              isRecordingClip={isRecordingClip}
              recordingCountDown={recordingCountDown}
              isAnalyzingGait={isAnalyzingGait}
              onStartRecording={onStartRecording}
              onRunBenchmark={onRunBenchmark}
              onClearGait={onClearGait}
              onLiveClipRecorded={onLiveClipRecorded}
              onCommitObservation={onCommitObservation}
              participantName={form.name}
            />

            <div className="review-panel">
              <div className="review-panel-title">
                <ClipboardCheck size={16} />
                <strong>Review responses before saving</strong>
              </div>
              <div className="review-grid">
                <div className="review-item">
                  <strong>Participant</strong>
                  <span>
                    {form.name ? form.name : "Anonymised"} · {form.age ? `${form.age} yrs` : "Age pending"} · {form.district || "District pending"} · {form.joint || "Joint pending"}
                  </span>
                </div>
                <div className="review-item">
                  <strong>Symptoms & Discomfort</strong>
                  <span>
                    {form.painDuration ? form.painDuration : "Duration pending"} · Discomfort: {form.painLevel}/10 · Stiffness: {form.stiffness || "Pending"}
                  </span>
                </div>
                <div className="review-item">
                  <strong>History & Strain</strong>
                  <span>
                    Injury: {form.previousInjury === true ? "Yes" : form.previousInjury === false ? "No" : form.previousInjury === NOT_CHECKED ? "Not checked" : "Unanswered"} · Family: {form.familyHistory === true ? "Yes" : form.familyHistory === false ? "No" : form.familyHistory === NOT_CHECKED ? "Not checked" : "Unanswered"} · Load: {form.repeatedLoad === true ? "Yes" : form.repeatedLoad === false ? "No" : form.repeatedLoad === NOT_CHECKED ? "Not checked" : "Unanswered"}
                  </span>
                </div>
                <div className="review-item">
                  <strong>Safety Red-Flag Status</strong>
                  <span>
                    {hasSafetyRedFlag ? (
                      <span style={{ color: "#c8411b", fontWeight: 700 }}>
                        <AlertTriangle size={12} style={{ verticalAlign: "middle", marginRight: "3px" }} />
                        Urgent clinical advisory flagged
                      </span>
                    ) : (
                      "No acute red flags reported"
                    )}
                  </span>
                </div>
                <div className="review-item">
                  <strong>Measured Clinical Data</strong>
                  <span>
                    {liveBmi ? `BMI: ${liveBmi} kg/m²` : "BMI: Not provided"} · {form.bmdTScore ? `BMD T-Score: ${form.bmdTScore} (${form.bmdSite || "Measured"})` : "BMD: None recorded"}
                  </span>
                </div>
                <div className="review-item">
                  <strong>Completeness Check</strong>
                  <span>
                    {unassessedCount > 0 ? `${unassessedCount} items marked 'Not checked' or omitted` : "All standard questions addressed"} · Consent: {consent ? "Confirmed" : "Required"}
                  </span>
                </div>
              </div>
            </div>

            <div className="consent-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => onConsent(e.target.checked)}
                />
                <span className="custom-checkbox">
                  <Check size={13} />
                </span>
                <span>
                  The person understands this is a voluntary screening aid, not a diagnosis, and agrees to continue.
                </span>
              </label>
            </div>

            {error && (
              <div className="form-error" role="alert">
                <Info size={17} />
                {error}
              </div>
            )}

            <div className="form-actions">
              <span>
                <ShieldCheck size={16} /> No personal data leaves this browser
              </span>
              <button className="button button-primary" type="submit" disabled={isSubmitting}>
                <Sparkles size={16} />{" "}
                {editingRecordId ? "Save updated screening record" : "Save screening & view summary"}{" "}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>

          <ScreeningAside />
        </form>
      )}
      <Disclaimer />
    </div>
  );
});

const MovementCard = memo(function MovementCard({
  cameraStatus,
  cameraMessage,
  onStartCamera,
  onStopCamera,
  videoRef,
  enablePoseOverlay = true,
  gaitAssessment,
  manualObservations,
  onManualObservationChange,
  isRecordingClip,
  recordingCountDown: _recordingCountDown,
  isAnalyzingGait,
  onStartRecording: _onStartRecording,
  onRunBenchmark,
  onClearGait,
  onLiveClipRecorded,
  onCommitObservation,
  participantName,
}: {
  cameraStatus: "idle" | "ready" | "unsupported" | "denied" | "error";
  cameraMessage: string;
  onStartCamera: () => void;
  onStopCamera: () => void;
  videoRef: RefObject<HTMLVideoElement>;
  enablePoseOverlay?: boolean;
  gaitAssessment: StructuredGaitAnalysisOutput | null;
  manualObservations: ManualGaitObservations;
  onManualObservationChange: (field: keyof ManualGaitObservations, val: TriStateAnswer | string) => void;
  isRecordingClip: boolean;
  recordingCountDown: number;
  isAnalyzingGait: boolean;
  onStartRecording: () => void;
  onRunBenchmark: () => void;
  onClearGait: () => void;
  onLiveClipRecorded?: (frames: ValidatedPoseFrame[]) => void;
  onCommitObservation?: (observation: StructuredGaitAnalysisOutput) => void;
  participantName?: string;
}) {
  const gaitStatus = getGaitAnalysisStatus(cameraStatus === "ready", gaitAssessment);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [livePoseStatus, setLivePoseStatus] = useState<LivePoseStatus>("uninitialized");
  const [poseMetrics, setPoseMetrics] = useState<LiveJointMetrics>({
    kneeAngleDeg: null,
    trunkTiltDeg: null,
    confidenceScore: 0,
    landmarksDetected: 0,
  });
  const [showOverlay, setShowOverlay] = useState<boolean>(enablePoseOverlay);
  const [poseError, setPoseError] = useState<string>("");
  const [retryTrigger, setRetryTrigger] = useState<number>(0);

  // Controlled Observation Workflow State
  const [observationStage, setObservationStage] = useState<"idle" | "guidance" | "capturing" | "review">("idle");
  const [stagedObservation, setStagedObservation] = useState<StructuredGaitAnalysisOutput | null>(null);
  const [localCountdown, setLocalCountdown] = useState<number>(5);
  const [elapsedCaptureMs, setElapsedCaptureMs] = useState<number>(0);
  const captureTimerRef = useRef<number | null>(null);
  const captureStartTimeRef = useRef<number>(0);

  const recordingActiveRef = useRef<boolean>(false);
  const recordedFramesRef = useRef<ValidatedPoseFrame[]>([]);
  const frameCounterRef = useRef<number>(0);

  const handleStopAndReview = useCallback(() => {
    if (captureTimerRef.current !== null) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    recordingActiveRef.current = false;

    const frames = [...recordedFramesRef.current];
    if (onLiveClipRecorded) {
      onLiveClipRecorded(frames);
    }

    const evalResult = evaluateMovementSequence(frames, {
      sequenceId: `live_${Date.now()}`,
      timestamp: Date.now(),
    });
    const output = convertMovementEvaluationToGaitOutput(
      evalResult,
      participantName || "PARTICIPANT",
      manualObservations
    );
    setStagedObservation(output);
    setObservationStage("review");
  }, [manualObservations, onLiveClipRecorded, participantName]);

  const handleBeginObservationCapture = useCallback(() => {
    recordedFramesRef.current = [];
    frameCounterRef.current = 0;
    recordingActiveRef.current = true;
    setObservationStage("capturing");
    setLocalCountdown(5);
    setElapsedCaptureMs(0);
    captureStartTimeRef.current = Date.now();

    if (captureTimerRef.current !== null) {
      clearInterval(captureTimerRef.current);
    }

    captureTimerRef.current = window.setInterval(() => {
      const elapsedSec = (Date.now() - captureStartTimeRef.current) / 1000;
      setElapsedCaptureMs(Math.round(elapsedSec * 1000));
      const remaining = Math.max(0, 5 - Math.floor(elapsedSec));
      setLocalCountdown(remaining);

      if (elapsedSec >= 5) {
        if (captureTimerRef.current !== null) {
          clearInterval(captureTimerRef.current);
          captureTimerRef.current = null;
        }
        handleStopAndReview();
      }
    }, 100);
  }, [handleStopAndReview]);

  const handleStartObservationWorkflow = useCallback(() => {
    if (cameraStatus !== "ready") {
      onStartCamera();
    }
    setObservationStage((curr) => (curr === "guidance" ? "idle" : "guidance"));
  }, [cameraStatus, onStartCamera]);

  const handleAcceptObservation = useCallback(() => {
    if (stagedObservation) {
      if (onCommitObservation) {
        onCommitObservation(stagedObservation);
      }
      setStagedObservation(null);
      setObservationStage("idle");
    }
  }, [stagedObservation, onCommitObservation]);

  const handleDiscardObservation = useCallback(() => {
    setStagedObservation(null);
    setObservationStage("idle");
    recordedFramesRef.current = [];
  }, []);

  useEffect(() => {
    if (cameraStatus !== "ready") {
      if (captureTimerRef.current !== null) {
        clearInterval(captureTimerRef.current);
        captureTimerRef.current = null;
      }
      recordingActiveRef.current = false;
      if (observationStage === "capturing" || observationStage === "guidance") {
        setObservationStage("idle");
      }
    }
  }, [cameraStatus, observationStage]);

  useEffect(() => {
    return () => {
      if (captureTimerRef.current !== null) {
        clearInterval(captureTimerRef.current);
        captureTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (isRecordingClip) {
      recordingActiveRef.current = true;
      recordedFramesRef.current = [];
      frameCounterRef.current = 0;
    } else if (observationStage !== "capturing") {
      if (recordingActiveRef.current) {
        recordingActiveRef.current = false;
        if (onLiveClipRecorded && recordedFramesRef.current.length > 0) {
          onLiveClipRecorded([...recordedFramesRef.current]);
        }
      }
    }
  }, [isRecordingClip, observationStage, onLiveClipRecorded]);

  useEffect(() => {
    setShowOverlay(enablePoseOverlay);
  }, [enablePoseOverlay]);

  useEffect(() => {
    if (cameraStatus !== "ready") {
      setLivePoseStatus("uninitialized");
      setPoseMetrics({
        kneeAngleDeg: null,
        trunkTiltDeg: null,
        confidenceScore: 0,
        landmarksDetected: 0,
      });
      return;
    }

    let isMounted = true;
    let animId: number | null = null;
    let isInferring = false;
    let lastMetricsTime = 0;
    let landmarker: any = null;

    setLivePoseStatus("loading-model");
    setPoseError("");

    getLivePoseLandmarker()
      .then((instance) => {
        if (!isMounted) return;
        landmarker = instance;
        setLivePoseStatus("model-ready");

        const loop = () => {
          if (!isMounted) return;

          const video = videoRef.current;
          const canvas = canvasRef.current;

          if (video && canvas && landmarker && video.readyState >= 2 && !video.paused && !video.ended) {
            if (!isInferring) {
              isInferring = true;
              try {
                const now = performance.now();
                const { result, metrics } = detectAndDrawPose(landmarker, video, canvas, now, showOverlay);
                if (result && result.landmarks && result.landmarks.length > 0) {
                  setLivePoseStatus("tracking-active");
                } else {
                  setLivePoseStatus("no-person-detected");
                }

                // Buffer validated pose frames during recording clip
                if (recordingActiveRef.current) {
                  const lms = result?.landmarks?.[0] || [];
                  const vFrame = validatePoseFrame(lms, now, frameCounterRef.current++);
                  recordedFramesRef.current.push(vFrame);
                }

                // Throttle React state updates to avoid unnecessary renders
                if (now - lastMetricsTime > 200) {
                  lastMetricsTime = now;
                  setPoseMetrics(metrics);
                }
              } catch {
                // Drop frame on timing error
              } finally {
                isInferring = false;
              }
            }
          }

          animId = requestAnimationFrame(loop);
        };

        animId = requestAnimationFrame(loop);
      })
      .catch((err) => {
        if (!isMounted) return;
        setLivePoseStatus("error");
        setPoseError(
          err instanceof Error
            ? err.message
            : "MediaPipe PoseLandmarker model failed to load in this browser environment."
        );
      });

    return () => {
      isMounted = false;
      if (animId !== null) {
        cancelAnimationFrame(animId);
      }
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    };
  }, [cameraStatus, retryTrigger, showOverlay, videoRef]);

  return (
    <section className="form-card movement-card">
      <div className="form-section-heading">
        <span className="form-section-icon history-icon">
          <Activity size={18} />
        </span>
        <div>
          <h2>Movement assessment</h2>
          <p>Local pose tracking and manual observational checklist.</p>
        </div>
      </div>

      <div className="gait-model-badge">
        <Activity size={15} />
        <span>
          <strong>Automated gait analysis: {gaitStatus.status}</strong> — {gaitStatus.statusNotice}
        </span>
      </div>

      <div className="pose-model-bar">
        <span className="pose-status-indicator">
          <span
            className={`pose-status-dot ${
              livePoseStatus === "tracking-active"
                ? "dot-active"
                : livePoseStatus === "loading-model"
                  ? "dot-loading"
                  : livePoseStatus === "error"
                    ? "dot-error"
                    : "dot-waiting"
            }`}
          />
          <strong>Pose estimation:</strong>{" "}
          {livePoseStatus === "loading-model"
            ? "Initializing local MediaPipe Pose model..."
            : livePoseStatus === "tracking-active"
              ? `Real-time tracking active (${poseMetrics.landmarksDetected} landmarks)`
              : livePoseStatus === "no-person-detected"
                ? "Camera active · Step into frame to track movement"
                : livePoseStatus === "error"
                  ? "Model unavailable (offline fallback active)"
                  : cameraStatus === "ready"
                    ? "Camera ready for pose tracking"
                    : "Ready to start camera"}
        </span>

        {livePoseStatus === "error" && (
          <button
            type="button"
            className="button button-secondary"
            style={{ padding: "2px 7px", fontSize: "7.5px" }}
            onClick={() => setRetryTrigger((c) => c + 1)}
          >
            <RefreshCw size={11} /> Retry
          </button>
        )}
      </div>

      <div className="movement-toolbar">
        <button
          type="button"
          className="button button-secondary"
          onClick={cameraStatus === "ready" ? onStopCamera : onStartCamera}
        >
          {cameraStatus === "ready" ? "Stop camera" : "Open camera"}
        </button>

        {cameraStatus === "ready" && (
          <button
            type="button"
            className="button button-secondary"
            onClick={handleStartObservationWorkflow}
            disabled={observationStage === "capturing" || isAnalyzingGait}
            title="Start controlled 5-second movement observation with camera positioning guidance"
          >
            {observationStage === "capturing" ? (
              <>
                <span className="recording-live-pulse" /> Capturing ({localCountdown}s)
              </>
            ) : (
              "Record 5s walking clip"
            )}
          </button>
        )}

        <button
          type="button"
          className="button button-secondary"
          onClick={onRunBenchmark}
          disabled={isAnalyzingGait || isRecordingClip || observationStage === "capturing"}
          title="Run gait analysis using a validated benchmark walking cycle (tests pipeline without camera hardware)"
        >
          {isAnalyzingGait ? "Analyzing..." : "Test benchmark clip"}
        </button>

        {gaitAssessment && (
          <button
            type="button"
            className="button button-secondary"
            onClick={onClearGait}
            title="Reset automated movement assessment"
          >
            Clear / Retest
          </button>
        )}

        {cameraStatus === "ready" && (
          <button
            type="button"
            className={`button button-secondary ${showOverlay ? "active" : ""}`}
            onClick={() => setShowOverlay((v) => !v)}
            title="Toggle visible real-time pose skeleton connectors"
          >
            {showOverlay ? <Eye size={13} /> : <EyeOff size={13} />}
            {showOverlay ? "Skeleton: Visible" : "Skeleton: Hidden"}
          </button>
        )}

        {cameraStatus === "ready" && !isRecordingClip && observationStage !== "capturing" && (
          <span className="camera-live-indicator">Camera live</span>
        )}
      </div>

      {/* PHASE 9: Controlled Observation Guidance Card */}
      {observationStage === "guidance" && (
        <div className="observation-guidance-card">
          <div className="guidance-header">
            <Info size={18} />
            <div>
              <h4>Optional Movement Observation Setup</h4>
              <p>Direct in-browser pose tracking to evaluate exploratory movement rhythm and joint excursion.</p>
            </div>
          </div>
          <div className="guidance-body">
            <div className="guidance-step">
              <span className="step-num">1</span>
              <div>
                <strong>Device placement:</strong> Place camera at waist or chest height on a stable, level surface.
              </div>
            </div>
            <div className="guidance-step">
              <span className="step-num">2</span>
              <div>
                <strong>Position yourself:</strong> Stand 2–3 meters back so your whole body (head to feet) is in view.
              </div>
            </div>
            <div className="guidance-step">
              <span className="step-num">3</span>
              <div>
                <strong>Movement test:</strong> Walk continuously across the camera frame, or perform 2–3 slow chair sit-to-stands.
              </div>
            </div>
          </div>
          <div className="guidance-privacy-note">
            <Lock size={13} />
            <span>Privacy Guarantee: Video frames are evaluated locally in your browser using WebAssembly. No video is uploaded or stored.</span>
          </div>
          <div className="guidance-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={handleBeginObservationCapture}
            >
              <Play size={13} /> Begin 5-Second Observation
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setObservationStage("idle")}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className={`camera-panel ${cameraStatus === "ready" ? "camera-visible" : ""}`} style={{ position: "relative" }}>
        <video
          ref={videoRef}
          className="camera-video"
          style={{ display: cameraStatus === "ready" ? "block" : "none" }}
          playsInline
          muted
          autoPlay
        />
        <canvas
          ref={canvasRef}
          className="pose-canvas-overlay"
          style={{ display: cameraStatus === "ready" ? "block" : "none" }}
        />

        {/* Live Observation Capture HUD with Early Stop */}
        {observationStage === "capturing" && (
          <div className="observation-capture-hud">
            <div className="capture-hud-status">
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span className="recording-live-pulse" />
                <strong>Recording movement... {localCountdown}s</strong>
              </span>
              <span className="capture-frames-badge">{recordedFramesRef.current.length} frames</span>
            </div>
            <div className="capture-hud-progress">
              <div
                className="capture-hud-bar"
                style={{ width: `${Math.min(100, Math.max(0, (elapsedCaptureMs / 5000) * 100))}%` }}
              />
            </div>
            <div className="capture-hud-controls">
              <button
                type="button"
                className="button button-secondary"
                style={{ background: "#ffffff", borderColor: "#e11d48", color: "#e11d48", padding: "4px 10px", fontSize: "11px" }}
                onClick={handleStopAndReview}
              >
                <Square size={12} /> Stop Early & Review
              </button>
            </div>
          </div>
        )}

        {cameraStatus === "ready" && (
          <>
            <div className="pose-hud-top">
              <span className="pose-hud-badge">
                <span
                  className={`pose-status-dot ${
                    livePoseStatus === "tracking-active"
                      ? "dot-active"
                      : livePoseStatus === "loading-model"
                        ? "dot-loading"
                        : livePoseStatus === "error"
                          ? "dot-error"
                          : "dot-waiting"
                  }`}
                />
                {livePoseStatus === "loading-model"
                  ? "Loading MediaPipe Pose..."
                  : livePoseStatus === "tracking-active"
                    ? `Tracking active · ${poseMetrics.landmarksDetected} landmarks`
                    : livePoseStatus === "no-person-detected"
                      ? "Stand in camera view"
                      : livePoseStatus === "error"
                        ? "Model offline"
                        : "Camera ready"}
              </span>

              <span className="pose-engine-tag">Local MediaPipe Pose (Lite)</span>
            </div>

            {livePoseStatus === "tracking-active" && (
              <div className="pose-hud-bottom">
                <div className="pose-metrics-group">
                  {poseMetrics.kneeAngleDeg !== null && (
                    <div className="pose-metric-tag">
                      <span>Knee angle</span>
                      <strong>{poseMetrics.kneeAngleDeg}°</strong>
                    </div>
                  )}
                  {poseMetrics.trunkTiltDeg !== null && (
                    <div className="pose-metric-tag">
                      <span>Trunk sway</span>
                      <strong>{poseMetrics.trunkTiltDeg}°</strong>
                    </div>
                  )}
                  {poseMetrics.confidenceScore > 0 && (
                    <div className="pose-metric-tag">
                      <span>Tracking</span>
                      <strong>{poseMetrics.confidenceScore}%</strong>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <div
          className="camera-placeholder"
          style={{ display: cameraStatus === "ready" ? "none" : "grid" }}
        >
          <span>Camera feed appears here when available.</span>
        </div>
      </div>

      {/* PHASE 9: Pre-Save Observation Review Box */}
      {observationStage === "review" && stagedObservation && (
        <div className="observation-review-box">
          <div className="review-box-header">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Activity size={18} style={{ color: "#0d9488" }} />
              <div>
                <h4>Pre-Save Movement Observation Review</h4>
                <span style={{ fontSize: "11px", color: "#64748b" }}>
                  Review derived technical indicators before choosing to attach them to the patient screening.
                </span>
              </div>
            </div>
            <span
              className={`gait-status-tag ${
                stagedObservation.status === "completed"
                  ? "status-completed"
                  : stagedObservation.status === "insufficient-quality"
                    ? "status-insufficient"
                    : "status-failed"
              }`}
            >
              {stagedObservation.inputQualityStatus.toUpperCase()} QUALITY
            </span>
          </div>

          <div className="quality-indicators-grid">
            <div className="quality-indicator-card">
              <span className="q-label">Observed Duration</span>
              <span className="q-value">{stagedObservation.durationSeconds.toFixed(1)}</span>
              <span className="q-sub">seconds</span>
            </div>
            <div className="quality-indicator-card">
              <span className="q-label">Usable Frames</span>
              <span className="q-value">{stagedObservation.usableFramesCount}</span>
              <span className="q-sub">
                ({stagedObservation.technicalQuality?.usableFramePercentage ?? 0}%)
              </span>
            </div>
            <div className="quality-indicator-card">
              <span className="q-label">Tracking Confidence</span>
              <span className="q-value">{Math.round(stagedObservation.meanLandmarkConfidence * 100)}%</span>
              <span className="q-sub">confidence</span>
            </div>
            <div className="quality-indicator-card">
              <span className="q-label">Kinematic Status</span>
              <span className="q-value" style={{ fontSize: "12px", textTransform: "capitalize" }}>
                {stagedObservation.technicalQuality?.suitabilityStatus ?? "Marginal"}
              </span>
            </div>
          </div>

          {stagedObservation.technicalQuality?.coordinateSummary && (
            <div style={{ marginTop: "12px" }}>
              <strong style={{ fontSize: "11px", color: "#334155", display: "block", marginBottom: "4px" }}>
                Lower-Extremity Landmark Coordinate Bounds (Normalized 2D)
              </strong>
              <div className="coordinate-summary-grid">
                {Object.entries(stagedObservation.technicalQuality.coordinateSummary).map(([jointKey, range]) => (
                  <div key={jointKey} className="coordinate-joint-card">
                    <span className="coordinate-joint-name">
                      {jointKey.replace(/([A-Z])/g, " $1")}
                    </span>
                    <div className="coordinate-joint-stats">
                      {range.minX !== null ? (
                        <>
                          <span>X: [{range.minX.toFixed(2)}, {range.maxX?.toFixed(2)}]</span>
                          <span>Y: [{range.minY?.toFixed(2)}, {range.maxY?.toFixed(2)}]</span>
                          <span>Vis: {Math.round((range.meanVisibility ?? 0) * 100)}% ({range.trackedFramesCount} frames)</span>
                        </>
                      ) : (
                        <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Not detected</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: "12px" }}>
            <strong style={{ fontSize: "11px", color: "#334155", display: "block", marginBottom: "4px" }}>
              Exploratory Movement Measurements
            </strong>
            <div className="gait-features-grid">
              <div className="gait-feature-tile">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="feature-label">Step Cadence</span>
                  <span className={`feature-valid-tag ${stagedObservation.features.cadence?.isValid ? "tag-valid" : "tag-invalid"}`}>
                    {stagedObservation.features.cadence?.isValid ? "Valid" : "Unavailable"}
                  </span>
                </div>
                <div>
                  <span className="feature-val">
                    {stagedObservation.features.cadence?.value !== null && stagedObservation.features.cadence?.isValid
                      ? stagedObservation.features.cadence.value
                      : "Unavailable"}
                  </span>
                  <span className="feature-unit">
                    {stagedObservation.features.cadence?.isValid ? stagedObservation.features.cadence.unit : ""}
                  </span>
                </div>
              </div>

              <div className="gait-feature-tile">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="feature-label">Bilateral Step Symmetry</span>
                  <span className={`feature-valid-tag ${stagedObservation.features.stepSymmetry?.isValid ? "tag-valid" : "tag-invalid"}`}>
                    {stagedObservation.features.stepSymmetry?.isValid ? "Valid" : "Unavailable"}
                  </span>
                </div>
                <div>
                  <span className="feature-val">
                    {stagedObservation.features.stepSymmetry?.value !== null && stagedObservation.features.stepSymmetry?.isValid
                      ? stagedObservation.features.stepSymmetry.value
                      : "Unavailable"}
                  </span>
                  <span className="feature-unit">
                    {stagedObservation.features.stepSymmetry?.isValid ? stagedObservation.features.stepSymmetry.unit : ""}
                  </span>
                </div>
              </div>

              <div className="gait-feature-tile">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="feature-label">Active Knee Flexion Range</span>
                  <span className={`feature-valid-tag ${stagedObservation.features.activeKneeFlexionRange?.isValid ? "tag-valid" : "tag-invalid"}`}>
                    {stagedObservation.features.activeKneeFlexionRange?.isValid ? "Valid" : "Unavailable"}
                  </span>
                </div>
                <div>
                  <span className="feature-val">
                    {stagedObservation.features.activeKneeFlexionRange?.value !== null && stagedObservation.features.activeKneeFlexionRange?.isValid
                      ? `${stagedObservation.features.activeKneeFlexionRange.value}°`
                      : "Unavailable"}
                  </span>
                </div>
              </div>

              <div className="gait-feature-tile">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="feature-label">Coronal Trunk Sway</span>
                  <span className={`feature-valid-tag ${stagedObservation.features.coronalTrunkSway?.isValid ? "tag-valid" : "tag-invalid"}`}>
                    {stagedObservation.features.coronalTrunkSway?.isValid ? "Valid" : "Unavailable"}
                  </span>
                </div>
                <div>
                  <span className="feature-val">
                    {stagedObservation.features.coronalTrunkSway?.value !== null && stagedObservation.features.coronalTrunkSway?.isValid
                      ? `${stagedObservation.features.coronalTrunkSway.value}°`
                      : "Unavailable"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {stagedObservation.warnings && stagedObservation.warnings.length > 0 && (
            <div style={{ margin: "10px 0 0", padding: "8px 10px", background: "#fef2f2", border: "1px solid #fee2e2", borderRadius: "6px", fontSize: "11px", color: "#991b1b" }}>
              <strong>Observation Quality Notice:</strong> {stagedObservation.warnings.join(" ")}
            </div>
          )}

          <div className="gait-disclaimer-note" style={{ margin: "10px 0 0" }}>
            <strong>Non-Diagnostic Disclosure:</strong> Direct technical observations only. This prototype does not generate an osteoarthritis diagnosis, bone density, or cartilage thickness estimation. Camera capture does not override patient-reported safety red flags.
          </div>

          <div className="review-box-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={handleAcceptObservation}
            >
              <CheckCircle2 size={14} /> Attach Observation to Screening
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={handleDiscardObservation}
            >
              <Trash2 size={14} /> Discard & Retest
            </button>
          </div>
        </div>
      )}

      {livePoseStatus === "error" && (
        <div
          className="camera-message"
          role="alert"
          style={{ background: "#fff5f2", borderColor: "#f7cfc4", color: "#923f31", display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          <span>
            <strong>Pose estimation unavailable:</strong> {poseError || "Model initialization failed."} Real-time overlay disabled. The manual visual gait checklist below remains fully functional for screening.
          </span>
          <button
            type="button"
            className="button button-secondary"
            style={{ marginLeft: "8px", padding: "3px 8px", fontSize: "7.5px" }}
            onClick={() => setRetryTrigger((c) => c + 1)}
          >
            <RefreshCw size={11} /> Retry initialization
          </button>
        </div>
      )}


      {cameraMessage && (
        <div className="camera-message" role="status">
          {cameraMessage}
        </div>
      )}

      {isAnalyzingGait && (
        <div className="camera-message" role="status" style={{ color: "#147f73", marginTop: "8px" }}>
          <Sparkles size={14} /> Processing walking frames through local MediaPipe Pose model...
        </div>
      )}

      {gaitAssessment && (
        <div className="gait-analysis-box">
          <div className="gait-analysis-header">
            <div>
              <strong>Automated Gait & Movement Assessment</strong>
              <span style={{ fontSize: "7.5px", color: "#6a827a", marginLeft: "6px" }}>
                Method: {gaitAssessment.analysisMethod} (v{gaitAssessment.modelVersion})
              </span>
            </div>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span
                className={`gait-status-tag ${
                  gaitAssessment.status === "completed"
                    ? "status-completed"
                    : gaitAssessment.status === "processing"
                      ? "status-processing"
                      : gaitAssessment.status === "model-unavailable"
                        ? "status-offline"
                        : "status-failed"
                }`}
              >
                {gaitAssessment.status}
              </span>
            </div>
          </div>

          <div style={{ fontSize: "7.5px", color: "#4f6a62", marginBottom: "8px" }}>
            Pose landmarks: <strong>{gaitAssessment.usableFramesCount > 0 ? `Detected (${gaitAssessment.usableFramesCount} usable frames)` : "No usable pose data found"}</strong> · Tracking status: <strong>{gaitAssessment.inputQualityStatus.toUpperCase()}</strong>
          </div>

          {/* CATEGORY 1: Directly Observed Technical Indicators */}
          <div className="gait-category-section">
            <div className="gait-category-heading">
              <span>1. Directly Observed Technical Quality Indicators</span>
              <span className="gait-category-tag tag-observed">Direct Technical Observations</span>
            </div>
            <div className="quality-indicators-grid">
              <div className="quality-indicator-card">
                <span className="q-label">Frames Processed</span>
                <span className="q-value">{gaitAssessment.framesAnalyzed}</span>
                <span className="q-sub">frames</span>
              </div>
              <div className="quality-indicator-card">
                <span className="q-label">Usable Frames</span>
                <span className="q-value">{gaitAssessment.usableFramesCount}</span>
                <span className="q-sub">
                  ({gaitAssessment.framesAnalyzed > 0 ? Math.round((gaitAssessment.usableFramesCount / gaitAssessment.framesAnalyzed) * 100) : 0}%)
                </span>
              </div>
              <div className="quality-indicator-card">
                <span className="q-label">Capture Duration</span>
                <span className="q-value">{gaitAssessment.durationSeconds.toFixed(1)}</span>
                <span className="q-sub">seconds</span>
              </div>
              <div className="quality-indicator-card">
                <span className="q-label">Person Visibility</span>
                <span className="q-value">
                  {gaitAssessment.technicalQuality
                    ? Math.round(gaitAssessment.technicalQuality.personPresenceRatio * 100)
                    : (gaitAssessment.usableFramesCount > 0 ? Math.min(100, Math.round((gaitAssessment.usableFramesCount / Math.max(1, gaitAssessment.framesAnalyzed)) * 100)) : 0)}%
                </span>
                <span className="q-sub">in-frame</span>
              </div>
              <div className="quality-indicator-card">
                <span className="q-label">Mean Confidence</span>
                <span className="q-value">{Math.round(gaitAssessment.meanLandmarkConfidence * 100)}%</span>
                <span className="q-sub">tracking</span>
              </div>
              <div className="quality-indicator-card">
                <span className="q-label">Kinematic Suitability</span>
                <span className="q-value" style={{ fontSize: "9.5px", textTransform: "capitalize" }}>
                  {gaitAssessment.technicalQuality?.suitabilityStatus || (gaitAssessment.status === "completed" ? "Suitable" : "Insufficient")}
                </span>
              </div>
            </div>

            {gaitAssessment.technicalQuality?.coordinateSummary && (
              <div style={{ marginTop: "8px", marginBottom: "8px" }}>
                <span style={{ fontSize: "7.5px", fontWeight: 700, color: "#3b5a51", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                  Lower-Extremity Landmark Coordinate Bounds (Normalized 2D)
                </span>
                <div className="coordinate-summary-grid">
                  {Object.entries(gaitAssessment.technicalQuality.coordinateSummary).map(([jointKey, range]) => (
                    <div key={jointKey} className="coordinate-joint-card">
                      <span className="coordinate-joint-name">
                        {jointKey.replace(/([A-Z])/g, " $1")}
                      </span>
                      <div className="coordinate-joint-stats">
                        {range.minX !== null ? (
                          <>
                            <span>X: [{range.minX.toFixed(2)}, {range.maxX?.toFixed(2)}]</span>
                            <span>Y: [{range.minY?.toFixed(2)}, {range.maxY?.toFixed(2)}]</span>
                            <span>Vis: {Math.round((range.meanVisibility ?? 0) * 100)}% ({range.trackedFramesCount} frames)</span>
                          </>
                        ) : (
                          <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Not detected</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ fontSize: "7.5px", color: "#547067", marginBottom: "8px", fontStyle: "italic" }}>
              Method: 2D landmark coordinates and model confidence evaluated over capture duration. Technical indicators evaluate camera capture fidelity only and do NOT represent OA risk markers.
            </div>
          </div>

          {/* CATEGORY 2: Exploratory Derived Biomechanical Measurements */}
          <div className="gait-category-section">
            <div className="gait-category-heading">
              <span>2. Exploratory Derived Biomechanical Measurements</span>
              <span className="gait-category-tag tag-exploratory">Exploratory Kinematics</span>
            </div>
            <div className="gait-features-grid">
              <div className="gait-feature-tile">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="feature-label">Step Cadence</span>
                  <span className={`feature-valid-tag ${gaitAssessment.features.cadence?.isValid ? "tag-valid" : "tag-invalid"}`}>
                    {gaitAssessment.features.cadence?.isValid ? "Valid" : "Unavailable"}
                  </span>
                </div>
                <div>
                  <span className="feature-val">
                    {gaitAssessment.features.cadence?.value !== null && gaitAssessment.features.cadence?.isValid
                      ? gaitAssessment.features.cadence.value
                      : "Unavailable"}
                  </span>
                  <span className="feature-unit">
                    {gaitAssessment.features.cadence?.isValid ? gaitAssessment.features.cadence.unit : ""}
                  </span>
                </div>
                <span className="feature-note">
                  {gaitAssessment.features.cadence?.isValid
                    ? gaitAssessment.features.cadence.clinicalSignificance
                    : (gaitAssessment.features.cadence?.reasonUnavailable || "Cadence requires at least 1.8s of sustained walking with visible ankle markers.")}
                </span>
              </div>

              <div className="gait-feature-tile">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="feature-label">Bilateral Step Symmetry</span>
                  <span className={`feature-valid-tag ${gaitAssessment.features.stepSymmetry?.isValid ? "tag-valid" : "tag-invalid"}`}>
                    {gaitAssessment.features.stepSymmetry?.isValid ? "Valid" : "Unavailable"}
                  </span>
                </div>
                <div>
                  <span className="feature-val">
                    {gaitAssessment.features.stepSymmetry?.value !== null && gaitAssessment.features.stepSymmetry?.isValid
                      ? gaitAssessment.features.stepSymmetry.value
                      : "Unavailable"}
                  </span>
                  <span className="feature-unit">
                    {gaitAssessment.features.stepSymmetry?.isValid ? gaitAssessment.features.stepSymmetry.unit : ""}
                  </span>
                </div>
                <span className="feature-note">
                  {gaitAssessment.features.stepSymmetry?.isValid
                    ? gaitAssessment.features.stepSymmetry.clinicalSignificance
                    : (gaitAssessment.features.stepSymmetry?.reasonUnavailable || "Symmetry requires detectable alternating step excursions across both limbs.")}
                </span>
              </div>

              <div className="gait-feature-tile">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="feature-label">Active Knee Flexion Range</span>
                  <span className={`feature-valid-tag ${gaitAssessment.features.activeKneeFlexionRange?.isValid ? "tag-valid" : "tag-invalid"}`}>
                    {gaitAssessment.features.activeKneeFlexionRange?.isValid ? "Valid" : "Unavailable"}
                  </span>
                </div>
                <div>
                  <span className="feature-val">
                    {gaitAssessment.features.activeKneeFlexionRange?.value !== null && gaitAssessment.features.activeKneeFlexionRange?.isValid
                      ? `${gaitAssessment.features.activeKneeFlexionRange.value}°`
                      : "Unavailable"}
                  </span>
                </div>
                <span className="feature-note">
                  {gaitAssessment.features.activeKneeFlexionRange?.isValid
                    ? gaitAssessment.features.activeKneeFlexionRange.clinicalSignificance
                    : (gaitAssessment.features.activeKneeFlexionRange?.reasonUnavailable || "Requires visible hip, knee, and ankle joints in sagittal or oblique view.")}
                </span>
              </div>

              <div className="gait-feature-tile">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="feature-label">Coronal Trunk Sway</span>
                  <span className={`feature-valid-tag ${gaitAssessment.features.coronalTrunkSway?.isValid ? "tag-valid" : "tag-invalid"}`}>
                    {gaitAssessment.features.coronalTrunkSway?.isValid ? "Valid" : "Unavailable"}
                  </span>
                </div>
                <div>
                  <span className="feature-val">
                    {gaitAssessment.features.coronalTrunkSway?.value !== null && gaitAssessment.features.coronalTrunkSway?.isValid
                      ? `${gaitAssessment.features.coronalTrunkSway.value}°`
                      : "Unavailable"}
                  </span>
                </div>
                <span className="feature-note">
                  {gaitAssessment.features.coronalTrunkSway?.isValid
                    ? gaitAssessment.features.coronalTrunkSway.clinicalSignificance
                    : (gaitAssessment.features.coronalTrunkSway?.reasonUnavailable || "Requires visible shoulder and hip markers during gait sequence.")}
                </span>
              </div>
            </div>
          </div>

          {/* CATEGORY 3: Clinically Validated Measures */}
          <div className="gait-category-section">
            <div className="gait-category-heading">
              <span>3. Clinically Validated Measures</span>
              <span className="gait-category-tag tag-clinical-zero">0 Validated Measures</span>
            </div>
            <div className="clinical-validation-box">
              <strong>Clinically Validated Measures: None (0 / Unvalidated Research Prototype)</strong>
              <p style={{ margin: "3px 0 0" }}>
                Zero movement features in this prototype have completed prospective clinical trials or received regulatory clearance for diagnosing osteoarthritis. Derived kinematic indicators are exploratory engineering metrics intended solely for clinician review.
              </p>
            </div>
          </div>

          {(gaitAssessment.status === "insufficient-quality" ||
            gaitAssessment.status === "failed" ||
            gaitAssessment.status === "model-unavailable") && (
            <div style={{ padding: "8px 0", fontSize: "8px", color: "#7a3e35" }}>
              <p style={{ fontWeight: 600 }}>
                {gaitAssessment.errorMessage || gaitAssessment.warnings?.join(" ") || "Pose estimation could not extract sufficient landmarks."}
              </p>
              <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
                {cameraStatus === "ready" && (
                  <button
                    type="button"
                    className="button button-secondary"
                    style={{ fontSize: "7.5px", padding: "4px 8px" }}
                    onClick={handleStartObservationWorkflow}
                    disabled={observationStage === "capturing" || isAnalyzingGait}
                  >
                    <RefreshCw size={11} /> Retry clip recording
                  </button>
                )}
                <button
                  type="button"
                  className="button button-secondary"
                  style={{ fontSize: "7.5px", padding: "4px 8px" }}
                  onClick={onRunBenchmark}
                  disabled={isRecordingClip || isAnalyzingGait}
                >
                  Load benchmark sample instead
                </button>
              </div>
            </div>
          )}

          {gaitAssessment.limitations && gaitAssessment.limitations.length > 0 && (
            <div style={{ marginTop: "10px", fontSize: "7.5px", color: "#547067" }}>
              <strong>Technical & Biomechanical Limitations:</strong>
              <ul style={{ margin: "3px 0 0 16px", padding: 0 }}>
                {gaitAssessment.limitations.map((lim, i) => (
                  <li key={i}>{lim}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="gait-disclaimer-note">
            {gaitAssessment.disclaimer}
          </div>
        </div>
      )}

      <div className="gait-manual-section">
        <div className="gait-manual-title">
          <ClipboardCheck size={15} />
          <span>Manual Visual Gait Observations (Clinical Fallback)</span>
        </div>
        <p style={{ fontSize: "7.5px", color: "#667d75", margin: "0 0 8px" }}>
          Observational items can be assessed visually whether camera is available or offline.
        </p>
        <div className="toggle-list">
          <TriStateRow
            title="Visible limping or antalgic gait"
            description="Participant visibly offloads or limits stance time on one limb."
            value={manualObservations.visibleLimp}
            onChange={(val) => onManualObservationChange("visibleLimp", val)}
          />
          <TriStateRow
            title="Hesitancy or hand-support rising from chair"
            description="Requires push-off or exhibits visible hesitancy during chair transfer."
            value={manualObservations.hesitantSitToStand}
            onChange={(val) => onManualObservationChange("hesitantSitToStand", val)}
          />
          <TriStateRow
            title="Turning hesitancy or unsteadiness"
            description="Noticeable multi-step hesitation or unsteadiness when turning 180°."
            value={manualObservations.turningHesitancy}
            onChange={(val) => onManualObservationChange("turningHesitancy", val)}
          />
          <TriStateRow
            title="Joint crepitus or crackling reported"
            description="Audible or palpable grating sensation noted during movement."
            value={manualObservations.audibleCrepitusReported}
            onChange={(val) => onManualObservationChange("audibleCrepitusReported", val)}
          />
        </div>
      </div>
    </section>
  );
});

const ScreeningAside = memo(function ScreeningAside() {
  return (
    <aside className="form-aside">
      <div className="aside-help">
        <span className="aside-help-icon">
          <HelpCircle size={18} />
        </span>
        <h3>How to use this tool</h3>
        <p>
          Have a relaxed conversation. Read each question aloud if helpful, and let the person answer in their
          own words.
        </p>
        <div className="aside-divider" />
        <div className="aside-tip">
          <BadgeCheck size={16} />
          <span>They can pause or stop at any time. Respect their choice throughout.</span>
        </div>
      </div>
      <div className="aside-disclaimer">
        <Info size={16} />
        <p>
          <strong>A supportive guide, not a diagnosis.</strong> OA-Sathi does not replace a clinical examination
          or professional medical advice.
        </p>
      </div>
    </aside>
  );
});

const Choice = memo(function Choice({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className={`choice-card ${checked ? "selected" : ""}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onChange(value)} />
      <span className="choice-indicator">
        <span />
      </span>
      <span>{children}</span>
    </label>
  );
});

const TriStateRow = memo(function TriStateRow({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: TriStateAnswer;
  onChange: (value: TriStateAnswer) => void;
}) {
  const isChecked = value === true;
  const isNotChecked = value === NOT_CHECKED;
  const isFalse = value === false;
  return (
    <div className="toggle-row tri-state-row">
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <div className="tri-state-controls" role="group" aria-label={`${title} answer`}>
        <button
          type="button"
          className={`tri-state-button ${isNotChecked ? "selected" : ""}`}
          onClick={() => onChange(NOT_CHECKED)}
          aria-pressed={isNotChecked}
        >
          Not checked
        </button>
        <button
          type="button"
          className={`tri-state-button ${isChecked ? "selected" : ""}`}
          onClick={() => onChange(true)}
          aria-pressed={isChecked}
        >
          Yes
        </button>
        <button
          type="button"
          className={`tri-state-button ${isFalse ? "selected" : ""}`}
          onClick={() => onChange(false)}
          aria-pressed={isFalse}
        >
          No
        </button>
      </div>
    </div>
  );
});

const SafetyQuestionRow = memo(function SafetyQuestionRow({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: TriStateAnswer | undefined;
  onChange: (value: TriStateAnswer) => void;
}) {
  const isChecked = value === true;
  const isFalse = value === false;
  const isNotChecked = value === NOT_CHECKED;
  const isPreferNot = value === PREFER_NOT_TO_ANSWER;

  return (
    <div className={`safety-question-item ${isChecked ? "flagged" : ""}`}>
      <div className="safety-question-text">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div className="safety-btn-group" role="group" aria-label={`${title} answer`}>
        <button
          type="button"
          className={`safety-btn ${isNotChecked ? "selected" : ""}`}
          onClick={() => onChange(NOT_CHECKED)}
          aria-pressed={isNotChecked}
        >
          Not checked
        </button>
        <button
          type="button"
          className={`safety-btn ${isFalse ? "selected safe" : ""}`}
          onClick={() => onChange(false)}
          aria-pressed={isFalse}
        >
          No
        </button>
        <button
          type="button"
          className={`safety-btn ${isChecked ? "selected alert" : ""}`}
          onClick={() => onChange(true)}
          aria-pressed={isChecked}
        >
          Yes
        </button>
        <button
          type="button"
          className={`safety-btn ${isPreferNot ? "selected" : ""}`}
          onClick={() => onChange(PREFER_NOT_TO_ANSWER)}
          aria-pressed={isPreferNot}
          title="Participant prefers not to answer"
        >
          Prefer not to say
        </button>
      </div>
    </div>
  );
});

const ResultSummary = memo(function ResultSummary({
  result,
  onExport,
  onStartNew,
  onEdit,
  onViewReport,
  onShareConsent,
  onWithdrawConsent,
  onRequestConsultation,
}: {
  result: Screening;
  onExport: () => void;
  onStartNew: () => void;
  onEdit: () => void;
  onViewReport: (record: Screening) => void;
  onShareConsent: (record: Screening) => void;
  onWithdrawConsent: (record: Screening) => void;
  onRequestConsultation: (record: Screening, notes?: string) => void;
}) {
  const isPreliminary = Array.isArray(result.unassessedFactors) && result.unassessedFactors.length >= 3;
  const aiMeta = getAIModelMetadata();
  const [isActionPending, setIsActionPending] = useState(false);

  const handleShareClick = () => {
    if (isActionPending) return;
    setIsActionPending(true);
    onShareConsent(result);
    setTimeout(() => setIsActionPending(false), 500);
  };

  const handleWithdrawClick = () => {
    if (isActionPending) return;
    setIsActionPending(true);
    onWithdrawConsent(result);
    setTimeout(() => setIsActionPending(false), 500);
  };

  const handleConsultClick = () => {
    if (isActionPending) return;
    setIsActionPending(true);
    onRequestConsultation(result);
    setTimeout(() => setIsActionPending(false), 500);
  };

  return (
    <div className="result-layout">
      <div className="result-main">
        {result.urgentCareNotice?.hasRedFlags && (
          <div
            className="urgent-care-top-alert"
            role="alert"
            style={{
              background: "#fef2f2",
              border: "2px solid #ef4444",
              borderRadius: "10px",
              padding: "14px 16px",
              marginBottom: "16px",
              color: "#991b1b",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "11px", marginBottom: "4px" }}>
              <AlertTriangle size={18} color="#dc2626" />
              <span>URGENT CLINICAL EVALUATION ADVISED</span>
            </div>
            <p style={{ margin: "0 0 6px", fontSize: "9px", lineHeight: "1.45", color: "#7f1d1d" }}>
              <strong>Important:</strong> Potential acute red-flag symptoms were reported. Routine wear markers and preliminary scores below do NOT supersede or diminish acute medical concerns.
            </p>
            <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "8.5px", lineHeight: "1.4" }}>
              {result.urgentCareNotice.flags.map((flag) => (
                <li key={flag} style={{ marginBottom: "2px" }}>{flag}</li>
              ))}
            </ul>
            <div style={{ marginTop: "8px", fontSize: "8.5px", fontWeight: 600, color: "#991b1b" }}>
              {result.urgentCareNotice.guidance}
            </div>
          </div>
        )}

        <section className="result-card">
          <div
            className={`result-banner ${
              result.band === "More markers"
                ? "banner-high"
                : result.band === "Some markers"
                  ? "banner-medium"
                  : "banner-low"
            }`}
          >
            <div className="result-status-icon">
              {result.band === "More markers" ? (
                <ArrowUpRight size={23} />
              ) : result.band === "Some markers" ? (
                <Activity size={23} />
              ) : (
                <CheckCircle2 size={23} />
              )}
            </div>
            <div>
              <span className="eyebrow">SCREENING SUMMARY · {result.id}</span>
              <h2>{result.band} to discuss</h2>
              <p>This is a screening conversation, not a diagnosis.</p>
            </div>
            <div className="result-score">
              <strong>{result.score}</strong>
              <span>demo score</span>
            </div>
          </div>
          <div className="result-profile">
            <div>
              <span>PERSON / REF</span>
              <strong>{result.name}</strong>
            </div>
            <div>
              <span>JOINT</span>
              <strong>{result.joint}</strong>
            </div>
            <div>
              <span>DISTRICT</span>
              <strong>{result.district}</strong>
            </div>
            <div>
              <span>AGE</span>
              <strong>{result.age} years</strong>
            </div>
          </div>
        </section>

        <section className="result-card explanation-card">
          <div className="result-section-title">
            <span className="result-ai-icon">
              <Sparkles size={16} />
            </span>
            <div>
              <span className="eyebrow">EXPLAINABLE DEMO SUMMARY</span>
              <h3>What shaped this result</h3>
            </div>
          </div>
          <div className="ai-boundary-note">
            <Sparkles size={15} />
            <span>
              <strong>AI Model Status: {aiMeta.statusLabel}</strong> · {aiMeta.statusDescription} {aiMeta.privacyNotice}
            </span>
          </div>
          <p className="explanation-intro">
            This prototype uses a transparent, rules-based demo score; no AI model or clinically validated prediction is
            running.{isPreliminary ? " Note: This preliminary summary is based on partial assessment; unassessed items are not evidence of absent risk." : ""} These are the answers included in the summary:
          </p>
          <ul className="factor-list">
            {result.markers.map((marker, index) => (
              <li key={marker}>
                <span>{index + 1}</span>
                {marker}
              </li>
            ))}
          </ul>
          {result.urgentCareNotice?.hasRedFlags && (
            <div className="urgent-care-card" role="alert">
              <div className="urgent-care-header">
                <AlertTriangle size={16} />
                <strong>Urgent clinical advisory notice</strong>
              </div>
              <p>{result.urgentCareNotice.guidance}</p>
              <ul className="urgent-flags-list">
                {result.urgentCareNotice.flags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="next-step">
            <div className="next-step-icon">
              <MessageCircle size={17} />
            </div>
            <div>
              <strong>A helpful next step</strong>
              <p>
                Encourage the person to speak with a qualified health professional, especially if pain persists,
                worsens, or affects daily life.
              </p>
            </div>
          </div>
        </section>

        {(result.gaitAssessment || result.manualGaitObservations) && (
          <section className="result-card explanation-card" style={{ marginTop: "12px" }}>
            <div className="result-section-title">
              <span className="result-ai-icon">
                <Activity size={16} />
              </span>
              <div>
                <span className="eyebrow">MOVEMENT ASSESSMENT · EXPLORATORY</span>
                <h3>Observed Movement & Gait Markers</h3>
              </div>
            </div>
            <p className="explanation-intro">
              Movement and gait observations describe physical mobility and functional kinematics.
              They are kept strictly separate from the symptom risk summary and do not constitute an OA diagnosis.
            </p>

            {result.gaitAssessment && result.gaitAssessment.status === "completed" && (
              <>
                <div className="gait-features-grid">
                  <div className="gait-feature-tile">
                    <span className="feature-label">Step Cadence</span>
                    <div>
                      <span className="feature-val">
                        {result.gaitAssessment.features.cadence?.value !== null && result.gaitAssessment.features.cadence?.isValid
                          ? result.gaitAssessment.features.cadence.value
                          : "Unavailable"}
                      </span>
                      <span className="feature-unit">
                        {result.gaitAssessment.features.cadence?.isValid ? "steps/min" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="gait-feature-tile">
                    <span className="feature-label">Bilateral Symmetry</span>
                    <div>
                      <span className="feature-val">
                        {result.gaitAssessment.features.stepSymmetry?.value !== null && result.gaitAssessment.features.stepSymmetry?.isValid
                          ? result.gaitAssessment.features.stepSymmetry.value
                          : "Unavailable"}
                      </span>
                      <span className="feature-unit">
                        {result.gaitAssessment.features.stepSymmetry?.isValid ? "index" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="gait-feature-tile">
                    <span className="feature-label">Knee Flexion ROM</span>
                    <div>
                      <span className="feature-val">
                        {result.gaitAssessment.features.activeKneeFlexionRange?.value !== null && result.gaitAssessment.features.activeKneeFlexionRange?.isValid
                          ? `${result.gaitAssessment.features.activeKneeFlexionRange.value}°`
                          : "Unavailable"}
                      </span>
                    </div>
                  </div>
                  <div className="gait-feature-tile">
                    <span className="feature-label">Coronal Trunk Sway</span>
                    <div>
                      <span className="feature-val">
                        {result.gaitAssessment.features.coronalTrunkSway?.value !== null && result.gaitAssessment.features.coronalTrunkSway?.isValid
                          ? `${result.gaitAssessment.features.coronalTrunkSway.value}°`
                          : "Unavailable"}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: "7.5px", color: "#547067", margin: "6px 0" }}>
                  Tracking Quality: <strong>{result.gaitAssessment.inputQualityStatus}</strong> · Usable frames:{" "}
                  {result.gaitAssessment.usableFramesCount}/{result.gaitAssessment.framesAnalyzed} · Method: {result.gaitAssessment.analysisMethod}
                </div>
              </>
            )}

            {result.manualGaitObservations && (
              <ul className="factor-list" style={{ marginTop: "10px" }}>
                <li>
                  <span>Obs</span>
                  Visible Limp / Offloading:{" "}
                  {result.manualGaitObservations.visibleLimp === true
                    ? "Reported present"
                    : result.manualGaitObservations.visibleLimp === false
                      ? "Not observed"
                      : "Not checked / unassessed"}
                </li>
                <li>
                  <span>Obs</span>
                  Chair-Rise Hesitancy:{" "}
                  {result.manualGaitObservations.hesitantSitToStand === true
                    ? "Reported present"
                    : result.manualGaitObservations.hesitantSitToStand === false
                      ? "Not observed"
                      : "Not checked / unassessed"}
                </li>
                <li>
                  <span>Obs</span>
                  Turning Hesitancy:{" "}
                  {result.manualGaitObservations.turningHesitancy === true
                    ? "Reported present"
                    : result.manualGaitObservations.turningHesitancy === false
                      ? "Not observed"
                      : "Not checked / unassessed"}
                </li>
                <li>
                  <span>Obs</span>
                  Joint Crepitus:{" "}
                  {result.manualGaitObservations.audibleCrepitusReported === true
                    ? "Reported present"
                    : result.manualGaitObservations.audibleCrepitusReported === false
                      ? "Not observed"
                      : "Not checked / unassessed"}
                </li>
              </ul>
            )}

            <div className="gait-disclaimer-note" style={{ marginTop: "10px" }}>
              Exploratory movement features for clinician discussion only. Not clinically validated for osteoarthritis diagnosis, grading, or treatment decisions.
            </div>
          </section>
        )}

        {/* Patient Care Navigation & Doctor Sharing Card */}
        <section className="care-navigation-card">
          <div className="care-card-header">
            <span className="care-card-icon">
              <Stethoscope size={18} />
            </span>
            <div>
              <h3>Patient Care Navigation & Clinical Sharing</h3>
              <p>Manage explicit sharing consent, request doctor consultation, and review clinical feedback.</p>
            </div>
          </div>

          <div className="care-workflow-grid">
            {/* Step 1: Sharing Consent */}
            <div className="care-step-tile">
              <div>
                <div className="care-step-title">
                  <strong>1. Clinical Sharing Consent</strong>
                  {result.sharingStatus === "shared" ? (
                    <span className="care-badge shared">
                      <Share2 size={9} /> Shared
                    </span>
                  ) : result.sharingStatus === "withdrawn" ? (
                    <span className="care-badge withdrawn">Withdrawn</span>
                  ) : (
                    <span className="care-badge not-shared">Private</span>
                  )}
                </div>
                <p>
                  {result.sharingStatus === "shared"
                    ? `Consent granted on ${new Date(result.sharingConsentGivenAt || result.timestamp).toLocaleDateString()}. Clinicians in the Doctor Demo Portal are authorized to review this submission.`
                    : result.sharingStatus === "withdrawn"
                      ? "Sharing consent was withdrawn. Authorized doctors can no longer access this assessment."
                      : "Private to your session. Grant explicit consent to allow review by a medical officer in the Doctor Demo Portal."}
                </p>
              </div>
              <div>
                {result.sharingStatus === "shared" ? (
                  <button
                    type="button"
                    className="button button-secondary"
                    style={{ fontSize: "8px", width: "100%" }}
                    onClick={handleWithdrawClick}
                    disabled={isActionPending}
                  >
                    <Lock size={13} /> Withdraw Sharing Consent
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button button-primary"
                    style={{ fontSize: "8px", width: "100%" }}
                    onClick={handleShareClick}
                    disabled={isActionPending}
                  >
                    <Share2 size={13} /> Consent &amp; Share with Doctor
                  </button>
                )}
              </div>
            </div>

            {/* Step 2: Consultation Request */}
            <div className="care-step-tile">
              <div>
                <div className="care-step-title">
                  <strong>2. Doctor Consultation</strong>
                  {result.consultationStatus === "requested" ? (
                    <span className="care-badge requested">Requested</span>
                  ) : result.consultationStatus === "appointment-confirmed" ? (
                    <span className="care-badge confirmed">Scheduled</span>
                  ) : result.consultationStatus === "completed" ? (
                    <span className="care-badge reviewed">Completed</span>
                  ) : (
                    <span className="care-badge not-shared">Not requested</span>
                  )}
                </div>
                <p>
                  {result.consultationStatus === "appointment-confirmed"
                    ? `Appointment confirmed: ${result.doctorAppointmentDetails || "Details pending at clinic"}`
                    : result.consultationStatus === "requested"
                      ? `Consultation requested on ${new Date(result.consultationRequestedAt || result.timestamp).toLocaleDateString()}. Pending clinical triage.`
                      : "Ask a doctor to review your joint symptoms and recommend a personalized care plan."}
                </p>
              </div>
              <div>
                {result.consultationStatus === "not-requested" || !result.consultationStatus ? (
                  <button
                    type="button"
                    className="button button-secondary"
                    style={{ fontSize: "8px", width: "100%" }}
                    onClick={handleConsultClick}
                    disabled={isActionPending}
                  >
                    <Send size={13} /> Request Consultation
                  </button>
                ) : (
                  <div style={{ fontSize: "7.5px", color: "#4f6e64", fontStyle: "italic" }}>
                    Status: {result.consultationStatus}
                  </div>
                )}
              </div>
            </div>

            {/* Step 3: Clinical Review Status & Patient Feedback */}
            <div className="care-step-tile">
              <div>
                <div className="care-step-title">
                  <strong>3. Doctor Review &amp; Guidance</strong>
                  {result.doctorReviewStatus === "reviewed" ? (
                    <span className="care-badge reviewed">
                      <BadgeCheck size={9} /> Reviewed
                    </span>
                  ) : (
                    <span className="care-badge pending">Awaiting Review</span>
                  )}
                </div>
                {result.doctorReviewStatus === "reviewed" ? (
                  <div className="doctor-feedback-display">
                    <strong>
                      <Stethoscope size={13} style={{ verticalAlign: "middle", marginRight: "3px" }} />
                      {result.doctorReviewerName || "Reviewing Doctor"}
                    </strong>
                    <p>{result.doctorPatientFeedback || "Clinical review recorded without additional comments."}</p>
                    {result.doctorFollowUpRecommendation && (
                      <div style={{ marginTop: "6px", fontSize: "7.5px", color: "#147f73", fontWeight: 700 }}>
                        Recommendation: {result.doctorFollowUpRecommendation}
                      </div>
                    )}
                    <span className="doctor-feedback-meta">
                      Reviewed: {new Date(result.doctorReviewedAt || result.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                ) : (
                  <p>
                    No doctor review recorded yet. When a doctor completes their review in the Doctor Demo Portal, their clinical recommendations will appear here.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="result-actions">
          <button className="button button-primary" onClick={() => onViewReport(result)} title="Open printable medical screening report">
            <Printer size={16} /> View &amp; Print Medical Report (PDF)
          </button>
          <button className="button button-secondary" onClick={onExport}>
            <Download size={16} /> Download summary
          </button>
          <button className="button button-secondary" onClick={onEdit} title="Edit these screening responses">
            <FileEdit size={16} /> Edit record
          </button>
          <button className="button button-primary" onClick={onStartNew}>
            <Plus size={17} /> Start another screening
          </button>
        </div>
      </div>

      <ResultAside />
    </div>
  );
});

const ResultAside = memo(function ResultAside() {
  return (
    <aside className="result-aside">
      <div className="aside-help">
        <span className="aside-help-icon">
          <ShieldCheck size={18} />
        </span>
        <h3>Keep it supportive</h3>
        <p>
          Share this summary as a conversation starter. Only a qualified health professional can assess or diagnose
          osteoarthritis.
        </p>
        <div className="aside-divider" />
        <div className="aside-tip">
          <HeartPulse size={16} />
          <span>Offer practical help to connect with a local health worker or clinic.</span>
        </div>
      </div>
      <div className="aside-disclaimer">
        <Info size={16} />
        <p>
          <strong>Demo limitation.</strong> This illustrative heuristic score has not been clinically validated and
          must not be used for diagnosis, treatment, or triage.
        </p>
      </div>
    </aside>
  );
});

const RecordsPage = memo(function RecordsPage({
  screenings,
  onNew,
  onOpen,
  onViewReport,
  onExportCsv,
  onClearDemo,
  onRestoreDemo,
}: {
  screenings: Screening[];
  onNew: () => void;
  onOpen: (item: Screening) => void;
  onViewReport: (record: Screening) => void;
  onExportCsv: () => void;
  onClearDemo: () => void;
  onRestoreDemo: () => void;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const filteredScreenings = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) return screenings;
    return screenings.filter((item) => {
      const rec = item as Screening & { _searchKey?: string };
      if (!rec._searchKey) {
        rec._searchKey = `${item.id} ${item.name} ${item.district} ${item.joint} ${item.band}`.toLowerCase();
      }
      return rec._searchKey.includes(query);
    });
  }, [screenings, deferredSearch]);

  const total = screenings.length;
  const hasDemoRecords = screenings.some((s) => s.isDemo);

  return (
    <div className="page-content">
      <div className="page-title-row">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" /> PRIVATE TO THIS SESSION
          </div>
          <h1>Screening records</h1>
          <p className="page-subtitle">A simple record of this browser session's screening conversations.</p>
        </div>
        <div style={{ display: "flex", gap: "9px" }}>
          {hasDemoRecords ? (
            <button
              className="button button-secondary"
              onClick={onClearDemo}
              title="Remove synthetic demo records"
            >
              <Trash2 size={15} /> Clear demo data
            </button>
          ) : (
            <button
              className="button button-secondary"
              onClick={onRestoreDemo}
              title="Restore demo records for presentation"
            >
              <RotateCcw size={15} /> Restore demo data
            </button>
          )}
          <button className="button button-secondary" onClick={onExportCsv} title="Export all records as CSV">
            <Download size={15} /> Export CSV
          </button>
          <button className="button button-primary" onClick={onNew}>
            <Plus size={17} /> New screening
          </button>
        </div>
      </div>

      <div className="records-toolbar">
        <div className="records-count">
          <span className="records-count-icon">
            <ClipboardCheck size={17} />
          </span>
          <span>
            <strong>{total} screenings</strong>
            <small>Stored in this session only</small>
          </span>
        </div>
        <label className="records-search">
          <Search size={16} />
          <input
            aria-label="Search screening records"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, district, joint..."
          />
        </label>
      </div>

      {filteredScreenings.length ? (
        <ScreeningTable screenings={filteredScreenings} onOpen={onOpen} onViewReport={onViewReport} />
      ) : (
        <div className="empty-state records-empty">
          <div className="empty-icon">
            <Search size={21} />
          </div>
          <strong>No matching screenings</strong>
          <p>Try a different search, or start a new screening.</p>
          <button className="button button-secondary" onClick={onNew}>
            <Plus size={16} /> Start a screening
          </button>
        </div>
      )}

      <div className="privacy-note">
        <ShieldCheck size={17} />
        <span>
          <strong>Your privacy matters.</strong> Screening details are held in memory for this browser session only.
          Reloading or closing this page clears demo data.
        </span>
      </div>
      <Disclaimer />
    </div>
  );
});

const SettingsPage = memo(function SettingsPage({
  settings,
  onUpdateSetting,
  onResetSettings,
  screenings,
  onClearDemoScreenings,
  onRestoreDemoScreenings,
  onExportCsv,
}: {
  settings: AppSettings;
  onUpdateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onResetSettings: () => void;
  screenings: Screening[];
  onClearDemoScreenings: () => void;
  onRestoreDemoScreenings: () => void;
  onExportCsv: () => void;
}) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const demoCount = screenings.filter((s) => s.isDemo).length;
  const participantCount = screenings.filter((s) => !s.isDemo).length;

  return (
    <div className="page-content">
      <div className="page-title-row">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" /> CLIENT WORKSPACE PREFERENCES
          </div>
          <h1>Application Settings</h1>
          <p className="page-subtitle">Configure local screening defaults, pose estimation visualization, and session records.</p>
        </div>
      </div>

      <div className="settings-container">
        {/* Regional Phrasing Card */}
        <section className="settings-card">
          <div className="settings-card-header">
            <span className="settings-card-icon">
              <Languages size={18} />
            </span>
            <div>
              <h2>Regional Language & Phrasing</h2>
              <p>Tailors questionnaire wording to localized clinical phrasing across the North Eastern Region.</p>
            </div>
          </div>
          <div className="settings-field-group">
            <div className="settings-field-row">
              <div className="settings-field-info">
                <h3>Preferred Language Phrasing</h3>
                <p>Default dialect used for question titles and options in new screenings.</p>
              </div>
              <select
                className="settings-select"
                aria-label="Preferred Language Phrasing"
                value={settings.preferredLanguage}
                onChange={(e) => onUpdateSetting("preferredLanguage", e.target.value as NERLanguageCode)}
              >
                {SUPPORTED_REGIONAL_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name} ({lang.nativeName})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Pose Estimation Card */}
        <section className="settings-card">
          <div className="settings-card-header">
            <span className="settings-card-icon">
              <Activity size={18} />
            </span>
            <div>
              <h2>Movement Assessment & Pose Tracking</h2>
              <p>Configure client-side computer-vision behavior during camera screening.</p>
            </div>
          </div>
          <div className="settings-field-group">
            <div className="settings-field-row">
              <div className="settings-field-info">
                <h3>Real-Time Pose Skeleton Overlay</h3>
                <p>Superimposes 33-landmark skeleton connectors and lower-extremity tracking dots on camera feed.</p>
              </div>
              <button
                type="button"
                className={`settings-toggle-btn ${settings.enablePoseOverlay ? "active" : ""}`}
                onClick={() => onUpdateSetting("enablePoseOverlay", !settings.enablePoseOverlay)}
              >
                {settings.enablePoseOverlay ? <Check size={14} /> : <X size={14} />}
                {settings.enablePoseOverlay ? "Overlay Enabled" : "Overlay Disabled"}
              </button>
            </div>

            <div className="settings-field-row">
              <div className="settings-field-info">
                <h3>Auto-Release Camera Stream</h3>
                <p>Automatically turn off camera hardware when saving a screening or navigating between pages.</p>
              </div>
              <button
                type="button"
                className={`settings-toggle-btn ${settings.autoStopCameraOnSave ? "active" : ""}`}
                onClick={() => onUpdateSetting("autoStopCameraOnSave", !settings.autoStopCameraOnSave)}
              >
                {settings.autoStopCameraOnSave ? <Check size={14} /> : <X size={14} />}
                {settings.autoStopCameraOnSave ? "Auto-Stop Active" : "Manual Only"}
              </button>
            </div>
          </div>
        </section>

        {/* Community Field Intake Card */}
        <section className="settings-card">
          <div className="settings-card-header">
            <span className="settings-card-icon">
              <Sliders size={18} />
            </span>
            <div>
              <h2>Community Field Intake</h2>
              <p>Default regional parameters to streamline health worker assessments.</p>
            </div>
          </div>
          <div className="settings-field-group">
            <div className="settings-field-row">
              <div className="settings-field-info">
                <h3>Default District</h3>
                <p>Pre-populates the district selector when opening a new screening.</p>
              </div>
              <select
                className="settings-select"
                aria-label="Default District"
                value={settings.defaultDistrict}
                onChange={(e) => onUpdateSetting("defaultDistrict", e.target.value)}
              >
                <option value="">None (Select each time)</option>
                {districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Accessibility & Visual Theme Card */}
        <section className="settings-card">
          <div className="settings-card-header">
            <span className="settings-card-icon">
              <Eye size={18} />
            </span>
            <div>
              <h2>Accessibility & Visual Theme</h2>
              <p>Enhance legibility and contrast for community field workers in variable outdoor lighting conditions.</p>
            </div>
          </div>
          <div className="settings-field-group">
            <div className="settings-field-row">
              <div className="settings-field-info">
                <h3>High Contrast Mode</h3>
                <p>Increases element contrast, sharpens borders, and deepens background tones for outdoor sunlight visibility.</p>
              </div>
              <button
                type="button"
                className={`settings-toggle-btn ${settings.highContrastMode ? "active" : ""}`}
                onClick={() => onUpdateSetting("highContrastMode", !settings.highContrastMode)}
                aria-pressed={settings.highContrastMode}
              >
                {settings.highContrastMode ? <Check size={14} /> : <X size={14} />}
                {settings.highContrastMode ? "High Contrast Active" : "Standard Contrast"}
              </button>
            </div>
          </div>
        </section>

        {/* Data Hygiene & Records Management Card */}
        <section className="settings-card">
          <div className="settings-card-header">
            <span className="settings-card-icon">
              <ShieldCheck size={18} />
            </span>
            <div>
              <h2>Session Records & Data Management</h2>
              <p>Audit and manage screening records stored in this browser session.</p>
            </div>
          </div>

          <div className="settings-stats-row">
            <div className="settings-stat-box">
              <span>Total Stored Records</span>
              <strong>{screenings.length}</strong>
            </div>
            <div className="settings-stat-box">
              <span>Synthetic Demo Records</span>
              <strong>{demoCount}</strong>
            </div>
            <div className="settings-stat-box">
              <span>Participant Records</span>
              <strong>{participantCount}</strong>
            </div>
          </div>

          <div className="settings-actions-row">
            <button
              type="button"
              className="button button-secondary"
              onClick={onExportCsv}
              disabled={screenings.length === 0}
            >
              <Download size={14} /> Export CSV ({screenings.length})
            </button>

            {demoCount > 0 ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setShowClearConfirm(true)}
              >
                <Trash2 size={14} /> Clear Demo Data ({demoCount})
              </button>
            ) : (
              <button
                type="button"
                className="button button-secondary"
                onClick={onRestoreDemoScreenings}
              >
                <RotateCcw size={14} /> Restore Demo Data
              </button>
            )}

            <button
              type="button"
              className="button button-secondary"
              onClick={() => setShowResetConfirm(true)}
            >
              Reset Settings
            </button>
          </div>

          {showClearConfirm && (
            <div className="confirm-box" role="alert">
              <p>
                <strong>Confirm clearing demo records:</strong> This will remove only the {demoCount} pre-loaded
                synthetic demonstration records. All {participantCount} participant records created during this
                session will be strictly preserved.
              </p>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    onClearDemoScreenings();
                    setShowClearConfirm(false);
                  }}
                >
                  Yes, Remove Demo Data
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowClearConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showResetConfirm && (
            <div className="confirm-box" role="alert">
              <p>
                <strong>Reset all application settings?</strong> Preferences will return to default values. Stored
                screening records will NOT be deleted.
              </p>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    onResetSettings();
                    setShowResetConfirm(false);
                  }}
                >
                  Confirm Reset
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowResetConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Privacy Card */}
        <section className="settings-card" style={{ background: "#fbfdfc" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <span className="settings-card-icon" style={{ background: "#ebf6f1", color: "#147f73" }}>
              <ShieldCheck size={18} />
            </span>
            <div>
              <strong style={{ fontSize: "10px", color: "#253b34" }}>Local Demonstration Storage &amp; Privacy Notice</strong>
              <p style={{ margin: "4px 0 0", fontSize: "8.5px", color: "#6b867c", lineHeight: "1.5" }}>
                OA-Sathi processes all screening questionnaires, MediaPipe pose tracking, and movement
                metrics 100% locally on your device. No health records, participant names, camera video frames,
                or credentials are transmitted over external networks.
              </p>
              <p style={{ margin: "6px 0 0", fontSize: "8px", color: "#748f85", lineHeight: "1.45" }}>
                <strong>Storage Limitations:</strong> Records are saved in browser <code>localStorage</code> for demonstration convenience. 
                <code>localStorage</code> is NOT encrypted clinical storage and does NOT synchronize across devices, browsers, or different users. 
                For real-world clinical deployments, an enterprise-grade encrypted database with multi-tenant access controls (HIPAA/DISHA compliant) is required.
              </p>
            </div>
          </div>
        </section>
      </div>
      <Disclaimer />
    </div>
  );
});

const MedicalReportView = memo(function MedicalReportView({
  record,
  onBack,
  onEdit,
}: {
  record: Screening;
  onBack: () => void;
  onEdit?: () => void;
}) {
  const isReviewed = record.doctorReviewStatus === "reviewed";
  const hasUrgentFlags = Boolean(record.urgentCareNotice?.hasRedFlags);

  return (
    <div className="medical-report-view">
      {/* Top Action Toolbar (hidden on print) */}
      <div className="report-toolbar no-print">
        <button className="button button-secondary" onClick={onBack}>
          <ArrowLeft size={16} /> Back to records
        </button>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {onEdit && (
            <button className="button button-secondary" onClick={onEdit} title="Edit assessment answers">
              <FileEdit size={16} /> Edit Assessment
            </button>
          )}
          <button
            className="button button-primary"
            onClick={() => window.print()}
            title="Print or save as PDF using browser print"
          >
            <Printer size={16} /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* Printable Sheet */}
      <div className="medical-report-sheet">
        {/* Header Banner */}
        <div className="report-header-banner">
          <div>
            <div className="report-org-title">OA-SATHI</div>
            <div className="report-doc-title">Community Joint Health Screening &amp; Navigation Report</div>
          </div>
          <div className="report-meta-box">
            <div>
              <strong>Report ID:</strong> {record.id}
            </div>
            <div>
              <strong>Screened:</strong> {record.date}
            </div>
            <div>
              <strong>Generated:</strong> {new Date().toLocaleDateString()}
            </div>
            <div>
              <strong>District:</strong> {record.district}
            </div>
          </div>
        </div>

        {/* Clinical Review Status Banner */}
        <div className="report-disclaimer-box">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
            <strong style={{ fontSize: "9px" }}>CLINICAL REVIEW STATUS</strong>
            {isReviewed ? (
              <span className="report-reviewed-flag">
                <BadgeCheck size={11} style={{ verticalAlign: "middle", marginRight: "3px" }} />
                REVIEWED BY MEDICAL OFFICER
              </span>
            ) : (
              <span className="report-unreviewed-flag">
                <AlertTriangle size={11} style={{ verticalAlign: "middle", marginRight: "3px" }} />
                NOT REVIEWED BY A DOCTOR
              </span>
            )}
          </div>
          <p style={{ margin: 0 }}>
            {isReviewed
              ? `Reviewed by ${record.doctorReviewerName || "Attending Medical Officer"} on ${new Date(record.doctorReviewedAt || record.timestamp).toLocaleDateString()}. Clinician notes and follow-up guidance are detailed in Section 7 below.`
              : "This report contains preliminary screening heuristics recorded during a community intake session. It is NOT a clinical diagnosis and has not been reviewed by a physician. Clinical evaluation at a Primary Health Centre (PHC) is recommended."}
          </p>
        </div>

        {/* Urgent Care Advisory Notice (if red flags present) */}
        {hasUrgentFlags && (
          <div
            style={{
              background: "#fef2f2",
              border: "1.5px solid #ef4444",
              borderRadius: "8px",
              padding: "12px 14px",
              marginBottom: "18px",
              color: "#991b1b",
            }}
            role="alert"
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, fontSize: "9.5px" }}>
              <AlertTriangle size={16} />
              <span>URGENT MEDICAL ADVISORY NOTICE — IMMEDIATE ATTENTION RECOMMENDED</span>
            </div>
            <p style={{ margin: "4px 0 6px", fontSize: "8.5px", lineHeight: "1.45" }}>
              {record.urgentCareNotice?.guidance}
            </p>
            <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "8px" }}>
              {record.urgentCareNotice?.flags.map((flag) => (
                <li key={flag} style={{ marginBottom: "2px" }}>{flag}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Section 1: Demographics & Target Joint */}
        <div className="report-section-block">
          <div className="report-section-header">1. Participant &amp; Intake Demographics</div>
          <div className="report-section-body">
            <div className="report-grid-two">
              <div className="report-data-pair">
                <span>Participant / Reference</span>
                <strong>{record.name}</strong>
              </div>
              <div className="report-data-pair">
                <span>Age</span>
                <strong>{record.age} years</strong>
              </div>
              <div className="report-data-pair">
                <span>Joint Evaluated</span>
                <strong>{record.joint}</strong>
              </div>
              <div className="report-data-pair">
                <span>Administrative District</span>
                <strong>{record.district}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Patient-Reported Symptoms & History */}
        <div className="report-section-block">
          <div className="report-section-header">2. Patient-Reported Symptoms &amp; Everyday Impact</div>
          <div className="report-section-body">
            <div className="report-grid-two">
              <div className="report-data-pair">
                <span>Symptom Duration</span>
                <strong>
                  {record.formAnswers?.painDuration
                    ? DURATION_LABELS[record.formAnswers.painDuration] || record.formAnswers.painDuration
                    : "Intake completed"}
                </strong>
              </div>
              <div className="report-data-pair">
                <span>Typical Discomfort Rating</span>
                <strong>
                  {record.formAnswers?.painLevel !== undefined
                    ? `${record.formAnswers.painLevel} / 10`
                    : "Intake completed"}
                </strong>
              </div>
              <div className="report-data-pair">
                <span>Morning / Resting Stiffness</span>
                <strong>
                  {record.formAnswers?.stiffness
                    ? STIFFNESS_LABELS[record.formAnswers.stiffness] || record.formAnswers.stiffness
                    : "Intake completed"}
                </strong>
              </div>
              <div className="report-data-pair">
                <span>Daily Activity Impairment</span>
                <strong>
                  {record.formAnswers?.mobility
                    ? MOBILITY_LABELS[record.formAnswers.mobility] || record.formAnswers.mobility
                    : "Intake completed"}
                </strong>
              </div>
              <div className="report-data-pair">
                <span>Previous Joint Injury</span>
                <strong>
                  {record.formAnswers?.previousInjury === true
                    ? "Yes — reported"
                    : record.formAnswers?.previousInjury === false
                      ? "No — not reported"
                      : "Not checked / unanswered"}
                </strong>
              </div>
              <div className="report-data-pair">
                <span>Family History of Joint Issues</span>
                <strong>
                  {record.formAnswers?.familyHistory === true
                    ? "Yes — reported"
                    : record.formAnswers?.familyHistory === false
                      ? "No — not reported"
                      : "Not checked / unanswered"}
                </strong>
              </div>
              <div className="report-data-pair">
                <span>Heavy Repetitive Strain</span>
                <strong>
                  {record.formAnswers?.repeatedLoad === true
                    ? "Yes — reported"
                    : record.formAnswers?.repeatedLoad === false
                      ? "No — not reported"
                      : "Not checked / unanswered"}
                </strong>
              </div>
              <div className="report-data-pair">
                <span>Assessment Completeness</span>
                <strong>
                  {record.assessedCount && record.totalQuestions
                    ? `${record.assessedCount} of ${record.totalQuestions} standard questions assessed`
                    : "Standard intake completed"}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Laboratory & Physical Measurements (Strictly Isolated) */}
        <div className="report-section-block">
          <div className="report-section-header">3. Measured Clinical &amp; Laboratory Values (Never Inferred)</div>
          <div className="report-section-body">
            <div className="report-grid-two">
              <div className="report-data-pair">
                <span>Height &amp; Weight</span>
                <strong>
                  {record.formAnswers?.heightCm ? `${record.formAnswers.heightCm} cm` : "Not provided"} /{" "}
                  {record.formAnswers?.weightKg ? `${record.formAnswers.weightKg} kg` : "Not provided"}
                </strong>
              </div>
              <div className="report-data-pair">
                <span>Calculated Body Mass Index (BMI)</span>
                <strong>
                  {record.bmi !== null && record.bmi !== undefined ? `${record.bmi} kg/m²` : "Not calculated"}
                </strong>
              </div>
              <div className="report-data-pair">
                <span>Measured Bone Mineral Density (BMD)</span>
                <strong>
                  {record.bmdTScore ? `T-Score: ${record.bmdTScore}` : "None recorded / not checked"}
                </strong>
              </div>
              <div className="report-data-pair">
                <span>BMD Skeletal Site &amp; Date</span>
                <strong>
                  {record.bmdSite || "Site not specified"}{record.bmdDate ? ` · ${record.bmdDate}` : ""}
                </strong>
              </div>
            </div>
            <div style={{ marginTop: "8px", fontSize: "7.5px", color: "#668379", fontStyle: "italic", borderTop: "1px dashed #dce8e2", paddingTop: "6px" }}>
              Clinical Isolation Standard: BMD data is recorded exclusively from prior external DXA/QUS laboratory reports. OA-Sathi NEVER estimates, infers, or predicts bone density from questionnaire responses, BMI, age, or camera movement.
            </div>
          </div>
        </div>

        {/* Section 4: Safety & Red-Flag Assessment */}
        <div className="report-section-block">
          <div className="report-section-header">4. Safety &amp; Red-Flag Assessment</div>
          <div className="report-section-body">
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "6px", fontSize: "8.5px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f4f2" }}>
                <span>Hot or red joint accompanied by fever or chills:</span>
                <strong>
                  {record.formAnswers?.hasHotRedJointFever === true ? (
                    <span style={{ color: "#b91c1c" }}>YES — REPORTED</span>
                  ) : record.formAnswers?.hasHotRedJointFever === false ? (
                    <span style={{ color: "#15803d" }}>NO</span>
                  ) : (
                    <span style={{ color: "#6b7280" }}>NOT CHECKED</span>
                  )}
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0f4f2" }}>
                <span>Sudden severe joint pain or rapid swelling:</span>
                <strong>
                  {record.formAnswers?.hasSuddenSeverePainSwelling === true ? (
                    <span style={{ color: "#b91c1c" }}>YES — REPORTED</span>
                  ) : record.formAnswers?.hasSuddenSeverePainSwelling === false ? (
                    <span style={{ color: "#15803d" }}>NO</span>
                  ) : (
                    <span style={{ color: "#6b7280" }}>NOT CHECKED</span>
                  )}
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span>Inability to bear weight after an injury or fall:</span>
                <strong>
                  {record.formAnswers?.hasInabilityToBearWeight === true ? (
                    <span style={{ color: "#b91c1c" }}>YES — REPORTED</span>
                  ) : record.formAnswers?.hasInabilityToBearWeight === false ? (
                    <span style={{ color: "#15803d" }}>NO</span>
                  ) : (
                    <span style={{ color: "#6b7280" }}>NOT CHECKED</span>
                  )}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Section 5: Heuristic Summary & Contributing Factors */}
        <div className="report-section-block">
          <div className="report-section-header">5. Rule-Based Heuristic Summary &amp; Factor Breakdown</div>
          <div className="report-section-body">
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "10px" }}>
              <div style={{ padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", textAlign: "center" }}>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#15803d" }}>{record.score} / 100</div>
                <div style={{ fontSize: "7px", color: "#166534", textTransform: "uppercase", fontWeight: 700 }}>Heuristic Score</div>
              </div>
              <div>
                <strong style={{ fontSize: "10.5px", color: "#1f3930" }}>Summary Band: {record.band}</strong>
                <p style={{ margin: "2px 0 0", fontSize: "8px", color: "#5d7870" }}>
                  Calculated from explicit intake responses using transparent rules. Not a clinical diagnosis or disease probability.
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "8px" }}>
              <div>
                <strong style={{ color: "#1e3930", display: "block", marginBottom: "4px" }}>
                  Reported Contributing Findings ({record.contributingFactors?.length || 0}):
                </strong>
                <ul style={{ margin: 0, paddingLeft: "16px", color: "#374151" }}>
                  {record.contributingFactors && record.contributingFactors.length > 0 ? (
                    record.contributingFactors.map((f) => <li key={f}>{f}</li>)
                  ) : (
                    <li>None reported</li>
                  )}
                </ul>
              </div>
              <div>
                <strong style={{ color: "#1e3930", display: "block", marginBottom: "4px" }}>
                  Unassessed or Omitted Items ({record.unassessedFactors?.length || 0}):
                </strong>
                <ul style={{ margin: 0, paddingLeft: "16px", color: "#6b7280" }}>
                  {record.unassessedFactors && record.unassessedFactors.length > 0 ? (
                    record.unassessedFactors.map((f) => <li key={f}>{f}</li>)
                  ) : (
                    <li>All standard questions were answered</li>
                  )}
                </ul>
                <div style={{ fontSize: "7px", color: "#8a9f98", marginTop: "4px" }}>
                  * Unassessed items are not counted as negative responses.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 6: Exploratory Movement Assessment (if present) */}
        {(record.gaitAssessment || record.manualGaitObservations) && (
          <div className="report-section-block">
            <div className="report-section-header">6. Exploratory Movement Assessment &amp; Gait Kinematics</div>
            <div className="report-section-body">
              {record.gaitAssessment && record.gaitAssessment.status === "completed" && (
                <div className="report-grid-two" style={{ marginBottom: "8px" }}>
                  <div className="report-data-pair">
                    <span>Step Cadence</span>
                    <strong>{record.gaitAssessment.features.cadence?.value ?? "Unavailable"} steps/min</strong>
                  </div>
                  <div className="report-data-pair">
                    <span>Bilateral Step Symmetry</span>
                    <strong>{record.gaitAssessment.features.stepSymmetry?.value ?? "Unavailable"} index</strong>
                  </div>
                  <div className="report-data-pair">
                    <span>Active Knee Flexion ROM</span>
                    <strong>{record.gaitAssessment.features.activeKneeFlexionRange?.value ?? "Unavailable"}°</strong>
                  </div>
                  <div className="report-data-pair">
                    <span>Coronal Trunk Sway</span>
                    <strong>{record.gaitAssessment.features.coronalTrunkSway?.value ?? "Unavailable"}°</strong>
                  </div>
                </div>
              )}
              {record.manualGaitObservations && (
                <div className="report-grid-two">
                  <div className="report-data-pair">
                    <span>Visible Limp / Offloading</span>
                    <strong>
                      {record.manualGaitObservations.visibleLimp === true
                        ? "Present"
                        : record.manualGaitObservations.visibleLimp === false
                          ? "Not observed"
                          : "Not checked"}
                    </strong>
                  </div>
                  <div className="report-data-pair">
                    <span>Chair-Rise Hesitancy</span>
                    <strong>
                      {record.manualGaitObservations.hesitantSitToStand === true
                        ? "Present"
                        : record.manualGaitObservations.hesitantSitToStand === false
                          ? "Not observed"
                          : "Not checked"}
                    </strong>
                  </div>
                </div>
              )}
              <div style={{ fontSize: "7.5px", color: "#668379", fontStyle: "italic", marginTop: "6px" }}>
                Movement features are exploratory computer vision outputs for clinician discussion only. They do not constitute an osteoarthritis diagnosis or severity grading.
              </div>
            </div>
          </div>
        )}

        {/* Section 7: Doctor Review & Recommendations */}
        <div className="report-section-block">
          <div className="report-section-header">7. Clinician Review &amp; Follow-Up Recommendation</div>
          <div className="report-section-body">
            {isReviewed ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                  <div>
                    <strong style={{ fontSize: "10px", color: "#1c352d" }}>
                      <Stethoscope size={13} style={{ verticalAlign: "middle", marginRight: "4px" }} />
                      {record.doctorReviewerName || "Reviewing Medical Officer"}
                    </strong>
                    <div style={{ fontSize: "7.5px", color: "#718981" }}>
                      Reviewed on {new Date(record.doctorReviewedAt || record.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                  <span className="report-reviewed-flag">Clinically Reviewed</span>
                </div>

                <div style={{ marginBottom: "10px" }}>
                  <span style={{ display: "block", fontSize: "7.5px", color: "#749086", textTransform: "uppercase", fontWeight: 700 }}>
                    Doctor's Advice to Patient:
                  </span>
                  <p style={{ margin: "3px 0 0", fontSize: "9px", color: "#1c332a", lineHeight: "1.5" }}>
                    {record.doctorPatientFeedback || "Clinical review recorded without additional comments."}
                  </p>
                </div>

                {record.doctorFollowUpRecommendation && (
                  <div style={{ marginBottom: "8px" }}>
                    <span style={{ display: "block", fontSize: "7.5px", color: "#749086", textTransform: "uppercase", fontWeight: 700 }}>
                      Recommended Next Step:
                    </span>
                    <strong style={{ fontSize: "9.5px", color: "#147f73" }}>
                      {record.doctorFollowUpRecommendation}
                    </strong>
                  </div>
                )}

                {record.doctorAppointmentDetails && (
                  <div>
                    <span style={{ display: "block", fontSize: "7.5px", color: "#749086", textTransform: "uppercase", fontWeight: 700 }}>
                      Consultation / Clinic Appointment:
                    </span>
                    <strong style={{ fontSize: "9.5px", color: "#2563eb" }}>
                      {record.doctorAppointmentDetails}
                    </strong>
                  </div>
                )}

                <div style={{ fontSize: "7px", color: "#8a9e97", marginTop: "10px", fontStyle: "italic" }}>
                  * Confidential clinician observations are kept internal to the Doctor Portal and are withheld from this patient report.
                </div>
              </div>
            ) : (
              <div style={{ padding: "8px 0", color: "#6b7280", fontStyle: "italic", fontSize: "8.5px" }}>
                No clinician review has been recorded yet for this assessment. Once a medical officer in the Doctor Demo Portal completes their review, their verified recommendations and advice will appear here.
              </div>
            )}
          </div>
        </div>

        {/* Section 8: Patient Sharing & Workflow Audit */}
        <div className="report-section-block">
          <div className="report-section-header">8. Sharing Consent &amp; Consultation Audit</div>
          <div className="report-section-body">
            <div className="report-grid-two">
              <div className="report-data-pair">
                <span>Sharing Consent</span>
                <strong>
                  {record.sharingStatus === "shared"
                    ? `Shared with consent (${new Date(record.sharingConsentGivenAt || record.timestamp).toLocaleDateString()})`
                    : record.sharingStatus === "withdrawn"
                      ? "Sharing consent withdrawn"
                      : "Private — not shared"}
                </strong>
              </div>
              <div className="report-data-pair">
                <span>Consultation Status</span>
                <strong>
                  {record.consultationStatus === "appointment-confirmed"
                    ? "Appointment scheduled"
                    : record.consultationStatus === "requested"
                      ? "Consultation requested"
                      : record.consultationStatus === "completed"
                        ? "Completed"
                        : "Not requested"}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Disclaimers */}
        <div style={{ marginTop: "24px", paddingTop: "12px", borderTop: "1px solid #dce8e2", fontSize: "7.5px", color: "#748f86", lineHeight: "1.45" }}>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Medical Notice:</strong> OA-Sathi is a healthcare screening and community navigation prototype for clinical demonstration. It is not an approved medical device, does not provide an osteoarthritis diagnosis, and does not replace in-person clinical examination, radiography, or laboratory diagnostic evaluation by a licensed healthcare professional.
          </p>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>OA-Sathi Clinical Screening Aid · Prototype build</span>
            <span>Printed from local verified session</span>
          </div>
        </div>
      </div>
    </div>
  );
});

const DoctorPortalPage = memo(function DoctorPortalPage({
  screenings,
  onUpdateScreening,
  onViewReport,
  onNavigate,
}: {
  screenings: Screening[];
  onUpdateScreening: (updated: Screening) => void;
  onViewReport: (record: Screening) => void;
  onNavigate: (page: Page) => void;
}) {
  // Access control: Doctor portal ONLY displays submissions with explicit sharing consent!
  const authorizedScreenings = useMemo(() => {
    return screenings.filter((s) => s.sharingStatus === "shared");
  }, [screenings]);

  const [filter, setFilter] = useState<"all" | "awaiting" | "consultation">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return authorizedScreenings[0]?.id || null;
  });

  // Ensure selectedId is valid if authorized list changes
  useEffect(() => {
    if (authorizedScreenings.length > 0) {
      if (!selectedId || !authorizedScreenings.some((s) => s.id === selectedId)) {
        setSelectedId(authorizedScreenings[0].id);
      }
    } else {
      setSelectedId(null);
    }
  }, [authorizedScreenings, selectedId]);

  const selectedRecord = useMemo(() => {
    return authorizedScreenings.find((s) => s.id === selectedId) || null;
  }, [authorizedScreenings, selectedId]);

  // Form states for clinical review
  const [reviewerName, setReviewerName] = useState("Dr. A. Sharma, MO (Community Health)");
  const [internalNotes, setInternalNotes] = useState("");
  const [patientFeedback, setPatientFeedback] = useState("");
  const [recommendation, setRecommendation] = useState<FollowUpRecommendation>("routine-monitoring");
  const [consultStatus, setConsultStatus] = useState<ConsultationStatus>("not-requested");
  const [appointmentDetails, setAppointmentDetails] = useState("");
  const [saveSuccessNotice, setSaveSuccessNotice] = useState("");
  const [validationError, setValidationError] = useState("");
  const [isSavingReview, setIsSavingReview] = useState(false);

  // Populate form fields when selected record changes
  useEffect(() => {
    if (selectedRecord) {
      setReviewerName(selectedRecord.doctorReviewerName || "Dr. A. Sharma, MO (Community Health)");
      setInternalNotes(selectedRecord.doctorInternalNotes || "");
      setPatientFeedback(selectedRecord.doctorPatientFeedback || "");
      setRecommendation(
        (selectedRecord.doctorFollowUpRecommendation as FollowUpRecommendation) ||
          (selectedRecord.band === "More markers" ? "clinical-examination" : "routine-monitoring")
      );
      setConsultStatus(selectedRecord.consultationStatus || "not-requested");
      setAppointmentDetails(selectedRecord.doctorAppointmentDetails || "");
      setSaveSuccessNotice("");
      setValidationError("");
    }
  }, [selectedRecord]);

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return authorizedScreenings.filter((item) => {
      if (filter === "awaiting" && item.doctorReviewStatus === "reviewed") return false;
      if (filter === "consultation" && item.consultationStatus !== "requested") return false;
      if (!q) return true;
      const key = `${item.id} ${item.name} ${item.district} ${item.joint}`.toLowerCase();
      return key.includes(q);
    });
  }, [authorizedScreenings, filter, search]);

  const stats = useMemo(() => {
    const total = authorizedScreenings.length;
    const awaiting = authorizedScreenings.filter((s) => s.doctorReviewStatus !== "reviewed").length;
    const consultReq = authorizedScreenings.filter((s) => s.consultationStatus === "requested").length;
    const reviewed = authorizedScreenings.filter((s) => s.doctorReviewStatus === "reviewed").length;
    return { total, awaiting, consultReq, reviewed };
  }, [authorizedScreenings]);

  const handleSaveReview = () => {
    if (!selectedRecord || isSavingReview) return;

    if (!patientFeedback.trim()) {
      setValidationError("Please enter patient-visible clinical advice or reassurance before saving.");
      return;
    }

    if (consultStatus === "appointment-confirmed" && !appointmentDetails.trim()) {
      setValidationError("Please enter specific appointment schedule details (date/time/facility) before confirming an appointment. Do not falsely confirm an appointment without scheduling details.");
      return;
    }

    setIsSavingReview(true);
    try {
      const reviewInput: DoctorReviewInput = {
        doctorReviewerName: reviewerName.trim() || "Attending Medical Officer",
        doctorInternalNotes: internalNotes.trim(),
        doctorPatientFeedback: patientFeedback.trim(),
        doctorFollowUpRecommendation: recommendation,
        markAsReviewed: true,
        consultationStatus: consultStatus,
        doctorAppointmentDetails: appointmentDetails.trim(),
      };

      const updated = recordDoctorReview(selectedRecord, reviewInput);
      onUpdateScreening(updated);
      setSaveSuccessNotice(`Clinical review for ${selectedRecord.id} saved and persisted.`);
      setValidationError("");
    } finally {
      setTimeout(() => setIsSavingReview(false), 400);
    }
  };

  return (
    <div className="page-content">
      {/* Banner */}
      <div className="doctor-portal-banner">
        <div className="eyebrow">
          <span className="eyebrow-dot" /> CLINICIAN DEMO PORTAL · TRIAGE &amp; REVIEW
        </div>
        <h1>Doctor Clinical Review Portal</h1>
        <p>
          Local demonstration interface for primary health centre medical officers. Shows ONLY patient screening submissions where explicit clinical sharing consent has been granted (<code>sharingStatus === 'shared'</code>).
        </p>
      </div>

      {/* Security & Multi-User Disclaimer */}
      <div className="privacy-note" style={{ marginBottom: "16px", background: "#f0fdf4", borderColor: "#bbf7d0" }}>
        <ShieldCheck size={18} style={{ color: "#15803d" }} />
        <span>
          <strong>Local Architecture Notice:</strong> In this demonstration build, patient-doctor sharing operates via local verified session storage. In a production clinical pilot, this is replaced by an authenticated server-side role-based access control (RBAC) database. Local storage is not encrypted clinical storage, does not transmit data over external networks, and does not automatically synchronize across different devices or separate users.
        </span>
      </div>

      {/* Stats Row */}
      <div className="doctor-stats-row">
        <div className="doctor-stat-card">
          <div className="doctor-stat-icon">
            <Users size={18} />
          </div>
          <div className="doctor-stat-info">
            <strong>{stats.total}</strong>
            <span>Shared Submissions</span>
          </div>
        </div>
        <div className="doctor-stat-card">
          <div className="doctor-stat-icon" style={{ background: "#fef9c3", color: "#854d0e" }}>
            <Clock3 size={18} />
          </div>
          <div className="doctor-stat-info">
            <strong>{stats.awaiting}</strong>
            <span>Awaiting Review</span>
          </div>
        </div>
        <div className="doctor-stat-card">
          <div className="doctor-stat-icon" style={{ background: "#e0f2fe", color: "#0369a1" }}>
            <Send size={18} />
          </div>
          <div className="doctor-stat-info">
            <strong>{stats.consultReq}</strong>
            <span>Consult Requests</span>
          </div>
        </div>
        <div className="doctor-stat-card">
          <div className="doctor-stat-icon" style={{ background: "#dcfce7", color: "#15803d" }}>
            <BadgeCheck size={18} />
          </div>
          <div className="doctor-stat-info">
            <strong>{stats.reviewed}</strong>
            <span>Reviewed</span>
          </div>
        </div>
      </div>

      {/* Main Review Layout */}
      {authorizedScreenings.length === 0 ? (
        <div className="empty-state records-empty">
          <div className="empty-icon" style={{ background: "#e0f2fe", color: "#0284c7" }}>
            <Lock size={24} />
          </div>
          <strong>No Patient Submissions Currently Shared</strong>
          <p>
            No patient records have sharing consent active. In OA-Sathi, patient records are strictly private by default.
          </p>
          <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
            <button className="button button-primary" onClick={() => onNavigate("records")}>
              Go to Patient Records
            </button>
            <button className="button button-secondary" onClick={() => onNavigate("screening")}>
              Start New Screening
            </button>
          </div>
        </div>
      ) : (
        <div className="doctor-review-layout">
          {/* Left: Patient List */}
          <div className="doctor-patient-list-card">
            <div className="doctor-patient-list-header">
              <strong style={{ fontSize: "10px", color: "#1e372f" }}>
                Authorized Patient Submissions ({filteredList.length})
              </strong>
            </div>

            <div style={{ padding: "8px 12px", borderBottom: "1px solid #edf3ef" }}>
              <input
                className="doctor-input"
                style={{ padding: "6px 9px", fontSize: "8px" }}
                placeholder="Search patient, ID, joint..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div style={{ display: "flex", gap: "4px", marginTop: "6px" }}>
                <button
                  type="button"
                  className={`button button-secondary ${filter === "all" ? "active" : ""}`}
                  style={{ fontSize: "7px", padding: "3px 6px", height: "auto" }}
                  onClick={() => setFilter("all")}
                >
                  All ({authorizedScreenings.length})
                </button>
                <button
                  type="button"
                  className={`button button-secondary ${filter === "awaiting" ? "active" : ""}`}
                  style={{ fontSize: "7px", padding: "3px 6px", height: "auto" }}
                  onClick={() => setFilter("awaiting")}
                >
                  Awaiting ({stats.awaiting})
                </button>
                <button
                  type="button"
                  className={`button button-secondary ${filter === "consultation" ? "active" : ""}`}
                  style={{ fontSize: "7px", padding: "3px 6px", height: "auto" }}
                  onClick={() => setFilter("consultation")}
                >
                  Consults ({stats.consultReq})
                </button>
              </div>
            </div>

            <div style={{ maxHeight: "600px", overflowY: "auto" }}>
              {filteredList.map((item) => {
                const isSelected = item.id === selectedId;
                return (
                  <div
                    key={item.id}
                    className={`doctor-patient-item ${isSelected ? "active" : ""}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <strong style={{ fontSize: "9.5px", color: "#1e372f" }}>{item.name}</strong>
                        <div style={{ fontSize: "7.5px", color: "#6d867d" }}>
                          {item.id} · {item.age} yrs · {item.district}
                        </div>
                      </div>
                      <span className="joint-chip">{item.joint}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
                      <RiskBadge band={item.band} />
                      {item.doctorReviewStatus === "reviewed" ? (
                        <span className="care-badge reviewed">Reviewed</span>
                      ) : (
                        <span className="care-badge pending">Pending</span>
                      )}
                      {item.consultationStatus === "requested" && (
                        <span className="care-badge requested">Consult Req</span>
                      )}
                      {item.urgentCareNotice?.hasRedFlags && (
                        <span className="care-badge alert" style={{ background: "#fee2e2", color: "#991b1b" }}>
                          Red Flag
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Review Workspace */}
          {selectedRecord ? (
            <div className="doctor-review-workspace">
              {/* Workspace Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <div className="eyebrow">PATIENT CLINICAL INSPECTION · {selectedRecord.id}</div>
                  <h2 style={{ margin: "2px 0 0", fontSize: "16px", color: "#1c352d" }}>
                    {selectedRecord.name} ({selectedRecord.age} yrs)
                  </h2>
                  <p style={{ margin: "2px 0 0", fontSize: "8.5px", color: "#668379" }}>
                    Screened: {selectedRecord.date} · Joint: {selectedRecord.joint} · District: {selectedRecord.district}
                  </p>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => onViewReport(selectedRecord)}
                  title="Open formal medical report view"
                >
                  <Printer size={15} /> Medical Report
                </button>
              </div>

              {/* Red-Flag Alert if present */}
              {selectedRecord.urgentCareNotice?.hasRedFlags && (
                <div className="safety-warning-banner" role="alert" style={{ marginBottom: "16px" }}>
                  <AlertTriangle size={20} />
                  <div>
                    <strong>URGENT CLINICAL SYMPTOMS FLAGGED:</strong>
                    <ul style={{ margin: "4px 0 0", paddingLeft: "16px", fontSize: "8px" }}>
                      {selectedRecord.urgentCareNotice.flags.map((flag) => (
                        <li key={flag}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Patient Answers Inspection Grid */}
              <div style={{ background: "#f8faf9", border: "1px solid #e1ebe6", borderRadius: "10px", padding: "14px", marginBottom: "18px" }}>
                <strong style={{ display: "block", fontSize: "9px", color: "#223d34", marginBottom: "8px" }}>
                  Submitted Patient Questionnaire &amp; Measurements
                </strong>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", fontSize: "8px" }}>
                  <div>
                    <span style={{ color: "#748f85", display: "block" }}>Pain Duration:</span>
                    <strong>{selectedRecord.formAnswers?.painDuration ? (DURATION_LABELS[selectedRecord.formAnswers.painDuration] || selectedRecord.formAnswers.painDuration) : "Intake recorded"}</strong>
                  </div>
                  <div>
                    <span style={{ color: "#748f85", display: "block" }}>Discomfort Intensity:</span>
                    <strong>{selectedRecord.formAnswers?.painLevel ?? "N/A"}/10</strong>
                  </div>
                  <div>
                    <span style={{ color: "#748f85", display: "block" }}>Morning Stiffness:</span>
                    <strong>{selectedRecord.formAnswers?.stiffness ? (STIFFNESS_LABELS[selectedRecord.formAnswers.stiffness] || selectedRecord.formAnswers.stiffness) : "Intake recorded"}</strong>
                  </div>
                  <div>
                    <span style={{ color: "#748f85", display: "block" }}>Daily Functional Mobility:</span>
                    <strong>{selectedRecord.formAnswers?.mobility ? (MOBILITY_LABELS[selectedRecord.formAnswers.mobility] || selectedRecord.formAnswers.mobility) : "Intake recorded"}</strong>
                  </div>
                  <div>
                    <span style={{ color: "#748f85", display: "block" }}>Prior Joint Injury:</span>
                    <strong>{selectedRecord.formAnswers?.previousInjury === true ? "Yes" : selectedRecord.formAnswers?.previousInjury === false ? "No" : "Not checked"}</strong>
                  </div>
                  <div>
                    <span style={{ color: "#748f85", display: "block" }}>Family History:</span>
                    <strong>{selectedRecord.formAnswers?.familyHistory === true ? "Yes" : selectedRecord.formAnswers?.familyHistory === false ? "No" : "Not checked"}</strong>
                  </div>
                  <div>
                    <span style={{ color: "#748f85", display: "block" }}>Measured BMI:</span>
                    <strong>{selectedRecord.bmi !== null && selectedRecord.bmi !== undefined ? `${selectedRecord.bmi} kg/m²` : "Not provided"}</strong>
                  </div>
                  <div>
                    <span style={{ color: "#748f85", display: "block" }}>Measured BMD T-Score:</span>
                    <strong>{selectedRecord.bmdTScore ? `${selectedRecord.bmdTScore} (${selectedRecord.bmdSite || "Measured"})` : "None recorded"}</strong>
                  </div>
                </div>

                {/* Contributing factors */}
                {selectedRecord.contributingFactors && selectedRecord.contributingFactors.length > 0 && (
                  <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px dashed #d5e3dc", fontSize: "7.5px" }}>
                    <span style={{ color: "#748f85" }}>Rule-Based Heuristic Findings: </span>
                    <span style={{ color: "#253f36" }}>{selectedRecord.contributingFactors.join(" · ")}</span>
                  </div>
                )}
              </div>

              {/* Doctor Review Entry Form */}
              <div style={{ borderTop: "2px solid #e2ebe7", paddingTop: "16px" }}>
                <h3 style={{ margin: "0 0 12px", fontSize: "11px", color: "#1c352d" }}>
                  Record Clinical Observations &amp; Advice
                </h3>

                {validationError && (
                  <div className="form-error" role="alert" style={{ marginBottom: "12px" }}>
                    <AlertTriangle size={15} /> {validationError}
                  </div>
                )}

                {saveSuccessNotice && (
                  <div className="toast" role="status" style={{ marginBottom: "12px", position: "static", transform: "none" }}>
                    <CheckCircle2 size={16} /> {saveSuccessNotice}
                  </div>
                )}

                <div className="doctor-form-group">
                  <label htmlFor="doctor-reviewer-name">Reviewing Clinician Name &amp; Designation</label>
                  <input
                    id="doctor-reviewer-name"
                    className="doctor-input"
                    value={reviewerName}
                    onChange={(e) => setReviewerName(e.target.value)}
                    placeholder="e.g. Dr. A. Sharma, MO (Community Health)"
                  />
                </div>

                <div className="doctor-form-group">
                  <label htmlFor="doctor-internal-notes">
                    Private Clinician Notes <small>(Confidential — visible only to medical staff)</small>
                  </label>
                  <textarea
                    id="doctor-internal-notes"
                    className="doctor-textarea"
                    rows={3}
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    placeholder="Enter internal diagnostic impressions, differential considerations, or notes for colleagues..."
                  />
                  <small>These notes are never shown on the patient summary or printable report.</small>
                </div>

                <div className="doctor-form-group">
                  <label htmlFor="doctor-patient-feedback">
                    Patient-Facing Guidance &amp; Advice <b>*</b> <small>(Visible to patient)</small>
                  </label>
                  <textarea
                    id="doctor-patient-feedback"
                    className="doctor-textarea"
                    rows={3}
                    value={patientFeedback}
                    onChange={(e) => setPatientFeedback(e.target.value)}
                    placeholder="Enter plain-language advice for the patient (e.g., quadriceps strengthening exercises, heat/ice application, weight management, when to visit PHC)..."
                    required
                  />
                  <small>This advice will appear directly on the patient's screening summary and printable medical report.</small>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="doctor-form-group">
                    <label htmlFor="doctor-recommendation">Clinical Recommendation</label>
                    <select
                      id="doctor-recommendation"
                      className="doctor-select"
                      value={recommendation}
                      onChange={(e) => setRecommendation(e.target.value as FollowUpRecommendation)}
                    >
                      <option value="routine-monitoring">Routine joint health monitoring &amp; light exercise</option>
                      <option value="lifestyle-management">Lifestyle adaptation &amp; weight management</option>
                      <option value="physiotherapy">Physiotherapy &amp; quadriceps strengthening</option>
                      <option value="clinical-examination">Outpatient clinical examination at PHC</option>
                      <option value="imaging-radiology">Radiography / X-ray imaging recommendation</option>
                      <option value="urgent-evaluation">Urgent hospital evaluation (Acute red flags)</option>
                    </select>
                  </div>

                  <div className="doctor-form-group">
                    <label htmlFor="doctor-consult-status">Consultation &amp; Appointment Status</label>
                    <select
                      id="doctor-consult-status"
                      className="doctor-select"
                      value={consultStatus}
                      onChange={(e) => setConsultStatus(e.target.value as ConsultationStatus)}
                    >
                      <option value="not-requested">Not requested</option>
                      <option value="requested">Consultation requested (In triage)</option>
                      <option value="appointment-confirmed">Appointment confirmed &amp; scheduled</option>
                      <option value="completed">Consultation completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>

                {consultStatus === "appointment-confirmed" && (
                  <div className="doctor-form-group" style={{ background: "#fbfdfc", padding: "10px", borderRadius: "8px", border: "1px solid #cce3d8" }}>
                    <label htmlFor="doctor-appointment-details">
                      Appointment Details &amp; Location <b>*</b>
                    </label>
                    <input
                      id="doctor-appointment-details"
                      className="doctor-input"
                      value={appointmentDetails}
                      onChange={(e) => setAppointmentDetails(e.target.value)}
                      placeholder="e.g. Community Health Centre Room 3 · Next Tuesday at 10:30 am"
                    />
                    <small style={{ color: "#0f766e" }}>
                      * An appointment must have real scheduling details before confirmation to prevent false patient expectations.
                    </small>
                  </div>
                )}

                <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                  <button type="button" className="button button-primary" onClick={handleSaveReview} disabled={isSavingReview}>
                    <CheckCircle2 size={16} /> Save Clinical Review
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => onViewReport(selectedRecord)}
                  >
                    <Printer size={15} /> Preview Medical Report
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="doctor-review-workspace" style={{ display: "grid", placeItems: "center" }}>
              <p style={{ color: "#748f85" }}>Select a patient from the list to begin clinical inspection.</p>
            </div>
          )}
        </div>
      )}

      <Disclaimer />
    </div>
  );
});

const Disclaimer = memo(function Disclaimer() {
  return (
    <footer className="disclaimer-footer">
      <span>
        <ShieldCheck size={15} /> For demonstration and educational purposes only.
      </span>
      <span>OA-Sathi is not a diagnostic tool and does not replace clinical advice.</span>
    </footer>
  );
});

export default App;
