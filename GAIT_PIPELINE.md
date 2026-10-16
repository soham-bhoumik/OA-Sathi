# OA-Sathi Gait Analysis & Pose Estimation Pipeline

## 1. Overview and Problem Statement

**Problem Statement:**  
*“AI-Assisted Early Detection System for Osteoarthritis (OA) Risk Markers in the North Eastern Region (NER), India.”*

The OA-Sathi movement assessment subsystem provides an objective, explainable, and local pipeline to quantify observable physical movement descriptors during short walking sequences or chair transfers. 

### Critical Responsible Healthcare Principles
1. **Exploratory, Non-Diagnostic:** Pose estimation measures observable body kinematics (e.g. cadence, stance symmetry, joint flexion angle range). It **does not** assess cartilage loss, joint space narrowing, or radiographic Kellgren-Lawrence (KL) grade, and **never** makes an OA diagnosis.
2. **Local Edge Execution:** All video processing executes locally on the user's machine (via a lightweight FastAPI backend using Google MediaPipe Pose or client benchmark). **Zero video footage, frames, or participant records are transmitted to cloud services or external APIs.**
3. **No Synthetic Measurement Fabrication:** If landmarks are occluded, out-of-frame, or tracking quality is insufficient, metrics are explicitly marked as unavailable (`isValid: false`, `value: null`) with a documented clinical reason. Missing landmarks are **never** substituted with zeros.
4. **Independent Manual Checklist:** A complete manual observational checklist (visible limping, chair-rise transfer hesitancy, turning unsteadiness, joint crepitus) remains 100% operational as a fallback even if camera hardware or pose models are offline.

---

## 2. Dependencies & Licensing

| Component | Technology | Version | License | Role |
| :--- | :--- | :--- | :--- | :--- |
| **Pose Estimation** | MediaPipe Pose Landmarker | `1.1.1` | **Apache 2.0** | Local CPU pose landmark inference (33 anatomical landmarks). |
| **Computer Vision** | OpenCV Python (`opencv-python`) | `5.0.0` | **Apache 2.0** | Video decoding, frame extraction, and downsampling. |
| **Numerical Processing** | NumPy (`numpy`) | `2.5.4` | **BSD 3-Clause** | Vector arithmetic, angular trigonometry, and signal variance. |
| **Backend Framework** | FastAPI (`fastapi`) | `0.143.2` | **MIT** | Local HTTP service with request validation & narrow CORS. |
| **ASGI Server** | Uvicorn (`uvicorn`) | `0.54.0` | **BSD 3-Clause** | Local lightweight HTTP server. |
| **Frontend Framework** | React + TypeScript + Vite | `18.3.1` / `5.4` | **MIT** | User interface, video recording, and state management. |

All dependencies are free, open-source, and permissible for academic, community screening, and prototype demonstrations without paid API subscriptions or secret keys.

---

## 3. Modular Pipeline Architecture

The gait analysis pipeline executes across 7 strictly isolated stages:

```
[Uploaded / Recorded Video]
           │
           ▼
Stage 1: Input Validation ────────► Rejects > 25MB, > 20s, or unsupported formats
           │
           ▼
Stage 2: Frame Sampling ──────────► Uniform downsampling at ~12 FPS (max 120 frames)
           │
           ▼
Stage 3: Pose Estimation ─────────► MediaPipe Pose Lite (33 landmarks per frame)
           │
           ▼
Stage 4: Quality Checks ──────────► Verifies hip, knee, and ankle visibility >= 0.40
           │
           ▼
Stage 5: Feature Extraction ──────► Cadence, step symmetry, knee ROM, trunk sway
           │
           ▼
Stage 6: Result Validation ───────► Biomechanical boundary sanity checks; keeps missing null
           │
           ▼
Stage 7: Output Serialization ────► Versioned, typed JSON response matching OA-Sathi schema
```

### Temporary File Lifecycle & Privacy
When a video file is uploaded to `POST /api/gait/analyze`:
- It is saved to an isolated temporary directory (`tempfile.mkdtemp(prefix="oa_gait_")`).
- The video is decoded frame-by-frame in RAM.
- **In a guaranteed `finally:` block, the temporary file and directory are permanently deleted from disk immediately after processing**, including on any unhandled error paths.
- Video bytes are never archived, logged, or forwarded.

---

## 4. Calculated Movement Features (Exploratory Descriptors)

| Feature | Unit | Formula / Methodology | Assumptions & Limitations | Clinical Relevance |
| :--- | :--- | :--- | :--- | :--- |
| **Step Cadence** | `steps/min` | Alternating ankle relative displacement zero-crossing rate: $(\text{steps} / \text{duration}) \times 60$. | Valid only for continuous walking sequences >= 1.5s with >= 2 stride cycles. | Reflects walking speed and gait fluidity. Slower cadence often correlates with joint stiffness or discomfort. |
| **Bilateral Step Symmetry** | `index (0–1)` | Ratio of vertical excursion variance: $\frac{\min(\sigma_{\text{left}}, \sigma_{\text{right}})}{\max(\sigma_{\text{left}}, \sigma_{\text{right}})}$. $1.0 = \text{symmetric}$. | Requires both lower limbs to be visible simultaneously. | Detects antalgic gait patterns or offloading favoring an unaffected limb. |
| **Active Knee Flexion Range** | `degrees` | 3-point angle between hip, knee, and ankle vectors: $\theta = \arccos\left(\frac{\vec{u} \cdot \vec{v}}{\|\vec{u}\| \|\vec{v}\|}\right)$. $\text{Excursion} = \max - \min$. | Computed from 2D plane projection. Most accurate in lateral/sagittal camera view; frontal view underestimates ROM. | Measures functional knee flexion excursion during the swing phase of walking. |
| **Coronal Trunk Sway** | `degrees` | Standard deviation of angle between shoulder midpoint and hip midpoint relative to vertical. | Coronal/frontal camera view required. | Measures lateral compensations (e.g. Trendelenburg gait or antalgic trunk shift). |

---

## 5. Stable Output Schema

The pipeline returns a standardized JSON structure:

```json
{
  "analysisId": "gait-7f9a2b1c4d",
  "recordId": "OS-0248",
  "status": "completed",
  "analysisMethod": "mediapipe-pose-lite",
  "modelVersion": "1.1.1",
  "inputQualityStatus": "good",
  "timestamp": 1729074800000,
  "durationSeconds": 5.4,
  "framesAnalyzed": 64,
  "usableFramesCount": 61,
  "meanLandmarkConfidence": 0.88,
  "features": {
    "cadence": {
      "name": "Step Cadence",
      "value": 104.2,
      "unit": "steps/min",
      "isValid": true,
      "isApproximation": true,
      "confidence": 0.88,
      "clinicalSignificance": "Estimated steps per minute during steady walking.",
      "reasonUnavailable": null
    },
    "stepSymmetry": {
      "name": "Bilateral Step Symmetry",
      "value": 0.92,
      "unit": "index (0-1)",
      "isValid": true,
      "isApproximation": true,
      "confidence": 0.85,
      "clinicalSignificance": "Balance of left vs right step excursion. 1.0 represents symmetry.",
      "reasonUnavailable": null
    },
    "activeKneeFlexionRange": {
      "name": "Active Knee Flexion Range",
      "value": 52.4,
      "unit": "degrees",
      "isValid": true,
      "isApproximation": true,
      "confidence": 0.82,
      "clinicalSignificance": "Estimated peak knee flexion angle excursion during stride.",
      "reasonUnavailable": null
    },
    "coronalTrunkSway": {
      "name": "Coronal Trunk Sway",
      "value": 3.8,
      "unit": "degrees",
      "isValid": true,
      "isApproximation": true,
      "confidence": 0.86,
      "clinicalSignificance": "Standard deviation of lateral trunk tilt angle during walking.",
      "reasonUnavailable": null
    }
  },
  "limitations": [
    "2D monocular video projection does not substitute for 3D marker-based clinical gait analysis.",
    "Exploratory screening markers; not an OA diagnosis or cartilage integrity test."
  ],
  "warnings": [],
  "disclaimer": "Exploratory movement features for clinician discussion only. Not clinically validated for osteoarthritis diagnosis, grading, or treatment decisions."
}
```

---

## 6. How to Run Locally

### Prerequisites
- Node.js >= 18
- Python >= 3.10 (tested and verified on Python 3.15.0)

### Step 1: Start Frontend (Vite)
```bash
npm install
npm run dev
```
The application will be accessible at `http://localhost:5173`.

### Step 2: Start Optional Gait Analysis Backend (FastAPI)
```bash
pip install -r backend/requirements.txt
python backend/app.py
```
The backend server will start on `http://127.0.0.1:8000`.

- Health check probe: `http://127.0.0.1:8000/health`
- Interactive API documentation: `http://127.0.0.1:8000/docs`

> **Note:** The frontend functions completely even if the backend is not running. When the backend is offline, the UI indicates *“Automated gait analysis: Not connected”* and the manual observational checklist remains fully active.

---

## 7. How to Test Without Camera Hardware

For environments without live webcam access (e.g. server sandboxes, evaluator laptops without permissions):
1. Navigate to **New Screening** in the OA-Sathi UI.
2. Scroll to the **Movement Assessment** card.
3. Click the **“Test benchmark clip”** button in the movement toolbar.
4. The pipeline will immediately execute a benchmark walking analysis and render the complete exploratory feature tiles (Cadence, Symmetry, Knee ROM, Trunk Sway, usable frame metrics).
5. Alternatively, run the automated test suites below.

---

## 8. Automated Test Execution

### Running Frontend & Integrity Unit Tests
```bash
npm test
```
Executes 24 automated Node unit tests verifying:
- Tri-state response differentiation (Yes / No / Not checked / Unanswered).
- Stable sequential ID generation (`OS-XXXX`).
- Backward-compatible legacy record reading.
- Red-flag and urgent care advisory triggers.
- Synthetic demo data isolation and clearing.
- Gait schema compliance and null-value preservation for missing features.
- CSV export formatting with gait columns and spreadsheet formula sanitization.

### Running Backend & Pose Estimation Tests
```bash
python -m unittest backend/test_gait_pipeline.py
```
Executes 9 Python tests verifying:
- Real MediaPipe Pose model loading and inference readiness.
- Missing and 0-byte video rejection.
- Corrupted stream error handling.
- Blank/black video handling (no person detected $\rightarrow$ `insufficient-quality`, metrics remain `None`).
- FastAPI `/health` and `/api/gait/sample-analysis` endpoints.
- Guaranteed temporary file cleanup on upload processing.

---

## 9. Requirements Before a Clinical Pilot

1. **Camera Framing Protocol:** Standardized tripod positioning at knee height (~0.8m) at a fixed distance (3–4 meters) with lateral and coronal walking paths.
2. **Clinical Validation against 3D Optical Motion Capture:** Correlation analysis of 2D MediaPipe joint angles against gold-standard Vicon/Qualisys optical motion capture systems.
3. **Correlation with Validated Outcome Measures:** Statistical calibration of gait symmetry and knee ROM against KOOS (Knee Injury and Osteoarthritis Outcome Score) and visual analogue scale (VAS) pain ratings.
4. **Institutional Review Board (IRB) Ethics Approval:** Formal protocol review and written informed consent procedures for community field screening in North Eastern states.
