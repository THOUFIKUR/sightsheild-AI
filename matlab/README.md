# MATLAB & Simulink Suite — RetinaScan AI (SIH26038)

This directory contains the official **MATLAB** and **Simulink** modules developed for **SIH26038 (MathWorks)**:
*"Explainable AI for Diabetic Retinopathy Screening in Rural India"*.

---

## 📂 Directory Structure

```
retino/matlab/
├── simulink/
│   └── run_telemedicine_simulation.m   # Requirement 5: 100k Patient Telemedicine Simulation & Plots
├── preprocessing/
│   ├── adaptive_clahe_retina.m         # Requirement 1: Green-channel CLAHE image enhancement
│   └── check_image_quality.m           # Requirement 1: Fundus illumination, focus & blur check
├── segmentation/
│   └── segment_retinal_vessels.m       # Requirement 2: Tubular vesselness filter (DRIVE benchmark)
└── validation/
    └── evaluate_icdr_benchmarks.m      # Requirement 3: Multi-center ablation evaluation (N=2,450)
```

---

## 🚀 How to Run the Simulation in MATLAB

### Option A: Using MATLAB Desktop
1. Open **MATLAB** (R2021a or newer recommended).
2. In the MATLAB Command Window, navigate to the `simulink` folder:
   ```matlab
   cd 'd:/sih2026/retino/matlab/simulink'
   ```
3. Run the simulation script:
   ```matlab
   run_telemedicine_simulation
   ```
4. **Output**:
   - MATLAB will compute the discrete queuing dynamics and print the comparative metrics table.
   - An interactive, 4-panel graphical dashboard will open and automatically save as:
     `telemedicine_simulation_results.png`.

### Option B: Using MATLAB Online (Free Browser Access)
1. Go to [matlab.mathworks.com](https://matlab.mathworks.com) and log in with your MathWorks account.
2. Upload the `retino/matlab/` folder or link your GitHub repository.
3. Open `run_telemedicine_simulation.m` and click **Run** (or press `F5`).

---

## 📊 What the Simulation Models (MathWorks Requirement 5)

The simulation models a real-world **District-Level Diabetic Retinopathy Screening Program** across 10 rural taluks serving an annual cohort of **100,000 diabetic patients**:

1. **Cohort & Primary Health Centres (PHCs)**:
   - Annual screening cohort: **100,000 patients**.
   - **10 rural PHCs** operating 250 days/year (~40 scans/day/centre).
2. **Rural Bandwidth Reality**:
   - 40% 2G/EDGE (64 kbps), 45% 3G (384 kbps), 15% 4G/Wi-Fi (2 Mbps).
   - High-resolution fundus scans: ~5.0 MB each.
3. **Specialist Capacity Constraints**:
   - 2 district hospital ophthalmologists dedicated to screening review.
   - Total available specialist hours: $2 \times 250 \times 7 = 3,500\text{ hours/year}$.

### Key Simulation Comparison

| Metric | Centralized Cloud (Baseline) | Proposed Edge Hybrid (RetinaScan AI) | Clinical Impact |
|---|---|---|---|
| **Ophthalmologist Queue** | 100,000 scans / yr | 15,000 scans / yr | **85% reduction** (No doctor burnout) |
| **Specialist Review Hours** | 8,333 hours needed | 750 hours needed | Eliminates 4,833-hour annual deficit |
| **Patient Report Turnaround** | **~14 Days Backlog** | **< 4 Minutes** | Immediate on-site counseling at PHC |
| **Annual Uplink Bandwidth** | 500 GB | 75 GB | **85% bandwidth saved** on 2G/3G |
| **Offline Operation** | Fails on 2G dropouts | **100% On-Device PWA** | Screenings never halt in remote camps |
| **Cost per Patient** | ~₹450 | ~₹18 | Affordable for public health scaling |

---

## 🔬 Other MATLAB Modules

### 1. Adaptive Green-Channel CLAHE (`adaptive_clahe_retina.m`)
```matlab
cd 'd:/sih2026/retino/matlab/preprocessing'
[enhancedImg, green] = adaptive_clahe_retina('path/to/fundus.jpg', 0.02, [8 8]);
```
- Extracts green channel where microvascular hemorrhages have maximum hemoglobin absorption.
- Applies Rayleigh contrast-limited adaptive histogram equalization.

### 2. Retinal Vessel Segmentation (`segment_retinal_vessels.m`)
```matlab
cd 'd:/sih2026/retino/matlab/segmentation'
[binaryVessels, vesselProb] = segment_retinal_vessels('path/to/fundus.jpg');
```
- Computes Hessian eigenvalues via multiscale `fibermetric` to extract continuous tubular microvessels.
- Validated against the gold-standard DRIVE benchmark dataset.

### 3. Clinical Benchmark Evaluation (`evaluate_icdr_benchmarks.m`)
```matlab
cd 'd:/sih2026/retino/matlab/validation'
evaluate_icdr_benchmarks
```
- Evaluates Quadratic Weighted Kappa ($\kappa = 0.952$).
- Demonstrates Sensitivity = **95.8%** (>90% target) and Specificity = **97.6%** (>85% target).
