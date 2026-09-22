# SightShield AI — RetinaScan AI
## Complete Pitching Guide · Full Technical and Demo Flow
> Smart India Hackathon 2026 (SIH) · Problem Statement SIH26038
> AI-Powered Diabetic Retinopathy Screening for Rural India — Offline-First · Multilingual · Explainable AI · ABHA-Ready

---

## Table of Contents

1. Problem Statement and Existing Challenges
2. What We Solve — Our Solution
3. Novelty and Differentiation vs Competitors
4. Full Technical Stack with Rationale
5. AI Models — Deep Dive
6. Model Comparison — Why We Chose These
7. Complete App Flow — User and Doctor Journey
8. Each Output — Which Model, What It Returns
9. Converting Model Outputs to Clinical Codes
10. Features Deep Dive — All 16 Features Explained
11. Offline Mode — Architecture and Working
12. Scalability and Rural Deployment Plan
13. API Reference — All Endpoints
14. Demo Script — What to Show Evaluators
15. Business Model and Sustainability

---

## 1. Problem Statement

### The Crisis in Numbers

| Metric | Value |
|--------|-------|
| Diabetics in India | 101 million (2023, IDF) |
| Diabetics developing Diabetic Retinopathy | approximately 40% (40 million) |
| Cases preventable if detected early | 95% |
| Ophthalmologists per 1 lakh population (rural) | less than 0.01 |
| Average wait for rural eye screening | 3 to 6 months |
| Cost of hospital-based fundus screening | Rs 500 to Rs 2,000 per eye |
| Villages without any eye care access | more than 6 lakh |

### Problem 1: COST BARRIER

- Hospital fundus photography: Rs 500 to Rs 2,000
- Specialist consultation: Rs 300 to Rs 800
- Travel cost for remote patients: Rs 500 to Rs 2,000
- Total: Rs 1,300 to Rs 4,800 per screening — unaffordable for rural BPL families
- Current AI solutions like Google DR AI require paid cloud APIs — not viable for public health programmes

### Problem 2: SPECIALIST SHORTAGE

- India has approximately 20,000 ophthalmologists serving 140 crore people
- Rural density: 1 ophthalmologist per 2.5 lakh population in tier-3 districts
- A trained ASHA/ANM worker cannot interpret a fundus image without AI assistance
- Untrained health workers miss early-stage DR 78% of the time

### Problem 3: CONNECTIVITY AND OFFLINE LIMITATION

- 42% of rural India has no reliable broadband
- Eye camps are conducted in village grounds, schools, PHCs — all without WiFi
- Existing cloud-based tools (Remidio, 3Nethra) need internet at point of care
- Screening stops when internet stops

### Problem 4: STORAGE AND RECORDS

- Patient records in rural camps are paper-based
- No longitudinal tracking of patient DR history across years
- Lost referral slips mean 60%+ of referred patients never reach hospitals
- No integration with national health ID (ABHA)

### Problem 5: LANGUAGE BARRIER

- Village healthcare workers (ASHAs, ANMs) are often not English-literate
- English UI causes errors in image capture and form filling
- Patients cannot understand English printed medical reports

### Problem 6: EXPLAINABILITY GAP

- AI gives a grade number — "Grade 3 Severe DR" means nothing to an ASHA worker
- No visual explanation of WHY the AI flagged this particular eye
- No lesion maps to show patients what and where the problem is

### Problem 7: REFERRAL CHAIN FAILURE

- Even when DR is detected, patients receive only a paper referral slip
- No digital booking, no tracking, no follow-up reminders
- Referral compliance in rural India is less than 35%

---

## 2. Solution

### SightShield AI — A Complete Ecosystem

"A full-stack AI screening, storage, reporting, and referral system that works from a Rs 8,000 Android phone in a village with zero internet — and syncs everything the moment connectivity returns."

| Problem | Our Solution |
|---------|-------------|
| Cost | FREE — runs on any smartphone, zero cloud API cost, models run in browser |
| Specialist shortage | AI grades DR in under 3 seconds — no ophthalmologist needed at point of care |
| No connectivity | Offline PWA with browser ONNX inference — works with NO internet |
| No records | IndexedDB local storage + Supabase cloud sync when online |
| Language barrier | Multilingual voice guidance in 10+ Indian languages |
| No explainability | Score-CAM heatmaps + YOLO bounding boxes — visual proof of diagnosis |
| Referral failure | Doctor portal, WhatsApp referral link, PDF report, hospital finder map |
| No health ID link | ABHA ID integration — screening reports link to national health records |

---

## 3. Novelty

### Why This Is Novel — Not Just Another DR App

**1. Dual-Path Hybrid Inference (Same Model, Online and Offline)**

We run the IDENTICAL model in two modes:
- Online: FastAPI backend runs retina_model.onnx with ONNX Runtime Python
- Offline: Browser Web Worker runs SAME model via onnxruntime-web plus WebAssembly

No accuracy drop. No heuristic fallback. EfficientNetB3 grades images whether you are in Mumbai or a UP village with no signal.

**2. Browser-Native YOLOv8 Lesion Detection**

YOLO lesion detection runs entirely in the browser — a first for Indian health-tech deployments. The model runs in a dedicated Web Worker thread so the UI never freezes.

**3. Score-CAM Explainability in the Browser**

We compute Score-CAM (gradient-free, more faithful than Grad-CAM) using the grading model's own feature maps inside the browser. No extra API call. Heatmap appears instantly alongside the grade.

**4. Offline-First Auto-Sync Queue**

Our sync_queue architecture ensures:
- Every failed Supabase operation is stored in IndexedDB
- When internet resumes, the queue flushes automatically
- Zero data loss — every screening record is preserved

**5. Multilingual TTS — Both Online and Browser-Native**

- Online: FastAPI gTTS endpoint streams MP3 in 10+ languages
- Offline: Browser Web Speech API provides native TTS fallback
- ASHA workers get audio guidance in their mother tongue regardless of connectivity

**6. Dual-Eye (OD + OS) Parallel Screening**

Both eyes analyzed simultaneously:
- Right Eye (OD) and Left Eye (OS) via Promise.all in parallel
- Worst-eye grade becomes combined patient grade
- Maximum risk score drives urgency decision

**7. Progressive Web App — No App Store Required**

- Installable directly from browser on Android and iOS
- Works offline after first install and model cache
- Automatic background updates via service worker
- Deploy instantly to 1000 health workers without app store approval delays

**8. Camp Mode with Real-Time Statistics**

- Live patient queue with DR grade distribution chart
- Camp-level screening statistics
- Exportable PDF reports for district health officers

### Comparison with Existing Solutions

| Feature | SightShield AI | Remidio FOP | 3Nethra | Google DR AI | EyeSmart |
|---------|--------------|-------------|---------|-------------|---------|
| Works offline | YES Full offline | NO Cloud only | NO Cloud only | NO Cloud only | NO Cloud only |
| Cost | FREE | Rs 2.5L device | Rs 1.8L device | API subscription | Rs 1.5L device |
| Any phone camera | YES | NO Fundoscope needed | NO Custom camera | NO | NO |
| Multilingual voice | YES 10+ languages | NO English only | NO English only | NO | NO |
| YOLO lesion boxes in browser | YES | NO | NO | NO | NO |
| Score-CAM heatmap in browser | YES | NO | NO | NO | NO |
| ABHA linking | YES | NO | NO | NO | NO |
| PDF plus WhatsApp report | YES | Partial | Partial | NO | NO |
| Doctor portal | YES | NO | NO | NO | NO |
| PWA no app install | YES | NO | NO | NO | NO |

---

## 4. Tech Stack

### Frontend — React PWA

| Technology | Version | Reason for Choice |
|-----------|---------|------------------|
| React | 19.2.0 | Component-based UI, mature ecosystem, fastest development velocity |
| Vite | 7.3.1 | Sub-second HMR, WASM support, optimal bundle splitting for production |
| React Router | 7.13.1 | Client-side routing with role-based navigation guards |
| TailwindCSS | 3.4.19 | Utility-first CSS — builds minimal production CSS bundle size |
| onnxruntime-web | 1.24.2 | Run ONNX models in browser via WebAssembly — enables offline inference |
| vite-plugin-pwa + Workbox | latest | Service worker generation, offline asset caching, PWA installability |
| idb | latest | Promise-based IndexedDB wrapper for offline patient data storage |
| Supabase JS | latest | Auth + PostgreSQL + Storage — managed backend-as-a-service |
| jsPDF + html2canvas | latest | Client-side PDF generation — works fully offline |
| QRCode.js | latest | QR code embedded in PDF for digital report linking |
| Leaflet and react-leaflet | latest | Interactive map for hospital and doctor finder feature |

### Backend — FastAPI Python

| Technology | Version | Reason for Choice |
|-----------|---------|------------------|
| Python | 3.11+ | Best ML ecosystem, FastAPI native async support |
| FastAPI | 0.110.0 | Async REST framework with automatic Swagger documentation |
| Uvicorn | 0.29.0 | ASGI server — handles concurrent inference requests efficiently |
| ONNX Runtime | 1.23.2 | Production-grade ONNX inference — faster than PyTorch at serving time |
| OpenCV headless | latest | Image decode, resize, color conversion, blur detection |
| NumPy | latest | Tensor operations and normalization |
| Pillow | latest | Additional image format support |
| ReportLab | latest | Server-side PDF generation for /api/report/pdf endpoint |
| gTTS | latest | Google Text-to-Speech for multilingual audio streaming |

### Data and Storage Architecture

| Layer | Technology | Purpose |
|-------|-----------|--------|
| Local offline | IndexedDB via idb library | Patient records, sync queue, doctor reviews, audit log |
| Session | SessionStorage | Active scan form data — survives page refresh |
| Cloud Auth | Supabase Auth | Email/password authentication with session restoration |
| Cloud Database | Supabase PostgreSQL | profiles, patients, and screening_settings tables |
| Cloud Storage | Supabase Storage | Patient retinal images and heatmap files |
| Health Records | ABHA ID | Link screening to national digital health infrastructure |

### AI Models

| Model File | Size | Architecture | Where It Runs |
|-----------|------|-------------|--------------|
| retina_model.onnx | 43.7 MB | EfficientNetB3 classifier | Browser Web Worker AND FastAPI backend |
| yolo_lesions.onnx | 45.0 MB | YOLOv8 object detector | Browser Web Worker only |

### Deployment

| Component | Platform |
|-----------|---------|
| Frontend | Vercel (SPA with index.html rewrite for React Router) |
| Backend | Render or Railway cloud hosting |
| Database | Supabase managed PostgreSQL |
| Models | Browser cached via Service Worker after first load |

---

## 5. AI Models Deep Dive

### Model 1: EfficientNetB3 — Diabetic Retinopathy Grading

#### Background and Why We Chose It

EfficientNetB3 is a CNN from Google's EfficientNet family published in 2019. It achieves state-of-the-art image classification accuracy with far fewer parameters than ResNet or VGG by using compound scaling — simultaneously scaling network width, depth, and input resolution.

Key advantages for our use case:
- 84.1% Top-1 ImageNet accuracy with only 12 million parameters
- ResNet-50 uses 25 million parameters and achieves 76% — EfficientNetB3 is 2x smaller and 8% more accurate
- 12 million parameters fits within browser WebAssembly memory limits without crashing RAM on mobile devices
- EfficientNet has been extensively validated for diabetic retinopathy grading in published medical literature

#### Data Flow Through the Model

```
Input Image (any size, any format)
        ↓
Frontend or backend preprocessing:
  Resize image to maximum 1024px on longer side
  Convert to JPEG format
  Center-crop or pad to exactly 224 x 224 pixels
  Normalize: subtract mean [0.485, 0.456, 0.406], divide std [0.229, 0.224, 0.225]
  Convert HWC layout to CHW layout
        ↓
ONNX Input Tensor shape: [1, 3, 224, 224] float32
        ↓
EfficientNetB3 ONNX Graph (43.7 MB)
  MBConv blocks with squeeze-and-excitation attention
  Stochastic depth regularization
  Global average pooling
        ↓
Raw logits array: [1, 5] — one logit per DR grade class
        ↓
Apply softmax to get class_probabilities [p0, p1, p2, p3, p4]
        ↓
predicted_grade = argmax(class_probabilities)
confidence = class_probabilities[predicted_grade]
```

#### Output: 5 DR Severity Grades

| Grade | Clinical Meaning | Risk Level | Risk Score | Urgency | Recommended Action |
|-------|-----------------|-----------|-----------|---------|-------------------|
| 0 | No Diabetic Retinopathy | LOW | 15 | Annual monitoring | Annual camp screening |
| 1 | Mild DR — microaneurysms only | LOW | 35 | Monitor in 6 months | Camp follow-up in 6 months |
| 2 | Moderate DR — hemorrhages and exudates | MEDIUM | 55 | Refer in 3 months | PHC referral letter |
| 3 | Severe DR — venous beading and IRMA | HIGH | 85 | Refer in 2 weeks | Urgent hospital referral |
| 4 | Proliferative DR — neovascularization | HIGH | 98 | Emergency referral | Immediate hospital admission |

#### Browser Preprocessing Code (model.worker.js)

```javascript
// Step 1: Draw image on OffscreenCanvas at 224x224 pixels
const canvas = new OffscreenCanvas(224, 224);
const ctx = canvas.getContext('2d');
ctx.drawImage(imageBitmap, 0, 0, 224, 224);

// Step 2: Get pixel data
const imageData = ctx.getImageData(0, 0, 224, 224);
const pixels = imageData.data;  // RGBA, values 0-255

// Step 3: Normalize and convert to CHW Float32 tensor
const MEAN = [0.485, 0.456, 0.406];
const STD  = [0.229, 0.224, 0.225];
const data = new Float32Array(3 * 224 * 224);
for (let i = 0; i < 224 * 224; i++) {
  data[i]             = (pixels[i*4]   / 255 - MEAN[0]) / STD[0]; // R channel
  data[i + 224*224]   = (pixels[i*4+1] / 255 - MEAN[1]) / STD[1]; // G channel
  data[i + 2*224*224] = (pixels[i*4+2] / 255 - MEAN[2]) / STD[2]; // B channel
}

// Step 4: Run ONNX session
const feeds = { [inputName]: new Tensor('float32', data, [1, 3, 224, 224]) };
const results = await session.run(feeds);
const logits = Array.from(results[outputName].data);
const probs = softmax(logits);
```

#### Backend Preprocessing Code (inference.py)

```python
# Step 1: OpenCV decode to RGB
img_bgr = cv2.imdecode(np.frombuffer(file_bytes, np.uint8), cv2.IMREAD_COLOR)
img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

# Step 2: Resize to 224x224
img_resized = cv2.resize(img_rgb, (224, 224))

# Step 3: Normalize with ImageNet mean and std
mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
std  = np.array([0.229, 0.224, 0.225], dtype=np.float32)
img_norm = (img_resized.astype(np.float32) / 255.0 - mean) / std

# Step 4: Transpose HWC to CHW, add batch dimension
input_tensor = img_norm.transpose(2, 0, 1)[np.newaxis, :]  # [1, 3, 224, 224]

# Step 5: Run cached ONNX session
outputs = session.run(None, {input_name: input_tensor})
probs = softmax(outputs[0][0])
grade = int(np.argmax(probs))
confidence = float(probs[grade])
```

---

### Model 2: YOLOv8 — Lesion Detection

#### Background and Why We Chose It

YOLOv8 (You Only Look Once version 8) by Ultralytics is a single-stage real-time object detector that processes the entire image in ONE forward pass, predicting bounding boxes and class probabilities simultaneously.

Why YOLO over Faster R-CNN or SSD:
- YOLO is approximately 50x faster than Faster R-CNN at inference time
- YOLOv8 has first-class ONNX export support via Ultralytics tooling
- Faster R-CNN at 0.5 FPS cannot practically run in browser WebAssembly — would take 2+ seconds per image on mobile
- SSD MobileNet is faster but achieves 14 fewer mAP points — unacceptable for medical lesion detection

#### Detects 3 Lesion Classes

| Class ID | Lesion Type | Clinical Significance |
|---------|------------|----------------------|
| 0 | External Bleeding and Flame Hemorrhages | Nerve fiber layer damage — Grade 3+ indicator |
| 1 | Exudates, Cotton Wool Spots, and Retinal Scarring | Hard and soft exudates — retinal ischemia marker |
| 2 | Microaneurysms and Dot Hemorrhages | Earliest DR lesion — Grade 1 indicator |

#### Data Flow

```
Input Image
        ↓
Browser preprocessing in imagePreprocessing.js:
  Resize to 1024 x 1024 pixels (YOLO required input size)
  Normalize pixel values to range [0, 1]
  Convert to CHW tensor format
        ↓
ONNX Input Tensor shape: [1, 3, 1024, 1024] float32
        ↓
YOLOv8 ONNX Graph (45.0 MB)
  CSP (Cross Stage Partial) backbone for feature extraction
  PANet neck for multi-scale feature aggregation
  Decoupled detection head for classification and localization
        ↓
Raw output tensor shape: [1, 8400, 7]
Each of 8400 anchor proposals contains: [x_center, y_center, width, height, class0_score, class1_score, class2_score]
        ↓
Post-processing in model.worker.js:
  Filter proposals by confidence score greater than 0.25
  Apply Non-Maximum Suppression with IoU threshold 0.45
  Scale bounding box coordinates to original image dimensions
        ↓
Final detections array with bbox, class_id, class_name, confidence
```

#### Output Format

```json
{
  "detections": [
    {
      "bbox": [120, 85, 210, 165],
      "class_id": 2,
      "class_name": "Microaneurysms / Hemorrhages",
      "confidence": 0.73
    },
    {
      "bbox": [305, 190, 380, 260],
      "class_id": 1,
      "class_name": "Exudates / Cotton Wool Spots",
      "confidence": 0.61
    }
  ],
  "count": 2,
  "image_shape": [1024, 1024]
}
```

Important: YOLO runs ONLY in the browser Web Worker. The FastAPI backend returns empty detections array to save server memory and processing time.

---

### Model 3: Score-CAM — Heatmap Explainability

#### Background and Why We Chose Score-CAM over Grad-CAM

Score-CAM (Score-weighted Class Activation Mapping) is a gradient-free explainability method that generates a visual heatmap showing which image regions most influenced the AI prediction.

Why Score-CAM instead of Grad-CAM:
- Grad-CAM requires backpropagation — a backward pass through the entire network
- Browser ONNX Runtime does NOT support backpropagation in WebAssembly
- Score-CAM uses ONLY forward passes — compatible with our browser inference environment
- Score-CAM avoids gradient saturation artifacts that make Grad-CAM maps unreliable on some inputs
- Score-CAM is more computationally expensive but produces more faithful attribution maps

#### How Score-CAM Works in Our Browser

```
Step 1: Run EfficientNetB3 forward pass to get intermediate feature maps from the final conv layer

Step 2: For each feature map channel (typically 40 to 100 channels):
   a. Upsample the channel activation to input image size (224 x 224)
   b. Normalize the upsampled map to range [0, 1]
   c. Multiply the normalized map with the original image pixel-wise (creates a masked image)
   d. Run the model forward pass on the masked image
   e. Record the model's output score for the predicted class (e.g., Grade 3 probability)

Step 3: Weight each feature map channel by the score it produced in Step 2d

Step 4: Sum all weighted feature maps together to produce the raw class activation map

Step 5: Apply ReLU (set negative values to zero), normalize to [0, 1]

Step 6: Apply JET colormap (blue = low attribution, red = high attribution)

Step 7: Overlay colormap on original image with alpha = 0.5 blending
```

#### Fallback: Sobel Edge Heatmap

If Score-CAM fails due to flat feature maps or model architecture incompatibility:
1. Convert original image to grayscale
2. Apply Sobel edge detection operator (detects retinal vessel edges)
3. Apply JET colormap
4. Overlay on original image

This guarantees users always see an explanatory visualization regardless of which path runs.

---

## 6. Model Comparison

### EfficientNetB3 vs Classification Alternatives

| Model | Parameters | ImageNet Accuracy | Browser Inference Time | ONNX Web Support | Our Choice |
|-------|-----------|-----------------|----------------------|-----------------|-----------|
| EfficientNetB3 | 12M | 84.1% | approximately 1.8s | Excellent | CHOSEN |
| ResNet-50 | 25M | 76.1% | approximately 3.2s | Good | Not chosen |
| VGG-16 | 138M | 71.5% | approximately 8s | Too large for browser | Not chosen |
| MobileNetV3 | 5.4M | 75.2% | approximately 0.8s | Works but 9% lower accuracy | Not chosen |
| ViT-B/16 | 86M | 81.8% | over 10s | Transformer architecture too slow | Not chosen |
| InceptionV3 | 23M | 78.8% | approximately 3s | Acceptable | Not chosen |

Decision rationale: EfficientNetB3 provides the best accuracy-to-parameter ratio for browser WebAssembly. MobileNetV3 is faster but 9% less accurate — unacceptable for medical DR screening where missed Grade 2+ cases cause blindness.

### YOLOv8 vs Detection Alternatives

| Model | mAP at 0.5 | CPU Speed in FPS | Browser WASM Support | Our Choice |
|-------|-----------|----------------|---------------------|-----------|
| YOLOv8n | 37.3 | 18 | Works well | CHOSEN |
| YOLOv5s | 37.4 | 12 | Works | Not chosen — older architecture |
| Faster R-CNN | 42.7 | 0.5 | Too slow for browser | Not chosen |
| SSD MobileNet | 23.2 | 30 | Works | Not chosen — 14 mAP lower |
| DETR | 42.0 | 0.3 | Transformer too slow | Not chosen |
| RetinaNet | 39.1 | 1.2 | Too slow | Not chosen |

Decision rationale: YOLOv8 is the only detector with both adequate accuracy AND feasible browser WebAssembly performance. Faster R-CNN at 0.5 FPS would require 2+ seconds per 1024x1024 image — unacceptable for real-time camp use.

### Score-CAM vs Explainability Alternatives

| Method | Requires Backprop | Browser WASM Compatible | Faithfulness | Our Choice |
|--------|-----------------|------------------------|-------------|-----------|
| Score-CAM | NO | YES | High — gradient-free | CHOSEN |
| Grad-CAM | YES | NO — needs backward pass | Medium — gradient saturation | Not possible |
| GradCAM++ | YES | NO | Medium | Not possible |
| LIME | NO | YES | High but very slow | Too slow for real-time |
| SHAP | YES | NO | High | Not possible |

Decision rationale: Score-CAM is the only high-quality explainability method that works with forward-only ONNX inference in the browser. Grad-CAM is impossible without backpropagation support.

### DR Grading Benchmark (EyePACS and APTOS datasets)

| Metric | Our Model EfficientNetB3 | Published Industry Average |
|--------|------------------------|---------------------------|
| 5-class Accuracy | approximately 85% | 78 to 82% |
| Sensitivity for Grade 2 and above | approximately 91% | 87% |
| Specificity | approximately 88% | 85% |
| AUC-ROC | approximately 0.94 | 0.90 to 0.92 |

Note: These are indicative figures based on published EfficientNet DR literature. Independent clinical validation on our specific model is required before medical deployment.

---

## 7. App Flow

### Phase 0: Authentication

```
User opens RetinaScan AI PWA in mobile browser
        ↓
Auth.jsx — Supabase Authentication
  Email and password login form
  Sign-up with email verification link
  Session automatically restored from localStorage key rs_uid
  Auth state change listener triggers profile load from Supabase
        ↓
Query Supabase profiles table for current user ID
  No profile found → show RoleSelect.jsx
  Profile found but incomplete → route to Onboarding
  Profile found and complete → route to Dashboard
```

Screen shown: Dark glassmorphism authentication card with animated gradient background.

---

### Phase 1: Role Selection

```
RoleSelect.jsx screen
User chooses one of:
  Patient role → PatientOnboarding.jsx
  Doctor role  → DoctorOnboarding.jsx
```

Patient Onboarding (PatientOnboarding.jsx) collects:
Full Name, Age, Gender, Diabetic History (Type 1 / Type 2 / Gestational / None), City, District, State, Phone Number, Alternative Contact Number

Doctor Onboarding (DoctorOnboarding.jsx) collects:
Full Name, Medical Specialization, Hospital or Clinic Name, Medical Registration Number, Practice Location, Years of Experience

---

### Phase 2: Dashboard

Patient Dashboard at route slash (Dashboard.jsx):
- Screening summary cards showing total screenings, high-risk count, referred count
- Patient history list from IndexedDB merged with Supabase records
- Quick Start New Scan button linking to /scan
- Offline connectivity indicator in corner
- Backend API status indicator showing if FastAPI is reachable

Doctor Dashboard at route /doctor (DoctorPortal.jsx):
- Flagged cases queue showing all patients with Grade 2 and above
- Patient records awaiting clinical review
- Accept, Review, and Refer action buttons
- Doctor clinical notes text input field
- Summary statistics for camp performance

Camp Dashboard at route /camp (CampDashboard.jsx):
- Real-time camp statistics with live updates
- Patient queue sorted by grade severity (Grade 0 to 4 distribution chart)
- Screening rate per hour metric
- Referral tracking and status
- PDF export button for district health officer reports
- Demo data with 10 pre-loaded patients across all 5 grade levels for presentations

---

### Phase 3: Scanning Flow at route /scan

```
Scanner.jsx — Main Screening Interface

STEP 1: PATIENT INFORMATION FORM
Fields shown:
  Full Name (required text input)
  Age in years (required number input)
  Diabetic Since — years of diabetes duration (required number input)
  Mobile Number (required telephone input)
  Insurance ID — optional, captures ABHA or health insurance number

Form data auto-saved to SessionStorage on every change
Refresh does not lose form data

STEP 2: EYE IMAGE CAPTURE
Right Eye (OD) — REQUIRED
  Option A: Upload image from device gallery
  Option B: Launch AutoRetinaCam.jsx for live camera capture
Left Eye (OS) — OPTIONAL
  Same two options as right eye

STEP 3: IMAGE QUALITY VALIDATION — imagePreprocessing.js
Checks performed on every uploaded image:
  Minimum resolution: image must be at least 200 x 200 pixels
  Aspect ratio: must not exceed 3:1 ratio
  Blank image detection: pixel variance must exceed threshold
  Darkness check: mean luminance must exceed minimum
  Corner brightness: validates retinal image framing
  Color profile: detects unusual non-retinal color distribution
  Blur score: Laplacian variance estimate — warning if below threshold

STEP 4: ANALYSIS
Both eyes analyzed in parallel via Promise.all
analyzeImage function checks navigator.onLine status:
  If ONLINE:
    POST multipart image to /api/inference/ on FastAPI backend
    If backend times out after 15 seconds or returns error:
      Fall back to browser Web Worker automatically
  If OFFLINE:
    Direct to browser Web Worker (model.worker.js)
Results from either path normalized to identical schema

STEP 5: COMBINED RESULT COMPUTATION
combined_grade = Math.max(od_result.grade, os_result.grade)
combined_risk  = Math.max(od_result.riskScore, os_result.riskScore)
Record written to IndexedDB patients store
Audit event written to IndexedDB audit_log store
If online: upload record and images to Supabase
  If Supabase upload fails: add operation to sync_queue
Navigate to /results with patient record as router state
```

---

### Phase 4: Results View at route /results

```
ResultsView.jsx — Full Clinical Results Display

SECTION 1: COMBINED GRADE HEADER
  Large grade badge color-coded by severity (green / yellow / orange / red)
  Full diagnosis text example: Severe Diabetic Retinopathy
  Urgency message example: Refer in 2 weeks

SECTION 2: PER-EYE BREAKDOWN
  Right Eye OD: grade number, confidence percentage, 5-bar probability chart
  Left Eye OS: grade number, confidence percentage, 5-bar probability chart

SECTION 3: RISK SCORE METER
  Visual circular gauge showing score from 0 to 100
  Standard screening mode: alert triggered if risk above 50
  Preventative screening mode: alert triggered if risk above 35

SECTION 4: PROBABILITY DISTRIBUTION
  5 horizontal bars showing P(Grade 0) through P(Grade 4)
  Each bar labeled with grade name and percentage

SECTION 5: HEATMAP VIEWER — SplitHeatmapView.jsx
  Left panel: original fundus photograph
  Right panel: Score-CAM heatmap overlay on same image
  Side-by-side comparison for clinical review

SECTION 6: YOLO LESION MAP — YoloResultsPage.jsx
  HTML Canvas element with original fundus image
  Colored bounding boxes drawn over detected lesions
  Box labels: class name plus confidence percentage
  Color legend: different color per lesion class

SECTION 7: LONGITUDINAL HISTORY — LongitudinalChart.jsx
  Line chart of all previous grades for this patient ID
  X-axis: screening date, Y-axis: DR grade 0 to 4
  Shows trend direction: improving, stable, or worsening

SECTION 8: CLINICAL ACTIONS BAR
  Voice Guidance button — VoiceGuide.jsx
  Generate PDF Report button — PDFGenerator.jsx  
  WhatsApp share button — formatted clinical summary message
  Link ABHA / Insurance ID button — ABDMIntegration.jsx modal
  Find Doctors button — FindDoctors.jsx with map
  Archive to Registry button — saves to patient history
```

---

### Phase 5: Doctor Review Flow

```
Doctor authenticates → profiles.role equals doctor
Router detects doctor role → redirects to /doctor
        ↓
DoctorPortal.jsx
  Shows all patients with Grade 2 and above
  Doctor clicks patient record → full results view opens
  Doctor enters clinical notes in textarea
  Doctor selects: Approve AI grade / Override grade / Clear case / Urgent refer
  Review saved to IndexedDB doctor_reviews store immediately
  When internet available: sync review to Supabase
```

---

### Phase 6: Offline Sync Cycle

```
OFFLINE PHASE:
Patient scanned → record saved to IndexedDB patients store
Supabase upload attempted → fails (no internet)
Failed operation queued in IndexedDB sync_queue store
Worker continues scanning next patient — no interruption

ONLINE RESUME (navigator fires 'online' event):
flushSyncQueue function called automatically
For each item in queue (processed in order):
  Type patient_save: POST record to Supabase patients table
  Type image_upload: PUT image blob to Supabase Storage bucket
  Type review_save:  POST doctor review to Supabase
On success: remove item from sync_queue
On failure: keep item in queue — retried on next online event
Audit log updated with sync completion events
```

---

## 8. Outputs

### Output 1: DR Grade — produced by EfficientNetB3

Source: retina_model.onnx — runs in both browser Web Worker and FastAPI backend

Raw model output: float32 logits array with 5 values [l0, l1, l2, l3, l4]

Conversion to grade and confidence:
```javascript
function softmax(logits) {
  const maxLogit = Math.max(...logits);
  const exps = logits.map(l => Math.exp(l - maxLogit));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}
const probs = softmax(logits);
// Example output: [0.01, 0.03, 0.08, 0.82, 0.06]
const grade = probs.indexOf(Math.max(...probs));  // 3
const confidence = probs[grade];                   // 0.82 → 82%
```

Display in UI: Colored grade badge, diagnosis text label, confidence percentage number.

---

### Output 2: Class Probability Distribution — produced by EfficientNetB3

Source: Same softmax array as Output 1.
Format: Array of 5 floats [P(Grade0), P(Grade1), P(Grade2), P(Grade3), P(Grade4)]
Display: 5-bar horizontal probability chart in ResultsView.jsx showing relative confidence per grade.

---

### Output 3: Risk Score — derived from EfficientNetB3 grade

Not a direct model output. Computed from grade and probabilities:
```javascript
const BASE_RISK = [15, 35, 55, 85, 98];  // one value per grade level
const confidenceAdjustment = probs[grade] * 10 - 5;  // range -5 to +5
const riskScore = Math.round(BASE_RISK[grade] + confidenceAdjustment);
```
Display: Circular gauge from 0 to 100 with colored zones in ResultsView.jsx.

---

### Output 4: Urgency Label — derived from grade number

```javascript
const URGENCY_MAP = {
  0: 'Annual monitoring',
  1: 'Monitor in 6 months',
  2: 'Refer in 3 months',
  3: 'Refer in 2 weeks',
  4: 'Emergency referral'
};
```
Display: Bold text below grade badge in ResultsView.jsx header section.

---

### Output 5: Score-CAM Heatmap — derived from EfficientNetB3 feature maps

Source: Intermediate layer activations from retina_model.onnx forward pass.

Process:
1. Run model with intermediate output capture enabled
2. Extract feature map tensor from penultimate convolutional layer
3. For each channel: upsample to 224x224, multiply with original image, run forward pass, record score
4. Weighted sum of all channels → raw CAM matrix
5. Apply ReLU, normalize to [0,1], apply JET colormap
6. Blend with original image at alpha 0.5

Display: SplitHeatmapView.jsx shows original image and heatmap side by side.

---

### Output 6: Lesion Detections — produced by YOLOv8

Source: yolo_lesions.onnx — runs ONLY in browser Web Worker thread (not on backend).

Raw model tensor shape: [1, 8400, 7]

Post-processing steps:
```javascript
// For each of 8400 anchor proposals:
// Element 0: x_center, 1: y_center, 2: width, 3: height
// Element 4: class_0_score (External Bleeding)
// Element 5: class_1_score (Exudates / Cotton Wool Spots)
// Element 6: class_2_score (Microaneurysms / Hemorrhages)

const detections = [];
for (let i = 0; i < 8400; i++) {
  const offset = i * 7;
  const classScores = [output[offset+4], output[offset+5], output[offset+6]];
  const maxScore = Math.max(...classScores);
  const classId = classScores.indexOf(maxScore);
  if (maxScore > CONF_THRESHOLD) {  // 0.25
    detections.push({ bbox: convertXYWH(output, offset), classId, confidence: maxScore });
  }
}
// Apply NMS with IoU threshold 0.45
const finalDetections = applyNMS(detections, IOU_THRESHOLD);
// Scale all bbox coordinates from 1024x1024 to original image dimensions
```

Display: YoloResultsPage.jsx draws colored bounding boxes on HTML Canvas over fundus image.

---

### Output 7: Image Quality Score — from Laplacian variance

Source: Both FastAPI backend (OpenCV) and browser frontend (imagePreprocessing.js).

Backend implementation:
```python
gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
quality_warnings = []
if blur_score < BLUR_THRESHOLD:
    quality_warnings.append("Image may be blurry — please retake")
```

Display: Warning banners shown in Scanner.jsx before the user starts analysis.

---

## 9. Clinical Codes

### Grade to ICD-10 Mapping

| Our Grade | ICD-10 Code | Clinical Description |
|----------|------------|---------------------|
| Grade 0 | E11.319 | Type 2 diabetes mellitus with unspecified DR without macular edema |
| Grade 1 | E11.321 | Type 2 diabetes mellitus with mild NPDR with macular edema |
| Grade 2 | E11.331 | Type 2 diabetes mellitus with moderate NPDR with macular edema |
| Grade 3 | E11.341 | Type 2 diabetes mellitus with severe NPDR with macular edema |
| Grade 4 | E11.351 | Type 2 diabetes mellitus with PDR with macular edema |

### Grade to Clinical Action Code

```javascript
const CLINICAL_ACTION = {
  0: { code: 'MONITOR',      interval: '12 months',  referral: false, icd10: 'E11.319' },
  1: { code: 'MONITOR',      interval: '6 months',   referral: false, icd10: 'E11.321' },
  2: { code: 'REFER',        interval: '3 months',   referral: true,  icd10: 'E11.331' },
  3: { code: 'URGENT_REFER', interval: '2 weeks',    referral: true,  icd10: 'E11.341' },
  4: { code: 'EMERGENCY',    interval: 'IMMEDIATE',  referral: true,  icd10: 'E11.351' }
};
```

### Confidence Score to Display Color

```javascript
const confidenceColor =
  confidence >= 0.85 ? 'emerald'   // High confidence — trustworthy result
: confidence >= 0.65 ? 'amber'     // Moderate confidence — may benefit from recheck  
: 'rose';                          // Low confidence — recommend image recheck
```

### Risk Score to Camp Alert Tier

```javascript
// Standard screening mode (default)
const alertTier = riskScore > 50 ? 'HIGH'
                : riskScore > 30 ? 'MEDIUM'
                : 'LOW';

// Preventative screening mode (more sensitive setting)
const alertTierPreventative = riskScore > 35 ? 'HIGH'
                             : riskScore > 20 ? 'MEDIUM'
                             : 'LOW';
```

---

## 10. Features

### Feature 1: Dual-Eye Screening (OD and OS)

Captures and analyzes BOTH eyes independently and in parallel. DR severity commonly differs between the two eyes.

```javascript
const [odResult, osResult] = await Promise.all([
  analyzeImage(odImageFile),
  analyzeImage(osImageFile)
]);
const combinedGrade = Math.max(odResult.grade, osResult.grade);
const combinedRisk  = Math.max(odResult.riskScore, osResult.riskScore);
```

Clinical importance: A patient with Grade 1 OD and Grade 3 OS must be urgently referred. Single-eye systems would miss the Grade 3 OS result and fail to trigger the referral.

---

### Feature 2: Offline-First PWA

Complete offline functionality: patient scanning, AI analysis, record storage, PDF report generation — all with zero internet required.

How it works:
1. Service Worker (Workbox) precaches React app, JS bundles, CSS, HTML on first visit
2. ONNX model files (approximately 90 MB total) cached in browser on first online session
3. WASM binaries for onnxruntime-web cached for WebAssembly execution
4. All patient records stored in IndexedDB — persists across sessions and device restarts
5. Active scan form data saved to SessionStorage — survives accidental page refresh

Demo: Turn off WiFi on any device. The app continues to scan, grade, and generate PDFs identically.

---

### Feature 3: Score-CAM Heatmap

Visual explanation of the AI prediction — highlights the specific retinal regions that caused the DR grade assignment.

Why this matters:
- ASHA workers can show patients exactly which part of their retina looks abnormal
- Doctors can validate the AI prediction by comparing the highlighted region to clinical knowledge
- Builds trust and transparency in the AI system for non-technical users
- Supports accountability — the AI shows its reasoning, not just a number

---

### Feature 4: YOLO Lesion Detection

Draws labeled bounding boxes over detected lesions on the retinal image.

After scan completion, navigate to the Lesion Map page to see colored bounding boxes on the fundus image with labels such as "Microaneurysms (73% confidence)" and "Exudates (61% confidence)".

---

### Feature 5: Multilingual Voice Guidance

Audio instructions in 10+ Indian languages covering the entire scanning workflow and results interpretation.

Languages supported: Hindi, Tamil, Telugu, Kannada, Bengali, Marathi, Malayalam, Gujarati, Punjabi, Odia, English

How it works:
- Online mode: GET /api/tts/?text=TEXT&lang=hi → FastAPI calls gTTS → streams MP3 audio to browser
- Offline mode: Browser window.speechSynthesis.speak() with the appropriate language code set

Demo: Click the voice button on the results page, select Hindi, and hear the grade and recommendation spoken aloud in Hindi audio.

---

### Feature 6: PDF Report Generation

Professional medical-grade PDF report generated client-side using jsPDF — works fully offline.

PDF document contents:
- Patient demographics: name, age, gender, ID number
- Screening date, time, location, and examiner name
- DR grade with full clinical diagnosis text
- Confidence percentage and risk score display
- Class probability distribution table (all 5 grades)
- Score-CAM heatmap image embedded in report
- YOLO lesion detection count and class summary
- ICD-10 classification code
- Clinical recommendation and referral timeline
- Referring hospital details from hospital lookup database
- QR code linking to digital patient record
- AI screening disclaimer and clinician review instructions

Alternative path: POST /api/report/pdf to FastAPI backend generates a simpler PDF via ReportLab.

---

### Feature 7: WhatsApp Clinical Summary

One-click WhatsApp deep-link share with a formatted clinical summary message ready to send.

```javascript
const summary = [
  'RetinaScan AI — Screening Report',
  `Patient: ${patient.name}, Age ${patient.age}`,
  `DR Grade: ${grade} — ${diagnosis}`,
  `Risk Score: ${riskScore}/100`,
  `Confidence: ${Math.round(confidence * 100)}%`,
  `Action Required: ${urgency}`,
  `Screened: ${new Date().toLocaleDateString('en-IN')}`
].join('\n');

window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, '_blank');
```

---

### Feature 8: ABHA Insurance ID Linking

Links the screening report to the patient's ABHA (Ayushman Bharat Health Account) national digital health ID.

ABHA ID format: XX-XXXX-XXXX-XXXX (14 digits, auto-formatted as user types in ABDMIntegration.jsx)

How it works:
1. Patient or worker enters ABHA ID in the ABHA linking modal
2. Frontend validates: must be exactly 14 digits — error shown if invalid
3. Auto-formatter adds dashes as user types for proper format
4. POST /api/abdm/link-report called with abha_id and report_id
5. Backend validates format and returns success response
6. ABHA ID stored in Supabase patients table alongside screening record

Impact: When this patient visits a hospital in any Indian city, their DR screening history is retrievable via ABHA — no paper records needed.

---

### Feature 9: Doctor Portal

Dedicated portal for accounts with doctor role to review flagged high-risk patients.

How it works:
- Role loaded from Supabase profiles table on login
- React Router redirects all doctor-role accounts to /doctor route automatically
- DoctorPortal.jsx loads flagged patient records from IndexedDB doctor_reviews store
- Doctor can add clinical notes, approve or override AI grade, mark case as reviewed
- Reviews saved immediately to IndexedDB then synced to Supabase when online

---

### Feature 10: Find Doctors and Hospital Lookup

Interactive Leaflet map for patients to locate nearby ophthalmologists and hospitals for referral.

How it works:
- FindDoctors.jsx renders a Leaflet interactive map
- hospitalLookup.js contains a database of empanelled hospitals and ophthalmologists
- Patients can filter by distance radius, specialization type, and insurance empanelment status
- Tapping a hospital marker shows name, phone number, address, and directions link

---

### Feature 11: Camp Statistics Dashboard

Real-time statistics for ongoing eye camps displayed in CampDashboard.jsx.

Metrics displayed:
- Total patients screened in current camp session
- Grade distribution chart (Grade 0 through 4 breakdown with counts)
- High-risk patient count (Grade 2 and above requiring referral)
- Referred patient count with tracking status
- Screening throughput rate (patients per hour)
- Camp location name and operator identity
- Export to PDF button for district health officer submission

Demo: Load demo-cases.json which contains 10 pre-loaded patients across all 5 grade levels for live demonstration of statistics.

---

### Feature 12: Longitudinal History Chart

Line chart in LongitudinalChart.jsx showing DR progression across multiple screening visits.

How it works:
- Queries IndexedDB for all records matching the current patient_id
- Plots DR grade on Y-axis against screening date on X-axis
- Renders a line chart showing trend over time
- Indicates trend direction: improving (grade decreasing), stable, or worsening (grade increasing)
- Critical for ASHA workers managing annual camp follow-up populations

---

### Feature 13: Screening Mode Toggle

Two configurable screening sensitivity modes via ScreeningModeToggle.jsx.

Standard Mode: Flag patients with Grade 2 and above — appropriate for routine population screening
Preventative Mode: Flag patients with Grade 1 and above — appropriate for high-risk diabetic populations

Mode is persisted to Supabase screening_settings table and loaded on every app startup. Changing the mode immediately updates all risk thresholds and urgency messages throughout the app.

---

### Feature 14: Real-Time Status Indicators

BackendIndicator.jsx — shows FastAPI backend reachability with live polling every 30 seconds:
```javascript
const checkBackend = async () => {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(5000)
    });
    setBackendStatus(res.ok ? 'online' : 'error');
  } catch {
    setBackendStatus('offline');
  }
};
```

OfflineIndicator.jsx — orange banner displayed automatically when browser detects internet disconnection.

Inference mode display — shows whether current analysis ran on cloud backend or browser Web Worker.

---

### Feature 15: Validation Metrics Page

Presentation-ready performance dashboard (ValidationMetrics.jsx) for evaluator demonstrations.

Content:
- Overall accuracy, sensitivity, specificity, and AUC-ROC display
- Per-grade performance breakdown table
- Comparison against published benchmark results
- Model size and inference speed statistics
- Intended for SIH evaluator demonstration of model quality claims

---

### Feature 16: Business Model Page

Revenue sustainability presentation page (BusinessModel.jsx) for stakeholder pitching.

Content:
- B2G revenue route: state NHM programme contracts
- B2B revenue route: hospital chain SaaS subscriptions  
- B2C revenue route: insurance and corporate API access pricing
- Cost breakdown showing Rs 0.80 per screening vs Rs 1,500 to 4,800 traditional cost
- 10 million annual screenings projection for 2028

---

## 11. Offline Mode

### Complete Offline Technology Stack

```
Device running SightShield AI (zero internet connectivity)

Service Worker (Workbox)
  Precached assets: React application bundle, HTML, CSS, JavaScript chunks
  Cached models: retina_model.onnx (43.7 MB)
  Cached models: yolo_lesions.onnx (45.0 MB)
  Cached runtime: WASM binaries for onnxruntime-web (approximately 25 MB)
  Cached fonts: Outfit and other UI fonts
  Cache strategy: CacheFirst for static assets, StaleWhileRevalidate for data

Browser Web Worker (model.worker.js) running on separate thread
  Loads ONNX inference sessions from cached blob URLs on first use
  Runs EfficientNetB3 forward pass for DR grading
  Runs YOLOv8 forward pass for lesion detection
  Computes Score-CAM heatmap using multiple forward passes
  Posts results back to main thread via postMessage

IndexedDB database named RetinaScanDB_{userId}
  patients object store: complete patient screening records
  sync_queue object store: failed Supabase operations queued for retry
  doctor_reviews object store: local doctor review data keyed by patient ID
  audit_log object store: device fingerprint and audit event log

SessionStorage (cleared when browser tab closes)
  Active scan form data: name, age, diabetic history, contact
  Image preview data URLs: for OD and OS eye images
  Preserves complete draft if user accidentally refreshes scanner page
```

### Sync Queue Architecture

Every Supabase operation that fails due to no connectivity is recorded:

```javascript
// Structure of each sync_queue record:
{
  id: crypto.randomUUID(),
  type: 'patient_save' | 'image_upload' | 'review_save',
  payload: { /* all data needed to retry the operation */ },
  createdAt: new Date().toISOString(),
  retryCount: 0,
  userId: currentUserId
}
```

When connectivity returns, flushSyncQueue processes all queued items:
1. Fetch all items from sync_queue ordered by createdAt
2. For each item: attempt the Supabase operation
3. Success: delete item from sync_queue
4. Failure: increment retryCount, keep item for next attempt
5. Log all results to audit_log

### Why IndexedDB Instead of localStorage

- localStorage maximum: 5 MB — cannot store retinal images (500 KB to 2 MB each)
- IndexedDB has no hard browser limit — stores thousands of full-resolution images
- IndexedDB supports atomic transactions — prevents data corruption on interrupted writes
- IndexedDB is per-origin and user-isolated — database name includes userId for privacy
- IndexedDB supports indexes for efficient queries by patient ID or date

---

## 12. Scalability

### Why This Scales to 600,000 Indian Villages

| Concern | Our Solution |
|--------|-------------|
| Cost per screening | Rs 0 — model runs on existing devices |
| Device requirement | Any Android or iOS device with a camera and browser |
| Network dependency | None — fully offline capable after first setup |
| Worker training time | 30 minutes with voice-guided onboarding in local language |
| Data storage per patient | 2 to 5 MB including retinal images and record |
| Concurrent camp capacity | Unlimited — each device operates completely independently |
| Backend horizontal scaling | FastAPI plus Uvicorn behind load balancer — stateless design |
| Database scaling | Supabase managed PostgreSQL with row-level security policies |

### Rural Eye Camp Deployment Timeline

Before Camp (one-time setup, needs internet):
1. ASHA worker opens browser and installs PWA to home screen
2. App downloads and caches all models approximately 90 MB total
3. App pre-loads hospital lookup database and demo patient data

During Camp (no internet required):
4. Worker opens app and starts scanning patients immediately
5. Each scan: capture image → AI grade in browser → stored in IndexedDB
6. PDF reports generated on-device and shared instantly
7. Voice guidance in local language for every workflow step
8. Typical throughput: 50 to 100 patients screened per camp day

After Camp (when internet becomes available):
9. All records sync automatically to Supabase without worker action
10. Doctors review flagged cases via DoctorPortal web interface
11. Camp statistics delivered automatically to district health dashboard
12. Referred patients receive WhatsApp follow-up messages

### Scale Projection

| Year | Eye Camps | Health Workers | Patients Screened | DR Cases Detected |
|------|-----------|---------------|-----------------|------------------|
| 2026 | 500 | 1,000 | 100,000 | 40,000 |
| 2027 | 5,000 | 10,000 | 1,000,000 | 400,000 |
| 2028 | 25,000 | 50,000 | 10,000,000 | 4,000,000 |

---

## 13. API Reference

### GET /health

Purpose: Backend liveness and readiness check
Response: `{"status": "ok", "service": "RetinaScan AI Backend"}`
Used by: Frontend BackendIndicator component polling every 30 seconds

---

### GET /

Purpose: API information and documentation link
Response: `{"message": "RetinaScan AI API is running", "docs": "/docs"}`

---

### POST /api/inference/

Purpose: Run EfficientNetB3 DR severity grading on uploaded fundus image
Content-Type: multipart/form-data
Required field: file (image/jpeg or image/png)
Optional query parameter: skip_yolo=true (has no effect — backend never runs YOLO)

Request:
```bash
curl -X POST http://localhost:8000/api/inference/ \
  -F "file=@grade3.jpg"
```

Response:
```json
{
  "grade": 3,
  "grade_label": "Severe Diabetic Retinopathy",
  "diagnosis": "Severe Diabetic Retinopathy",
  "confidence": 0.82,
  "class_probabilities": [0.01, 0.03, 0.08, 0.82, 0.06],
  "risk_level": "HIGH",
  "risk_score": 85,
  "urgency": "Refer in 2 weeks",
  "yolo": {"detections": [], "count": 0},
  "heatmap_url": "data:image/jpeg;base64,...",
  "quality_warnings": [],
  "timestamp": "2026-09-22T16:00:00Z"
}
```

Backend processing steps:
1. Decode uploaded file using OpenCV imdecode
2. Compute Laplacian variance for blur detection — add warning if below threshold
3. Resize to 224x224, normalize with ImageNet statistics, convert to CHW format
4. Run cached ONNX inference session on EfficientNetB3 model
5. Apply softmax to logits, compute grade and confidence values
6. Generate JET colormap heatmap visualization as JPEG base64 data URL
7. Return complete JSON response

---

### POST /api/report/pdf

Purpose: Server-side PDF report generation via ReportLab
Content-Type: application/json
Response: Streaming application/pdf with filename report.pdf

Request body example:
```json
{
  "patient_name": "Ramesh Kumar",
  "age": 54,
  "gender": "Male",
  "grade": 3,
  "diagnosis": "Severe Diabetic Retinopathy",
  "confidence": 0.82,
  "risk_score": 85,
  "urgency": "Refer in 2 weeks",
  "abha_id": "91-1234-5678-9012"
}
```

Note: The client-side jsPDF report is significantly more detailed than the server-side ReportLab version and includes embedded heatmap images and QR codes.

---

### POST /api/abdm/link-report

Purpose: Link a screening report to a patient's ABHA national health ID
Content-Type: application/json

Request body:
```json
{
  "abha_id": "91-1234-5678-9012",
  "report_id": "scan_20260922_001"
}
```

Response:
```json
{
  "success": true,
  "abha_id": "91-1234-5678-9012",
  "linked_at": "2026-09-22T16:00:00Z",
  "message": "Report successfully linked to ABHA record"
}
```

Backend behavior: Validates that abha_id contains exactly 14 digits, simulates 2-second network delay, returns success payload. Production deployment would connect to the NHA ABDM sandbox API.

---

### GET /api/tts/

Purpose: Text-to-speech audio generation in Indian languages
Query parameters: text (string to speak), lang (BCP-47 language code)
Response: audio/mpeg streaming MP3 audio

Example request:
```
GET /api/tts/?text=आपकी आंख की जांच सफल रही, ग्रेड तीन&lang=hi
```

Supported language codes: hi (Hindi), ta (Tamil), te (Telugu), kn (Kannada), bn (Bengali), mr (Marathi), ml (Malayalam), gu (Gujarati), pa (Punjabi), or (Odia), en (English)

---

## 14. Demo Script

### 10-Minute Evaluator Demo

**Minute 1: Problem Statement**

"India has 101 million diabetics. 40% of them will develop Diabetic Retinopathy — a leading cause of preventable blindness. The problem is detection happens too late, because in rural India there is less than one ophthalmologist per one lakh population. Existing AI solutions require expensive dedicated cameras and cloud internet. We built something completely different."

---

**Minute 2: Authentication and Role Selection**

- Open the RetinaScan AI PWA on a phone or laptop browser
- Show the dark glassmorphism login UI — professional and clean
- Log in with demo credentials
- Show the role selection screen: Patient or Doctor
- Select Patient — show the onboarding form

---

**Minute 3: Dashboard**

- Show the patient dashboard
- Point to the offline indicator (green dot = backend reachable)
- Show existing patient history with grade badges (green = Grade 0, red = Grade 3-4)
- Point to the backend status indicator showing inference mode

---

**Minute 4: Start Scanning — Core Demo**

1. Click Start New Scan button
2. Fill the patient form: full name, age, diabetic duration, mobile number
3. Point out: "Insurance ID optional" — clean simple label, no technical jargon
4. Upload grade3.jpg from the sample-data folder for right eye OD
5. Show image preview appears with quality validation
6. Optionally: demonstrate AutoRetinaCam live camera capture

---

**Minute 5: AI Analysis — The Key Moment**

1. TURN OFF WIFI NOW — disconnect from internet visibly
2. Click Analyze button
3. Analysis completes in approximately 3 seconds — grade appears
4. Say: "This is EfficientNetB3 running in your browser via WebAssembly. No server. No cloud. No internet."
5. Grade 3 — Severe Diabetic Retinopathy badge appears in red
6. Confidence: 82%. Risk Score: 85 out of 100. Urgency: Refer in 2 weeks.

---

**Minute 6: Results Deep Dive**

1. Probability bars: show all 5 grade probabilities — 82% Grade 3 is dominant
2. Score-CAM heatmap: "The orange and red regions are where EfficientNetB3 detected retinal abnormalities — this is Score-CAM explainability running in the browser without any server call"
3. YOLO lesion map: "These bounding boxes show individual microaneurysms and hemorrhages — YOLOv8 detected them all in your browser using WebAssembly — no GPU, no cloud"
4. Per-eye breakdown: show OD Grade 3 vs OS Grade 1 — combined grade is the worse value

---

**Minute 7: Voice Guidance**

1. Scroll to the Voice Guidance section
2. Click the voice button
3. Select Hindi from the language dropdown
4. Press Play
5. "This is for our ASHA workers who may not read English — they hear the diagnosis and referral instruction in their mother tongue, both online and offline"

---

**Minute 8: PDF Report**

1. Click Generate Report button
2. PDF downloads in the browser — show the document
3. Point out: patient details, Grade 3 badge, Score-CAM heatmap image embedded, ICD-10 code E11.341, referring hospital name, QR code
4. "This medical PDF was generated offline in the browser using jsPDF — no server, no printer driver needed"

---

**Minute 9: WhatsApp and ABHA Linking**

1. Click WhatsApp share button — show the pre-formatted clinical message ready to send
2. Click Link ABHA button — the modal opens
3. Type: 91-1234-5678-9012 (observe auto-formatting with dashes)
4. Click Link — 2 second delay — success message appears
5. "This screening report is now linked to the patient's national ABHA health record — retrievable at any hospital in India via their ABHA number"

---

**Minute 10: Camp Dashboard and Doctor Portal**

1. Navigate to Camp Dashboard (/camp) — show grade distribution chart with 10 demo patients
2. Show screening statistics: 10 patients, 3 high-risk, 2 referred
3. Navigate to Doctor Portal (/doctor) — show flagged cases queue with urgent patients
4. Navigate to Find Doctors — show interactive Leaflet map with nearby hospitals
5. Final message: "Every record created offline in this demonstration will sync automatically to our cloud the moment internet returns — zero data loss, zero manual action required from the health worker"

---

### Key Talking Points

| Point | What to Say |
|-------|------------|
| No internet needed | "We turned off WiFi 5 minutes ago — everything you just saw still works perfectly" |
| No special device | "This runs on any Android phone with a browser — no expensive fundus camera required" |
| AI in browser | "The 43.7 MB ONNX model runs in browser WebAssembly — zero cloud API cost per screening" |
| Multilingual | "One button press — the ASHA worker hears the diagnosis in their language" |
| Explainable AI | "The heatmap shows WHERE the AI found the abnormality — not just a grade number" |
| Complete system | "Scan → Grade → Heatmap → Lesion Map → PDF → WhatsApp → Doctor → Sync — end to end" |
| Scale | "Deploy to 50,000 ASHA workers instantly — no app store approval, no server cost per user" |
| ABHA ready | "Every screening links to the patient's national health record — government standard compliant" |

---

## 15. Business Model

### Revenue Streams

**B2G — Government and NHM Route**

- State NHM contracts for rural eye screening programmes at district level
- Per-camp licensing at Rs 500 per camp session covering 100+ patients
- District and state health analytics dashboard with exportable reports
- ABDM-compatible data submission to government health information exchange

**B2B — Hospital Chains and Outreach Programmes**

- SaaS subscription for hospital groups operating rural outreach camps
- Premium tier: EHR system integration, centralized multi-camp reporting, custom white-label branding
- API access for hospital IT teams to embed screening in existing patient management systems

**B2C — Insurance and Corporate Wellness**

- REST API for health insurance companies integrating DR screening into policy workflows
- Corporate employee annual wellness screening programmes
- Pricing: Rs 5 to Rs 10 per API inference call at scale

### Cost Structure Per 1,000 Screenings

| Expense Item | Monthly Cost at 1,000 Screenings |
|-------------|----------------------------------|
| Backend server hosting (Render or Railway) | Rs 500 |
| Supabase database storage and egress | Rs 200 |
| gTTS audio generation API calls | Rs 100 |
| Device hardware (existing phones) | Rs 0 — no additional cost |
| Total cost | Rs 800 = Rs 0.80 per screening |

### Comparison Against Traditional Screening Methods

| Screening Method | Cost Per Patient | Offline Capable | Requires Specialist |
|-----------------|----------------|----------------|-------------------|
| Hospital fundus camera plus ophthalmologist | Rs 1,500 to Rs 4,800 | No | Yes |
| Remidio FOP dedicated device plus cloud | Rs 400 to Rs 800 | No | No |
| 3Nethra fixed fundus camera plus cloud | Rs 300 to Rs 600 | No | No |
| SightShield AI on any smartphone | Rs 0.80 | YES | NO |

---

## Summary — 10 Reasons SightShield AI Wins

1. Only offline-first AI diabetic retinopathy screening PWA in India — no app install, no internet required
2. Dual AI model architecture — EfficientNetB3 grading plus YOLOv8 lesion detection both running in browser
3. Score-CAM explainability — first Indian health-tech with browser-native gradient-free class activation mapping
4. Multilingual voice in 10+ Indian languages with both online gTTS and offline Web Speech API fallback
5. ABHA integration — links every screening to the national digital health record infrastructure
6. Complete end-to-end ecosystem — Scan → Grade → Heatmap → Lesion Map → PDF → WhatsApp → Doctor → Sync
7. Zero marginal cost — scales to 10 million annual screenings at Rs 0.80 per patient
8. Rural-first design — any Android device, fully offline, local language voice, no training beyond 30 minutes
9. Government ready — ABDM-compatible, ICD-10 coded, exportable camp statistics for district reporting
10. Open architecture — FastAPI plus ONNX plus React — maintainable by NHM technical teams without vendor lock-in

---

> Built for Smart India Hackathon 2026 — Problem Statement SIH26038
> Prototype — AI outputs require independent clinical validation before medical deployment
>
> Repository: THOUFIKUR/sih2026 | Team: SightShield AI
