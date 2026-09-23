# RetinaScan AI — System Architecture

This diagram shows the deployed web application, the browser/offline inference path, the data services, and the MATLAB/Simulink research and engineering path.

> **Important:** MATLAB is a separate research/engineering pipeline. It is not required by the React/FastAPI production web inference path. The MATLAB pipeline consumes fundus images independently and produces analysis, overlays, validation outputs, and telemedicine simulation results.

## End-to-end architecture

```mermaid
flowchart TB
    %% Actors and client
    USER[Healthcare worker / patient / doctor]
    CAM[Fundus camera or image upload]

    subgraph CLIENT[Frontend — React/Vite Progressive Web App]
        AUTH[Supabase authentication\nand profile/role loading]
        UI[Scanner, dashboard, doctor portal\nand results views]
        PREP[Client validation\nand image preprocessing]
        NET{Network available\nand backend responds?}
        ONLINE[Online inference client\nmodelInference.js]
        WORKER[Browser inference worker\nONNX Runtime Web + WASM]
        BROWSER_GRADE[Browser retina_model.onnx\nEfficientNet-B3-style classifier]
        BROWSER_YOLO[Browser yolo_lesions.onnx\nlesion detector]
        LOCAL[IndexedDB\npatients, sync_queue, doctor_reviews, audit_log]
        REPORT[Client PDF, QR code,\nvoice and sharing]
    end

    subgraph API[Backend — FastAPI / Python]
        MAIN[main.py\nAPI and router registration]
        INF[/api/inference/\nimage decode, quality check, inference]
        GRADE[ONNX Runtime\nretina_model.onnx]
        YOLO[ONNX Runtime\nyolo_lesions.onnx]
        ARB[Clinical arbitration\nrisk, urgency, referral flags]
        HEATMAP[OpenCV evidence heatmap\nCLAHE + green channel + JET]
        PDF[/api/report/pdf\nReportLab]
        TTS[/api/tts/\ngTTS fallback]
        ABDM[/api/abdm/link-report\nABDM mock]
    end

    subgraph CLOUD[Cloud services]
        SUPA[Supabase Auth, Database\nand Storage]
        STORAGE[(patient-scans\nimage/heatmap storage)]
    end

    %% MATLAB path
    subgraph MATLAB[MATLAB / Simulink — Research and engineering path]
        MENTRY[run_retinascan_demo.m\nmaster MATLAB entry point]
        MQUALITY[Image quality assessment\ncheck_image_quality.m]
        MENHANCE[Green-channel enhancement\nadaptive_clahe_retina.m]
        MSTRUCT[Retinal structures\noptic disc, fovea, vessels]
        MLESION[Lesion analysis\nmicroaneurysms, exudates, hemorrhages, NV]
        MEXPLAIN[Explainability\ncalibration + annotated overlay]
        MVALID[Validation and benchmarks\nevaluate_icdr_benchmarks.m]
        SIM[Telemedicine simulation\nrun_telemedicine_simulation.m]
        MRESULTS[MATLAB reports, overlays,\nmetrics and simulation dashboard]
    end

    USER --> AUTH
    CAM --> UI
    AUTH --> UI
    UI --> PREP
    PREP --> NET
    NET -->|Yes| ONLINE
    NET -->|No / failure| WORKER
    ONLINE -->|multipart image| MAIN
    MAIN --> INF
    INF --> GRADE
    INF --> YOLO
    GRADE --> ARB
    YOLO --> ARB
    INF --> HEATMAP
    ARB --> ONLINE
    HEATMAP --> ONLINE
    WORKER --> BROWSER_GRADE
    WORKER --> BROWSER_YOLO
    BROWSER_GRADE --> WORKER
    BROWSER_YOLO --> WORKER
    WORKER --> UI
    ONLINE --> UI
    UI --> LOCAL
    LOCAL -->|When online: queued sync| SUPA
    SUPA --> STORAGE
    UI --> REPORT
    ONLINE --> PDF
    ONLINE --> TTS
    ONLINE --> ABDM
    REPORT --> UI

    %% MATLAB flow
    CAM -. fundus image file .-> MENTRY
    MENTRY --> MQUALITY
    MQUALITY --> MENHANCE
    MENHANCE --> MSTRUCT
    MSTRUCT --> MLESION
    MLESION --> MEXPLAIN
    MEXPLAIN --> MRESULTS
    MENTRY --> MVALID
    MENTRY --> MRESULTS
    SIM --> MRESULTS
    MATLAB -. separate from deployed web inference .-> CLIENT

    classDef production fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef data fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef matlab fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef boundary fill:#f3e8ff,stroke:#9333ea,color:#111827;

    class CLIENT,API production;
    class CLOUD,LOCAL data;
    class MATLAB matlab;
```

## Main runtime flows

### 1. Online screening

1. A healthcare worker captures or uploads a fundus image in the React PWA.
2. The frontend performs client-side validation and sends the image to `POST /api/inference/` when the backend is reachable.
3. FastAPI runs the grading ONNX model, optional lesion detection, clinical arbitration, and an evidence heatmap.
4. The result returns to the UI with grade, confidence, risk, urgency, lesion findings, and explainability output.
5. The patient record is written to IndexedDB first and synchronized to Supabase when possible.

### 2. Offline or backend-failure screening

The browser worker runs `retina_model.onnx` and `yolo_lesions.onnx` using ONNX Runtime Web/WASM. Results are saved locally in IndexedDB. Full offline operation depends on the PWA assets, WASM runtime, and model binaries already being available on the device.

### 3. MATLAB and Simulink engineering workflow

`matlab/run_retinascan_demo.m` orchestrates the MATLAB path:

- image quality assessment and green-channel CLAHE enhancement;
- optic-disc/fovea and retinal-vessel analysis;
- lesion-analysis prototypes;
- confidence calibration and annotated overlays;
- validation/benchmark scripts.

`matlab/simulink/run_telemedicine_simulation.m` is a separate capacity and telemedicine scenario simulation. It models centralized versus edge-hybrid screening, bandwidth, specialist review capacity, queues, and operating assumptions. It does not serve web requests and is not called by FastAPI.

## Repository mapping

| Layer | Main location | Responsibility |
|---|---|---|
| Frontend | `frontend/` | React PWA, capture UI, routing, results, offline worker integration |
| Backend | `backend/` | FastAPI routes, ONNX inference, lesion processing, reports and TTS |
| Cloud data | Supabase references in frontend/backend | Authentication, patient data, settings, hospital lookup and storage |
| Training/export | `backend/training/`, `backend/scripts/` | Classifier training, model export and lesion-label preparation |
| MATLAB preprocessing | `matlab/preprocessing/` | Quality checks and retinal image enhancement |
| MATLAB analysis | `matlab/retinal_structures/`, `matlab/segmentation/`, `matlab/lesion_analysis/` | Structures, vessels and lesion-analysis research modules |
| MATLAB explainability | `matlab/explainability/` | Calibration and annotated visual explanations |
| MATLAB validation | `matlab/validation/` | Benchmark and evaluation scripts |
| MATLAB simulation | `matlab/simulink/` | Rural telemedicine capacity/scenario simulation |

## Architecture boundary

The production path is:

```text
React PWA → FastAPI or browser ONNX worker → result → IndexedDB → Supabase sync
```

The MATLAB path is:

```text
Fundus image → MATLAB master pipeline → analysis/overlays/validation
Scenario parameters → MATLAB telemedicine simulation → dashboard/metrics
```

The two paths support the same project and problem statement, but they are separate implementations and should not be presented as one runtime pipeline unless an explicit integration layer is added.
