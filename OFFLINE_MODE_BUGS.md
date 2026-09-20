# Offline Mode Bugs and Required Features

## Overview

This document records the bugs and missing functionality reported for offline mode in `THOUFIKUR/sih2026`, along with the expected behavior and reasons each item should be addressed.

## Scope

The issues described here affect the offline inference flow, model loading and caching, grade prediction, Grad-CAM visualization, and YOLO result aggregation.

---

## Bugs

### 1. Offline mode always displays Grade 4

**Status:** Open  
**Area:** Offline prediction / grade classification  
**Severity:** Critical

#### Description

When the application is used in offline mode, it always displays **Grade 4**, regardless of the actual prediction produced by the model.

#### Expected behavior

The displayed grade must be calculated from the offline model's actual prediction and must change according to the input image and inference result.

#### Why this must be fixed

- It makes offline predictions unreliable.
- Users may receive an incorrect assessment for every image.
- It indicates that the offline result may be using a hard-coded fallback value or is not correctly reading the model output.
- It creates a mismatch between online and offline behavior.

#### Suggested investigation areas

- Check whether `Grade 4` is hard-coded in the offline UI or result-mapping logic.
- Verify that the offline inference response is passed to the grade-calculation function.
- Confirm that the correct class, confidence, and model output are used.
- Check for a fallback branch that always returns Grade 4.
- Test all supported grade outputs using representative images.

#### Acceptance criteria

- Offline mode displays the grade derived from the prediction.
- Different valid inputs can produce different grades.
- No hard-coded grade is used except for an explicitly documented error state.
- Online and offline grade mapping follows the same documented rules.
- Tests cover every supported grade and an invalid/inference-error response.

---

### 2. Grad-CAM is not used in offline mode

**Status:** Open  
**Area:** Offline explainability / Grad-CAM  
**Severity:** High

#### Description

Grad-CAM integration is available in the online flow, but it is not used when inference is performed in offline mode.

#### Expected behavior

After an offline prediction, the application should generate and display the Grad-CAM visualization for the same offline model inference, when the selected model supports Grad-CAM.

#### Why this must be fixed

- Users lose the visual explanation of the offline prediction.
- Offline and online modes provide different functionality for the same image.
- Explainability is important for validating whether the model focused on the relevant region.
- The feature is especially important when the application is used without network access.

#### Suggested implementation requirements

- Reuse the existing Grad-CAM processing logic where possible.
- Ensure the offline model exposes the required intermediate layer or activation output.
- Run Grad-CAM against the same image and prediction used to determine the grade.
- Handle models or prediction types that do not support Grad-CAM gracefully.
- Display a clear fallback message instead of silently omitting the visualization.

#### Acceptance criteria

- Offline predictions produce a Grad-CAM result when supported.
- The Grad-CAM image corresponds to the offline prediction and input image.
- The UI clearly indicates when Grad-CAM is unavailable.
- Grad-CAM generation does not require an online request.
- Online Grad-CAM behavior remains unchanged.

---

### 3. YOLO result average is not integrated in offline mode

**Status:** Open  
**Area:** Offline YOLO inference / result aggregation  
**Severity:** High

#### Description

The average of the YOLO results is integrated in online mode but is not integrated into the offline mode. Offline mode therefore does not use the same aggregation logic when multiple YOLO detections or predictions are available.

#### Expected behavior

Offline mode must calculate and use the YOLO result average according to the same rules as online mode.

#### Why this must be fixed

- Offline results may differ from online results for the same input.
- Ignoring the average can produce incorrect grades or classifications.
- Multiple detections need to be combined consistently before the final result is displayed.
- It causes inconsistent behavior between deployment modes.

#### Suggested investigation areas

- Identify the existing online YOLO averaging function and reuse it in offline mode.
- Confirm whether the average is calculated over confidence, score, bounding-box attributes, grade values, or another metric.
- Verify behavior when there are zero, one, or multiple detections.
- Ensure detections are filtered consistently before averaging.
- Confirm that the averaged result is passed into the grade-calculation logic.

#### Acceptance criteria

- Offline mode applies the same YOLO averaging algorithm as online mode.
- Zero, one, and multiple detections are handled safely.
- The averaged value is used in the final prediction or grade.
- Online and offline results match for the same model, image, and inputs.
- Tests cover multiple detections and empty detection results.

---

### 4. Model downloads repeatedly in the deployed application

**Status:** Open  
**Area:** Model loading / deployment caching  
**Severity:** High

#### Description

In the deployed application, the model appears to download again and again when the application is used for the first time or revisited. This occurs even after the model has already been downloaded and used previously. A report indicates that the model was downloaded for a third time instead of being reused from local storage or cache.

The same model loads in approximately five seconds in the local hostel environment, but the deployed application takes much longer and repeatedly shows the model-download process.

#### Expected behavior

The model should be downloaded only when it is not already available locally. After a successful download, subsequent uses should load the cached model without downloading it again.

#### Why this must be fixed

- Repeated downloads increase startup time.
- Users may believe the application is stuck.
- It wastes bandwidth and can fail on slow or unavailable networks.
- It prevents offline mode from working reliably after the initial model setup.
- Deployment behavior differs from local behavior.

#### Suggested investigation areas

- Check whether the model is stored in persistent browser storage or only in memory.
- Verify that the deployed application uses a stable cache key and model version.
- Confirm that the service worker or browser cache is configured correctly.
- Check whether the model-loading code runs on every component mount or page refresh.
- Ensure that concurrent requests share the same model-loading promise.
- Investigate whether deployment headers prevent caching.
- Check whether the application clears IndexedDB, Cache Storage, or local storage during startup.
- Verify that a model-version change intentionally invalidates the cache only when required.

#### Acceptance criteria

- The model is downloaded once per model version and deployment environment, unless the cache is cleared or the model changes.
- A later visit loads the model from persistent cache/storage.
- The UI distinguishes between downloading, loading from cache, and ready states.
- Failed downloads can be retried without corrupting the cached model.
- Model caching works in the deployed application, not only in local development.
- Browser refresh and application restart do not trigger an unnecessary download.

---

### 5. Offline and online inference behavior is inconsistent

**Status:** Open  
**Area:** Feature parity / inference pipeline  
**Severity:** High

#### Description

The online mode includes functionality that is missing from offline mode, including Grad-CAM integration and YOLO result averaging. Offline mode also returns an incorrect fixed grade and may repeatedly download the model in the deployed environment.

#### Expected behavior

Both modes should use equivalent prediction, aggregation, grade-mapping, and explainability logic, with the only meaningful difference being where inference is executed.

#### Why this must be fixed

- Users should receive the same result regardless of connectivity.
- Offline mode is expected to be a reliable fallback, not a reduced or inaccurate version.
- Inconsistent logic makes bugs difficult to diagnose and results difficult to trust.

#### Acceptance criteria

- The same input produces equivalent online and offline grades within the documented tolerance.
- Both modes use the same YOLO aggregation rules.
- Both modes provide Grad-CAM when supported.
- Both modes use the same grade-mapping logic.
- Differences caused by model versions or runtime limitations are documented in the UI and project documentation.

---

## Required Features and Improvements

### Feature 1: Persistent model caching

Add reliable persistent caching for downloaded model files so the application can reuse them after refreshes and restarts.

**Reason:** This reduces loading time, bandwidth usage, and dependence on network availability.

### Feature 2: Offline model-ready state

Add a clear status indicator showing whether the offline model is downloading, loading from cache, ready, or unavailable.

**Reason:** Users need to know whether they can start an offline prediction and whether a network connection is still required.

### Feature 3: Shared inference result pipeline

Create or reuse a common result-processing pipeline for online and offline inference:

1. Run model inference.
2. Collect YOLO detections.
3. Apply the YOLO averaging logic.
4. Calculate the grade from the processed result.
5. Generate Grad-CAM when supported.
6. Display the final result and explanation.

**Reason:** A shared pipeline prevents the two modes from drifting apart and avoids repeating the same bug in separate implementations.

### Feature 4: Offline prediction validation

Add automated tests and manual test cases for offline predictions across all supported grades and detection scenarios.

**Reason:** The fixed Grade 4 bug could have been detected immediately with a small set of varied inputs.

### Feature 5: Offline error and fallback handling

Show actionable errors when the offline model is unavailable, corrupted, unsupported for Grad-CAM, or unable to produce detections.

**Reason:** Silent fallback values can appear to be valid predictions and may hide serious inference failures.

### Feature 6: Model cache diagnostics

Provide development or debug logging for:

- Cache hit and cache miss.
- Model version and cache key.
- Download start and completion.
- Model-load failures.
- Cache invalidation.
- Offline/online inference path.

**Reason:** Repeated model downloads and mode-specific bugs are difficult to troubleshoot without visibility into the loading path.

---

## Testing Checklist

### Offline grade prediction

- [ ] Test images that should produce each supported grade.
- [ ] Confirm the displayed grade is not always Grade 4.
- [ ] Confirm the displayed grade matches the processed model output.
- [ ] Test low-confidence and invalid prediction results.

### Grad-CAM

- [ ] Confirm Grad-CAM is generated in online mode.
- [ ] Confirm Grad-CAM is generated in offline mode.
- [ ] Confirm the visualization corresponds to the selected input image.
- [ ] Confirm unsupported models show a clear fallback message.

### YOLO averaging

- [ ] Test zero detections.
- [ ] Test one detection.
- [ ] Test multiple detections.
- [ ] Compare online and offline averaged results.
- [ ] Confirm the average affects the final grade where expected.

### Model loading and caching

- [ ] First visit downloads the model.
- [ ] Second visit loads from cache.
- [ ] Browser refresh does not trigger an unnecessary download.
- [ ] Application restart does not trigger an unnecessary download.
- [ ] Offline prediction works after the initial model download.
- [ ] A failed download can be retried.
- [ ] A model version change invalidates and refreshes the cache correctly.
- [ ] Deployed behavior is tested separately from local development.

### Online/offline parity

- [ ] Run the same image through both modes.
- [ ] Compare grades.
- [ ] Compare YOLO aggregation results.
- [ ] Compare Grad-CAM availability and output.
- [ ] Document any intentional differences.

---

## Priority Order

1. Fix the hard-coded Grade 4 result in offline mode.
2. Integrate YOLO result averaging into offline mode.
3. Integrate Grad-CAM into offline mode.
4. Fix persistent model caching and repeated downloads in deployment.
5. Add shared online/offline result processing.
6. Add automated regression tests and cache diagnostics.

## Definition of Done

This work is complete when offline mode produces the correct dynamic grade, applies YOLO averaging, provides Grad-CAM when supported, and reuses a persistently cached model in the deployed application. Online and offline modes must be tested with the same inputs and produce consistent, documented results.
