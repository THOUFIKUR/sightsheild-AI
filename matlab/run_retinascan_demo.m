function result = run_retinascan_demo(imagePath, saveOverlays)
% RUN_RETINASCAN_DEMO
% Problem Statement: SIH26038 (MathWorks) — Master Pipeline Entry Point
%
% Orchestrates the complete MATLAB-side PS pipeline for a single fundus image.
%
% Usage:
%   result = run_retinascan_demo('path/to/fundus.jpg')
%   result = run_retinascan_demo('path/to/fundus.jpg', true)  % saves overlays
%
% This function satisfies PS Requirements 1–4 (image quality, retinal
% structure analysis, lesion analysis, explainability) in one call.
% For PS Requirement 5 (Simulink), run: run_simulation
%
% ─── ARCHITECTURE NOTE ───────────────────────────────────────────────────
% This is the MATLAB research/engineering path.
% The production web application (React → FastAPI → ONNX → Supabase)
% runs INDEPENDENTLY and does NOT require MATLAB.
%
% MATLAB is NOT required for deployed web inference.
% These modules address the PS's academic/engineering demonstration.
% ─────────────────────────────────────────────────────────────────────────
%
% Outputs:
%   result struct with fields:
%     .image_path
%     .quality       — from check_image_quality
%     .enhancement   — from adaptive_clahe_retina
%     .optic_disc    — from detect_optic_disc
%     .fovea         — from localize_fovea
%     .vessels       — from segment_retinal_vessels
%     .microaneurysms — from detect_microaneurysms
%     .exudates      — from segment_exudates
%     .hemorrhages   — from classify_hemorrhages
%     .neovascularization — from detect_neovascularization
%     .calibration   — from calibrate_confidence
%     .overlay_path  — from visualize_gradcam_overlay
%     .timing        — wallclock time per module (seconds)
%     .pipeline_note — architecture disclaimer

if nargin < 1 || isempty(imagePath)
    % Default to IDRiD Grade 3 sample if available
    scriptDir  = fileparts(mfilename('fullpath'));
    imagePath  = fullfile(scriptDir, '..', 'data', 'samples', 'idrid_samples', 'idrid_grade_3.jpg');
    fprintf('[run_retinascan_demo] No path provided. Using default: %s\n', imagePath);
end
if nargin < 2, saveOverlays = false; end

if ~isfile(imagePath)
    error('[run_retinascan_demo] Image not found: %s', imagePath);
end

% ─── Add all module directories to MATLAB path ───────────────────────────
thisDir = fileparts(mfilename('fullpath'));
addpath(fullfile(thisDir, 'preprocessing'));
addpath(fullfile(thisDir, 'retinal_structures'));
addpath(fullfile(thisDir, 'segmentation'));
addpath(fullfile(thisDir, 'lesion_analysis'));
addpath(fullfile(thisDir, 'explainability'));
addpath(fullfile(thisDir, 'validation'));

fprintf('\n');
fprintf('================================================================\n');
fprintf(' RetinaScan AI — MATLAB Pipeline (SIH26038)\n');
fprintf(' Image: %s\n', imagePath);
fprintf(' Date:  %s\n', datetime('now', 'Format', 'yyyy-MM-dd HH:mm:ss'));
fprintf('================================================================\n\n');

result = struct();
result.image_path    = imagePath;
result.timing        = struct();
result.pipeline_note = ['MATLAB Research/Engineering Path. ' ...
    'Production web app (React+FastAPI+ONNX) runs independently. ' ...
    'MATLAB NOT required for deployed inference.'];

% ─── REQ 1A: Image Quality Assessment ────────────────────────────────────
fprintf('[Step 1/10] Image Quality Assessment (Req 1)...\n');
t = tic;
try
    [gradeable, qualityMetrics, feedback] = check_image_quality(imagePath);
    result.quality = struct('gradeable', gradeable, 'metrics', qualityMetrics, ...
        'feedback', feedback);
    if ~gradeable
        fprintf('[WARNING] Image flagged as non-gradeable: %s\n', feedback);
        fprintf('[WARNING] Pipeline will continue but results may be unreliable.\n');
    end
catch ex
    fprintf('[Step 1 ERROR] %s\n', ex.message);
    result.quality = struct('error', ex.message, 'gradeable', true);
end
result.timing.quality_sec = toc(t);

% ─── REQ 1B: Enhancement ─────────────────────────────────────────────────
fprintf('[Step 2/10] Image Enhancement — CLAHE + denoising (Req 1)...\n');
t = tic;
try
    [enhancedImage, greenChannel] = adaptive_clahe_retina(imagePath, 0.02, [8 8], false);
    result.enhancement = struct('completed', true, 'denoising_applied', false);
catch ex
    fprintf('[Step 2 ERROR] %s\n', ex.message);
    result.enhancement = struct('error', ex.message);
end
result.timing.enhancement_sec = toc(t);

% ─── REQ 2A: Optic Disc Localization ─────────────────────────────────────
fprintf('[Step 3/10] Optic Disc Localization (Req 2 — Prototype)...\n');
t = tic;
try
    result.optic_disc = detect_optic_disc(imagePath, saveOverlays);
catch ex
    fprintf('[Step 3 ERROR] %s\n', ex.message);
    result.optic_disc = struct('error', ex.message, 'center', [], 'radius', [], 'confidence', 0);
end
result.timing.optic_disc_sec = toc(t);

% ─── REQ 2B: Fovea Localization ──────────────────────────────────────────
fprintf('[Step 4/10] Fovea Localization (Req 2 — Heuristic Prototype)...\n');
t = tic;
try
    discCenter = [];  discRadius = [];
    if isfield(result.optic_disc, 'center') && ~isempty(result.optic_disc.center)
        discCenter = result.optic_disc.center;
        discRadius = result.optic_disc.radius;
    end
    result.fovea = localize_fovea(imagePath, discCenter, discRadius, saveOverlays);
catch ex
    fprintf('[Step 4 ERROR] %s\n', ex.message);
    result.fovea = struct('error', ex.message, 'center', [], 'validated', false);
end
result.timing.fovea_sec = toc(t);

% ─── REQ 2C: Vessel Segmentation (with DRIVE metrics if GT available) ────
fprintf('[Step 5/10] Vessel Segmentation — fibermetric (Req 2)...\n');
t = tic;
try
    % Check for DRIVE ground truth
    driveGT  = fullfile(thisDir, '..', 'data', 'samples', 'drive', 'train', 'label', '21.png');
    driveImg = fullfile(thisDir, '..', 'data', 'samples', 'drive', 'train', 'input', '21.tif');

    if strcmp(imagePath, driveImg) && isfile(driveGT)
        % Running on DRIVE sample — pass GT for metric computation
        [binaryVessels, vesselProb, vesselMetrics] = segment_retinal_vessels(imagePath, [1 8], driveGT);
    else
        % Non-DRIVE image — segment only, no GT
        [binaryVessels, vesselProb, vesselMetrics] = segment_retinal_vessels(imagePath, [1 8]);
    end
    vesselDensity = sum(binaryVessels(:)) / numel(binaryVessels) * 100;
    result.vessels = struct('vessel_density_pct', vesselDensity, ...
        'drive_metrics', vesselMetrics, 'has_gt_eval', ~isempty(fieldnames(vesselMetrics)));
catch ex
    fprintf('[Step 5 ERROR] %s\n', ex.message);
    result.vessels = struct('error', ex.message);
end
result.timing.vessels_sec = toc(t);

% ─── REQ 2D: Microaneurysm Candidate Detection ───────────────────────────
fprintf('[Step 6/10] Microaneurysm Candidate Detection (Req 2 — Prototype)...\n');
t = tic;
try
    result.microaneurysms = detect_microaneurysms(imagePath, saveOverlays);
catch ex
    fprintf('[Step 6 ERROR] %s\n', ex.message);
    result.microaneurysms = struct('error', ex.message, 'candidate_count', 0);
end
result.timing.microaneurysms_sec = toc(t);

% ─── REQ 2E: Exudate Candidate Segmentation ──────────────────────────────
fprintf('[Step 7/10] Exudate Candidate Segmentation (Req 2 — Prototype)...\n');
t = tic;
try
    discCenter = [];  discRadius = [];
    if isfield(result.optic_disc, 'center') && ~isempty(result.optic_disc.center)
        discCenter = result.optic_disc.center;
        discRadius = result.optic_disc.radius;
    end
    result.exudates = segment_exudates(imagePath, discCenter, discRadius, saveOverlays);
catch ex
    fprintf('[Step 7 ERROR] %s\n', ex.message);
    result.exudates = struct('error', ex.message, 'candidate_area_px', 0);
end
result.timing.exudates_sec = toc(t);

% ─── REQ 2F: Hemorrhage Candidate Detection ──────────────────────────────
fprintf('[Step 8/10] Hemorrhage Candidate Detection (Req 2 — Prototype)...\n');
t = tic;
try
    result.hemorrhages = classify_hemorrhages(imagePath, saveOverlays);
catch ex
    fprintf('[Step 8 ERROR] %s\n', ex.message);
    result.hemorrhages = struct('error', ex.message, 'total_count', 0);
end
result.timing.hemorrhages_sec = toc(t);

% ─── REQ 2G: Neovascularization Candidate Detection ──────────────────────
fprintf('[Step 9/10] Neovascularization Candidate Detection (Req 2 — Research Prototype)...\n');
t = tic;
try
    discCenter = [];  discRadius = [];
    if isfield(result.optic_disc, 'center') && ~isempty(result.optic_disc.center)
        discCenter = result.optic_disc.center;
        discRadius = result.optic_disc.radius;
    end
    result.neovascularization = detect_neovascularization(imagePath, discCenter, discRadius, saveOverlays);
catch ex
    fprintf('[Step 9 ERROR] %s\n', ex.message);
    result.neovascularization = struct('error', ex.message, 'nv_disc_candidate', false);
end
result.timing.neovascularization_sec = toc(t);

% ─── REQ 4: Explainability — Calibration + Annotated Overlay ─────────────
fprintf('[Step 10/10] Explainability — calibration framework + annotated overlay (Req 4)...\n');
t = tic;
% Calibration requires a held-out validation set (>=200 images).
% Single-image pipeline cannot calibrate; log status and skip.
% Wired in P1.4 when calibration.mat is produced from IDRiD val split.
result.calibration = struct( ...
    'temperature',      NaN, ...
    'ece_before',       NaN, ...
    'ece_after',        NaN, ...
    'brier_before',     NaN, ...
    'brier_after',      NaN, ...
    'n_samples',        0, ...
    'validation_note',  'NOT RUN — calibrate_confidence() requires a held-out validation set (>=200 samples). See P1.4 task. Confidence shown in UI is model probability (uncalibrated).');

try
    result.overlay_path = visualize_gradcam_overlay(imagePath, result);
catch ex
    fprintf('[Overlay ERROR] %s\n', ex.message);
    result.overlay_path = '';
end
result.timing.explainability_sec = toc(t);

% ─── Print summary table ─────────────────────────────────────────────────
totalTime = sum(struct2array(result.timing));
fprintf('\n');
fprintf('================================================================\n');
fprintf(' RETINASCAN AI — MATLAB PIPELINE SUMMARY\n');
fprintf('================================================================\n');
fprintf(' %-30s %s\n', 'Image:', imagePath);

if isfield(result.quality, 'gradeable')
    fprintf(' %-30s %s (score=%.1f/100)\n', 'Image Quality:', ...
        result.quality.feedback(1:min(30,end)), ...
        result.quality.metrics.QualityScore);
end
if isfield(result.optic_disc, 'center') && ~isempty(result.optic_disc.center)
    fprintf(' %-30s [%d, %d] r=%dpx (conf=%.2f) [%s]\n', 'Optic Disc:', ...
        result.optic_disc.center(1), result.optic_disc.center(2), ...
        result.optic_disc.radius, result.optic_disc.confidence, result.optic_disc.method);
end
if isfield(result.fovea, 'center') && ~isempty(result.fovea.center)
    fprintf(' %-30s [%d, %d] HEURISTIC\n', 'Fovea (prototype):', ...
        result.fovea.center(1), result.fovea.center(2));
end
if isfield(result.vessels, 'vessel_density_pct')
    fprintf(' %-30s %.2f%%\n', 'Vessel density:', result.vessels.vessel_density_pct);
    if isfield(result.vessels, 'has_gt_eval') && result.vessels.has_gt_eval
        m = result.vessels.drive_metrics;
        fprintf(' %-30s Dice=%.4f IoU=%.4f (1 DRIVE sample)\n', ...
            'DRIVE metrics:', m.Dice, m.IoU);
    end
end
if isfield(result.microaneurysms, 'candidate_count')
    fprintf(' %-30s %d candidates [PROTOTYPE]\n', 'Microaneurysms:', ...
        result.microaneurysms.candidate_count);
end
if isfield(result.exudates, 'candidate_area_px') && isfield(result.exudates, 'candidate_ratio')
    fprintf(' %-30s %d px (%.2f%%) [PROTOTYPE]\n', 'Exudate area:', ...
        result.exudates.candidate_area_px, result.exudates.candidate_ratio * 100);
end
if isfield(result.hemorrhages, 'total_count') && isfield(result.hemorrhages, 'dot_count')
    fprintf(' %-30s %d total (dot=%d, flame=%d) [PROTOTYPE]\n', 'Hemorrhages:', ...
        result.hemorrhages.total_count, result.hemorrhages.dot_count, result.hemorrhages.flame_count);
end
if isfield(result.neovascularization, 'nv_disc_candidate')
    fprintf(' %-30s NVD=%d NVE=%d [RESEARCH PROTOTYPE]\n', 'Neovascularization:', ...
        result.neovascularization.nv_disc_candidate, result.neovascularization.nv_elsewhere_candidate);
end
if isfield(result.calibration, 'ece_before')
    fprintf(' %-30s ECE before=%.4f | Status: %s\n', 'Confidence calibration:', ...
        result.calibration.ece_before, result.calibration.validation_note(1:min(60,end)));
end
if ~isempty(result.overlay_path)
    fprintf(' %-30s %s\n', 'Annotated overlay:', result.overlay_path);
end

fprintf('----------------------------------------------------------------\n');
fprintf(' Module timing:\n');
fields = fieldnames(result.timing);
for f = 1:numel(fields)
    fprintf('   %-28s %.3f s\n', fields{f}, result.timing.(fields{f}));
end
fprintf('   %-28s %.3f s\n', 'TOTAL:', totalTime);
fprintf('================================================================\n');
fprintf(' NOTE: All lesion modules are PROTOTYPES. Not clinically validated.\n');
fprintf(' Production DR grading uses EfficientNetB3+CBAM (ONNX) in FastAPI.\n');
fprintf('================================================================\n\n');

result.total_time_sec = totalTime;
end
