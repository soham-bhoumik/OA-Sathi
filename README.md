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

### Movement & Computer Vision Features (Phase 9: Functional Pose Estimation & Movement Evaluation)
- **Local In-Browser MediaPipe Pose Estimation:** 33-landmark pose tracking running client-side via Google MediaPipe PoseLandmarker (Lite float16 model) using WebAssembly (WASM) and WebGL/GPU execution with automatic CPU fallback.
- **Local Asset Strategy with Fallback:** Fully offline-capable using local bundled assets (`public/models/pose_landmarker_lite.task` [5.77 MB] and `public/wasm/`), with automatic fallback to jsDelivr/Google Cloud CDN if local file access is restricted.
- **Explicit Opt-In & Privacy-Preserving:** Camera access is strictly opt-in; no camera tracks are requested until the user explicitly opens the camera. No video is uploaded or transmitted to any external server.
- **Controlled Movement Observation Workflow:**
  1. *Pre-Capture Guidance:* Clear camera-positioning guidance (2–3 meters distance, waist/chest height, full body in view) and purpose explanation.
  2. *Live Observation HUD with Early Stop:* 5-second countdown timer, live elapsed progress bar, tracked frame counter, and a prominent **"Stop Early & Review"** button enabling early completion.
  3. *Pre-Save Review Panel:* Allows inspecting duration, usable frame ratio, tracking confidence, lower-extremity coordinate bounds, and derived exploratory measurements before choosing **"Attach Observation to Screening"** or **"Discard & Retest"**.
- **Direct Technical Quality Indicators:** Measures actual usable frames, observation duration (seconds), person presence ratio, mean landmark confidence (0–100%), and lower-extremity landmark coordinate bounds (min, max, mean normalized X/Y ranges and tracking visibility for Left/Right Hips, Knees, and Ankles).
- **Exploratory Derived Biomechanical Indicators:** Computes step cadence (steps/min), bilateral step symmetry index (0.0–1.0), active knee flexion range (degrees), and coronal trunk sway (degrees), each documented with required landmarks, formulas, units, assumptions, and validation limitations.
- **Strict Clinical Non-Diagnostic Boundary:** Zero movement features are claimed as clinical biomarkers. The prototype does **NOT** diagnose osteoarthritis, estimate cartilage loss, predict joint space narrowing, or measure bone mineral density (BMD). Missing poses are never treated as normal movement.
- **Observational Fallback:** The manual visual checklist (visible limp, chair-rise hesitancy, turning hesitancy, joint crepitus) remains 100% functional whether the camera is live, offline, or disabled. Camera use is completely optional and never blocks patient screening completion.

### Accessibility & Regional Personalization
- **High Contrast Theme:** Dedicated toggle in Settings providing sharpened borders and deepened contrast for outdoor sunlight readability.
- **Regional Phrasing Aid:** North Eastern terminology glossaries supporting Khasi, Garo, Meiteilon (Manipuri), Mizo, and Assamese clinical phrasing aids.
- **Session Records & Data Management:** Full CSV export with formula injection protection and Phase 7/8/9 workflow audit columns (`Sharing Status`, `Consultation Status`, `Doctor Review Status`, `Doctor Follow-Up Recommendation`, `Urgent Safety Guidance`, `Gait Assessment Status`, `Gait Movement Summary`).

---

## 3. Installation & Run Commands

### Prerequisites
- Node.js 18+ (tested with Node 20 / 22 / 24)
- Python 3.10+ (for optional backend gait pipeline services)

### Frontend Web Application
```sh
# Install dependencies
npm install

# Start local development server
npm run dev

# Run automated tests (57 tests passing)
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

# Run backend unit tests (9 tests)
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
  ✔ 1. Valid landmark sequences produce valid exploratory features with correct units (4.5ms)
  ✔ 2. Missing landmarks are preserved as null/unavailable, NOT coerced to zero (0.2ms)
  ✔ 3. Invalid coordinates (NaN, Infinity, out-of-bounds) are strictly rejected (0.1ms)
  ✔ 4. Low-visibility landmarks (< 0.35) are marked invalid with clear reason (0.1ms)
  ✔ 5. Empty input (0 frames) is handled safely without throwing (0.2ms)
  ✔ 6. Too few usable frames is flagged with informative technical quality status (0.4ms)
  ✔ 7. Invalid or non-monotonic timestamps are caught and marked unusable (0.8ms)
  ✔ 8. Incorrect or missing units are avoided across all movement features (0.7ms)
  ✔ 9. Feature calculation is strictly deterministic for identical inputs (1.5ms)
  ✔ 10. Frame with no person detected is rejected and counted appropriately (0.2ms)
  ✔ 11. Landmark coordinate summaries compute valid min, max, mean normalized bounds without inventing missing data (0.8ms)
  ✔ 12. Early-stop sequence evaluation (e.g. 2.2s / 40 frames) computes valid quality indicators (0.5ms)
  ✔ 13. Unilateral lower-limb occlusion disables bilateral symmetry while preserving active knee flexion (0.7ms)
  ✔ 14. MovementFeature interface metadata contains required technical documentation attributes (1.3ms)
  ✔ 15. Attaching movement assessment does not alter patient symptom answers, red flags, or wear score band (1.5ms)
✔ OA-Sathi Movement Feature Evaluation & Quality Indicator Test Suite (15.6ms)

▶ OA-Sathi Data Correctness & Integrity Test Suite
  ✔ 1. Distinguishes between Yes, No, Not checked, and Unanswered across all fields (1.6ms)
  ✔ 2. Missing values are not counted as negative/protective answers (0.1ms)
  ✔ 3. Produces identical deterministic score, band, and factors for identical inputs (0.6ms)
  ✔ 4. Form validation rejects invalid numeric inputs and boundaries (0.2ms)
  ✔ 5. BMI calculated strictly when valid height and weight measurements are provided (0.1ms)
  ✔ 6. Generates stable sequential unique IDs without random collisions (0.2ms)
  ✔ 7. Updating an existing record preserves ID and updates content in-place (0.2ms)
  ✔ 8. Simulates JSON serialization and re-parsing with schema integrity (0.1ms)
  ✔ 9. Backward-compatible reading of legacy records missing newer fields (0.8ms)
  ✔ 10. Dashboard calculations accurately reflect record count, today count, and followup count (0.1ms)
  ✔ 11. Properly escapes special characters (commas, quotes, newlines) in CSV output (0.1ms)
  ✔ 12. Sanitizes formula injection characters (=, +, -, @, \t) in CSV exports (0.1ms)
  ✔ 13. Distinguishes incomplete or omitted questions from normal outcomes (0.1ms)
  ✔ 14. Identifies severe red-flag symptoms and supplies non-diagnostic urgent care guidance (0.1ms)
  ✔ 15. Distinguishes synthetic demo data from real records and clears/restores safely (0.1ms)
  ✔ 16. AI model boundary provides transparent non-connected status and zero external data leaks (0.1ms)
  ✔ 17. Gait analysis service provides structured boundary without fabricating kinematics (0.1ms)
  ✔ 18. Regional terminology glossary provides accurate local terms and defaults safely to English (0.08ms)
  ✔ 19. Benchmark gait analysis returns structured schema with defensible exploratory movement metrics (25.2ms)
  ✔ 20. Missing or unobservable movement features remain null and invalid rather than zero (0.1ms)
  ✔ 21. Manual visual gait observations persist independently of automated tracking (0.09ms)
  ✔ 22. Associates movement assessment with participant record and survives JSON persistence (1.9ms)
  ✔ 23. CSV export includes Gait Assessment Status and Gait Movement Summary columns (1.2ms)
  ✔ 24. getGaitAnalysisStatus returns appropriate status banners for all pipeline states (0.3ms)
  ✔ 25. Settings storage loads schema-validated defaults and safely recovers from corrupt or invalid data (0.2ms)
  ✔ 26. Settings storage persists valid updates without storing credentials and safely resets (0.1ms)
  ✔ 27. Live pose estimation metrics calculator validates landmarks without false zeros (0.2ms)
  ✔ 28. Safety red flags activate urgent care guidance while keeping wear score unaffected (0.1ms)
  ✔ 29. Measured BMD is preserved independently, never inferred, and missing BMD does not break workflow (0.09ms)
  ✔ 30. Patient sharing consent transitions correctly and controls authorized doctor access (0.1ms)
  ✔ 31. Consultation requests and doctor review persist without overwriting patient answers (0.2ms)
  ✔ 32. CSV export includes Sharing, Consultation, Doctor Review, and Safety columns (0.1ms)
  ✔ 33. Malformed, corrupted JSON or non-array records in storage recover safely without crashing (0.3ms)
  ✔ 34. sanitizeText strips HTML tags and control characters to prevent XSS payloads (0.07ms)
  ✔ 35. Consultation requests do not falsely confirm appointments without scheduling details (0.08ms)
  ✔ 36. Sharing consent withdrawal immediately revokes doctor review authorization (0.08ms)
  ✔ 37. Urgent clinical red flags cannot be overridden or diluted by low routine wear score (0.1ms)
  ✔ 38. Settings persistence is isolated from screening records and does not clear assessments (0.1ms)
  ✔ 39. Input validation strictly validates required bounds and allows legitimate tri-state answers (0.1ms)
  ✔ 40. Pose landmarker disposal cleans up singleton resources safely (0.1ms)
✔ OA-Sathi Data Correctness & Integrity Test Suite (38.7ms)

Total Tests: 55 passed, 0 failed, 0 skipped across 2 test suites.
```

```
> python -m unittest backend.test_gait_pipeline
Ran 9 tests in 0.886s: OK
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
6. (Optional) In **Movement Assessment**, click **Record 5s walking clip**. Review the camera positioning guidance, start the observation, observe real-time landmark tracking, and either let the timer complete or click **Stop Early & Review**. In the review screen, inspect duration, usable frames, coordinate bounds, and exploratory features before clicking **Attach Observation to Screening**.
7. Check voluntary screening consent and click **Save screening & view summary**.
8. Observe the **Urgent clinical advisory notice** highlighting the red flag, alongside the independent movement observations.

### Step 2: Medical Report & Browser Print
1. Click **View & Print Medical Report (PDF)**.
2. Review structured clinical layout: demographics, symptoms, isolated laboratory BMD, safety questions, heuristic summary, movement observations, and audit status.
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

### Application Security Controls Implemented (Phase 8 & 9)
- **Zero Video Uploads:** Video frames are processed in-browser via WebAssembly; no raw video or frame data is uploaded to remote servers.
- **Pre-Save Observation Review:** Users explicitly inspect derived observations before committing them to persistent records.
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

## 9. Movement Feature Documentation & Biomechanical Limitations

The table below summarizes all technical movement measurements implemented in OA-Sathi Phase 9:

| Feature Name | Required Landmarks | Calculation Method | Units | Assumptions & Limitations | Clinically Validated? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Usable Frame Count** | Torso (11/12, 23/24) + lower limb (25, 27 or 26, 28) | Count of frames where person visibility ≥ 0.35 and lower-extremity tracking is valid. | frames | Monocular visibility drops under poor illumination or loose clothing. | Technical indicator only |
| **Observation Duration** | Strictly monotonic timestamps | `(lastTimestamp - firstTimestamp) / 1000` | seconds | Clock jitter or frame dropouts can distort temporal fidelity. | Technical indicator only |
| **Landmark Bounds** | Hips (23, 24), Knees (25, 26), Ankles (27, 28) | Min, max, mean normalized X/Y coordinates across usable frames. | norm (0–1) | 2D coordinates without depth calibration; sensitive to distance from camera. | Technical indicator only |
| **Step Cadence** | Bilateral ankles (27, 28) | Count alternating vertical ground-contact excursion peaks divided by duration in minutes. | steps/min | Assumes straight continuous walking. Foot plane occlusions cause false peaks. | **No** (Exploratory research estimate) |
| **Bilateral Step Symmetry** | Hips (23, 24) and Ankles (27, 28) | `min(meanLeftExcursion, meanRightExcursion) / max(...)` where excursion = \|ankle.x - hip.x\|. | index (0–1) | Walking must be parallel to camera plane. Diagonal path skews symmetry. | **No** (Exploratory research estimate) |
| **Active Knee Flexion Range** | Hip (23/24), Knee (25/26), Ankle (27/28) | 2D planar vector angle `acos((v1 · v2) / (|v1| \|v2\|))`; range = `max - min`. | degrees (°) | 2D projection under-represents true 3D angle during transverse rotation. | **No** (Exploratory research estimate) |
| **Coronal Trunk Sway** | Shoulders (11, 12) and Hips (23, 24) | Standard deviation of lateral trunk tilt angle `atan2(dx, -dy)` across sequence. | degrees (°) | Camera must be level. Clothing shifts landmark centers. | **No** (Exploratory research estimate) |

---

## 10. Steps Required Prior to Real-World Clinical Pilot

1. **Institutional Review Board (IRB) / Ethics Committee Approval:** Formal protocol review and written informed consent procedures compliant with the Indian Council of Medical Research (ICMR) ethical guidelines.
2. **Clinical Motion Lab Comparative Validation:** Validation of monocular 2D smartphone tracking against multi-camera Vicon/Qualisys motion capture systems and force plates.
3. **Correlation with Kellgren-Lawrence Radiographic Grading:** Multi-centre prospective comparative studies against standing AP/lateral knee radiographs to establish whether exploratory kinematic indices correlate with functional knee OA impairment.
4. **Secure Cloud Infrastructure:** Implementation of authenticated, role-based backend architecture with ABHA (Ayushman Bharat Health Account) federated identity integration and encryption at rest and in transit.
5. **Device Compatibility & Low-Bandwidth Audits:** Extended field validation across entry-level Android devices in remote sub-centres.

---

## 11. License & Attribution

- Built as an open-source demonstration for rural community health innovation.
- Incorporates Google MediaPipe for client-side pose tracking.
- Icons by Lucide React.


