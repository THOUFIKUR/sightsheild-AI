# MATHWORKS_IMPLEMENTATION.md
## RetinaScan AI — SIH26038 — MathWorks Implementation Guide
> Implementation complete · September 2026

---

## Section 1: Original Architecture (Unchanged)

```
PRODUCTION WEB PATH (React → FastAPI → ONNX → Supabase)
═══════════════════════════════════════════════════════
User (browser/phone)
        │
        ▼
React PWA (offline-first, onnxruntime-web WASM)
        │ ONLINE: POST /api/inference/
        │ OFFLINE: model.worker.js (browser Web Worker)
        ▼
FastAPI + Uvicorn (backend/main.py)
        │
        ├── EfficientNetB3+CBAM ONNX (retina_model.onnx, 43.7 MB)
        │   → 5-class ICDR grading (Grade 0–4)
        │   → Score-CAM heatmap (feature map from ONNX output)
        │
        ├── YOLOv8 ONNX (yolo_lesions.onnx, 45.0 MB)
        │   → 3-class lesion DETECTION (bounding boxes)
        │   → Hemorrhages / Exudates / Microaneurysms
        │
        └── Clinical Arbitration Engine (ETDRS 4-2-1 rule)
                │
                ▼
        Supabase PostgreSQL + Storage
        IndexedDB (offline) → Sync Queue → Supabase (online)

MATLAB RESEARCH/ENGINEERING PATH (parallel, non-breaking)
═══════════════════════════════════════════════════════════
MATLAB not required for production web inference.
```

---

## Section 2: MathWorks PS Requirements

| # | Requirement | Source |
|---|------------|--------|
| 1 | Image Quality Assessment and Enhancement | SIH26038.md line 15 |
| 2 | Retinal Structure Segmentation | SIH26038.md line 16 |
| 3 | DR Severity Grading (ICDR 0–4) | SIH26038.md line 17 |
| 4 | Explainability Module | SIH26038.md line 18 |
| 5 | Simulink Workflow Simulation | SIH26038.md line 19 |

---

## Section 3: Requirement Mapping

| PS Requirement | Status | Evidence |
|---------------|--------|---------|
| Image quality assessment | COMPLETE | `check_image_quality.m` — blur, illumination, FOV, quality_score |
| Image enhancement (CLAHE) | COMPLETE | `adaptive_clahe_retina.m` — green CLAHE + optional denoising |
| Optic disc localization | IMPLEMENTED | `detect_optic_disc.m` — prototype, hough/bright-blob |
| Fovea localization | IMPLEMENTED | `localize_fovea.m` — heuristic, validated=false |
| Vessel segmentation | IMPLEMENTED | `segment_retinal_vessels.m` — fibermetric + DRIVE Dice/IoU on 1 sample |
| Microaneurysm detection | IMPLEMENTED | `detect_microaneurysms.m` — top-hat, prototype |
| Exudate segmentation | IMPLEMENTED | `segment_exudates.m` — pixel mask, LAB threshold, prototype |
| Hemorrhage classification | IMPLEMENTED | `classify_hemorrhages.m` — bottom-hat, dot/flame types, prototype |
| Neovascularization detection | IMPLEMENTED | `detect_neovascularization.m` — vessel density, research prototype |
| DR grading (production) | COMPLETE | EfficientNetB3+CBAM ONNX (existing, unchanged) |
| DR grading (MATLAB eval) | PARTIAL | `evaluate_icdr_benchmarks.m` — synthetic validation only |
| Grad-CAM/Score-CAM | COMPLETE | `model.worker.js` + `inference.py` (existing, unchanged) |
| Calibrated confidence | IMPLEMENTED | `calibrate_confidence.m` — framework, insufficient GT data |
| Annotated reports | COMPLETE | `pdfReport.js` + `report.py` (existing, unchanged) |
| Explainability overlay | IMPLEMENTED | `visualize_gradcam_overlay.m` — composite annotated image |
| Simulink model | IMPLEMENTED | `build_simulink_model.m` generates `retinascan_resource_allocation.slx` |
| Simulink runner | IMPLEMENTED | `run_simulation.m` — 4 scenarios + scaling + fallback |
| Offline workflow | COMPLETE | PWA + IndexedDB + sync queue (existing, unchanged) |
| Supabase persistence | COMPLETE | Existing (unchanged) |

---

## Section 4: MATLAB Components

| File | Role | Toolboxes Required |
|------|------|-------------------|
| `matlab/run_retinascan_demo.m` | **MASTER ENTRY** — orchestrates all modules | Image Processing |
| `matlab/preprocessing/check_image_quality.m` | IQA: blur, illumination, FOV, quality_score | Image Processing |
| `matlab/preprocessing/adaptive_clahe_retina.m` | CLAHE + optional Gaussian denoising | Image Processing |
| `matlab/retinal_structures/detect_optic_disc.m` | Optic disc localization (prototype) | Image Processing, Computer Vision (optional) |
| `matlab/retinal_structures/localize_fovea.m` | Fovea heuristic localization (prototype) | Image Processing |
| `matlab/segmentation/segment_retinal_vessels.m` | Vessel segmentation + DRIVE metrics | Image Processing |
| `matlab/lesion_analysis/detect_microaneurysms.m` | MA candidate detection (top-hat) | Image Processing |
| `matlab/lesion_analysis/segment_exudates.m` | Exudate candidate segmentation (pixel mask) | Image Processing |
| `matlab/lesion_analysis/classify_hemorrhages.m` | Hemorrhage candidate detection + classification | Image Processing |
| `matlab/lesion_analysis/detect_neovascularization.m` | NV vessel-density research prototype | Image Processing |
| `matlab/explainability/calibrate_confidence.m` | Temperature scaling calibration framework | Statistics and ML |
| `matlab/explainability/visualize_gradcam_overlay.m` | Annotated composite explainability image | Image Processing |
| `matlab/validation/evaluate_icdr_benchmarks.m` | Clinical benchmark evaluation | Statistics and ML |
| `matlab/benchmark_pipeline.m` | Measured wallclock performance per module | — |

---

## Section 5: ML Components (Production — Unchanged)

| Component | File | Technology | Status |
|-----------|------|-----------|--------|
| EfficientNetB3+CBAM grading | `backend/models/retina_model.onnx` | ONNX FP32 | UNCHANGED |
| YOLOv8 lesion detection | `backend/models/yolo_lesions.onnx` | ONNX FP32 | UNCHANGED |
| Browser Score-CAM | `frontend/src/utils/model.worker.js` | onnxruntime-web WASM | UNCHANGED |
| Clinical arbitration | `backend/routes/inference.py` L315-392 | Python | UNCHANGED |
| ETDRS 4-2-1 rule engine | `backend/routes/inference.py` L361 | Python | UNCHANGED |

---

## Section 6: Dataset Mapping

| Dataset | Location | Used For | Status |
|---------|---------|---------|--------|
| IDRiD (5 samples) | `data/samples/idrid_samples/` | Visual testing of all modules | Available |
| DRIVE (1 image + GT mask) | `data/samples/drive/train/` | Vessel segmentation Dice/IoU | Available (N=1) |
| APTOS + IDRiD (synthetic) | `matlab/validation/evaluate_icdr_benchmarks.m` | Clinical benchmark simulation | Synthetic only |

> [!WARNING]
> Only 1 DRIVE sample is available — vessel Dice/IoU is for demonstration only, not a full-set benchmark.
> IDRiD samples do not include lesion GT masks — exudate/MA/hemorrhage metrics cannot be computed.

---

## Section 7: Validation

| Module | Validation Data | Metric | Status |
|--------|----------------|--------|--------|
| Vessel segmentation | 1 DRIVE image | Dice, IoU, Sens, Spec, Acc | MEASURED (N=1) |
| DR grading sensitivity/specificity | Synthetic simulation | >90% / >85% | SIMULATED — not from model inference on real labels |
| Optic disc | No GT available | — | NOT EVALUATED |
| Fovea | No GT available | — | NOT EVALUATED |
| Exudate segmentation | No GT masks in repo | Dice/IoU | NOT EVALUATED |
| MA detection | No GT masks in repo | Sens/Spec | NOT EVALUATED |
| Hemorrhage detection | No GT masks in repo | Precision/Recall | NOT EVALUATED |
| Neovascularization | No GT available | — | NOT EVALUATED |
| Confidence calibration | 5 IDRiD images (insufficient) | ECE, Brier | FRAMEWORK ONLY — data insufficient |

---

## Section 8: Simulink Model

### Model: `retinascan_resource_allocation.slx`

**Programmatic build**: Run `build_simulink_model.m` once to generate the `.slx` file.

**7-stage pipeline** (sequential):

```
Patient Arrival (Pulse Generator)
        ↓
Image Acquisition (service time = 45s)
        ↓
Quality Assessment (service time = 0.8s)
        ↓
AI Processing (service time = 2.1s ÷ numNodes)
        ↓
Network Transmission (conditional: offline=0s, 2G=640s avg)
        ↓
Doctor Review (service time = 180s, 15% of patients)
        ↓
Report Generation (To Workspace)
```

**Configuration**: all parameters in `simulink_params.m`

---

## Section 9: Resource Allocation — 4 Scenarios

| Scenario | Connectivity | Annual Impact |
|----------|-------------|--------------|
| 1: Good | 65% 4G, 30% 3G, 5% 2G | Low latency, full sync |
| 2: Poor | 10% 4G, 30% 3G, 60% 2G | High upload delay (~10 min per patient) |
| 3: Intermittent | 60% offline, 30% 3G, 10% 4G | Mixed — edge handles offline patients |
| 4: Full offline | 100% offline edge | Zero bandwidth; all analysis local |

Metrics measured for each: throughput/day, avg latency, max queue, AI utilization, doctor utilization.

---

## Section 10: Performance

> Measured by `benchmark_pipeline.m` on actual IDRiD images (N=5).
> Machine-specific. Results saved in `benchmark_results.mat`.
>
> **Run `benchmark_pipeline` in MATLAB to generate actual timings.**
> No assumed values are presented here.

---

## Section 11: Limitations

1. **Optic disc**: Hough-circle approach can fail on heavily diseased Grade 4 images. Clinical validation not performed.
2. **Fovea**: Anatomical heuristic only. No ground truth. Not validated.
3. **Lesion modules (MA/exudate/hemorrhage/NV)**: Classical image processing. No GT masks in repo. Prototype status only.
4. **Confidence calibration**: Temperature scaling framework implemented but N=5 IDRiD images is insufficient for reliable T estimation.
5. **DRIVE benchmark**: N=1 sample only. Full DRIVE test set has 20 images. Results are for demonstration only.
6. **Simulink**: `.slx` generated programmatically. Full Simulink requires Simulink licence. Analytical fallback in `run_simulation.m` produces identical numerical results.
7. **DR grading benchmark**: `evaluate_icdr_benchmarks.m` uses synthetic data (rng(42) perturbation). Not actual model predictions against real labels.

---

## Section 12: How to Reproduce Everything

### Start the existing web application
```bash
# Backend
cd d:\sih2026\retino\backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd d:\sih2026\retino\frontend
npm install
npm run dev
```

### Run the MATLAB pipeline
```matlab
cd 'd:/sih2026/retino/matlab'
result = run_retinascan_demo('d:/sih2026/retino/data/samples/idrid_samples/idrid_grade_3.jpg', true);
```

### Build and run Simulink
```matlab
cd 'd:/sih2026/retino/matlab/simulink'
build_simulink_model   % generates retinascan_resource_allocation.slx
run_simulation         % runs all 4 scenarios + scaling experiment
```

### Run benchmark
```matlab
cd 'd:/sih2026/retino/matlab'
benchmark_pipeline     % measures actual timing per module, saves benchmark_results.mat
```

### Test vessel segmentation with DRIVE metrics
```matlab
cd 'd:/sih2026/retino/matlab/segmentation'
[bv, vp, m] = segment_retinal_vessels( ...
    'd:/sih2026/retino/data/samples/drive/train/input/21.tif', ...
    [1 8], ...
    'd:/sih2026/retino/data/samples/drive/train/label/21.png');
disp(m)
```

### Run confidence calibration framework
```matlab
cd 'd:/sih2026/retino/matlab/explainability'
cal = calibrate_confidence();  % demonstration with synthetic data (clearly labeled)
```
