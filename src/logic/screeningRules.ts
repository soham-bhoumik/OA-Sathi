export type Page = "overview" | "screening" | "records" | "settings" | "doctor" | "report";
export type Joint = "Knee" | "Hip" | "Hand" | "Other";
export type RiskBand = "Lower markers" | "Some markers" | "More markers";
export type TriStateAnswer = boolean | "not-checked" | "unanswered" | "prefer-not-to-answer";

export type SharingStatus = "not-shared" | "shared" | "withdrawn";
export type ConsultationStatus =
  | "not-requested"
  | "requested"
  | "appointment-confirmed"
  | "completed"
  | "cancelled";
export type DoctorReviewStatus = "awaiting-review" | "reviewed";
export type FollowUpRecommendation =
  | "urgent-evaluation"
  | "clinical-examination"
  | "imaging-radiology"
  | "physiotherapy"
  | "lifestyle-management"
  | "routine-monitoring";

export const NOT_CHECKED = "not-checked" as const;
export const UNANSWERED = "unanswered" as const;
export const PREFER_NOT_TO_ANSWER = "prefer-not-to-answer" as const;
export const STORAGE_KEY = "oa_sathi_screenings_v1";

export interface FormValues {
  name: string;
  age: string;
  district: string;
  joint: Joint | "";
  painDuration: string;
  painLevel: number;
  stiffness: string;
  mobility: string;
  previousInjury: TriStateAnswer;
  familyHistory: TriStateAnswer;
  repeatedLoad: TriStateAnswer;
  heightCm?: string;
  weightKg?: string;
  // Separate Safety / Red-Flag Questions
  hasHotRedJointFever?: TriStateAnswer;
  hasSuddenSeverePainSwelling?: TriStateAnswer;
  hasInabilityToBearWeight?: TriStateAnswer;
  // Optional BMD (Bone Mineral Density) measured values (never inferred)
  bmdTScore?: string;
  bmdSite?: string;
  bmdDate?: string;
}

import type {
  StructuredGaitAnalysisOutput,
  ManualGaitObservations,
} from "../services/gaitAnalysisService";

export interface Screening {
  id: string;
  name: string;
  age: number;
  district: string;
  joint: Joint;
  score: number;
  band: RiskBand;
  markers: string[];
  date: string;
  timestamp: number;
  updatedAt?: number;
  isDemo?: boolean;
  formAnswers?: FormValues;
  contributingFactors?: string[];
  absentFactors?: string[];
  unassessedFactors?: string[];
  assessedCount?: number;
  totalQuestions?: number;
  bmi?: number | null;
  urgentCareNotice?: UrgentCareNotice;
  gaitAssessment?: StructuredGaitAnalysisOutput;
  manualGaitObservations?: ManualGaitObservations;
  // Patient-Doctor Workflow States
  sharingStatus?: SharingStatus;
  sharingConsentGivenAt?: number | null;
  sharingWithdrawnAt?: number | null;
  consultationStatus?: ConsultationStatus;
  consultationRequestedAt?: number | null;
  consultationNotes?: string | null;
  doctorReviewStatus?: DoctorReviewStatus;
  doctorReviewedAt?: number | null;
  doctorReviewerName?: string | null;
  doctorInternalNotes?: string | null; // clinician-only observations
  doctorPatientFeedback?: string | null; // patient-facing clinician advice
  doctorFollowUpRecommendation?: string | null;
  doctorAppointmentDetails?: string | null;
  // Optional laboratory BMD (separate from symptoms, never inferred)
  bmdTScore?: string;
  bmdSite?: string;
  bmdDate?: string;
}

export const districts = [
  "Choose a district",
  "East Khasi Hills",
  "West Khasi Hills",
  "Ri-Bhoi",
  "East Jaintia Hills",
  "West Jaintia Hills",
  "East Garo Hills",
  "West Garo Hills",
  "South Garo Hills",
  "Imphal West",
  "Imphal East",
  "Aizawl",
  "Kohima",
  "Dimapur",
  "Papum Pare",
  "Dibrugarh",
  "Kamrup Metropolitan",
  "Other",
] as const;

export const initialForm: FormValues = {
  name: "",
  age: "",
  district: "",
  joint: "",
  painDuration: "",
  painLevel: 3,
  stiffness: "",
  mobility: "",
  previousInjury: "unanswered",
  familyHistory: "unanswered",
  repeatedLoad: "unanswered",
  heightCm: "",
  weightKg: "",
  hasHotRedJointFever: "unanswered",
  hasSuddenSeverePainSwelling: "unanswered",
  hasInabilityToBearWeight: "unanswered",
  bmdTScore: "",
  bmdSite: "",
  bmdDate: "",
};

export const sampleScreenings: Screening[] = [
  {
    id: "OS-0248",
    name: "Anonymised · 62 yrs",
    age: 62,
    district: "East Khasi Hills",
    joint: "Knee",
    score: 96,
    band: "More markers",
    markers: [
      "Age recorded: 62 years.",
      "Joint symptoms have lasted over 3 months.",
      "Discomfort rating: 7 out of 10.",
      "Stiffness after rest: 30 minutes or more.",
      "Everyday activities: affected quite a bit.",
      "Previous joint injury: reported.",
      "Family history of joint problems: not reported.",
      "Frequent heavy or repetitive activity: not reported.",
    ],
    date: "Today, 10:42 am",
    timestamp: Date.now() - 1000 * 60 * 60 * 2,
    isDemo: true,
    contributingFactors: [
      "Age recorded: 62 years.",
      "Joint symptoms have lasted over 3 months.",
      "Discomfort rating: 7 out of 10.",
      "Stiffness after rest: 30 minutes or more.",
      "Everyday activities: affected quite a bit.",
      "Previous joint injury: reported.",
    ],
    absentFactors: [
      "Family history of joint problems: not reported.",
      "Frequent heavy or repetitive activity: not reported.",
    ],
    unassessedFactors: [],
    assessedCount: 8,
    totalQuestions: 8,
    sharingStatus: "shared",
    sharingConsentGivenAt: Date.now() - 1000 * 60 * 60 * 2,
    consultationStatus: "requested",
    consultationRequestedAt: Date.now() - 1000 * 60 * 50,
    consultationNotes: "Patient reported difficulty with daily walking and prolonged morning knee stiffness.",
    doctorReviewStatus: "awaiting-review",
  },
  {
    id: "OS-0247",
    name: "Anonymised · 54 yrs",
    age: 54,
    district: "Ri-Bhoi",
    joint: "Hip",
    score: 51,
    band: "Some markers",
    markers: [
      "Age recorded: 54 years.",
      "Joint symptoms have lasted 1–3 months.",
      "Discomfort rating: 5 out of 10.",
      "Stiffness after rest: less than 30 minutes.",
      "Everyday activities: affected a little.",
      "Previous joint injury: not reported.",
      "Family history of joint problems: not reported.",
      "Frequent heavy or repetitive activity: not reported.",
    ],
    date: "Today, 10:18 am",
    timestamp: Date.now() - 1000 * 60 * 60 * 3,
    isDemo: true,
    contributingFactors: [
      "Age recorded: 54 years.",
      "Joint symptoms have lasted 1–3 months.",
      "Discomfort rating: 5 out of 10.",
      "Stiffness after rest: less than 30 minutes.",
      "Everyday activities: affected a little.",
    ],
    absentFactors: [
      "Previous joint injury: not reported.",
      "Family history of joint problems: not reported.",
      "Frequent heavy or repetitive activity: not reported.",
    ],
    unassessedFactors: [],
    assessedCount: 8,
    totalQuestions: 8,
    sharingStatus: "not-shared",
    consultationStatus: "not-requested",
    doctorReviewStatus: "awaiting-review",
  },
  {
    id: "OS-0246",
    name: "Anonymised · 47 yrs",
    age: 47,
    district: "Imphal West",
    joint: "Knee",
    score: 19,
    band: "Lower markers",
    markers: [
      "Age recorded: 47 years.",
      "Joint symptoms have lasted less than 2 weeks.",
      "Discomfort rating: 2 out of 10.",
      "Stiffness after rest: no stiffness.",
      "Everyday activities: not affected.",
      "Previous joint injury: not reported.",
      "Family history of joint problems: not reported.",
      "Frequent heavy or repetitive activity: not reported.",
    ],
    date: "Today, 9:56 am",
    timestamp: Date.now() - 1000 * 60 * 60 * 4,
    isDemo: true,
    contributingFactors: [
      "Age recorded: 47 years.",
      "Discomfort rating: 2 out of 10.",
    ],
    absentFactors: [
      "Joint symptoms have lasted less than 2 weeks.",
      "Stiffness after rest: no stiffness.",
      "Everyday activities: not affected.",
      "Previous joint injury: not reported.",
      "Family history of joint problems: not reported.",
      "Frequent heavy or repetitive activity: not reported.",
    ],
    unassessedFactors: [],
    assessedCount: 8,
    totalQuestions: 8,
    sharingStatus: "shared",
    sharingConsentGivenAt: Date.now() - 1000 * 60 * 60 * 4,
    consultationStatus: "appointment-confirmed",
    consultationRequestedAt: Date.now() - 1000 * 60 * 60 * 3,
    doctorReviewStatus: "reviewed",
    doctorReviewedAt: Date.now() - 1000 * 60 * 60 * 2,
    doctorReviewerName: "Dr. A. Sharma, MO",
    doctorInternalNotes: "Mild early presentation. No signs of acute inflammation. Quadriceps strength normal on physical screening.",
    doctorPatientFeedback: "Symptoms are mild and short in duration. Regular walking and quadriceps strengthening exercises recommended. Schedule follow-up if discomfort persists beyond 4 weeks.",
    doctorFollowUpRecommendation: "Routine joint health monitoring & light exercise",
    doctorAppointmentDetails: "Community PHC Room 3 · Next Tuesday at 10:30 am",
  },
];

export const DURATION_LABELS: Record<string, string> = {
  "under-2-weeks": "less than 2 weeks",
  "2-4-weeks": "2–4 weeks",
  "1-3-months": "1–3 months",
  "over-3-months": "over 3 months",
  "not-checked": "not checked",
};

export const STIFFNESS_LABELS: Record<string, string> = {
  none: "no stiffness",
  "under-30": "less than 30 minutes",
  "over-30": "30 minutes or more",
  "not-checked": "not checked",
};

export const MOBILITY_LABELS: Record<string, string> = {
  no: "not affected",
  some: "affected a little",
  significant: "affected quite a bit",
  "not-checked": "not checked",
};

export function emptyForm(): FormValues {
  return { ...initialForm };
}

export function sanitizeText(value: unknown, maxLength = 60): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>?/gm, "")
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function calculateBMI(weightKg: unknown, heightCm: unknown): number | null {
  const weight = typeof weightKg === "number" ? weightKg : Number(weightKg);
  const height = typeof heightCm === "number" ? heightCm : Number(heightCm);
  if (
    isNaN(weight) ||
    isNaN(height) ||
    !isFinite(weight) ||
    !isFinite(height) ||
    weight <= 0 ||
    height <= 0 ||
    weight < 20 ||
    weight > 350 ||
    height < 50 ||
    height > 260
  ) {
    return null;
  }
  const heightInMeters = height / 100;
  const bmi = weight / (heightInMeters * heightInMeters);
  return isFinite(bmi) ? Math.round(bmi * 10) / 10 : null;
}

export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);
  // Prevent spreadsheet formula injection for values beginning with =, +, -, @, \t, \r
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function exportRecordsToCsv(records: Screening[]): string {
  const headers = [
    "Reference ID",
    "Profile Name",
    "Age",
    "District",
    "Joint",
    "Score",
    "Risk Band",
    "Screening Date",
    "Assessment Completeness",
    "Contributing Factors",
    "Absent Findings",
    "Unassessed Factors",
    "Gait Assessment Status",
    "Gait Movement Summary",
    "Sharing Status",
    "Consultation Status",
    "Doctor Review Status",
    "Doctor Follow-Up Recommendation",
    "Urgent Safety Guidance",
  ];

  const lines = [headers.map(escapeCsvField).join(",")];

  for (const record of records) {
    const completeness =
      typeof record.assessedCount === "number" && typeof record.totalQuestions === "number"
        ? `${record.assessedCount}/${record.totalQuestions} assessed`
        : "Standard assessment";

    const gaitStatus = record.gaitAssessment ? record.gaitAssessment.status : "Not performed";
    const gaitSummary =
      record.gaitAssessment && record.gaitAssessment.status === "completed"
        ? `Cadence: ${record.gaitAssessment.features.cadence?.value ?? "N/A"} steps/min | Symmetry: ${record.gaitAssessment.features.stepSymmetry?.value ?? "N/A"} | Flexion ROM: ${record.gaitAssessment.features.activeKneeFlexionRange?.value ?? "N/A"} deg`
        : "None";

    const row = [
      record.id,
      record.name,
      record.age,
      record.district,
      record.joint,
      record.score,
      record.band,
      record.date,
      completeness,
      Array.isArray(record.contributingFactors) && record.contributingFactors.length > 0
        ? record.contributingFactors.join(" | ")
        : Array.isArray(record.markers)
          ? record.markers.join(" | ")
          : "",
      Array.isArray(record.absentFactors) && record.absentFactors.length > 0
        ? record.absentFactors.join(" | ")
        : "None recorded",
      Array.isArray(record.unassessedFactors) && record.unassessedFactors.length > 0
        ? record.unassessedFactors.join(" | ")
        : "None (all assessed)",
      gaitStatus,
      gaitSummary,
      record.sharingStatus || "not-shared",
      record.consultationStatus || "not-requested",
      record.doctorReviewStatus || "awaiting-review",
      record.doctorFollowUpRecommendation || "None recorded",
      record.urgentCareNotice?.hasRedFlags ? record.urgentCareNotice.flags.join(" | ") : "Standard precautions",
    ];
    lines.push(row.map(escapeCsvField).join(","));
  }

  return lines.join("\r\n");
}

export function validateScreeningInput(
  form: FormValues,
  consent: boolean
): { isValid: boolean; error?: string } {
  const age = Number(form.age);
  if (!form.age.trim() || !Number.isInteger(age) || age < 18 || age > 110) {
    return {
      isValid: false,
      error: "Please enter an age between 18 and 110 years.",
    };
  }
  if (!form.district || form.district === "Choose a district" || !form.joint || !form.painDuration || !form.stiffness || !form.mobility) {
    return {
      isValid: false,
      error: "Please complete each required field before generating the screening summary.",
    };
  }
  if (
    form.painLevel === undefined ||
    isNaN(form.painLevel) ||
    form.painLevel < 0 ||
    form.painLevel > 10
  ) {
    return {
      isValid: false,
      error: "Please provide a valid pain or discomfort rating between 0 and 10.",
    };
  }
  if (!consent) {
    return {
      isValid: false,
      error: "Please confirm that the person understands this is a voluntary, non-diagnostic screening.",
    };
  }
  return { isValid: true };
}

export function calculateRiskScore(values: Partial<FormValues>): number {
  let score = 0;
  const age = Number(values.age);
  if (Number.isInteger(age) && age >= 18 && age <= 110) {
    if (age >= 60) score += 25;
    else if (age >= 45) score += 15;
    else if (age >= 35) score += 7;
  }

  // Symptom duration
  if (values.painDuration === "over-3-months") score += 20;
  else if (values.painDuration === "1-3-months") score += 13;
  else if (values.painDuration === "2-4-weeks") score += 7;

  // Discomfort level
  const painLevel = Number(values.painLevel);
  if (Number.isFinite(painLevel)) {
    if (painLevel >= 7) score += 15;
    else if (painLevel >= 4) score += 9;
    else if (painLevel >= 1) score += 4;
  }

  // Stiffness
  if (values.stiffness === "over-30") score += 12;
  else if (values.stiffness === "under-30") score += 6;

  // Mobility
  if (values.mobility === "significant") score += 14;
  else if (values.mobility === "some") score += 8;

  // Risk factors: ONLY explicitly reported positive answers add risk points
  if (values.previousInjury === true) score += 10;
  if (values.familyHistory === true) score += 7;
  if (values.repeatedLoad === true) score += 7;

  return Math.min(score, 100);
}

export function getRiskBand(score: number): RiskBand {
  if (score >= 60) return "More markers";
  if (score >= 32) return "Some markers";
  return "Lower markers";
}

export interface UrgentCareNotice {
  hasRedFlags: boolean;
  flags: string[];
  guidance: string;
}

export function checkUrgentCareGuidance(values: Partial<FormValues>): UrgentCareNotice {
  const flags: string[] = [];
  const pain = Number(values.painLevel);

  if (Number.isFinite(pain) && pain >= 9) {
    flags.push("Very high discomfort rating reported (9 or 10 out of 10).");
  }

  if (values.mobility === "significant" && (values.painDuration === "over-3-months" || (Number.isFinite(pain) && pain >= 8))) {
    flags.push("Severe daily functional impairment combined with intense or long-standing discomfort.");
  }

  if (values.hasHotRedJointFever === true) {
    flags.push("Hot or red joint accompanied by fever reported (concerning for acute inflammation or joint infection).");
  }

  if (values.hasSuddenSeverePainSwelling === true) {
    flags.push("Sudden, severe acute joint pain or rapid swelling reported.");
  }

  if (values.hasInabilityToBearWeight === true) {
    flags.push("Inability to bear weight on the joint following an acute injury.");
  }

  if (flags.length > 0) {
    return {
      hasRedFlags: true,
      flags,
      guidance:
        "Important medical notice: If experiencing unmanageable pain, a hot or markedly red joint with fever, sudden inability to bear weight, or visible deformity, prompt evaluation by a medical doctor at a primary health centre (PHC) or hospital emergency is advised.",
    };
  }

  return {
    hasRedFlags: false,
    flags: [],
    guidance:
      "General guidance: For ongoing or changing joint symptoms, consult a qualified primary care clinician for examination, lifestyle adaptations, and evidence-based non-pharmacological care.",
  };
}

export interface EvaluationResult {
  score: number;
  band: RiskBand;
  markers: string[];
  contributingFactors: string[];
  absentFactors: string[];
  unassessedFactors: string[];
  assessedCount: number;
  totalQuestions: number;
  isPreliminaryDueToMissingData: boolean;
  bmi: number | null;
  urgentCareNotice: UrgentCareNotice;
}

export function evaluateScreening(form: FormValues): EvaluationResult {
  const score = calculateRiskScore(form);
  const band = getRiskBand(score);

  const contributing: string[] = [];
  const absent: string[] = [];
  const unassessed: string[] = [];
  let assessedCount = 0;
  const totalQuestions = 8;

  const age = Number(form.age);
  if (Number.isInteger(age) && age >= 18) {
    assessedCount++;
    if (age >= 45) {
      contributing.push(`Age recorded: ${age} years.`);
    } else {
      absent.push(`Age recorded: ${age} years.`);
    }
  } else {
    unassessed.push("Age: not validly recorded.");
  }

  // Pain duration
  if (form.painDuration === "over-3-months" || form.painDuration === "1-3-months" || form.painDuration === "2-4-weeks") {
    assessedCount++;
    contributing.push(`Joint symptoms have lasted ${DURATION_LABELS[form.painDuration]}.`);
  } else if (form.painDuration === "under-2-weeks") {
    assessedCount++;
    absent.push("Joint symptoms have lasted less than 2 weeks.");
  } else {
    unassessed.push("Joint symptom duration: not checked.");
  }

  // Pain level
  if (form.painLevel >= 1) {
    assessedCount++;
    contributing.push(`Discomfort rating: ${form.painLevel} out of 10.`);
  } else if (form.painLevel === 0) {
    assessedCount++;
    absent.push("Discomfort rating: 0 out of 10.");
  } else {
    unassessed.push("Discomfort rating: not checked.");
  }

  // Stiffness
  if (form.stiffness === "over-30" || form.stiffness === "under-30") {
    assessedCount++;
    contributing.push(`Stiffness after rest: ${STIFFNESS_LABELS[form.stiffness]}.`);
  } else if (form.stiffness === "none") {
    assessedCount++;
    absent.push("Stiffness after rest: no stiffness.");
  } else {
    unassessed.push("Stiffness after rest: not checked.");
  }

  // Mobility
  if (form.mobility === "significant" || form.mobility === "some") {
    assessedCount++;
    contributing.push(`Everyday activities: ${MOBILITY_LABELS[form.mobility]}.`);
  } else if (form.mobility === "no") {
    assessedCount++;
    absent.push("Everyday activities: not affected.");
  } else {
    unassessed.push("Everyday activities: not checked.");
  }

  // Previous injury
  if (form.previousInjury === true) {
    assessedCount++;
    contributing.push("Previous joint injury: reported.");
  } else if (form.previousInjury === false) {
    assessedCount++;
    absent.push("Previous joint injury: not reported.");
  } else if (form.previousInjury === NOT_CHECKED) {
    unassessed.push("Previous joint injury: not checked.");
  } else {
    unassessed.push("Previous joint injury: unanswered.");
  }

  // Family history
  if (form.familyHistory === true) {
    assessedCount++;
    contributing.push("Family history of joint problems: reported.");
  } else if (form.familyHistory === false) {
    assessedCount++;
    absent.push("Family history of joint problems: not reported.");
  } else if (form.familyHistory === NOT_CHECKED) {
    unassessed.push("Family history of joint problems: not checked.");
  } else {
    unassessed.push("Family history of joint problems: unanswered.");
  }

  // Repeated load
  if (form.repeatedLoad === true) {
    assessedCount++;
    contributing.push("Frequent heavy or repetitive activity: reported.");
  } else if (form.repeatedLoad === false) {
    assessedCount++;
    absent.push("Frequent heavy or repetitive activity: not reported.");
  } else if (form.repeatedLoad === NOT_CHECKED) {
    unassessed.push("Frequent heavy or repetitive activity: not checked.");
  } else {
    unassessed.push("Frequent heavy or repetitive activity: unanswered.");
  }

  // Safety screening questions
  if (form.hasHotRedJointFever === true) {
    contributing.push("Hot or red joint with fever: reported.");
  } else if (form.hasHotRedJointFever === false) {
    absent.push("Hot or red joint with fever: not reported.");
  } else if (form.hasHotRedJointFever === NOT_CHECKED) {
    unassessed.push("Hot or red joint with fever: not checked.");
  } else if (form.hasHotRedJointFever === PREFER_NOT_TO_ANSWER) {
    unassessed.push("Hot or red joint with fever: preferred not to answer.");
  }

  if (form.hasSuddenSeverePainSwelling === true) {
    contributing.push("Sudden severe pain or swelling: reported.");
  } else if (form.hasSuddenSeverePainSwelling === false) {
    absent.push("Sudden severe pain or swelling: not reported.");
  } else if (form.hasSuddenSeverePainSwelling === NOT_CHECKED) {
    unassessed.push("Sudden severe pain or swelling: not checked.");
  } else if (form.hasSuddenSeverePainSwelling === PREFER_NOT_TO_ANSWER) {
    unassessed.push("Sudden severe pain or swelling: preferred not to answer.");
  }

  if (form.hasInabilityToBearWeight === true) {
    contributing.push("Inability to bear weight after injury: reported.");
  } else if (form.hasInabilityToBearWeight === false) {
    absent.push("Inability to bear weight after injury: not reported.");
  } else if (form.hasInabilityToBearWeight === NOT_CHECKED) {
    unassessed.push("Inability to bear weight after injury: not checked.");
  } else if (form.hasInabilityToBearWeight === PREFER_NOT_TO_ANSWER) {
    unassessed.push("Inability to bear weight after injury: preferred not to answer.");
  }

  // Standard legacy markers list for clean display
  const legacyPreviousLabel =
    form.previousInjury === true
      ? "reported"
      : form.previousInjury === false
        ? "not reported"
        : form.previousInjury === NOT_CHECKED
          ? "not checked"
          : "unanswered";
  const legacyFamilyLabel =
    form.familyHistory === true
      ? "reported"
      : form.familyHistory === false
        ? "not reported"
        : form.familyHistory === NOT_CHECKED
          ? "not checked"
          : "unanswered";
  const legacyLoadLabel =
    form.repeatedLoad === true
      ? "reported"
      : form.repeatedLoad === false
        ? "not reported"
        : form.repeatedLoad === NOT_CHECKED
          ? "not checked"
          : "unanswered";

  const legacyMarkers = [
    `Age recorded: ${form.age} years.`,
    `Joint symptoms have lasted ${DURATION_LABELS[form.painDuration] ?? "not checked"}.`,
    `Discomfort rating: ${form.painLevel} out of 10.`,
    `Stiffness after rest: ${STIFFNESS_LABELS[form.stiffness] ?? "not checked"}.`,
    `Everyday activities: ${MOBILITY_LABELS[form.mobility] ?? "not checked"}.`,
    `Previous joint injury: ${legacyPreviousLabel}.`,
    `Family history of joint problems: ${legacyFamilyLabel}.`,
    `Frequent heavy or repetitive activity: ${legacyLoadLabel}.`,
  ];

  const isPreliminaryDueToMissingData = unassessed.length >= 3;
  const bmi = calculateBMI(form.weightKg, form.heightCm);
  const urgentCareNotice = checkUrgentCareGuidance(form);

  return {
    score,
    band,
    markers: legacyMarkers,
    contributingFactors: contributing,
    absentFactors: absent,
    unassessedFactors: unassessed,
    assessedCount,
    totalQuestions,
    isPreliminaryDueToMissingData,
    bmi,
    urgentCareNotice,
  };
}

const VALID_JOINTS = new Set(["Knee", "Hip", "Hand", "Other"]);
const VALID_BANDS = new Set(["Lower markers", "Some markers", "More markers"]);

export function isRecordFromToday(record: { date: string; timestamp?: number }): boolean {
  if (typeof record.timestamp === "number" && !isNaN(record.timestamp)) {
    const recordDate = new Date(record.timestamp);
    const today = new Date();
    return (
      recordDate.getDate() === today.getDate() &&
      recordDate.getMonth() === today.getMonth() &&
      recordDate.getFullYear() === today.getFullYear()
    );
  }
  return typeof record.date === "string" && record.date.startsWith("Today");
}

export function calculateDashboardStats(screenings: Screening[]): {
  total: string;
  today: string;
  followup: string;
} {
  const now = new Date();
  const todayDay = now.getDate();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();

  let today = 0;
  let followup = 0;
  const len = screenings.length;

  for (let i = 0; i < len; i++) {
    const record = screenings[i];
    const ts = record.timestamp;
    if (typeof ts === "number" && !isNaN(ts)) {
      const d = new Date(ts);
      if (
        d.getDate() === todayDay &&
        d.getMonth() === todayMonth &&
        d.getFullYear() === todayYear
      ) {
        today++;
      } else if (typeof record.date === "string" && record.date.startsWith("Today")) {
        today++;
      }
    } else if (typeof record.date === "string" && record.date.startsWith("Today")) {
      today++;
    }

    if (record.band === "More markers") {
      followup++;
    }
  }

  return {
    today: String(today).padStart(2, "0"),
    followup: String(followup).padStart(2, "0"),
    total: String(len).padStart(2, "0"),
  };
}

export function generateStableId(existingRecords: Screening[]): string {
  const maxNumber = existingRecords.reduce((max, item) => {
    if (typeof item.id !== "string") return max;
    const match = item.id.match(/\d+/);
    const num = match ? parseInt(match[0], 10) : 0;
    return Math.max(max, isNaN(num) ? 0 : num);
  }, 248);
  return `OS-${String(maxNumber + 1).padStart(4, "0")}`;
}

export function clearDemoScreenings(records: Screening[]): Screening[] {
  return records.filter((r) => !r.isDemo);
}

export function restoreDemoScreenings(records: Screening[]): Screening[] {
  const existingIds = new Set(records.map((r) => r.id));
  const newDemos = sampleScreenings.filter((s) => !existingIds.has(s.id));
  return [...records, ...newDemos];
}

export function shareScreeningWithConsent(record: Screening): Screening {
  return {
    ...record,
    sharingStatus: "shared",
    sharingConsentGivenAt: Date.now(),
    sharingWithdrawnAt: null,
    updatedAt: Date.now(),
  };
}

export function withdrawSharingConsent(record: Screening): Screening {
  return {
    ...record,
    sharingStatus: "withdrawn",
    sharingWithdrawnAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function requestConsultation(record: Screening, notes?: string): Screening {
  return {
    ...record,
    consultationStatus: "requested",
    consultationRequestedAt: Date.now(),
    consultationNotes: notes ? sanitizeText(notes, 200) : null,
    updatedAt: Date.now(),
  };
}

export interface DoctorReviewInput {
  doctorReviewerName: string;
  doctorInternalNotes: string;
  doctorPatientFeedback: string;
  doctorFollowUpRecommendation: string;
  markAsReviewed: boolean;
  consultationStatus?: ConsultationStatus;
  doctorAppointmentDetails?: string;
}

export function recordDoctorReview(record: Screening, input: DoctorReviewInput): Screening {
  const isReviewed = input.markAsReviewed || record.doctorReviewStatus === "reviewed";
  const apptDetails = input.doctorAppointmentDetails ? sanitizeText(input.doctorAppointmentDetails, 200) : record.doctorAppointmentDetails;
  let consultStatus = input.consultationStatus || record.consultationStatus || "not-requested";
  // Prevent falsely marking appointment as confirmed without scheduling details
  if (consultStatus === "appointment-confirmed" && (!apptDetails || !apptDetails.trim())) {
    consultStatus = record.consultationStatus === "appointment-confirmed" ? "appointment-confirmed" : "requested";
  }

  return {
    ...record,
    doctorReviewStatus: isReviewed ? "reviewed" : "awaiting-review",
    doctorReviewedAt: isReviewed ? (record.doctorReviewedAt || Date.now()) : null,
    doctorReviewerName: sanitizeText(input.doctorReviewerName, 80) || "Attending Clinician",
    doctorInternalNotes: sanitizeText(input.doctorInternalNotes, 500),
    doctorPatientFeedback: sanitizeText(input.doctorPatientFeedback, 500),
    doctorFollowUpRecommendation: input.doctorFollowUpRecommendation || "Routine joint health follow-up",
    consultationStatus: consultStatus,
    doctorAppointmentDetails: apptDetails || null,
    updatedAt: Date.now(),
  };
}

export function loadStoredScreenings(): Screening[] {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return sampleScreenings;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return sampleScreenings;
    const parsed = JSON.parse(raw);
    const recordsArray = Array.isArray(parsed)
      ? parsed
      : (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as any).records))
        ? (parsed as any).records
        : null;

    if (recordsArray) {
      if (recordsArray.length === 0) return [];
      return recordsArray
        .filter((item: unknown): item is Record<string, any> => typeof item === "object" && item !== null)
        .map((record: Record<string, any>) => {
        const sanitizedId = typeof record.id === "string" && record.id.trim() ? record.id : generateStableId([]);
        const score = typeof record.score === "number" && !isNaN(record.score) ? Math.min(100, Math.max(0, record.score)) : 0;
        const band = record.band && VALID_BANDS.has(record.band) ? record.band : getRiskBand(score);

        return {
          id: sanitizedId,
          name: typeof record.name === "string" ? sanitizeText(record.name) : "Anonymised",
          age: typeof record.age === "number" && !isNaN(record.age) ? record.age : 50,
          district: typeof record.district === "string" ? record.district : "Other",
          joint: (record.joint && VALID_JOINTS.has(record.joint) ? record.joint : "Other") as Joint,
          score,
          band,
          markers: Array.isArray(record.markers)
            ? record.markers.filter((m): m is string => typeof m === "string")
            : [],
          date: typeof record.date === "string" ? record.date : "Today",
          timestamp: typeof record.timestamp === "number" ? record.timestamp : Date.now(),
          updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : undefined,
          isDemo: Boolean(record.isDemo),
          formAnswers: record.formAnswers,
          contributingFactors: Array.isArray(record.contributingFactors) ? record.contributingFactors : undefined,
          absentFactors: Array.isArray(record.absentFactors) ? record.absentFactors : undefined,
          unassessedFactors: Array.isArray(record.unassessedFactors) ? record.unassessedFactors : undefined,
          assessedCount: typeof record.assessedCount === "number" ? record.assessedCount : undefined,
          totalQuestions: typeof record.totalQuestions === "number" ? record.totalQuestions : undefined,
          bmi: typeof record.bmi === "number" ? record.bmi : undefined,
          urgentCareNotice: record.urgentCareNotice,
          gaitAssessment: record.gaitAssessment,
          manualGaitObservations: record.manualGaitObservations,
          sharingStatus:
            record.sharingStatus === "shared" || record.sharingStatus === "withdrawn"
              ? record.sharingStatus
              : "not-shared",
          sharingConsentGivenAt:
            typeof record.sharingConsentGivenAt === "number" ? record.sharingConsentGivenAt : null,
          sharingWithdrawnAt:
            typeof record.sharingWithdrawnAt === "number" ? record.sharingWithdrawnAt : null,
          consultationStatus:
            record.consultationStatus === "requested" ||
            record.consultationStatus === "appointment-confirmed" ||
            record.consultationStatus === "completed" ||
            record.consultationStatus === "cancelled"
              ? record.consultationStatus
              : "not-requested",
          consultationRequestedAt:
            typeof record.consultationRequestedAt === "number" ? record.consultationRequestedAt : null,
          consultationNotes:
            typeof record.consultationNotes === "string" ? sanitizeText(record.consultationNotes, 200) : null,
          doctorReviewStatus:
            record.doctorReviewStatus === "reviewed" ? "reviewed" : "awaiting-review",
          doctorReviewedAt:
            typeof record.doctorReviewedAt === "number" ? record.doctorReviewedAt : null,
          doctorReviewerName:
            typeof record.doctorReviewerName === "string" ? sanitizeText(record.doctorReviewerName, 80) : null,
          doctorInternalNotes:
            typeof record.doctorInternalNotes === "string" ? sanitizeText(record.doctorInternalNotes, 500) : null,
          doctorPatientFeedback:
            typeof record.doctorPatientFeedback === "string" ? sanitizeText(record.doctorPatientFeedback, 500) : null,
          doctorFollowUpRecommendation:
            typeof record.doctorFollowUpRecommendation === "string" ? record.doctorFollowUpRecommendation : null,
          doctorAppointmentDetails:
            typeof record.doctorAppointmentDetails === "string" ? sanitizeText(record.doctorAppointmentDetails, 200) : null,
          bmdTScore: typeof record.bmdTScore === "string" ? record.bmdTScore : undefined,
          bmdSite: typeof record.bmdSite === "string" ? record.bmdSite : undefined,
          bmdDate: typeof record.bmdDate === "string" ? record.bmdDate : undefined,
        };
      });
    }
  } catch {
    // Fallback on storage access failure
  }
  return sampleScreenings;
}

export function saveStoredScreenings(records: Screening[], preSerialized?: string): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const payload = preSerialized !== undefined ? preSerialized : JSON.stringify(records);
    localStorage.setItem(STORAGE_KEY, payload);
    return true;
  } catch {
    // Non-blocking quota or security error handling
    return false;
  }
}
