# OA-Sathi (ओए-साथी)

**A Community Joint Health Screening, Explainable Navigation & Clinician Triage Prototype**  
Tailored for community health workers (ASHAs/ANMs) and primary health centre (PHC) medical officers across the North Eastern Region of India.

---

> **IMPORTANT CLINICAL & REGULATORY NOTICE**  
> OA-Sathi is an **exploratory screening and care-navigation prototype** developed for hackathon demonstration and clinical workflow research.  
> - It is **NOT** a certified medical device and does **NOT** provide a clinical diagnosis of osteoarthritis or rule out joint pathology.  
> - It does **NOT** generate synthetic disease probabilities or claim clinical diagnostic accuracy.  
> - It does **NOT** replace a comprehensive clinical examination, plain radiography, synovial fluid analysis, or laboratory workup by a licensed physician.  
> - All demonstration records in this repository utilize **synthetic patient profiles**. No real patient data is stored or transmitted.

---

## 1. Project Purpose & Intended Users

In rural and hilly terrains across North East India, physical geography and limited specialist availability often delay early evaluation of chronic joint symptoms. OA-Sathi provides:
1. **Community Health Workers (ASHAs / Multi-Purpose Workers):** A guided, plain-language interview tool with localized North Eastern phrasing (Khasi, Garo, Meiteilon, Mizo, Assamese, and plain English) to systematically capture joint symptoms, functional limitations, red flags, and optional physical observations.
2. **Community Participants / Patients:** Transparent, non-stigmatizing feedback that explains what factors contributed to their preliminary wear summary, isolates laboratory values (like bone density), and empowers explicit consent before sharing with a clinician.
3. **Primary Care Clinicians (Medical Officers at PHCs/CHCs):** A dedicated triage review portal to inspect submitted patient responses, review red flags, document internal clinical impressions, provide patient-facing guidance, and coordinate follow-up without false appointment confirmations.

---

## 2. Implemented Features

### End-to-End Patient Journey
- **Guided Intake:** Captures essential demographics (age 18–110, district, joint), symptom duration, discomfort intensity (0–10 scale), morning stiffness, and everyday functional limitations.
- **Separate Safety / Red-Flag Screening:** Explicitly checks for hot/red joints with fever, sudden acute swelling, and inability to bear weight after a fall. Flagged symptoms immediately trigger high-priority urgent medical advisory notices without artificially distorting the musculoskeletal wear score.
- **Explainable Heuristic Summary:** Transparent rule-based breakdown distinguishing contributing factors, absent findings, and unassessed items (unassessed factors are never treated as negative evidence).
- **Clinical Laboratory Isolation:** BMD (Bone Mineral Density) T-scores and scan sites are strictly treated as optional, externally measured laboratory DXA/QUS values. BMD is **never** estimated, predicted, or inferred from questionnaires, BMI, age, or video.
- **Patient Sharing Consent:** Patient records are private by default (`"not-shared"`). Sharing with clinicians requires an explicit consent action (`"shared"`), which can be withdrawn at any time (`"withdrawn"`).
- **Care Navigation & Doctor Consultation:** Allows submitting a consultation request with optional clinical notes. Shows live appointment status and displays patient-intended doctor guidance once reviewed.
- **Printable Medical Screening Report:** Clean, multi-section clinical summary formatted for A4 printing and browser `Save as PDF` (`window.print()`). Automatically strips web navigation and interactive buttons. Unreviewed reports display a prominent warning banner.

### Doctor Clinical Review Journey
- **Doctor Demo Portal (`/doctor`):** Role-tailored interface clearly labelled for clinical triage demonstration.
- **Strict Access Control:** Enforces patient consent—only submissions with active sharing consent (`sharingStatus === "shared"`) are accessible to clinicians. Withdrawn or private records are inaccessible.
- **Clinical Inspection Workspace:** Clinicians review original submitted answers, functional impact, safety flags, and exploratory gait kinematics.
- **Dual Note Architecture:** Clinicians record **confidential internal notes** (private to clinicians) and **patient-facing guidance** (deliberately written for the patient's summary and report).
- **Follow-Up & Scheduling Safeguards:** Prevents false appointment confirmations by requiring explicit appointment date, time, and clinic facility details before marking an appointment confirmed.
- **Full In-Place Persistence:** Updates synchronize immediately across patient summaries, records tables, and printable reports without modifying the patient's original submitted answers.

### Movement & Computer Vision Features
- **Client-Side MediaPipe Pose Estimation:** 33-landmark pose tracking running entirely in the browser with real-time skeleton overlay.
- **Exploratory Movement Features:** Computes step cadence, bilateral step symmetry, active knee flexion range of motion, and coronal trunk sway.
- **Observational Fallback:** Manual visual observation inputs (visible limp, chair-rise hesitancy, turning hesitancy, joint crepitus) ensure field workers can assess mobility even if camera hardware is unavailable or lighting is poor.
- **Quality Assurance & Safety:** Tracks visibility thresholds and usable frames; cleanly releases camera media tracks when leaving the screening page or when the application is backgrounded.

### Accessibility & Regional Personalization
- **High Contrast Theme:** Dedicated toggle in Settings providing sharpened borders and deepened contrast for outdoor sunlight readability.
- **Regional Phrasing Aid:** North Eastern terminology glossaries supporting Khasi, Garo, Meiteilon (Manipuri), Mizo, and Assamese clinical phrasing aids.
- **Session Records & Data Management:** Full CSV export with formula injection protection and Phase 7 workflow audit columns (`Sharing Status`, `Consultation Status`, `Doctor Review Status`, `Doctor Follow-Up Recommendation`, `Urgent Safety Guidance`).

---

## 3. Installation & Run Commands

### Prerequisites
- Node.js 18+ (tested with Node 20 / 22)
- Python 3.10+ (for optional backend gait pipeline services)

### Frontend Web Application
```sh
# Install dependencies
npm install

# Start local development server
npm run dev

# Run automated tests
npm test

# Build production bundle
npm run build
```

### Optional Python Backend Service
```sh
# Navigate to project root
cd d:\PROJECTS\Hackathon

# Install backend dependencies
pip install -r backend/requirements.txt

# Run backend unit tests
python -m unittest backend.test_gait_pipeline

# Start FastAPI backend server
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

---

## 4. Test Verification & Actual Results

All automated test suites execute deterministically without external network calls:

```
> npm test

▶ OA-Sathi Movement Feature Evaluation & Quality Indicator Test Suite
  ✔ 1. Valid landmark sequences produce valid exploratory features with correct units (3.6ms)
  ✔ 2. Missing landmarks are preserved as null/unavailable, NOT coerced to zero (0.16ms)
  ✔ 3. Invalid coordinates (NaN, Infinity, out-of-bounds) are strictly rejected (0.10ms)
  ✔ 4. Low-visibility landmarks (< 0.35) are marked invalid with clear reason (0.12ms)
  ✔ 5. Empty input (0 frames) is handled safely without throwing (0.14ms)
  ✔ 6. Too few usable frames is flagged with informative technical quality status (0.21ms)
  ✔ 7. Invalid or non-monotonic timestamps are caught and marked unusable (0.30ms)
  ✔ 8. Incorrect or missing units are avoided across all movement features (0.96ms)
  ✔ 9. Feature calculation is strictly deterministic for identical inputs (1.37ms)
  ✔ 10. Frame with no person detected is rejected and counted appropriately (0.20ms)
✔ OA-Sathi Movement Feature Evaluation & Quality Indicator Test Suite (8.2ms)

▶ OA-Sathi Data Correctness & Integrity Test Suite
  ✔ 1. Distinguishes between Yes, No, Not checked, and Unanswered across all fields (1.49ms)
  ✔ 2. Missing values are not counted as negative/protective answers (0.14ms)
  ✔ 3. Produces identical deterministic score, band, and factors for identical inputs (0.55ms)
  ✔ 4. Form validation rejects invalid numeric inputs and boundaries (0.29ms)
  ✔ 5. BMI calculated strictly when valid height and weight measurements are provided (0.12ms)
  ✔ 6. Generates stable sequential unique IDs without random collisions (0.30ms)
  ✔ 7. Updating an existing record preserves ID and updates content in-place (0.17ms)
  ✔ 8. Simulates JSON serialization and re-parsing with schema integrity (0.17ms)
  ✔ 9. Backward-compatible reading of legacy records missing newer fields (0.91ms)
  ✔ 10. Dashboard calculations accurately reflect record count, today count, and followup count (0.18ms)
  ✔ 11. Properly escapes special characters (commas, quotes, newlines) in CSV output (0.15ms)
  ✔ 12. Sanitizes formula injection characters (=, +, -, @, \t) in CSV exports (0.13ms)
  ✔ 13. Distinguishes incomplete or omitted questions from normal outcomes (0.11ms)
  ✔ 14. Identifies severe red-flag symptoms and supplies non-diagnostic urgent care guidance (0.20ms)
  ✔ 15. Distinguishes synthetic demo data from real records and clears/restores safely (0.18ms)
  ✔ 16. AI model boundary provides transparent non-connected status and zero external data leaks (0.16ms)
  ✔ 17. Gait analysis service provides structured boundary without fabricating kinematics (0.12ms)
  ✔ 18. Regional terminology glossary provides accurate local terms and defaults safely to English (0.09ms)
  ✔ 19. Benchmark gait analysis returns structured schema with defensible exploratory movement metrics (27.1ms)
  ✔ 20. Missing or unobservable movement features remain null and invalid rather than zero (0.16ms)
  ✔ 21. Manual visual gait observations persist independently of automated tracking (0.09ms)
  ✔ 22. Associates movement assessment with participant record and survives JSON persistence (1.94ms)
  ✔ 23. CSV export includes Gait Assessment Status and Gait Movement Summary columns (1.20ms)
  ✔ 24. getGaitAnalysisStatus returns appropriate status banners for all pipeline states (0.24ms)
  ✔ 25. Settings storage loads schema-validated defaults and safely recovers from corrupt or invalid data (0.23ms)
  ✔ 26. Settings storage persists valid updates without storing credentials and safely resets (0.17ms)
  ✔ 27. Live pose estimation metrics calculator validates landmarks without false zeros (0.29ms)
  ✔ 28. Safety red flags activate urgent care guidance while keeping wear score unaffected (0.17ms)
  ✔ 29. Measured BMD is preserved independently, never inferred, and missing BMD does not break workflow (0.09ms)
  ✔ 30. Patient sharing consent transitions correctly and controls authorized doctor access (0.10ms)
  ✔ 31. Consultation requests and doctor review persist without overwriting patient answers (0.21ms)
  ✔ 32. CSV export includes Sharing, Consultation, Doctor Review, and Safety columns (0.16ms)
  ✔ 33. Malformed, corrupted JSON or non-array records in storage recover safely without crashing (0.39ms)
  ✔ 34. sanitizeText strips HTML tags and control characters to prevent XSS payloads (0.08ms)
  ✔ 35. Consultation requests do not falsely confirm appointments without scheduling details (0.08ms)
  ✔ 36. Sharing consent withdrawal immediately revokes doctor review authorization (0.08ms)
  ✔ 37. Urgent clinical red flags cannot be overridden or diluted by low routine wear score (0.11ms)
  ✔ 38. Settings persistence is isolated from screening records and does not clear assessments (0.13ms)
  ✔ 39. Input validation strictly validates required bounds and allows legitimate tri-state answers (0.12ms)
  ✔ 40. Pose landmarker disposal cleans up singleton resources safely (0.12ms)
✔ OA-Sathi Data Correctness & Integrity Test Suite (40.3ms)

Total Tests: 50 passed, 0 failed, 0 skipped.
```

```
> python -m unittest backend.test_gait_pipeline
Ran 9 tests in 0.875s: OK
```

---

## 5. Walkthrough: Patient & Doctor Demo Flow

To demonstrate the complete end-to-end integration:

### Step 1: Patient Screening & Safety Flags
1. Open the web app and click **New screening** or **Start screening**.
2. Enter participant age (e.g., `58`), select a district (`East Khasi Hills`), and select target joint (`Knee`).
3. Complete symptom questions: pain duration (`1–3 months`), discomfort rating (`6/10`), stiffness (`under 30 min`), everyday limitation (`A little`).
4. Under **Safety & Urgent Red-Flag Symptoms**, test entering `No` for fever and acute swelling, but report `Yes` for *Inability to bear weight after injury*.
5. (Optional) In **Clinical Measurements**, enter height (`162 cm`), weight (`68 kg`), and optional measured BMD T-score (`-1.8`, `Femoral Neck / Hip`). Notice that BMI is calculated automatically (`25.9 kg/m²`), while BMD remains clearly labelled as measured from DXA.
6. Check the voluntary screening consent box and click **Save screening & view summary**.
7. Observe the **Urgent clinical advisory notice** highlighting the red flag, along with the transparent list of contributing and absent factors.

### Step 2: Medical Report & Browser Print
1. Click **View & Print Medical Report (PDF)**.
2. Review the structured clinical layout: demographics, symptoms, isolated laboratory BMD, safety questions, heuristic summary, and audit status.
3. Observe the prominent badge: **`PRELIMINARY UNVALIDATED COMMUNITY SCREENING — NOT REVIEWED BY A DOCTOR`**.
4. Click **Print / Save PDF**. Notice that the topbar, sidebar, and action buttons are cleanly hidden in the print stylesheet.

### Step 3: Explicit Sharing Consent & Consultation Request
1. Return to the screening summary.
2. Under **Patient Care Navigation & Clinical Sharing**, click **Consent & Share with Doctor**.
3. Status updates to `SHARED WITH CONSENT`.
4. Click **Request Consultation**. The status updates to `REQUESTED` with a submission timestamp.

### Step 4: Doctor Portal Review & Triage
1. In the sidebar, navigate to **Doctor Demo Portal**.
2. Notice the badge shows authorized submissions.
3. Select the patient's record in the left panel.
4. Inspect the patient's actual reported answers, red-flag advisory, and measured metrics.
5. In the clinical review form:
   - Enter clinician name (`Dr. A. Sharma, MO`).
   - Add private clinician impressions under **Private Clinician Notes**.
   - Add patient-facing advice under **Patient-Facing Guidance & Advice** (e.g., *"Rest affected knee, avoid deep knee bends, apply cold compress 15 min twice daily, and attend outpatient clinic Thursday"*).
   - Select follow-up recommendation (`Outpatient clinical examination at PHC`).
   - Select consultation status `Appointment confirmed & scheduled`. Notice that appointment facility/date/time details are required to prevent false confirmations. Enter `PHC Room 2 · Next Thursday 10:30 am`.
6. Click **Save Clinical Review**.

### Step 5: Verification in Patient View
1. Return to **Screening records** or the patient's summary.
2. Open the medical report.
3. Notice the status banner is now: **`REVIEWED CLINICAL SUMMARY — Dr. A. Sharma, MO`**.
4. Confirm that the doctor's patient-facing guidance and confirmed appointment details appear in Section 7, while the doctor's confidential internal notes are **strictly withheld**.
5. Test clicking **Withdraw Sharing Consent** in the patient summary and verify that the record immediately vanishes from the Doctor Demo Portal.

---

---

## 6. Demonstration Data & Demo Accounts

- **Synthetic Records Pre-Loaded:** The prototype pre-populates three synthetic demonstration records:
  - `OS-0248` (Anonymised · 62 yrs, Knee, More markers, Sharing Consent: **Shared**, Consultation: **Requested**).
  - `OS-0247` (Anonymised · 54 yrs, Hip, Some markers, Sharing Consent: **Private / Not Shared**).
  - `OS-0246` (Anonymised · 47 yrs, Knee, Lower markers, Sharing Consent: **Shared**, Doctor Review: **Reviewed**, Appointment: **Confirmed**).
- **Demo Management in UI:**
  - Health workers can click **Clear demo data** on the Records page or Settings page to remove pre-loaded records and test real-time participant entries.
  - Health workers can click **Restore demo data** at any time to re-populate synthetic demonstration scenarios for evaluation.
- **Clinician Role Demo:** The **Doctor Clinical Review Portal** acts as the primary health centre medical officer triage workstation, showing authorized patient submissions where sharing consent is granted.

---

## 7. Security, Privacy & Storage Architecture

### Storage Model
- **Local Client-First Architecture:** The application operates primarily offline in the browser. Records and user preferences are persisted in `localStorage` (`oa_sathi_screenings_v1` and `oa_sathi_app_settings_v1`) and in-memory React state.
- **Not Encrypted Clinical Storage:** Standard browser `localStorage` is **NOT** encrypted clinical storage. It is suitable for controlled demonstration and local community health worker field triage simulations, but does not provide multi-tenant isolation, cryptographic field-level encryption, or cross-device synchronization.
- **Multi-Device Boundary:** Because storage is local, records created on one browser/device do not automatically synchronize to another device or remote clinician workstation without an authenticated cloud backend.

### Application Security Controls Implemented (Phase 8)
- **Input Sanitization & XSS Prevention:** User-provided text inputs (names, consultation notes, doctor observations, appointment details) are sanitized via `sanitizeText()`, which strips HTML tags (`<script>`, `<iframe>`, `<img>`, event attributes) and non-printable control characters.
- **Spreadsheet Formula Injection Defense:** CSV exports enforce prefix escaping—any cell value beginning with formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`) is safely quoted with a single-quote prefix.
- **Button Debouncing & In-Flight Guards:** Actions such as submitting assessments, granting/withdrawing sharing consent, submitting consultation requests, and saving doctor reviews enforce in-flight locking and debounce guards to eliminate duplicate state mutations from rapid double-clicks.
- **Anti-False-Confirmation Safeguard:** The application prevents consultation requests from being marked `appointment-confirmed` unless explicit scheduling details (date, time, clinic facility) are provided.
- **Storage Corruption Recovery:** Storage parsing filters out `null`, `undefined`, and corrupted non-object elements without throwing exceptions or deleting valid surviving records.

---

## 8. Deployment Readiness & Environment Configuration

### Environment Variables
A `.env.example` template is provided in the repository root. Real secrets or API keys must **never** be placed in client-side bundles or repository files.

| Variable Name | Default Value | Description |
| :--- | :--- | :--- |
| `VITE_GAIT_BACKEND_URL` | `http://127.0.0.1:8000` | Optional local Python/FastAPI gait pipeline service endpoint. |

### Deployment Instructions
1. **Production Build:**
   ```sh
   npm run build
   ```
   Compiles TypeScript and bundles static assets into `dist/`.
2. **Local Preview / Production Test:**
   ```sh
   npm run preview
   ```
   Serves the production bundle locally at `http://localhost:4173`.
3. **Static Web Server Deployment:**
   The `dist/` directory can be deployed to any compliant static hosting provider (e.g., Nginx, Apache, Cloudflare Pages, Vercel, or AWS S3 + CloudFront). Configure single-page application (SPA) fallback to route all non-file requests to `dist/index.html`.
4. **Security Headers Configured in `index.html`:**
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`

---

## 9. Features Remaining Experimental or Incomplete

1. **Client-Side MediaPipe Pose Tracking:** 2D monocular webcam tracking is an exploratory movement-feature demonstration (cadence, step symmetry, active flexion, coronal sway). It does **NOT** substitute for calibrated 3D multi-camera clinical gait laboratory analysis or radiographic cartilage assessment.
2. **AI Inference Subsystem Stub:** The automated machine-learning inference pipeline (`aiModelService.ts`) is currently in `"not-connected"` status. The application transparently relies on deterministic, explainable clinical heuristic screening rules.
3. **Local-Only Doctor Access Control:** The Doctor Demo Portal filters records locally based on patient consent state (`sharingStatus === "shared"`). Real-world multi-user clinical separation requires an enterprise server-side authentication system with role-based access control (RBAC).

---

## 10. Steps Required Prior to Real-World Clinical Pilot

1. **Institutional Review Board (IRB) / Ethics Committee Approval:** Formal protocol review and written informed consent procedures compliant with the Indian Council of Medical Research (ICMR) ethical guidelines.
2. **Clinical Validation Studies:** Prospective comparative validation against ACR clinical criteria and standing bilateral knee radiographs (Kellgren-Lawrence grading) across diverse primary care settings.
3. **Secure Cloud Infrastructure:** Implementation of authenticated, role-based backend architecture with ABHA (Ayushman Bharat Health Account) federated identity integration and encryption at rest and in transit.
4. **Device Compatibility & Bandwidth Audits:** Extended field validation across entry-level Android devices and low-connectivity primary health sub-centres.

---

## 11. License & Attribution

- Built as an open-source demonstration for rural community health innovation.
- Incorporates Google MediaPipe for client-side pose tracking.
- Icons by Lucide React.

