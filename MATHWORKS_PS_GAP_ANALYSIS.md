# MATHWORKS_PS_GAP_ANALYSIS.md
## RetinaScan AI — SIH26038 — MathWorks Problem Statement Gap Analysis
> Audit performed: September 2026 · Repository: THOUFIKUR/sih2026
> **DO NOT MODIFY ANYTHING BASED ON THIS DOCUMENT ALONE — get approval first**

---

## Audit Methodology

1. Read official PS: `SIH26038.md` (MathWorks, SIH 2026)
2. Inspected all files in: `frontend/`, `backend/`, `matlab/`, `data/`
3. Compared every PS requirement against actual code
4. Marked status: **COMPLETE / PARTIAL / MISSING**

---

## Official PS Requirements (Source: SIH26038.md)

**Requirement 1 — Image Quality Assessment and Enhancement**
> Automatically evaluate fundus images for adequacy (focus, illumination, field of view). Apply adaptive enhancement (CLAHE, illumination normalization, denoising) for borderline images; reject ungradeable ones with recapture feedback.

**Requirement 2 — Retinal Structure Segmentation**
> Extract clinically relevant structures — optic disc/fovea localization, vessel segmentation, microaneurysm detection, exudate segmentation, hemorrhage classification, and neovascularization detection.

**Requirement 3 — DR Severity Grading**
> Classify using the International Clinical DR severity scale (Levels 0–4) with clinically acceptable sensitivity (>90%) and specificity (>85%) for referable DR (Level 2+).

**Requirement 4 — Explainability Module**
> Implement Grad-CAM attention maps, lesion-level evidence correlated with clinical criteria, calibrated confidence scores, and automated annotated reports — enabling ophthalmologist validation in under 30 seconds for a human-in-the-loop workflow.

**Requirement 5 — Simulink Workflow Simulation**
> Model the telemedicine screening pipeline in Simulink — image acquisition rates, bandwidth constraints, processing throughput, and review capacity — to optimize resource allocation for district-level programs serving 100,000+ patients annually.

---

## Requirement Matrix

### PS Requirement 1: Image Quality Assessment and Enhancement

| Sub-requirement | Existing File | Technology | Status | Required Action |
|----------------|--------------|-----------|--------|----------------|
| Blur / focus detection | `backend/routes/inference.py` L308-310 | Python OpenCV Laplacian variance | **COMPLETE** | None |
| CLAHE enhancement | `matlab/preprocessing/adaptive_clahe_retina.m` | MATLAB `adapthisteq` | **COMPLETE** | None |
| Illumination check (mean intensity) | `matlab/preprocessing/check_image_quality.m` L26 | MATLAB | **COMPLETE** | None |
| Field of view coverage | `matlab/preprocessing/check_image_quality.m` L29-30 | MATLAB `retinaMask` | **COMPLETE** | None |
| Entropy measurement | `matlab/preprocessing/check_image_quality.m` L25 | MATLAB `entropy()` | **COMPLETE** | None |
| Recapture feedback | `matlab/preprocessing/check_image_quality.m` L41-50 | MATLAB structured feedback string | **COMPLETE** | None |
| Frontend quality warnings | `frontend/src/utils/imagePreprocessing.js` | JavaScript heuristics | **COMPLETE** | None |
| Backend quality warnings field | `backend/routes/inference.py` L413-416 | Python | **COMPLETE** | None |
| Quality score as single numeric value | Missing — check_image_quality returns struct but no normalized 0-100 score | — | **PARTIAL** | Add `quality_score` normalized field to `check_image_quality.m` |
| Denoising (illumination normalisation) | Not implemented in MATLAB | — | **PARTIAL** | Add Gaussian denoising step to `adaptive_clahe_retina.m` |

**Requirement 1 Overall: PARTIAL** — Core IQA implemented; score normalization and denoising missing.

---

### PS Requirement 2: Retinal Structure Segmentation

| Sub-requirement | Existing File | Technology | Status | Required Action |
|----------------|--------------|-----------|--------|----------------|
| Vessel segmentation | `matlab/segmentation/segment_retinal_vessels.m` | MATLAB `fibermetric` (Hessian-based) | **COMPLETE** | None |
| DRIVE benchmark validation | `matlab/segmentation/segment_retinal_vessels.m` comment only | MATLAB — no metric computation | **PARTIAL** | Add DRIVE Dice/IoU metric computation using `data/samples/drive/` |
| Microaneurysm detection (YOLO) | `backend/routes/inference.py` L53-56 + YOLO model | ONNX YOLOv8 | **COMPLETE** | None |
| Microaneurysm detection (MATLAB) | Missing dedicated MATLAB MA module | — | **PARTIAL** | Add `matlab/lesion_analysis/detect_microaneurysms.m` using morphological top-hat |
| Exudate segmentation | YOLO bounding boxes only (detection not segmentation) | ONNX YOLOv8 | **PARTIAL** | Add `matlab/lesion_analysis/segment_exudates.m` using bright region thresholding |
| Hemorrhage classification | `inference.py` L53 YOLO class 0 (detection) | ONNX YOLOv8 | **PARTIAL** | Add `matlab/lesion_analysis/classify_hemorrhages.m` |
| Optic disc localization | **MISSING** — no optic disc detection anywhere | — | **MISSING** | Add `matlab/retinal_structures/detect_optic_disc.m` |
| Fovea localization | **MISSING** — fovea only estimated heuristically in `inference.py` L331 as image center | Python heuristic | **MISSING** | Add `matlab/retinal_structures/localize_fovea.m` |
| Neovascularization detection | **MISSING** — no neovascularization module | — | **MISSING** | Add `matlab/lesion_analysis/detect_neovascularization.m` (research prototype) |
| Vessel density / A-V ratio | **MISSING** | — | **MISSING** | Add vessel density computation to vessel segmentation |
| Retinal structure overlay visualization | **MISSING** | — | **MISSING** | Add visualization output to each MATLAB module |

**Requirement 2 Overall: PARTIAL** — Vessels and YOLO lesion detection exist. Optic disc, fovea, and neovascularization MISSING. YOLO gives detection (bbox) not segmentation (pixel mask) for exudates/MA — must be clearly labeled.

---

### PS Requirement 3: DR Severity Grading

| Sub-requirement | Existing File | Technology | Status | Required Action |
|----------------|--------------|-----------|--------|----------------|
| 5-class ICDR grading (0–4) | `backend/routes/inference.py` L182-218 | EfficientNetB3+CBAM ONNX | **COMPLETE** | None |
| Correct ICDR class terminology | `inference.py` MAP array L184-218 uses correct labels | Python | **COMPLETE** | None |
| Browser offline grading | `frontend/src/utils/model.worker.js` | onnxruntime-web WASM | **COMPLETE** | None |
| Clinical arbitration engine | `inference.py` L315-392 (ETDRS 4-2-1 rule) | Python | **COMPLETE** | None |
| Sensitivity >90% for referable DR | `matlab/validation/evaluate_icdr_benchmarks.m` claims 95.8% | MATLAB simulation (synthetic) | **PARTIAL** | Evaluate against actual IDRiD samples |
| Specificity >85% for referable DR | Same file claims 97.6% | MATLAB simulation (synthetic) | **PARTIAL** | Evaluate against actual IDRiD samples |
| Multi-center ablation comparison | `evaluate_icdr_benchmarks.m` — uses synthetic rng(42) data | MATLAB | **PARTIAL** | Evaluation uses random seed simulation, not real model predictions |
| Quadratic Weighted Kappa | Hardcoded κ = 0.952 in `evaluate_icdr_benchmarks.m` L68 | MATLAB | **PARTIAL** | Compute actual QWK from model predictions on IDRiD samples |

**Requirement 3 Overall: PARTIAL** — Grading model and clinical logic are solid. Validation metrics use synthetic data, not actual model inference against real dataset labels.

---

### PS Requirement 4: Explainability Module

| Sub-requirement | Existing File | Technology | Status | Required Action |
|----------------|--------------|-----------|--------|----------------|
| Grad-CAM / Score-CAM attention map | `backend/routes/inference.py` L122-175 | Python CLAHE + YOLO fusion heatmap | **PARTIAL** | Current heatmap is microvascular saliency, not true Grad-CAM backprop |
| Browser Score-CAM | `frontend/src/utils/model.worker.js` | ONNX feature map Score-CAM | **COMPLETE** | None |
| Lesion-level evidence correlated with clinical criteria | `inference.py` L315-392 clinical arbitration | Python | **COMPLETE** | None |
| Calibrated confidence scores | **MISSING** — raw softmax probability presented as confidence | — | **MISSING** | Add `matlab/explainability/calibrate_confidence.m` using Platt scaling or temperature |
| Automated annotated reports | `backend/routes/report.py` (server PDF) + `frontend/src/utils/pdfReport.js` (client PDF) | Python ReportLab + jsPDF | **COMPLETE** | None |
| <30 second ophthalmologist validation | Not explicitly measured | — | **PARTIAL** | Add timing benchmark to documentation |
| MATLAB explainability overlay | **MISSING** | — | **MISSING** | Add `matlab/explainability/visualize_gradcam_overlay.m` |

**Requirement 4 Overall: PARTIAL** — Heatmap exists and reports work. Calibrated confidence is MISSING. MATLAB explainability visualization MISSING.

---

### PS Requirement 5: Simulink Workflow Simulation

| Sub-requirement | Existing File | Technology | Status | Required Action |
|----------------|--------------|-----------|--------|----------------|
| 100,000+ patient district model | `matlab/simulink/run_telemedicine_simulation.m` L21 | MATLAB script | **COMPLETE** | None |
| Bandwidth constraints | `run_telemedicine_simulation.m` L27-36 | MATLAB | **COMPLETE** | None |
| Processing throughput | `run_telemedicine_simulation.m` L51-67 | MATLAB | **COMPLETE** | None |
| Review capacity / ophthalmologist queue | `run_telemedicine_simulation.m` L39-47 | MATLAB | **COMPLETE** | None |
| Configurable scenarios (A/B comparison) | `run_telemedicine_simulation.m` L30 (A) + L49 (B) | MATLAB | **COMPLETE** | None |
| 4-panel visualization dashboard | `run_telemedicine_simulation.m` L83-151 | MATLAB figure with subplots | **COMPLETE** | None |
| Actual Simulink .slx file | **MISSING** — `run_telemedicine_simulation.m` is a MATLAB script, not a Simulink model | — | **PARTIAL** | PS says "Simulink model" — a .slx or equivalent Simulink diagram should exist; script is acceptable for demonstration but .slx is preferred |
| Scenario C/D (poor/intermittent/offline) | Only 2 scenarios (A=centralized, B=edge hybrid) | MATLAB | **PARTIAL** | Add offline/2G-only and multi-node scenarios |
| Resource allocation experiment | Implicitly modeled in Scenario B | MATLAB | **PARTIAL** | Add multi-node scaling experiment |

**Requirement 5 Overall: PARTIAL-to-COMPLETE** — The simulation script is thorough and produces real computed values. Main gap: no .slx Simulink file; the script IS the simulation but reviewers may expect a .slx diagram.

---

## Master Entry Point Gap

| Item | Status | Required Action |
|------|--------|----------------|
| `matlab/run_retinascan_demo.m` | **MISSING** | Create master entry point that orchestrates all modules |

The PS says: *"A working prototype demonstrating..."* — there must be a single runnable entry point.

---

## Summary of All Gaps

### MISSING (must add)
1. `matlab/retinal_structures/detect_optic_disc.m` — optic disc localization
2. `matlab/retinal_structures/localize_fovea.m` — fovea localization
3. `matlab/lesion_analysis/detect_microaneurysms.m` — morphological MA detection
4. `matlab/lesion_analysis/segment_exudates.m` — bright-region exudate segmentation
5. `matlab/lesion_analysis/classify_hemorrhages.m` — hemorrhage analysis
6. `matlab/lesion_analysis/detect_neovascularization.m` — research prototype
7. `matlab/explainability/calibrate_confidence.m` — temperature scaling calibration
8. `matlab/explainability/visualize_gradcam_overlay.m` — MATLAB heatmap overlay
9. `matlab/run_retinascan_demo.m` — MASTER ENTRY POINT

### PARTIAL (needs extension)
10. `matlab/validation/evaluate_icdr_benchmarks.m` — add actual IDRiD prediction pass (currently synthetic only)
11. `matlab/segmentation/segment_retinal_vessels.m` — add DRIVE Dice/IoU metrics using `data/samples/drive/`
12. `matlab/preprocessing/adaptive_clahe_retina.m` — add Gaussian denoising step
13. `matlab/preprocessing/check_image_quality.m` — add normalized 0–100 quality_score
14. `matlab/simulink/run_telemedicine_simulation.m` — add Scenario C (intermittent) + D (offline-only) + multi-node scaling

### COMPLETE (do not touch)
- EfficientNetB3+CBAM ONNX grading (backend + browser)
- YOLOv8 lesion detection (backend + browser)
- Browser Score-CAM (model.worker.js)
- Clinical arbitration engine (ETDRS 4-2-1)
- IndexedDB offline PWA
- Supabase sync
- PDF reports (client + server)
- TTS multilingual voice
- ABHA ID linking
- Doctor portal
- Camp dashboard
- Longitudinal chart
- Find doctors map
- Vessel segmentation (fibermetric)
- CLAHE preprocessing
- IQA (check_image_quality.m)
- Telemedicine simulation (run_telemedicine_simulation.m)

---

## Files to Add (Zero Deletions)

```
matlab/
├── run_retinascan_demo.m                       [NEW - MASTER ENTRY]
├── retinal_structures/
│   ├── detect_optic_disc.m                     [NEW]
│   └── localize_fovea.m                        [NEW]
├── lesion_analysis/
│   ├── detect_microaneurysms.m                 [NEW]
│   ├── segment_exudates.m                      [NEW]
│   ├── classify_hemorrhages.m                  [NEW]
│   └── detect_neovascularization.m             [NEW]
└── explainability/
    ├── calibrate_confidence.m                  [NEW]
    └── visualize_gradcam_overlay.m             [NEW]
```

And extend (NOT replace) 4 existing MATLAB files.

---

## Architecture Impact

The existing React + FastAPI + ONNX + Supabase architecture is **unchanged**.
MATLAB components are an additional engineering/research layer:

```
EXISTING PRODUCTION PATH (unchanged):
  React PWA → FastAPI → EfficientNetB3 ONNX → YOLO ONNX → Supabase

MATLAB RESEARCH PATH (new, parallel, non-breaking):
  MATLAB run_retinascan_demo.m
    → check_image_quality.m (IQA)
    → adaptive_clahe_retina.m (enhancement)
    → detect_optic_disc.m
    → localize_fovea.m
    → segment_retinal_vessels.m (+ DRIVE metrics)
    → detect_microaneurysms.m
    → segment_exudates.m
    → classify_hemorrhages.m
    → detect_neovascularization.m
    → calibrate_confidence.m
    → visualize_gradcam_overlay.m
    → evaluate_icdr_benchmarks.m
    → run_telemedicine_simulation.m (extended)
```

MATLAB unavailability does NOT affect the deployed web application.

---

*Gap analysis complete. No files modified. Awaiting implementation approval.*
