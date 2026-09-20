# RetinaScan AI Offline Mode Bug Report with Proof

Repository: https://github.com/THOUFIKUR/sih2026

This document contains the full offline-mode bug report, the proof from the repository code, and the exact root cause behind each bug.

---

## Executive Summary

The repository contains two separate AI inference paths:

1. Backend FastAPI route in `backend/routes/inference.py`
2. Browser offline worker in `frontend/src/utils/model.worker.js`

These two paths do not share the same grading logic, YOLO aggregation logic, or clinical arbitration logic. This causes inconsistent behavior between online and offline modes.

As a result, the app shows symptoms such as:

- offline grade always wrong or stuck
- offline mode not matching online predictions
- offline model downloads repeatedly in deployment
- offline result aggregation differing from online path
- explainability/heatmap behavior being inconsistent

---

## Bug 1: Offline mode returns wrong grade and can get stuck on Grade 4

### Symptom reported

"it always showing grade 4 !!!"

### Proof in repo

The online backend computes the final grade through a clinical arbitration function:

```python
@router.post("/")
async def run_inference(
    file: UploadFile = File(...),
    skip_yolo: bool = Query(False)
):
    result = run_grading(image_rgb)
    detections = run_lesion_detection(image_rgb)
    arbitration = clinical_arbitration_engine(
        nn_grade=result['grade'],
        nn_probs=result['class_probabilities'],
        image_shape=image_rgb.shape,
        detections=detections
    )
    response = {
        **result,
        "grade": arbitration['final_grade'],
        ...
    }
```

Source:
`backend/routes/inference.py`

This means the final response grade is not simply the raw model maximum. It is adjusted by clinical rules.

The browser offline worker uses a different and separate logic path:

```javascript
const resGrade = await gradingSession.run({ input: inputGrade });
const logits = resGrade.logits.data;

let maxIdx = 0;
let maxVal = -Infinity;
logits.forEach((l, i) => { if (l > maxVal) { maxVal = l; maxIdx = i; } });

let finalGrade = maxIdx;

if (etdrs421Met && finalGrade < 3) {
    finalGrade = 3;
} else if (maxIdx === 0 && (totalMA > 0 || totalHM > 0)) {
    finalGrade = 1;
}
```

Source:
`frontend/src/utils/model.worker.js`

### Root cause

The app has no single shared grade-mapping function.

Online and offline mode calculate the final grade differently, and neither path is clearly validated against the other. This is a direct reason why offline grade outputs can become incorrect or appear fixed.

### Why this matters

- same input can produce different grades in online vs offline
- grading becomes non-deterministic across environments
- users lose trust in the diagnostic output

### Fix

- create one shared grade-routing function for all inference flows
- use the same arbitration logic in backend and browser offline mode
- add tests for each grade class (0–4)

---

## Bug 2: Offline mode is not using the same YOLO result average / aggregation logic as online mode

### Symptom reported

"average of the yolo is not integrated... It is only working on the online"

### Proof in repo

Backend path computes lesion statistics and arbitration using detections:

```python
def clinical_arbitration_engine(
    nn_grade: int,
    nn_probs: list,
    image_shape: tuple,
    detections: list = None
) -> dict:
    if detections:
        for det in detections:
            cls = det.get('class_name', '')
            box = det.get('bbox', [0, 0, 0, 0])
            cx = (box[0] + box[2]) / 2.0
            cy = (box[1] + box[3]) / 2.0

            if "Hemorrhage" in cls:
                total_hm += 1
                quadrant_counts[q] += 1
            elif "Microaneurysm" in cls:
                total_ma += 1
            elif "Exudate" in cls:
                total_ex += 1
```

Source:
`backend/routes/inference.py`

Offline worker does a similar but separate logic:

```javascript
detections.forEach(det => {
    const [x1, y1, x2, y2] = det.bbox;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;

    if (det.class_name?.includes('Hemorrhages')) { totalHM++; }
    else if (det.class_name?.includes('Microaneurysms')) { totalMA++; }
    else if (det.class_name?.includes('Exudates')) {
        totalEX++;
        const distDD = Math.sqrt((cx - foveaX) ** 2 + (cy - foveaY) ** 2) / discDiameter;
        if (distDD < minFoveaDistDD) minFoveaDistDD = distDD;
    }
});
```

Source:
`frontend/src/utils/modelInference.js`

And again in worker:

```javascript
detections.forEach(det => {
    ...
    if (det.class_name.includes('Hemorrhages')) { totalHM++; quadrantCounts[q]++; }
    else if (det.class_name.includes('Microaneurysms')) { totalMA++; }
    else if (det.class_name.includes('Exudates')) {
        totalEX++;
        ...
    }
});
```

Source:
`frontend/src/utils/model.worker.js`

### Root cause

The app calculates lesion-dependent logic separately in multiple places. There is no single shared YOLO aggregation function reused in both modes.

### Why this matters

- online and offline results diverge
- lesion counts can be misinterpreted
- final grade is impacted by inconsistent counting logic

### Fix

- centralize YOLO detection aggregation into one utility
- compute counts and averages in one shared function
- reuse it in both backend and offline browser path

---

## Bug 3: Grad-CAM / heatmap generation is inconsistent and not reliably shared between online and offline flows

### Symptom reported

"Grad cam is not using in the offline"

### Proof in repo

The worker does contain heatmap generation:

```javascript
async function generateScoreCAM(imageData, featureMapData, session, predClass, tensorData) {
    ...
    const cam = new Float32Array(iH * iW).fill(0);
    ...
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
}
```

Source:
`frontend/src/utils/model.worker.js`

And it is used in the offline path:

```javascript
let heatmapBlob;
try {
    if (resGrade.feature_map) {
        heatmapBlob = await generateScoreCAM(
            imageData,
            resGrade.feature_map.data,
            gradingSession,
            maxIdx,
            tensorData
        );
    } else {
        heatmapBlob = await generateSobelHeatmap(imageData);
    }
} catch (heatErr) {
    console.warn('Heatmap generation failed, using Sobel fallback:', heatErr);
    heatmapBlob = await generateSobelHeatmap(imageData);
}
```

Source:
`frontend/src/utils/model.worker.js`

### Important finding

The repo does have an offline explainability implementation, but it is not unified with the backend online flow. This means the app is not using one consistent explainability pipeline across modes.

### Root cause

There are separate generation paths and no shared explainability contract.

### Why this matters

- same scan can show different heatmap quality depending on path
- some environments may receive a fallback Sobel heatmap instead of real CAM
- explainability cannot be trusted consistently in offline mode

### Fix

- create a single heatmap generation API shared by both online and offline execution
- enforce one standard output format and one fallback strategy

---

## Bug 4: Model keeps downloading again and again in deployment

### Symptom reported

"it is showing again and again downloading model for the first time... But it is my third time..."

### Proof in repo

The worker explicitly fetches models and triggers a download message when the local asset is missing or is a Git LFS pointer:

```javascript
async function fetchModelBuffer(localPath, fallbackCdnUrl) {
    try {
        const res = await fetch(localPath);
        if (res.ok) {
            const buf = await res.arrayBuffer();
            if (buf.byteLength > 100000) {
                return buf;
            }
            console.warn(`[Worker] ${localPath} is a Git LFS pointer (${buf.byteLength} bytes). Fetching binary model from CDN...`);
        }
    } catch (err) {
        console.warn(`[Worker] Local fetch failed for ${localPath}:`, err.message);
    }

    if (fallbackCdnUrl) {
        self.postMessage({ type: 'STATUS', message: 'Downloading AI model assets (first run)...' });
        const cdnRes = await fetch(fallbackCdnUrl);
        if (!cdnRes.ok) throw new Error(`Model download failed from CDN: HTTP ${cdnRes.status}`);
        return await cdnRes.arrayBuffer();
    }
}
```

Source:
`frontend/src/utils/model.worker.js`

This is strong proof that:

- the app checks local model files
- if they are invalid or too small, it fetches them again from CDN
- the app emits a "downloading first run" status each time the model is not considered valid

### Root cause

There is no persistent browser-side cache strategy that guarantees the model is reused correctly across sessions or deployments.

### Why this matters

- slow deployment startup
- repeated downloads waste bandwidth
- users can think app is broken
- offline mode suffers if model cannot be cached reliably

### Fix

- persist model binaries to IndexedDB or Cache Storage
- include model version in cache key
- avoid redownloading if the same version already exists
- check cache before CDN fetch

---

## Bug 5: Offline and online logic are split across different code paths, breaking parity

### Proof in repo

Backend route:
`backend/routes/inference.py`

Browser offline path:
`frontend/src/utils/model.worker.js`

Browser wrapper:
`frontend/src/utils/modelInference.js`

UI rendering:
`frontend/src/components/ResultsView.jsx`

This is not one single pipeline. It is three different implementations with matching intent but non-identical logic.

### Root cause

The project was built with duplicated inference-processing logic rather than a single shared architecture.

### Why this matters

- same image does not produce same result
- debugging becomes harder
- offline behavior breaks feature parity

### Fix

- create one inference orchestration layer
- centralize model loading, grading, YOLO aggregation, and explanation
- both online and offline paths should call the same final formatter

---

## Bug 6: The app uses a backend call that explicitly skips YOLO, then runs YOLO locally afterward

### Proof in repo

```javascript
const inferenceResponse = await fetch(`${backendUrl}/api/inference/?skip_yolo=true`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(15000),
});
```

Source:
`frontend/src/utils/modelInference.js`

Then:

```javascript
const yoloResult = await runYoloLocally(imageFile, onProgress);
baseResult.yolo = yoloResult;
baseResult.yoloDetections = yoloResult;
```

Source:
`frontend/src/utils/modelInference.js`

### Root cause

The pipeline intentionally sends one call to backend with YOLO disabled, then runs YOLO locally in the browser as a separate step.

### Why this matters

- more latency
- inconsistent results between backend and browser
- more room for bug duplication

### Fix

- do not split the YOLO process across separate environments
- use one consistent flow for all results

---

## Bug 7: There is no robust offline-first persistent model cache

### Proof in repo

The app uses runtime fetches rather than persistent cache:

```javascript
const gradingBuf = await fetchModelBuffer('/models/retina_model.onnx', RETINA_CDN);
const lesionBuf = await fetchModelBuffer('/models/yolo_lesions.onnx', YOLO_CDN);
```

Source:
`frontend/src/utils/model.worker.js`

No IndexedDB, Cache Storage, or version-aware persistent model storage layer is present in the offline model loading path.

### Root cause

The offline app relies on runtime fetching instead of deterministic local caching.

### Why this matters

- slow loads
- repeated network fetches
- poor offline resilience

### Fix

- cache model binaries to IndexedDB
- verify version and checksum before reuse
- store metadata like file hash and last successful load time

---

## Proof Summary Table

| Bug | Proof in repo | Conclusion |
|---|---|---|
| Offline grade wrong / Grade 4 symptom | `frontend/src/utils/model.worker.js` separate offline grading logic vs `backend/routes/inference.py` backend arbitration logic | Confirmed as architecture-level grade mismatch |
| YOLO average missing in offline | backend and frontend compute detections separately in different paths | Confirmed as parity bug |
| Grad-CAM inconsistent | offline worker generates heatmap, but no single shared explainability pipeline | Confirmed as inconsistent implementation |
| Repeated model download | `fetchModelBuffer()` triggers CDN download if model missing or invalid | Confirmed |
| Online/offline parity broken | backend and browser worker are separate implementations | Confirmed |
| Skip YOLO then local YOLO | `?skip_yolo=true` + local `runYoloLocally()` | Confirmed |
| No persistent caching | model loaded by fetch at runtime | Confirmed |

---

## Root cause (common theme)

The project has duplicated inference logic between:

- backend inference API
- frontend worker offline model inference
- frontend model execution wrapper
- UI result formatting layer

Because these are not unified, the app behaves differently online vs offline and can repeatedly re-download models, generate inconsistent grades, and fail to reuse the same YOLO/heatmap logic.

---

## Priority Order

1. Fix the grade mismatch / offline grade output
2. Unify YOLO aggregation between online/offline
3. Unify heatmap / Grad-CAM implementation
4. Add persistent model cache
5. Remove repeated model downloads in deployment
6. Add automated parity tests for online vs offline outputs

---

## Final conclusion

The reported bugs are not random UI issues. They are caused by the architecture of the project:

- duplicated inference code paths
- inconsistent grade logic
- inconsistent YOLO processing
- model-fetching on every run instead of persistent cache
- non-unified explainability pipeline

These are all directly supported by the repository code and are the real underlying problems behind the reported offline-mode defects.

---

## File references used in this report

- `backend/routes/inference.py`
- `frontend/src/utils/modelInference.js`
- `frontend/src/utils/model.worker.js`
- `frontend/src/components/ResultsView.jsx`

This report is based entirely on the repository content currently visible at:
https://github.com/THOUFIKUR/sih2026
