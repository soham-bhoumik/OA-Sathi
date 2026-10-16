import {
  memo,
  useCallback,
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
  FileEdit,
  FileHeart,
  FilePlus2,
  HeartPulse,
  HelpCircle,
  Info,
  LayoutDashboard,
  Leaf,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";

import {
  calculateDashboardStats,
  districts,
  emptyForm,
  evaluateScreening,
  exportRecordsToCsv,
  generateStableId,
  loadStoredScreenings,
  saveStoredScreenings,
  sanitizeText,
  validateScreeningInput,
  type FormValues,
  type Joint,
  type Page,
  type RiskBand,
  type Screening,
  type TriStateAnswer,
  NOT_CHECKED,
} from "./logic/screeningRules";

function App() {
  const [page, setPage] = useState<Page>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [screenings, setScreenings] = useState<Screening[]>(loadStoredScreenings);
  const [result, setResult] = useState<Screening | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [cameraStatus, setCameraStatus] = useState<"idle" | "ready" | "unsupported" | "denied" | "error">("idle");
  const [cameraMessage, setCameraMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const lastSavedRef = useRef<string>("");

  // Persist records to storage safely without duplicate writes
  useEffect(() => {
    try {
      const serialized = JSON.stringify(screenings);
      if (serialized !== lastSavedRef.current) {
        lastSavedRef.current = serialized;
        saveStoredScreenings(screenings);
      }
    } catch {
      // Non-blocking quota error handling
    }
  }, [screenings]);

  const stopCamera = useCallback(() => {
    const stream = cameraStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track: MediaStreamTrack) => {
        try {
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
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraStatus("unsupported");
      setCameraMessage(
        "This browser does not support camera access. Try a modern Chromium or Edge browser over HTTPS or localhost."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
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

  // High-performance search without array allocations per item
  const filteredScreenings = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return screenings;
    return screenings.filter((item) => {
      return (
        item.id.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query) ||
        item.district.toLowerCase().includes(query) ||
        item.joint.toLowerCase().includes(query) ||
        item.band.toLowerCase().includes(query)
      );
    });
  }, [screenings, search]);

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
      setMobileNavOpen(false);
      setNotice("");
    },
    [page, stopCamera]
  );

  const startScreening = useCallback(() => {
    stopCamera();
    setResult(null);
    setEditingRecordId(null);
    setForm(emptyForm());
    setConsent(false);
    setError("");
    setNotice("");
    setPage("screening");
    setMobileNavOpen(false);
  }, [stopCamera]);

  const handleOpenScreeningTab = useCallback(() => {
    stopCamera();
    // If viewing a completed result, reset so the screening form appears
    if (result) {
      setResult(null);
      setEditingRecordId(null);
      setForm(emptyForm());
      setConsent(false);
    }
    setPage("screening");
    setMobileNavOpen(false);
    setNotice("");
  }, [result, stopCamera]);

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
        });
      }
      setEditingRecordId(recordToEdit.id);
      setConsent(true);
      setResult(null);
      setError("");
      setPage("screening");
      setNotice(`Editing record ${recordToEdit.id}. Modify answers and click update.`);
    },
    [stopCamera]
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
          formAnswers: { ...form },
          contributingFactors: evaluation.contributingFactors,
          absentFactors: evaluation.absentFactors,
          unassessedFactors: evaluation.unassessedFactors,
          assessedCount: evaluation.assessedCount,
          totalQuestions: evaluation.totalQuestions,
          bmi: evaluation.bmi,
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
        };

        setScreenings((current) => [nextResult, ...current]);
        setResult(nextResult);
        setError("");
        setNotice("Screening summary created. It is stored only for this browser session.");
      }

      setIsSubmitting(false);
    },
    [consent, editingRecordId, form, isSubmitting, screenings, stopCamera]
  );

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
    setPage("screening");
  }, []);

  return (
    <div className="app">
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
            onClick={() => navigate("records")}
          >
            <ClipboardCheck size={18} />
            <span>Screening records</span>
            <span className="nav-count">{screenings.length}</span>
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
            onClick={() => setNotice("Profile settings are not available in this demo.")}
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
              {page === "overview" ? "Overview" : page === "screening" ? "New screening" : "Screening records"}
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
            onRecords={() => navigate("records")}
            onOpenScreening={handleOpenScreening}
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
            cameraStatus={cameraStatus}
            cameraMessage={cameraMessage}
            onStartCamera={startCamera}
            onStopCamera={stopCamera}
            videoRef={videoRef}
            isSubmitting={isSubmitting}
          />
        )}
        {page === "records" && (
          <RecordsPage
            screenings={filteredScreenings}
            total={screenings.length}
            search={search}
            onSearch={setSearch}
            onNew={startScreening}
            onOpen={handleOpenScreening}
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
}: {
  screenings: Screening[];
  onNew: () => void;
  onRecords: () => void;
  onOpenScreening: (item: Screening) => void;
}) {
  const stats = useMemo(() => calculateDashboardStats(screenings), [screenings]);
  const recentScreenings = useMemo(() => screenings.slice(0, 4), [screenings]);

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
        <button className="button button-primary" onClick={onNew}>
          <Plus size={17} /> Start a screening
        </button>
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
      <ScreeningTable screenings={recentScreenings} onOpen={onOpenScreening} />

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
}: {
  screenings: Screening[];
  onOpen: (item: Screening) => void;
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
              <th></th>
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
                      <strong>{item.name}</strong>
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
  cameraStatus,
  cameraMessage,
  onStartCamera,
  onStopCamera,
  videoRef,
  isSubmitting,
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
  cameraStatus: "idle" | "ready" | "unsupported" | "denied" | "error";
  cameraMessage: string;
  onStartCamera: () => void;
  onStopCamera: () => void;
  videoRef: RefObject<HTMLVideoElement>;
  isSubmitting: boolean;
}) {
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
        />
      ) : (
        <form className="screening-form" onSubmit={onSubmit} noValidate>
          <div className="screening-main">
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
                  {[
                    ["under-2-weeks", "Less than 2 weeks"],
                    ["2-4-weeks", "2–4 weeks"],
                    ["1-3-months", "1–3 months"],
                    ["over-3-months", "Over 3 months"],
                    [NOT_CHECKED, "Not checked"],
                  ].map(([value, label]) => (
                    <Choice
                      key={value}
                      name="pain-duration"
                      value={value}
                      checked={form.painDuration === value}
                      onChange={() => onChange("painDuration", value)}
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
                  onChange={(e) => onChange("painLevel", Number(e.target.value))}
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
                  {[
                    ["none", "No stiffness"],
                    ["under-30", "Less than 30 min"],
                    ["over-30", "30 min or more"],
                    [NOT_CHECKED, "Not checked"],
                  ].map(([value, label]) => (
                    <Choice
                      key={value}
                      name="stiffness"
                      value={value}
                      checked={form.stiffness === value}
                      onChange={() => onChange("stiffness", value)}
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
                  {[
                    ["no", "Not at the moment"],
                    ["some", "A little"],
                    ["significant", "Quite a bit"],
                    [NOT_CHECKED, "Not checked"],
                  ].map(([value, label]) => (
                    <Choice
                      key={value}
                      name="mobility"
                      value={value}
                      checked={form.mobility === value}
                      onChange={() => onChange("mobility", value)}
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
                  onChange={(value) => onChange("previousInjury", value)}
                />
                <TriStateRow
                  title="Family history of joint problems"
                  description="A close family member has experienced similar issues."
                  value={form.familyHistory}
                  onChange={(value) => onChange("familyHistory", value)}
                />
                <TriStateRow
                  title="Frequent heavy or repetitive activity"
                  description="Daily work or activities put repeated strain on this joint."
                  value={form.repeatedLoad}
                  onChange={(value) => onChange("repeatedLoad", value)}
                />
              </div>
            </section>

            <section className="form-card movement-card">
              <div className="form-section-heading">
                <span className="form-section-icon history-icon">
                  <Activity size={18} />
                </span>
                <div>
                  <h2>Movement assessment</h2>
                  <p>Manual assessment remains available as a fallback.</p>
                </div>
              </div>
              <div className="movement-toolbar">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={cameraStatus === "ready" ? onStopCamera : onStartCamera}
                >
                  {cameraStatus === "ready" ? "Stop camera" : "Open camera"}
                </button>
                {cameraStatus === "ready" && <span className="camera-live-indicator">Camera live</span>}
              </div>
              <div className={`camera-panel ${cameraStatus === "ready" ? "camera-visible" : ""}`}>
                <video
                  ref={videoRef}
                  className="camera-video"
                  style={{ display: cameraStatus === "ready" ? "block" : "none" }}
                  playsInline
                  muted
                  autoPlay
                />
                <div
                  className="camera-placeholder"
                  style={{ display: cameraStatus === "ready" ? "none" : "grid" }}
                >
                  <span>Camera feed appears here when available.</span>
                </div>
              </div>
              {cameraMessage && (
                <div className="camera-message" role="status">
                  {cameraMessage}
                </div>
              )}
            </section>

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
                {editingRecordId ? "Update screening summary" : "Generate screening summary"}{" "}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>

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
        </form>
      )}
      <Disclaimer />
    </div>
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
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className={`choice-card ${checked ? "selected" : ""}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
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

const ResultSummary = memo(function ResultSummary({
  result,
  onExport,
  onStartNew,
  onEdit,
}: {
  result: Screening;
  onExport: () => void;
  onStartNew: () => void;
  onEdit: () => void;
}) {
  const isPreliminary = Array.isArray(result.unassessedFactors) && result.unassessedFactors.length >= 3;

  return (
    <div className="result-layout">
      <div className="result-main">
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

        <div className="result-actions">
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
    </div>
  );
});

const RecordsPage = memo(function RecordsPage({
  screenings,
  total,
  search,
  onSearch,
  onNew,
  onOpen,
  onExportCsv,
}: {
  screenings: Screening[];
  total: number;
  search: string;
  onSearch: (value: string) => void;
  onNew: () => void;
  onOpen: (item: Screening) => void;
  onExportCsv: () => void;
}) {
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
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search by name, district, joint..."
          />
        </label>
      </div>

      {screenings.length ? (
        <ScreeningTable screenings={screenings} onOpen={onOpen} />
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
