export type Page = "overview" | "screening" | "records";
export type Joint = "Knee" | "Hip" | "Hand" | "Other";
export type RiskBand = "Lower markers" | "Some markers" | "More markers";
export type TriStateAnswer = boolean | "not-checked" | "unanswered";

export const NOT_CHECKED = "not-checked" as const;
export const UNANSWERED = "unanswered" as const;
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
}

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
  ];

  const lines = [headers.map(escapeCsvField).join(",")];

  for (const record of records) {
    const completeness =
      typeof record.assessedCount === "number" && typeof record.totalQuestions === "number"
        ? `${record.assessedCount}/${record.totalQuestions} assessed`
        : "Standard assessment";

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
  };
}

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
  let today = 0;
  let followup = 0;
  for (let i = 0; i < screenings.length; i++) {
    const record = screenings[i];
    if (isRecordFromToday(record)) today++;
    if (record.band === "More markers") followup++;
  }
  return {
    today: String(today).padStart(2, "0"),
    followup: String(followup).padStart(2, "0"),
    total: String(screenings.length).padStart(2, "0"),
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

export function loadStoredScreenings(): Screening[] {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return sampleScreenings;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return sampleScreenings;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const validJoints = new Set(["Knee", "Hip", "Hand", "Other"]);
      const validBands = new Set(["Lower markers", "Some markers", "More markers"]);
      return parsed.map((item: unknown) => {
        const record = item as Partial<Screening>;
        const sanitizedId = typeof record.id === "string" && record.id.trim() ? record.id : generateStableId([]);
        const score = typeof record.score === "number" && !isNaN(record.score) ? Math.min(100, Math.max(0, record.score)) : 0;
        const band = record.band && validBands.has(record.band) ? record.band : getRiskBand(score);

        return {
          id: sanitizedId,
          name: typeof record.name === "string" ? sanitizeText(record.name) : "Anonymised",
          age: typeof record.age === "number" && !isNaN(record.age) ? record.age : 50,
          district: typeof record.district === "string" ? record.district : "Other",
          joint: (record.joint && validJoints.has(record.joint) ? record.joint : "Other") as Joint,
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
        };
      });
    }
  } catch {
    // Fallback on storage access failure
  }
  return sampleScreenings;
}

export function saveStoredScreenings(records: Screening[]): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Non-blocking quota error handling
  }
}
